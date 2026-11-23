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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ providerError: true, errorCode: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ providerError: true, errorCode: "INVALID_JSON" }, 400);
  }

  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const fromLocationId = text(payload.fromLocationId);
  const toLocationId = text(payload.toLocationId);
  const travelDate = text(payload.travelDate);
  const fullName = text(payload.fullName);
  const phone = text(payload.phone);
  const locale = text(payload.locale) || "uk";

  if (
    !uuidPattern.test(fromLocationId)
    || !uuidPattern.test(toLocationId)
    || fromLocationId === toLocationId
    || !/^\d{4}-\d{2}-\d{2}$/.test(travelDate)
    || fullName.length < 2
    || phone.length < 7
  ) {
    return json({ providerError: true, errorCode: "INVALID_TRIP_REQUEST" }, 400);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return json({ providerError: true, errorCode: "TRIP_REQUEST_NOT_CONFIGURED" }, 503);
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: fromLocation }, { data: toLocation }] = await Promise.all([
    admin.from("locations").select("name_uk,name_en,name_it").eq("id", fromLocationId).eq("active", true).maybeSingle(),
    admin.from("locations").select("name_uk,name_en,name_it").eq("id", toLocationId).eq("active", true).maybeSingle(),
  ]);
  if (!fromLocation || !toLocation) {
    return json({ providerError: true, errorCode: "LOCATION_NOT_FOUND" }, 404);
  }

  const locationName = (location: Record<string, unknown>) =>
    locale === "en"
      ? text(location.name_en) || text(location.name_uk)
      : locale === "it"
        ? text(location.name_it) || text(location.name_en) || text(location.name_uk)
        : text(location.name_uk);
  const routeFrom = locationName(fromLocation);
  const routeTo = locationName(toLocation);

  const { data: admins, error: adminsError } = await admin
    .from("admin_profiles")
    .select("user_id")
    .eq("active", true)
    .in("role", ["super_admin", "admin", "support"]);
  if (adminsError) {
    console.error("Trip request admin lookup failed", adminsError.code);
    return json({ providerError: true, errorCode: "TRIP_REQUEST_ADMIN_LOOKUP_FAILED" }, 500);
  }
  if (!admins || admins.length === 0) {
    return json({ providerError: true, errorCode: "TRIP_REQUEST_NO_ADMINS" }, 503);
  }

  const metadata = {
    full_name: fullName,
    phone,
    travel_date: travelDate,
    route_from: routeFrom,
    route_to: routeTo,
    from_location_id: fromLocationId,
    to_location_id: toLocationId,
  };
  const { error: notificationError } = await admin
    .from("admin_notifications")
    .insert(admins.map((recipient) => ({
      recipient_id: recipient.user_id,
      type: "new_booking",
      title: "Нова заявка на пошук рейсу",
      message: `${fullName}: ${routeFrom} → ${routeTo}, ${travelDate}, ${phone}`,
      metadata,
    })));
  if (notificationError) {
    console.error("Trip request notification failed", notificationError.code);
    return json({ providerError: true, errorCode: "TRIP_REQUEST_SAVE_FAILED" }, 500);
  }

  return json({ providerError: false, requestReceived: true });
});
