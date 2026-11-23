import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function providerDate(value: unknown): string {
  const raw = text(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const eu = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  return eu ? `${eu[3]}-${eu[2]}-${eu[1]}` : "";
}

function providerTime(value: unknown): string {
  const raw = text(value).trim();
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(raw) ? raw.slice(0, 5) : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ errorCode: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = record(await request.json()) ?? {};
  } catch {
    return json({ errorCode: "INVALID_JSON" }, 400);
  }

  const tripId = text(payload.tripId).trim();
  const fromLocationId = text(payload.fromLocationId).trim();
  const toLocationId = text(payload.toLocationId).trim();
  const travelDate = text(payload.travelDate).trim();
  const expectedPrice = payload.expectedPrice;
  const expectedCurrency = text(payload.expectedCurrency);
  const passengers = Array.isArray(payload.passengers) ? payload.passengers : [];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    !tripId ||
    !uuidPattern.test(fromLocationId) ||
    !uuidPattern.test(toLocationId) ||
    fromLocationId === toLocationId ||
    !isoDate(travelDate) ||
    passengers.length < 1 ||
    passengers.length > 9
  ) {
    return json({ errorCode: "INVALID_BOOKING_PARAMS" }, 400);
  }

  for (const value of passengers) {
    const passenger = record(value);
    if (
      !passenger ||
      text(passenger.fullName).trim().length < 2 ||
      text(passenger.phone).trim().length < 7 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(passenger.email).trim())
    ) {
      return json({ errorCode: "INVALID_PASSENGER" }, 400);
    }
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("ALTRANS_API_KEY");
  const providerBase = (Deno.env.get("ALTRANS_API_BASE") ?? "https://al-trans.com.ua").replace(/\/+$/, "");
  if (!projectUrl || !anonKey || !serviceRoleKey || !apiKey) {
    return json({ errorCode: "BOOKING_NOT_CONFIGURED" }, 503);
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: fromLocation }, { data: toLocation }] = await Promise.all([
    admin.from("locations").select("provider_location_id").eq("id", fromLocationId).eq("active", true).maybeSingle(),
    admin.from("locations").select("provider_location_id").eq("id", toLocationId).eq("active", true).maybeSingle(),
  ]);
  if (!fromLocation?.provider_location_id || !toLocation?.provider_location_id) {
    return json({ errorCode: "TRIP_NOT_FOUND" }, 404);
  }
  const fromCityId = Number(fromLocation.provider_location_id);
  const toCityId = Number(toLocation.provider_location_id);
  if (!Number.isSafeInteger(fromCityId) || !Number.isSafeInteger(toCityId)) {
    return json({ errorCode: "INVALID_PROVIDER_LOCATION_ID" }, 422);
  }

  let providerSearch: Response;
  try {
    providerSearch = await fetch(`${providerBase}/api/v2/booking/search_trips`, {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "Accept-Language": "uk",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        departure_city_id: fromCityId,
        arrival_city_id: toCityId,
        depature_date: `${travelDate}T00:00:00`,
        passengers_count: passengers.length,
        currecny_code: expectedCurrency || "UAH",
        enable_external_search: false,
      }),
    });
  } catch {
    return json({ errorCode: "PROVIDER_UNAVAILABLE" }, 502);
  }
  if (!providerSearch.ok) {
    return json({ errorCode: "PROVIDER_UNAVAILABLE" }, 502);
  }

  const searchBody = record(await providerSearch.json());
  if (!searchBody || searchBody.success !== true || !Array.isArray(searchBody.trips_sequences)) {
    return json({ errorCode: "ALTRANS_INVALID_SEARCH_RESPONSE" }, 502);
  }

  const matched = searchBody.trips_sequences
    .map(record)
    .filter((sequence): sequence is Record<string, unknown> => sequence !== null)
    .find((sequence) => {
      const first = record(sequence.first_trip) ?? {};
      const id = text(first.id ?? sequence.id);
      return id === tripId;
    });
  if (!matched) {
    return json({ errorCode: "TRIP_UNAVAILABLE" }, 409);
  }

  const first = record(matched.first_trip) ?? {};
  const last = record(matched.last_trip) ?? first;
  const price = Number(matched.price);
  const currency = text(matched.currency_code);
  const departureDate = providerDate(first.departure_date ?? matched.departure_date);
  const departureTime = providerTime(first.departure_time ?? matched.departure_time);
  const arrivalDate = providerDate(last.arrival_date ?? matched.arrival_date);
  const arrivalTime = providerTime(last.arrival_time ?? matched.arrival_time);
  const routeId = text(first.route_id ?? matched.route_id);

  if (
    !Number.isFinite(price) ||
    price < 0 ||
    !["UAH", "EUR"].includes(currency) ||
    (expectedPrice !== undefined && expectedPrice !== null && Number(expectedPrice) !== price) ||
    (expectedCurrency && expectedCurrency !== currency) ||
    !departureDate ||
    !departureTime ||
    !arrivalDate ||
    !arrivalTime
  ) {
    return json({ errorCode: "PRICE_CHANGED" }, 409);
  }

  const { data: route, error: routeError } = await admin
    .from("routes")
    .select("id")
    .eq("from_location_id", fromLocationId)
    .eq("to_location_id", toLocationId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (routeError || !route) {
    return json({ errorCode: "TRIP_NOT_FOUND" }, 404);
  }

  const { data: trip, error: tripError } = await admin
    .from("trips")
    .upsert({
      route_id: route.id,
      provider_trip_id: tripId,
      departure_at: `${departureDate}T${departureTime}:00Z`,
      arrival_at: `${arrivalDate}T${arrivalTime}:00Z`,
      carrier: text(first.carrier_name ?? matched.carrier_name) || "AL-TRANS",
      status: "active",
    }, { onConflict: "provider_trip_id" })
    .select("id")
    .single();
  if (tripError || !trip) {
    return json({ errorCode: "TRIP_NOT_FOUND" }, 500);
  }

  let passengerUserId: string | null = null;
  const authorization = request.headers.get("Authorization");
  if (authorization) {
    const auth = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await auth.auth.getUser();
    if (!userError && userData.user) passengerUserId = userData.user.id;
  }

  const bookingNumber = `BUS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  const claimToken = passengerUserId
    ? null
    : `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const claimHash = claimToken ? await sha256Hex(claimToken) : null;
  const claimExpiresAt = claimToken
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      booking_number: bookingNumber,
      passenger_id: passengerUserId,
      trip_id: trip.id,
      status: "pending",
      currency,
      total_amount: price * passengers.length,
      expires_at: null,
      guest_claim_token_hash: claimHash,
      guest_claim_expires_at: claimExpiresAt,
    })
    .select("id")
    .single();
  if (bookingError || !booking) {
    return json({ errorCode: "BOOKING_FAILED" }, 500);
  }

  const passengerRows = passengers.map((value) => {
    const passenger = record(value) as Record<string, unknown>;
    return {
      booking_id: booking.id,
      full_name: text(passenger.fullName).trim(),
      email: text(passenger.email).trim(),
      phone: text(passenger.phone).trim(),
      seat_number: null,
      nationality: null,
      document_type: null,
      document_number: null,
    };
  });
  const { error: passengerError } = await admin
    .from("booking_passengers")
    .insert(passengerRows);
  if (passengerError) {
    await admin.from("bookings").delete().eq("id", booking.id);
    return json({ errorCode: "BOOKING_FAILED" }, 500);
  }

  return json({
    bookingId: booking.id,
    bookingNumber,
    status: "pending",
    currency,
    totalAmount: price * passengers.length,
    expiresAt: null,
    claimToken,
  });
});
