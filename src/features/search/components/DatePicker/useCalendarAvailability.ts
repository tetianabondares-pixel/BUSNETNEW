import { useEffect, useRef, useState } from "react";
import type { AvailabilityMonthRequest, CalendarAvailability } from "./calendar.types";

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
    const cacheKey = `${request.year}-${request.month}-${request.from}-${request.to}`;
    const cached = confirmedCache.get(cacheKey);

    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return () => controller.abort();
    }

    const endpoint = import.meta.env.VITE_BUSNET_AVAILABILITY_API as string | undefined;
    if (!request.from.trim() || !request.to.trim()) {
      setState({ data: [], loading: false, error: "calendar.selectRouteError" });
      return () => controller.abort();
    }
    if (!endpoint) {
      setState({ data: [], loading: false, error: "calendar.providerError" });
      return () => controller.abort();
    }

    setState({ data: [], loading: true, error: null });
    const timeout = window.setTimeout(async () => {
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("year", String(request.year));
        url.searchParams.set("month", String(request.month));
        url.searchParams.set("from", request.from);
        url.searchParams.set("to", request.to);
        url.searchParams.set("timezone", request.timezone);
        url.searchParams.set("schemaVersion", request.schemaVersion);

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Provider returned ${response.status}`);
        const data = normalizeAvailability(await response.json());
        confirmedCache.set(cacheKey, data);
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
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
  }, [request.year, request.month, request.from, request.to, retryKey]);

  return { ...state, retry: () => setRetryKey((value) => value + 1) };
}
