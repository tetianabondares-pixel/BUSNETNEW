import { useEffect, useRef, useState } from "react";
import type { AvailabilityMonthRequest, CalendarAvailability } from "./calendar.types";
import { supabase } from "@/lib/supabase";

type AvailabilityState = {
  data: CalendarAvailability[];
  loading: boolean;
  error: string | null;
};

const confirmedCache = new Map<string, CalendarAvailability[]>();

function normalizeAvailability(payload: unknown): CalendarAvailability[] {
  const root = payload as { data?: unknown; availability?: unknown };
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.availability)
        ? root.availability
        : null;

  if (!rows) throw new Error("Invalid availability response");

  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      date: String(item.date ?? ""),
      tripsCount: Number(item.tripsCount ?? item.trips_count ?? 0),
      minPrice: item.minPrice == null && item.min_price == null ? null : Number(item.minPrice ?? item.min_price),
      maxPrice: item.maxPrice == null && item.max_price == null ? null : Number(item.maxPrice ?? item.max_price),
      currency: item.currency == null ? null : String(item.currency),
      routes: Array.isArray(item.routes) ? item.routes.map(String) : [],
      isAvailable: Boolean(item.isAvailable ?? item.is_available),
    };
  });
}

export function useCalendarAvailability(request: AvailabilityMonthRequest) {
  const [state, setState] = useState<AvailabilityState>({ data: [], loading: false, error: null });
  const [retryKey, setRetryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const cacheKey = `${request.year}-${request.month}-${request.fromLocationId}-${request.toLocationId}`;
    const cached = confirmedCache.get(cacheKey);

    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return () => controller.abort();
    }

    if (!request.fromLocationId || !request.toLocationId) {
      setState({ data: [], loading: false, error: "calendar.selectRouteError" });
      return () => controller.abort();
    }

    setState({ data: [], loading: true, error: null });
    const timeout = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("get_month_availability", {
          p_year: request.year,
          p_month: request.month,
          p_from_location_id: request.fromLocationId,
          p_to_location_id: request.toLocationId,
          p_timezone: request.timezone,
          p_schema_version: request.schemaVersion,
        });
        if (error) throw error;
        const availability = normalizeAvailability(data);
        confirmedCache.set(cacheKey, availability);
        if (!controller.signal.aborted) setState({ data: availability, loading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "calendar.providerError";
        setState({ data: [], loading: false, error: message || "calendar.providerError" });
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [request.year, request.month, request.fromLocationId, request.toLocationId, request.timezone, request.schemaVersion, retryKey]);

  return { ...state, retry: () => setRetryKey((value) => value + 1) };
}
