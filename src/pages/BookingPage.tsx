import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";

/**
 * Supabase-backed trip results. Booking confirmation is implemented later.
 */
export function BookingPage() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState<Array<Record<string, unknown>>>([]);
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
    const runProviderSearch = async () => {
      try {
        const { data: locations, error: locationError } = await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it,provider_location_id")
          .in("id", [fromId, toId])
          .eq("active", true);
        if (locationError) throw locationError;
        const fromLocation = locations?.find((location) => location.id === fromId);
        const toLocation = locations?.find((location) => location.id === toId);
        if (!fromLocation || !toLocation || !fromLocation.provider_location_id || !toLocation.provider_location_id) {
          throw new Error("ALTRANS_LOCATION_NOT_IMPORTED");
        }
        if (fromId === toId) throw new Error("SAME_LOCATION");
        const locale = i18n.language?.startsWith("en")
          ? "en"
          : i18n.language?.startsWith("it")
            ? "it"
            : "uk";
        const displayName = (location: typeof fromLocation) =>
          locale === "en"
            ? location.name_en ?? location.name_uk
            : locale === "it"
              ? location.name_it ?? location.name_en ?? location.name_uk
              : location.name_uk;
        setRouteNames({
          from: displayName(fromLocation),
          to: displayName(toLocation),
        });

        const { data, error: invokeError } = await supabase.functions.invoke(
          "altrans-adapter",
          {
            body: {
              operation: "search-trips",
              fromLocationId: fromLocation.id,
              toLocationId: toLocation.id,
              travelDate: date,
              currencyCode: "UAH",
            },
          },
        );

        if (cancelled) return;
        if (invokeError) {
          setError(t("booking.providerError"));
        } else if (data?.providerError) {
          setError(t("booking.providerError"));
        } else {
          setTrips(Array.isArray(data?.trips) ? data.trips : []);
        }
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error && caught.message === "ALTRANS_LOCATION_NOT_IMPORTED"
            ? t("booking.locationNotImported")
            : caught instanceof Error && caught.message === "AMBIGUOUS_LOCATION"
              ? t("booking.locationAmbiguous")
              : caught instanceof Error && caught.message === "SAME_LOCATION"
                ? t("booking.sameLocation")
                : t("booking.searchError"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void runProviderSearch();

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
        {trips.map((trip) => {
          const departureDate = String(trip.departure_date ?? "");
          const departureTime = String(trip.departure_time ?? "");
          const arrivalDate = String(trip.arrival_date ?? "");
          const arrivalTime = String(trip.arrival_time ?? "");
          const carrier = String(trip.carrier ?? "");
          const price = trip.price == null ? "" : String(trip.price);
          const currency = String(trip.currency ?? "");
          const tripId = String(trip.trip_id ?? `${departureDate}-${departureTime}`);

          return (
            <article
              key={tripId}
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
                <strong>{carrier || t("booking.trip")}</strong>
                <div style={{ color: tokens.colorTextSecondary, marginTop: "4px" }}>
                  {departureDate} {departureTime}
                </div>
                {(arrivalDate || arrivalTime) && (
                  <div style={{ color: tokens.colorTextSecondary, marginTop: "4px" }}>
                    {String(trip.arrival_city ?? "")} · {arrivalDate} {arrivalTime}
                  </div>
                )}
              </div>
              <strong>{price} {currency}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
