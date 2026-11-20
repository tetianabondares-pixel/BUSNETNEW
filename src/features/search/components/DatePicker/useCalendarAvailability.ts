import { useEffect, useRef, useState } from "react";
import type { AvailabilityMonthRequest, CalendarAvailability } from "./calendar.types";
import { supabase } from "@/lib/supabase";

type AvailabilityState = {
  data: CalendarAvailability[];
  loading: boolean;
  error: string | null;
};

const scheduleCache = new Map<string, CalendarAvailability[]>();

function normalizeAvailability(payload: unknown): CalendarAvailability[] {
  const root = payload as { data?: unknown; availability?: unknown } | null;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? root.data
      : Array.isArray(root?.availability)
        ? root.availability
        : null;

  if (!rows) throw new Error("Invalid availability response");

  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid schedule availability row");
    }
    const item = row as Record<string, unknown>;
    const date = item.date;
    const count = Number(item.scheduledServicesCount ?? item.scheduled_services_count);
    const isAvailable = item.isAvailable ?? item.is_available;
    const routes = item.routes;
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      typeof isAvailable !== "boolean" ||
      isAvailable !== (count > 0) ||
      !Array.isArray(routes)
    ) {
      throw new Error("Invalid schedule availability row");
    }
    return {
      date,
      scheduledServicesCount: count,
      routes: routes.map(String),
      isAvailable,
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
    const cacheKey = `${request.year}-${request.month}-${request.fromLocationId}-${request.toLocationId}-${request.timezone}`;
    const cached = scheduleCache.get(cacheKey);

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
        });
        if (error) throw error;
        const availability = normalizeAvailability(data);
        scheduleCache.set(cacheKey, availability);
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
  }, [request.year, request.month, request.fromLocationId, request.toLocationId, request.timezone, retryKey]);

  return { ...state, retry: () => setRetryKey((value) => value + 1) };
}
