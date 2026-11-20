import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

async function providerRequest(path: string, init: RequestInit) {
  const base = (Deno.env.get("ALTRANS_API_BASE") ?? "https://al-trans.com.ua").replace(/\/+$/, "");
  const apiKey = Deno.env.get("ALTRANS_API_KEY");

  if (!apiKey) {
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
      return { ok: false, status: 502, body: null, errorCode: "ALTRANS_INVALID_RESPONSE" };
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
      errorCode: response.ok ? null : "ALTRANS_UNAVAILABLE",
    };
  } catch (error) {
    console.error("AL-TRANS request failed", {
      path,
      error: error instanceof Error ? error.name : "unknown",
    });
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

function normalizeTrip(value: unknown, index: number) {
  const sequence = asRecord(value);
  if (!sequence || sequence.canBook !== true) return null;

  const trips = asArray(sequence.trips).map(asRecord).filter(
    (trip): trip is JsonRecord => trip !== null,
  );
  const firstTrip = asRecord(sequence.first_trip) ?? trips[0] ?? {};
  const lastTrip = asRecord(sequence.last_trip) ?? trips[trips.length - 1] ?? firstTrip;
  const id = firstTrip.id ?? sequence.id ?? `${sequence.departure_date ?? "trip"}-${index}`;

  return {
    trip_id: String(id),
    carrier: String(firstTrip.carrier_name ?? sequence.carrier_name ?? "AL-TRANS"),
    bus_number: firstTrip.bus_number == null ? null : String(firstTrip.bus_number),
    departure_city: String(firstTrip.departure_city ?? ""),
    departure_place: String(firstTrip.departure_place ?? ""),
    departure_date: String(sequence.departure_date ?? firstTrip.departure_date ?? ""),
    departure_time: String(sequence.departure_time ?? firstTrip.departure_time ?? ""),
    arrival_city: String(lastTrip.arrival_city ?? ""),
    arrival_place: String(lastTrip.arrival_place ?? ""),
    arrival_date: String(sequence.arrival_date ?? lastTrip.arrival_date ?? ""),
    arrival_time: String(sequence.arrival_time ?? lastTrip.arrival_time ?? ""),
    price: typeof sequence.price === "number" || typeof sequence.price === "string"
      ? sequence.price
      : null,
    currency: String(sequence.currency_code ?? "UAH"),
    can_book_with_payment_at_boarding: sequence.canBookWithPaymentAtBoarding === true,
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
  if (!catalog.ok || providerRoutes.length === 0) {
    return json(
      { providerError: true, errorCode: catalog.errorCode ?? "ALTRANS_EMPTY_CATALOG" },
      catalog.status,
    );
  }

  const locations = new Map<string, {
    provider_location_id: string;
    name_uk: string;
    normalized_name: string;
    active: boolean;
  }>();
  const routePairs = new Map<string, {
    fromProviderId: string;
    toProviderId: string;
    providerRouteId: string;
  }>();
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
    });
    const detailsBody = asRecord(details.body);
    if (!details.ok || !detailsBody) {
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
        locations.set(providerLocationId, {
          provider_location_id: providerLocationId,
          name_uk: name,
          normalized_name: name.normalize("NFC").toLocaleLowerCase("uk-UA"),
          active: true,
        });
        scheduleLocations.push(providerLocationId);
      }

      if (invalidSchedule || scheduleLocations.length < 2) {
        errors.push(`${navigationKey}:INVALID_SCHEDULE`);
        continue;
      }

      for (let fromIndex = 0; fromIndex < scheduleLocations.length; fromIndex += 1) {
        for (let toIndex = fromIndex + 1; toIndex < scheduleLocations.length; toIndex += 1) {
          const fromProviderId = scheduleLocations[fromIndex];
          const toProviderId = scheduleLocations[toIndex];
          if (fromProviderId === toProviderId) continue;
          routePairs.set(`${providerRouteId}:${fromProviderId}:${toProviderId}`, {
            fromProviderId,
            toProviderId,
            providerRouteId,
          });
        }
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
  if (routeRows.length === 0) {
    return json({
      providerError: true,
      errorCode: "ALTRANS_NO_ROUTES",
    }, 502);
  }

  const { data: syncData, error: syncError } = await adminClient.rpc(
    "sync_altrans_catalog",
    { p_locations: rows, p_routes: routeRows },
  );
  if (syncError) {
    console.error("Catalog sync transaction failed", syncError.code);
    return json({ providerError: true, errorCode: "CATALOG_IMPORT_FAILED" }, 500);
  }

  const syncResult = asRecord(asArray(syncData)[0]);
  const importedLocations = Number(syncResult?.imported_locations);
  const importedRoutes = Number(syncResult?.imported_routes);
  if (
    !Number.isSafeInteger(importedLocations) ||
    !Number.isSafeInteger(importedRoutes) ||
    importedLocations !== rows.length ||
    importedRoutes !== routeRows.length
  ) {
    console.error("Catalog sync returned unexpected row counts");
    return json({ providerError: true, errorCode: "CATALOG_IMPORT_INCOMPLETE" }, 500);
  }

  return json({
    providerError: false,
    importedLocations,
    importedRoutes,
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
    });
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
      !["UAH", "EUR"].includes(currencyCode)
    ) {
      return json({ providerError: true, errorCode: "INVALID_SEARCH_PARAMS", trips: [] }, 400);
    }

    const date = new Date(`${travelDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== travelDate) {
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
    });
    if (!result.ok) {
      return json({ providerError: true, errorCode: result.errorCode, trips: [] }, result.status);
    }

    const root = asRecord(result.body);
    if (root?.success === false) {
      return json({ providerError: true, errorCode: "ALTRANS_SEARCH_FAILED", trips: [] }, 502);
    }
    const trips = asArray(root?.trips_sequences)
      .map(normalizeTrip)
      .filter((trip): trip is NonNullable<typeof trip> => trip !== null);
    return json({ providerError: false, trips, searchedAt: new Date().toISOString() });
  }

  return json({ providerError: true, errorCode: "UNKNOWN_OPERATION" }, 400);
});
