import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function providerRequest(path: string, init: RequestInit) {
  const base = Deno.env.get("ALTRANS_API_BASE") ?? "https://al-trans.com.ua";
  const apiKey = Deno.env.get("ALTRANS_API_KEY");

  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: {
        providerError: true,
        errorCode: "ALTRANS_NOT_CONFIGURED",
        trips: [],
      },
    };
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
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
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
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

  const operation = String(payload.operation ?? "");
  if (operation === "routes") {
    const result = await providerRequest("/api/v3/cache/routes", { method: "GET" });
    if (!result.ok) {
      return json(
        { providerError: true, errorCode: "ALTRANS_UNAVAILABLE", trips: [] },
        result.status,
      );
    }
    return json({ providerError: false, routes: result.body });
  }

  if (operation === "route-details") {
    const key = String(payload.navigationKey ?? "");
    if (!key) {
      return json({ providerError: true, errorCode: "INVALID_ROUTE_KEY", trips: [] }, 400);
    }
    const result = await providerRequest("/api/v2/references/route_details_key", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    if (!result.ok) {
      return json(
        { providerError: true, errorCode: "ALTRANS_UNAVAILABLE", trips: [] },
        result.status,
      );
    }
    return json({ providerError: false, route: result.body });
  }

  if (operation === "search-trips") {
    const cityFromId = payload.cityFromId ?? payload.city_from_id;
    const cityToId = payload.cityToId ?? payload.city_to_id;
    const date = payload.travelDate ?? payload.depature_date ?? payload.date;
    if (!cityFromId || !cityToId || !date) {
      return json(
        { providerError: true, errorCode: "INVALID_SEARCH_PARAMS", trips: [] },
        400,
      );
    }

    const result = await providerRequest("/api/v2/booking/search_trips", {
      method: "POST",
      body: JSON.stringify({
        city_from_id: cityFromId,
        city_to_id: cityToId,
        date,
        depature_date: date,
        currecny_code: payload.currencyCode ?? "UAH",
      }),
    });

    if (!result.ok) {
      return json(
        {
          providerError: true,
          errorCode: "ALTRANS_UNAVAILABLE",
          trips: [],
          status: result.status,
        },
        result.status,
      );
    }

    const root = result.body as {
      trips_sequences?: unknown[];
      trips?: unknown[];
      price?: unknown;
      currency_code?: unknown;
    };
    const trips = Array.isArray(root?.trips_sequences)
      ? root.trips_sequences
      : Array.isArray(root?.trips)
        ? root.trips
        : [];

    return json({
      providerError: false,
      trips,
      searchedAt: new Date().toISOString(),
    });
  }

  return json(
    { providerError: true, errorCode: "UNKNOWN_OPERATION", trips: [] },
    400,
  );
});
