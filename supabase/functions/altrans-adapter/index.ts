import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cityLocalizations } from "./city-localizations.ts";
import {
  buildDirectedRoutePairs,
  normalizeProviderSchedule,
  type ProviderRouteSchedule,
} from "./schedule-import.ts";
import { kyivLocalDateTimeToIso } from "./time-zone.js";
import {
  normalizeProviderTrip,
  selectProviderTrip,
  type NormalizedProviderTrip,
} from "./trip-normalization.ts";
import {
  buildStopsFromRouteSchedule,
  type RouteLocation,
  type RouteSchedule,
  type RouteScheduleStop,
} from "./route-itinerary.ts";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type ProviderLogContext = {
  routeKey?: string;
  travelDate?: string;
};

async function logProviderRequest(
  operation: string,
  status: number,
  errorCode: string | null,
  context: ProviderLogContext,
) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    console.error("Provider request log unavailable", { operation });
    return;
  }

  try {
    const adminClient = createClient(projectUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await adminClient.from("provider_request_logs").insert({
      provider: "AL-TRANS",
      operation,
      route_key: context.routeKey ?? null,
      travel_date: context.travelDate ?? null,
      status: errorCode ? "error" : "success",
      response_code: status,
      cache_hit: false,
      error_code: errorCode,
      completed_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Provider request log insert failed", {
        operation,
        errorCode: error.code,
      });
    }
  } catch (error) {
    console.error("Provider request log failed", {
      operation,
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

async function providerRequest(
  path: string,
  init: RequestInit,
  context: ProviderLogContext = {},
) {
  const base = (Deno.env.get("ALTRANS_API_BASE") ?? "https://al-trans.com.ua").replace(/\/+$/, "");
  const apiKey = Deno.env.get("ALTRANS_API_KEY");

  if (!apiKey) {
    await logProviderRequest(path, 503, "ALTRANS_NOT_CONFIGURED", context);
    return { ok: false, status: 503, body: null, errorCode: "ALTRANS_NOT_CONFIGURED" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Api-Key": apiKey,
        "Accept-Language": "uk",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      await logProviderRequest(path, 502, "ALTRANS_INVALID_RESPONSE", context);
      return { ok: false, status: 502, body: null, errorCode: "ALTRANS_INVALID_RESPONSE" };
    }

    const result = {
      ok: response.ok,
      status: response.status,
      body,
      errorCode: response.ok ? null : "ALTRANS_UNAVAILABLE",
    };
    await logProviderRequest(path, result.status, result.errorCode, context);
    return result;
  } catch (error) {
    console.error("AL-TRANS request failed", {
      path,
      error: error instanceof Error ? error.name : "unknown",
    });
    await logProviderRequest(path, 502, "ALTRANS_UNAVAILABLE", context);
    return { ok: false, status: 502, body: null, errorCode: "ALTRANS_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveProviderLocationId(locationId: string) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return { ok: false, status: 503, providerLocationId: null };
  }

  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client
    .from("locations")
    .select("provider_location_id")
    .eq("id", locationId)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("Provider location lookup failed", error.code);
    return { ok: false, status: 500, providerLocationId: null };
  }
  return data?.provider_location_id
    ? { ok: true, status: 200, providerLocationId: String(data.provider_location_id) }
    : { ok: false, status: 404, providerLocationId: null };
}

async function loadRouteScheduleItinerary(
  trip: NormalizedProviderTrip,
  locale: string,
) {
  if (
    trip.segment_count !== 1 ||
    !trip.provider_route_id ||
    !trip.departure_city_id ||
    !trip.arrival_city_id
  ) {
    return { stops: null, errorCode: null };
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return { stops: null, errorCode: "SCHEDULE_LOOKUP_NOT_CONFIGURED" };
  }
  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: schedulesData, error: schedulesError } = await client
    .from("provider_route_schedules")
    .select("id, provider_route_id, direction, service_weekday")
    .eq("provider_route_id", trip.provider_route_id)
    .eq("active", true);
  if (schedulesError) {
    console.error("Provider schedule lookup failed", schedulesError.code);
    return { stops: null, errorCode: "SCHEDULE_LOOKUP_FAILED" };
  }

  const schedules = (schedulesData ?? []) as RouteSchedule[];
  if (schedules.length === 0) {
    return { stops: null, errorCode: "SCHEDULE_NOT_FOUND" };
  }
  const scheduleIds = schedules.map((schedule) => schedule.id);
  const { data: scheduleStopsData, error: scheduleStopsError } = await client
    .from("provider_route_schedule_stops")
    .select("schedule_id, location_id, stop_order, day_offset, departure_time, place")
    .in("schedule_id", scheduleIds)
    .order("schedule_id")
    .order("stop_order");
  if (scheduleStopsError) {
    console.error("Provider schedule stops lookup failed", scheduleStopsError.code);
    return { stops: null, errorCode: "SCHEDULE_LOOKUP_FAILED" };
  }

  const scheduleStops = (scheduleStopsData ?? []) as RouteScheduleStop[];
  const locationIds = [...new Set(scheduleStops.map((stop) => stop.location_id))];
  if (locationIds.length === 0) {
    return { stops: null, errorCode: "SCHEDULE_STOPS_NOT_FOUND" };
  }
  const { data: locationsData, error: locationsError } = await client
    .from("locations")
    .select("id, provider_location_id, name_uk, name_en, name_it")
    .in("id", locationIds)
    .eq("active", true);
  if (locationsError) {
    console.error("Provider schedule locations lookup failed", locationsError.code);
    return { stops: null, errorCode: "SCHEDULE_LOOKUP_FAILED" };
  }

  const locations = (locationsData ?? []) as RouteLocation[];
  const stops = buildStopsFromRouteSchedule(
    trip,
    schedules,
    scheduleStops,
    locations,
    locale,
  );
  return {
    stops,
    errorCode: stops ? null : "SCHEDULE_NOT_MATCHED",
  };
}

async function syncCatalog(request: Request) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!projectUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ providerError: true, errorCode: "SYNC_NOT_CONFIGURED" }, 503);
  }

  const authClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ providerError: true, errorCode: "UNAUTHORIZED" }, 401);
  }

  const adminClient = createClient(projectUrl, serviceRoleKey);
  const { data: admin, error: adminError } = await adminClient
    .from("admin_profiles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (adminError) {
    console.error("Catalog sync admin check failed", adminError.code);
    return json({ providerError: true, errorCode: "ADMIN_CHECK_FAILED" }, 500);
  }
  if (!admin || !["super_admin", "admin", "provider_operator"].includes(admin.role)) {
    return json({ providerError: true, errorCode: "ADMIN_REQUIRED" }, 403);
  }

  const catalog = await providerRequest("/api/v3/cache/routes", { method: "GET" });
  const catalogBody = asRecord(catalog.body);
  const providerRoutes = asArray(catalogBody?.routes);
  if (!catalog.ok || catalogBody?.success !== true || providerRoutes.length === 0) {
    return json(
      { providerError: true, errorCode: catalog.errorCode ?? "ALTRANS_EMPTY_CATALOG" },
      catalog.status,
    );
  }

  const locations = new Map<string, {
    provider_location_id: string;
    name_uk: string;
    name_en: string | null;
    name_it: string | null;
    normalized_name: string;
    ascii_name: string | null;
    aliases: string[];
    country_code: string | null;
    active: boolean;
  }>();
  const routePairs = new Map<string, {
    fromProviderId: string;
    toProviderId: string;
    providerRouteId: string;
  }>();
  const providerSchedules: ProviderRouteSchedule[] = [];
  const errors: string[] = [];

  for (const routeValue of providerRoutes) {
    const route = asRecord(routeValue);
    const navigationKey = route?.navigation_key;
    if (typeof navigationKey !== "string" || !navigationKey) {
      errors.push("CATALOG_ROUTE_MISSING_KEY");
      continue;
    }
    const providerRouteId = route?.id == null ? "" : String(route.id);
    if (!providerRouteId) {
      errors.push(`${navigationKey}:MISSING_ROUTE_ID`);
      continue;
    }

    const details = await providerRequest("/api/v2/references/route_details_key", {
      method: "POST",
      body: JSON.stringify({ key: navigationKey }),
    }, { routeKey: navigationKey });
    const detailsBody = asRecord(details.body);
    if (!details.ok || !detailsBody || detailsBody.success !== true) {
      errors.push(`${navigationKey}:${details.errorCode ?? "INVALID_ROUTE_DETAILS"}`);
      continue;
    }

    const schedules = asArray(detailsBody.schedules);
    if (schedules.length === 0) {
      errors.push(`${navigationKey}:MISSING_SCHEDULES`);
      continue;
    }

    for (const schedule of schedules) {
      const scheduleRecord = asRecord(schedule);
      const scheduleLocations: string[] = [];
      const items = asArray(scheduleRecord?.items);
      let invalidSchedule = !scheduleRecord || items.length < 2;
      for (const stopValue of items) {
        const stop = asRecord(stopValue);
        const cityId = stop?.city_id;
        const cityName = stop?.city_name;
        if (
          (typeof cityId !== "number" && typeof cityId !== "string") ||
          typeof cityName !== "string" ||
          !cityName.trim()
        ) {
          invalidSchedule = true;
          continue;
        }

        const providerLocationId = String(cityId);
        const name = cityName.trim();
        const localization = cityLocalizations[name];
        const aliases = [...new Set([
          name,
          localization?.name_en,
          localization?.name_it,
        ].filter((alias): alias is string => Boolean(alias)))];
        locations.set(providerLocationId, {
          provider_location_id: providerLocationId,
          name_uk: name,
          name_en: localization?.name_en ?? null,
          name_it: localization?.name_it ?? null,
          normalized_name: name.normalize("NFC").toLocaleLowerCase("uk-UA"),
          ascii_name: localization?.name_en ?? null,
          aliases,
          country_code: localization?.country_code ?? null,
          active: true,
        });
        scheduleLocations.push(providerLocationId);
      }

      if (invalidSchedule || scheduleLocations.length < 2) {
        errors.push(`${navigationKey}:INVALID_SCHEDULE`);
        continue;
      }

      try {
        providerSchedules.push(...normalizeProviderSchedule(providerRouteId, scheduleRecord));
        for (const pair of buildDirectedRoutePairs(providerRouteId, scheduleLocations)) {
          routePairs.set(`${providerRouteId}:${pair.fromProviderId}:${pair.toProviderId}`, pair);
        }
      } catch (error) {
        errors.push(
          `${navigationKey}:${error instanceof Error ? error.message : "INVALID_SCHEDULE"}`,
        );
      }
    }
  }

  if (locations.size === 0) {
    return json(
      { providerError: true, errorCode: "ALTRANS_NO_LOCATIONS", routeErrors: errors },
      502,
    );
  }

  if (errors.length > 0) {
    return json({
      providerError: true,
      errorCode: "ALTRANS_INCOMPLETE_CATALOG",
      routeErrors: errors,
    }, 502);
  }

  const rows = [...locations.values()];
  const routeRows = [...routePairs.values()].map((pair) => ({
    from_provider_location_id: pair.fromProviderId,
    to_provider_location_id: pair.toProviderId,
    provider_route_id: pair.providerRouteId,
    active: true,
  }));
  if (routeRows.length === 0 || providerSchedules.length === 0) {
    return json({
      providerError: true,
      errorCode: routeRows.length === 0 ? "ALTRANS_NO_ROUTES" : "ALTRANS_NO_SCHEDULES",
    }, 502);
  }

  const { data: syncData, error: syncError } = await adminClient.rpc(
    "sync_altrans_catalog",
    { p_locations: rows, p_routes: routeRows, p_schedules: providerSchedules },
  );
  if (syncError) {
    console.error("Catalog sync transaction failed", syncError.code);
    return json({ providerError: true, errorCode: "CATALOG_IMPORT_FAILED" }, 500);
  }

  const syncResult = asRecord(asArray(syncData)[0]);
  const importedLocations = Number(syncResult?.imported_locations);
  const importedRoutes = Number(syncResult?.imported_routes);
  const importedSchedules = Number(syncResult?.imported_schedules);
  const importedScheduleStops = Number(syncResult?.imported_schedule_stops);
  if (
    !Number.isSafeInteger(importedLocations) ||
    !Number.isSafeInteger(importedRoutes) ||
    !Number.isSafeInteger(importedSchedules) ||
    !Number.isSafeInteger(importedScheduleStops) ||
    importedLocations !== rows.length ||
    importedRoutes !== routeRows.length ||
    importedSchedules !== providerSchedules.length ||
    importedScheduleStops !== providerSchedules.reduce((count, schedule) => count + schedule.stops.length, 0)
  ) {
    console.error("Catalog sync returned unexpected row counts");
    return json({ providerError: true, errorCode: "CATALOG_IMPORT_INCOMPLETE" }, 500);
  }

  return json({
    providerError: false,
    importedLocations,
    importedRoutes,
    importedSchedules,
    importedScheduleStops,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ providerError: true, errorCode: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(await request.json()) ?? {};
  } catch {
    return json({ providerError: true, errorCode: "INVALID_JSON" }, 400);
  }

  const operation = String(payload.operation ?? "");
  if (operation === "routes") {
    const result = await providerRequest("/api/v3/cache/routes", { method: "GET" });
    if (!result.ok) {
      return json({ providerError: true, errorCode: result.errorCode }, result.status);
    }
    return json({ providerError: false, routes: result.body });
  }

  if (operation === "route-details") {
    const key = String(payload.navigationKey ?? "");
    if (!key) {
      return json({ providerError: true, errorCode: "INVALID_ROUTE_KEY" }, 400);
    }
    const result = await providerRequest("/api/v2/references/route_details_key", {
      method: "POST",
      body: JSON.stringify({ key }),
    }, { routeKey: key });
    if (!result.ok) {
      return json({ providerError: true, errorCode: result.errorCode }, result.status);
    }
    return json({ providerError: false, route: result.body });
  }

  if (operation === "sync-catalog") {
    return await syncCatalog(request);
  }

  if (operation === "search-trips") {
    const fromLocationId = String(payload.fromLocationId ?? "");
    const toLocationId = String(payload.toLocationId ?? "");
    const travelDate = String(payload.travelDate ?? "");
    const locale = String(payload.locale ?? "uk");
    const passengersCount = payload.passengersCount ?? 1;
    const currencyCode = String(payload.currencyCode ?? "UAH");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      !uuidPattern.test(fromLocationId) ||
      !uuidPattern.test(toLocationId) ||
      fromLocationId === toLocationId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(travelDate) ||
      typeof passengersCount !== "number" ||
      !Number.isInteger(passengersCount) ||
      Number(passengersCount) < 1 ||
      Number(passengersCount) > 9 ||
      !["UAH", "EUR"].includes(currencyCode) ||
      !["uk", "en", "it"].includes(locale)
    ) {
      return json({ providerError: true, errorCode: "INVALID_SEARCH_PARAMS", trips: [] }, 400);
    }

    if (!isValidIsoDate(travelDate)) {
      return json({ providerError: true, errorCode: "INVALID_SEARCH_DATE", trips: [] }, 400);
    }

    const [fromLocation, toLocation] = await Promise.all([
      resolveProviderLocationId(fromLocationId),
      resolveProviderLocationId(toLocationId),
    ]);
    if (!fromLocation.ok || !toLocation.ok) {
      return json({ providerError: true, errorCode: "LOCATION_NOT_FOUND", trips: [] }, 404);
    }

    const fromCityId = Number(fromLocation.providerLocationId);
    const toCityId = Number(toLocation.providerLocationId);
    if (!Number.isSafeInteger(fromCityId) || !Number.isSafeInteger(toCityId)) {
      return json({ providerError: true, errorCode: "INVALID_PROVIDER_LOCATION_ID", trips: [] }, 422);
    }

    const result = await providerRequest("/api/v2/booking/search_trips", {
      method: "POST",
      body: JSON.stringify({
        departure_city_id: fromCityId,
        arrival_city_id: toCityId,
        depature_date: `${travelDate}T00:00:00`,
        passengers_count: Number(passengersCount),
        currecny_code: currencyCode,
        enable_external_search: false,
      }),
    }, { routeKey: `${fromLocationId}:${toLocationId}`, travelDate });
    if (!result.ok) {
      return json({ providerError: true, errorCode: result.errorCode, trips: [] }, result.status);
    }

    const root = asRecord(result.body);
    if (!root || root.success !== true || !Array.isArray(root.trips_sequences)) {
      return json({ providerError: true, errorCode: "ALTRANS_INVALID_SEARCH_RESPONSE", trips: [] }, 502);
    }
    const trips = root.trips_sequences
      .map(normalizeProviderTrip)
      .filter((trip): trip is NonNullable<typeof trip> => trip !== null);
    const selectedTrip = selectProviderTrip(
      trips,
      travelDate,
      String(fromCityId),
      String(toCityId),
      currencyCode,
    );
    if (!selectedTrip) {
      return json({
        providerError: false,
        trip: null,
        trips: [],
        searchedAt: new Date().toISOString(),
      });
    }

    const scheduleResult = await loadRouteScheduleItinerary(selectedTrip, locale);
    if (scheduleResult.errorCode) {
      console.warn("Provider itinerary uses segment endpoints only", scheduleResult.errorCode);
    }
    const tripData = { ...selectedTrip };
    delete tripData.provider_route_id;
    delete tripData.departure_city_id;
    delete tripData.arrival_city_id;
    delete tripData.segment_count;
    const trip = {
      ...tripData,
      stops: scheduleResult.stops ?? selectedTrip.stops,
      stops_source: scheduleResult.stops ? "provider_route_schedule" : "provider_segments",
      stops_warning: scheduleResult.errorCode,
    };
    return json({
      providerError: false,
      trip,
      trips: [trip],
      searchedAt: new Date().toISOString(),
    });
  }

  if (operation === "create-booking") {
    const tripId = String(payload.tripId ?? "");
    const expectedPrice = payload.expectedPrice;
    const expectedCurrency = String(payload.expectedCurrency ?? "");
    const fromLocationId = String(payload.fromLocationId ?? "");
    const toLocationId = String(payload.toLocationId ?? "");
    const travelDate = String(payload.travelDate ?? "");
    const locale = String(payload.locale ?? "uk");
    const passengers = Array.isArray(payload.passengers) ? payload.passengers : [];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const hasExpectedPrice = expectedPrice !== undefined && expectedPrice !== null;

    if (
      !tripId ||
      !uuidPattern.test(fromLocationId) ||
      !uuidPattern.test(toLocationId) ||
      fromLocationId === toLocationId ||
      !isValidIsoDate(travelDate) ||
      passengers.length < 1 ||
      passengers.length > 9 ||
      !["uk", "en", "it"].includes(locale) ||
      (hasExpectedPrice &&
        (typeof expectedPrice !== "number" || !Number.isFinite(expectedPrice) || expectedPrice < 0)) ||
      (expectedCurrency !== "" && !["UAH", "EUR"].includes(expectedCurrency))
    ) {
      return json({ errorCode: "INVALID_BOOKING_PARAMS" }, 400);
    }

    for (const passengerValue of passengers) {
      const passenger = asRecord(passengerValue);
      if (
        !passenger ||
        String(passenger.fullName ?? "").trim().length < 2 ||
        String(passenger.phone ?? "").trim().length < 7
      ) {
        return json({ errorCode: "INVALID_PASSENGER" }, 400);
      }
      if (passenger.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(passenger.email))) {
        return json({ errorCode: "INVALID_PASSENGER_EMAIL" }, 400);
      }
    }

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = request.headers.get("Authorization");
    if (!projectUrl || !anonKey) {
      return json({ errorCode: "BOOKING_NOT_CONFIGURED" }, 503);
    }
    if (!authorization) {
      return json({ errorCode: "AUTHENTICATION_REQUIRED" }, 401);
    }
    const authClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ errorCode: "AUTHENTICATION_REQUIRED" }, 401);
    }

    const [fromLocation, toLocation] = await Promise.all([
      resolveProviderLocationId(fromLocationId),
      resolveProviderLocationId(toLocationId),
    ]);
    if (!fromLocation.ok || !toLocation.ok) {
      return json({ errorCode: "TRIP_NOT_FOUND" }, 404);
    }
    const fromCityId = Number(fromLocation.providerLocationId);
    const toCityId = Number(toLocation.providerLocationId);
    if (!Number.isSafeInteger(fromCityId) || !Number.isSafeInteger(toCityId)) {
      return json({ errorCode: "INVALID_PROVIDER_LOCATION_ID" }, 422);
    }

    const search = await providerRequest("/api/v2/booking/search_trips", {
      method: "POST",
      body: JSON.stringify({
        departure_city_id: fromCityId,
        arrival_city_id: toCityId,
        depature_date: `${travelDate}T00:00:00`,
        passengers_count: passengers.length,
        currecny_code: expectedCurrency || "UAH",
        enable_external_search: false,
      }),
    }, { routeKey: `${fromLocationId}:${toLocationId}`, travelDate });
    if (!search.ok) {
      return json({ errorCode: "PROVIDER_UNAVAILABLE" }, 502);
    }
    const searchBody = asRecord(search.body);
    if (!searchBody || searchBody.success !== true || !Array.isArray(searchBody.trips_sequences)) {
      return json({ errorCode: "ALTRANS_INVALID_SEARCH_RESPONSE" }, 502);
    }
    const providerTrip = searchBody.trips_sequences
      .map(normalizeProviderTrip)
      .filter((trip): trip is NonNullable<typeof trip> => trip !== null)
      .find((trip) =>
        trip.trip_id === tripId &&
        trip.departure_date === travelDate &&
        trip.departure_city_id === String(fromCityId) &&
        trip.arrival_city_id === String(toCityId)
      );
    if (!providerTrip) {
      return json({ errorCode: "TRIP_UNAVAILABLE" }, 409);
    }
    if (providerTrip.price == null || String(providerTrip.price).trim() === "") {
      return json({ errorCode: "PRICE_CHANGED" }, 409);
    }
    if (!["UAH", "EUR"].includes(providerTrip.currency)) {
      return json({ errorCode: "UNSUPPORTED_CURRENCY" }, 409);
    }
    const price = Number(providerTrip.price);
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      !providerTrip.provider_route_id
    ) {
      return json({ errorCode: "PRICE_CHANGED" }, 409);
    }
    if (
      (hasExpectedPrice && expectedPrice !== price) ||
      (expectedCurrency && expectedCurrency !== providerTrip.currency)
    ) {
      return json({ errorCode: "PRICE_CHANGED" }, 409);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      return json({ errorCode: "BOOKING_NOT_CONFIGURED" }, 503);
    }
    const adminClient = createClient(projectUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: route, error: routeError } = await adminClient
      .from("routes")
      .select("id")
      .eq("from_location_id", fromLocationId)
      .eq("to_location_id", toLocationId)
      .eq("provider_route_id", providerTrip.provider_route_id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (routeError || !route) {
      return json({ errorCode: "TRIP_NOT_FOUND" }, 404);
    }

    const departureAt = kyivLocalDateTimeToIso(providerTrip.departure_date, providerTrip.departure_time);
    const arrivalAt = kyivLocalDateTimeToIso(providerTrip.arrival_date, providerTrip.arrival_time);
    if (!departureAt) {
      return json({ errorCode: "TRIP_UNAVAILABLE" }, 409);
    }

    const { data: trip, error: tripError } = await adminClient
      .from("trips")
      .upsert({
        route_id: route.id,
        provider_trip_id: tripId,
        departure_at: departureAt,
        arrival_at: arrivalAt,
        carrier: providerTrip.carrier,
        status: "active",
      }, { onConflict: "provider_trip_id" })
      .select("id")
      .single();
    if (tripError || !trip) {
      console.error("Booking trip upsert failed", tripError?.code);
      return json({ errorCode: "TRIP_NOT_FOUND" }, 500);
    }

    const expiresAt = null;
    const bookingNumber = `BUS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .insert({
        booking_number: bookingNumber,
        passenger_id: userData.user.id,
        trip_id: trip.id,
        status: "pending",
        currency: providerTrip.currency,
        total_amount: price * passengers.length,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (bookingError || !booking) {
      console.error("Booking insert failed", bookingError?.code);
      return json({ errorCode: "BOOKING_FAILED" }, 500);
    }

    const passengerRows = passengers.map((passengerValue) => {
      const passenger = asRecord(passengerValue) as JsonRecord;
      return {
        booking_id: booking.id,
        full_name: String(passenger.fullName).trim(),
        email: passenger.email ? String(passenger.email).trim() : null,
        phone: String(passenger.phone).trim(),
        seat_number: null,
        nationality: null,
        document_type: null,
        document_number: null,
      };
    });
    const { error: passengersError } = await adminClient
      .from("booking_passengers")
      .insert(passengerRows);
    if (passengersError) {
      await adminClient.from("bookings").delete().eq("id", booking.id);
      console.error("Booking passengers insert failed", passengersError.code);
      return json({ errorCode: "BOOKING_FAILED" }, 500);
    }

    return json({
      bookingId: booking.id,
      bookingNumber,
      status: "pending",
      currency: providerTrip.currency,
      totalAmount: price * passengers.length,
      expiresAt,
    });
  }

  return json({ providerError: true, errorCode: "UNKNOWN_OPERATION" }, 400);
});
