import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";

/**
 * Supabase-backed trip results. Booking confirmation is implemented later.
 */
export function BookingPage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    if (!from || !to || !date) {
      setError(t("booking.missingSearch"));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const runProviderSearch = async () => {
      try {
        const { data: locations, error: locationsError } = await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it,provider_location_id")
          .or(`name_uk.ilike.${from},name_en.ilike.${from},name_it.ilike.${from}`)
          .limit(10);

        if (locationsError) throw locationsError;

        const toLocations = await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it,provider_location_id")
          .or(`name_uk.ilike.${to},name_en.ilike.${to},name_it.ilike.${to}`)
          .limit(10);

        if (toLocations.error) throw toLocations.error;
        const fromLocation = locations?.[0];
        const toLocation = toLocations.data?.[0];

        if (!fromLocation?.provider_location_id || !toLocation?.provider_location_id) {
          throw new Error("ALTRANS_LOCATION_NOT_IMPORTED");
        }

        const { data, error: invokeError } = await supabase.functions.invoke(
          "altrans-adapter",
          {
            body: {
              operation: "search-trips",
              cityFromId: fromLocation.provider_location_id,
              cityToId: toLocation.provider_location_id,
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
  }, [from, to, date, t]);

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
        {from} → {to} · {date}
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
          const departure = String(trip.departure_at ?? "");
          const carrier = String(trip.carrier ?? "");
          const price = trip.price == null ? "" : String(trip.price);
          const currency = String(trip.currency ?? "");

          return (
            <article
              key={String(trip.trip_id)}
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
                  {departure ? new Date(departure).toLocaleString() : ""}
                </div>
              </div>
              <strong>{price} {currency}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
