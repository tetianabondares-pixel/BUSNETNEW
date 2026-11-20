import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import {
  deduplicateScheduledServicesByDeparture,
  getScheduledArrivalDate,
  type ScheduledService,
} from "@/features/search/schedule-search";

function languageOf(language: string): "uk" | "en" | "it" {
  return language.startsWith("en") ? "en" : language.startsWith("it") ? "it" : "uk";
}

export function BookingPage() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState<ScheduledService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [routeNames, setRouteNames] = useState({ from: "", to: "" });
  const fromId = searchParams.get("fromId")?.trim() ?? "";
  const toId = searchParams.get("toId")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    if (!fromId || !toId || !date) {
      setError(t("booking.missingSearch"));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setTrips([]);

    const searchSchedules = async () => {
      try {
        const { data: locations, error: locationError } = await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it")
          .in("id", [fromId, toId])
          .eq("active", true);
        if (locationError) throw locationError;

        const fromLocation = locations?.find((location) => location.id === fromId);
        const toLocation = locations?.find((location) => location.id === toId);
        if (!fromLocation || !toLocation) throw new Error("LOCATION_NOT_FOUND");
        if (fromId === toId) throw new Error("SAME_LOCATION");

        const locale = languageOf(i18n.language);
        const displayName = (location: typeof fromLocation) =>
          locale === "en"
            ? location.name_en ?? location.name_uk
            : locale === "it"
              ? location.name_it ?? location.name_en ?? location.name_uk
              : location.name_uk;

        const { data: routes, error: routeError } = await supabase
          .from("routes")
          .select("provider_route_id")
          .eq("from_location_id", fromId)
          .eq("to_location_id", toId)
          .eq("active", true)
          .not("provider_route_id", "is", null);
        if (routeError) throw routeError;

        const providerRouteIds = [...new Set(
          (routes ?? []).map((route) => route.provider_route_id).filter(Boolean),
        )];
        if (providerRouteIds.length === 0) {
          if (!cancelled) {
            setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
            setTrips([]);
          }
          return;
        }

        const { data: schedules, error: scheduleError } = await supabase
          .from("provider_route_schedules")
          .select("id, title, service_weekday")
          .in("provider_route_id", providerRouteIds)
          .eq("active", true);
        if (scheduleError) throw scheduleError;

        const scheduleIds = (schedules ?? []).map((schedule) => schedule.id);
        if (scheduleIds.length === 0) {
          if (!cancelled) {
            setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
            setTrips([]);
          }
          return;
        }

        const { data: stops, error: stopsError } = await supabase
          .from("provider_route_schedule_stops")
          .select("schedule_id, location_id, stop_order, day_offset, departure_time, place")
          .in("schedule_id", scheduleIds)
          .in("location_id", [fromId, toId]);
        if (stopsError) throw stopsError;

        const stopsBySchedule = new Map<string, Array<{
          location_id: string;
          stop_order: number;
          day_offset: number;
          departure_time: string;
          place: string | null;
        }>>();
        for (const stop of stops ?? []) {
          const scheduleStops = stopsBySchedule.get(stop.schedule_id) ?? [];
          scheduleStops.push(stop);
          stopsBySchedule.set(stop.schedule_id, scheduleStops);
        }

        const scheduledServices = (schedules ?? []).flatMap((schedule) => {
          const scheduleStops = stopsBySchedule.get(schedule.id) ?? [];
          const fromStop = scheduleStops.find((stop) => stop.location_id === fromId);
          const toStop = scheduleStops.find((stop) => stop.location_id === toId);
          if (!fromStop || !toStop) return [];
          const arrivalDate = getScheduledArrivalDate(
            date,
            { stopOrder: fromStop.stop_order, dayOffset: fromStop.day_offset },
            { stopOrder: toStop.stop_order, dayOffset: toStop.day_offset },
            schedule.service_weekday,
          );
          if (!arrivalDate) return [];

          return [{
            id: `${schedule.id}:${date}`,
            departureDate: date,
            departureTime: fromStop.departure_time.slice(0, 5),
            departurePlace: fromStop.place,
            arrivalDate,
            arrivalTime: toStop.departure_time.slice(0, 5),
            arrivalPlace: toStop.place,
          }];
        });
        const matchingTrips = deduplicateScheduledServicesByDeparture(scheduledServices);

        if (!cancelled) {
          setRouteNames({ from: displayName(fromLocation), to: displayName(toLocation) });
          setTrips(matchingTrips);
        }
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error && caught.message === "SAME_LOCATION"
            ? t("booking.sameLocation")
            : t("booking.searchError"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void searchSchedules();
    return () => {
      cancelled = true;
    };
  }, [fromId, toId, date, i18n.language, t]);

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
        padding: "3rem 1.5rem",
        minHeight: "50vh",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>
        {t("booking.title")}
      </h1>
      <p style={{ color: tokens.colorTextSecondary }}>
        {routeNames.from || fromId} → {routeNames.to || toId} · {date}
      </p>

      {loading && (
        <p style={{ color: tokens.colorTextSecondary }}>{t("booking.loading")}</p>
      )}

      {!loading && error && (
        <p style={{ color: tokens.colorTextSecondary }}>{error}</p>
      )}

      {!loading && !error && trips.length === 0 && (
        <p style={{ color: tokens.colorTextSecondary }}>{t("booking.notFound")}</p>
      )}

      <div style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "12px" }}>
        {trips.map((trip) => (
          <article
            key={trip.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              padding: "18px",
              borderRadius: "14px",
              border: `1px solid ${tokens.colorBorder}`,
              background: tokens.colorBgCard,
              boxSizing: "border-box",
            }}
          >
            <div>
              <strong>{t("calendar.scheduledService")}</strong>
              <div style={{ color: tokens.colorTextSecondary, marginTop: "4px" }}>
                {routeNames.from} {trip.departureTime}
                {trip.departurePlace ? ` · ${trip.departurePlace}` : ""}
              </div>
              <div style={{ color: tokens.colorTextSecondary, marginTop: "4px" }}>
                {routeNames.to} · {trip.arrivalDate} {trip.arrivalTime}
                {trip.arrivalPlace ? ` · ${trip.arrivalPlace}` : ""}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
