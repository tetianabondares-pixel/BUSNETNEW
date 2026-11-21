import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import type { ResolvedLocation } from "@/features/search/location.types";
import "./PopularDestinations.css";

export interface PopularDestination {
  from: ResolvedLocation;
  to: ResolvedLocation;
}

interface PopularDestinationsProps {
  isDark: boolean;
  onSelectDestination: (destination: PopularDestination) => void;
}

export function PopularDestinations({
  isDark,
  onSelectDestination,
}: PopularDestinationsProps) {
  const { t, i18n } = useTranslation();
  const [destinations, setDestinations] = useState<PopularDestination[]>([]);

  useEffect(() => {
    let cancelled = false;
    const locale = i18n.language?.startsWith("en")
      ? "en"
      : i18n.language?.startsWith("it")
        ? "it"
        : "uk";

    const loadDestinations = async () => {
      let routePairs: Array<{
        from_location_id: string;
        to_location_id: string;
      }> = [];

      const { data: popularRows, error: popularError } = await supabase
        .from("popular_routes")
        .select("route_id,routes(from_location_id,to_location_id)")
        .eq("active", true)
        .eq("locale", locale)
        .order("sort_order")
        .limit(8);

      if (!cancelled && !popularError && popularRows?.length) {
        routePairs = (popularRows as unknown as Array<{
          routes:
            | { from_location_id: string; to_location_id: string }
            | Array<{ from_location_id: string; to_location_id: string }>
            | null;
        }>).flatMap((row) => {
          if (Array.isArray(row.routes)) return row.routes;
          return row.routes ? [row.routes] : [];
        });
      }

      if (!cancelled && routePairs.length === 0) {
        const { data: activeRoutes, error: routesError } = await supabase
          .from("routes")
          .select("from_location_id,to_location_id")
          .eq("active", true)
          .limit(8);
        if (!routesError && activeRoutes?.length) {
          routePairs = activeRoutes;
        }
      }

      if (cancelled || routePairs.length === 0) return;

      const locationIds = [...new Set(routePairs.flatMap((row) =>
        [row.from_location_id, row.to_location_id],
      ))];
      const { data: locations, error: locationsError } = await supabase
        .from("locations")
        .select("id,name_uk,name_en,name_it,country_code,provider_location_id")
        .in("id", locationIds)
        .eq("active", true);

      if (cancelled || locationsError || !locations) return;
      const byId = new Map(locations.map((location) => [location.id, location]));
      const nextDestinations = routePairs.map((row) => {
        const from = byId.get(row.from_location_id);
        const to = byId.get(row.to_location_id);
        const display = (location: typeof from): ResolvedLocation => ({
          id: location?.id ?? "",
          name: locale === "en"
            ? (location?.name_en ?? location?.name_uk ?? "")
            : locale === "it"
              ? (location?.name_it ?? location?.name_en ?? location?.name_uk ?? "")
              : (location?.name_uk ?? ""),
          nameUk: location?.name_uk ?? "",
          nameEn: location?.name_en ?? null,
          nameIt: location?.name_it ?? null,
          countryCode: location?.country_code ?? null,
          providerLocationId: location?.provider_location_id ?? null,
        });
        return { from: display(from), to: display(to) };
      }).filter((destination) =>
        destination.from.id &&
        destination.to.id &&
        destination.from.id !== destination.to.id,
      );

      if (!cancelled) setDestinations(nextDestinations);
    };

    void loadDestinations();

    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const handleSelect = (destination: PopularDestination) => {
    onSelectDestination(destination);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById("trip-search")?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <section
      className="popular-destinations"
      id="routes"
      data-theme={isDark ? "dark" : "light"}
      aria-labelledby="popular-destinations-title"
    >
      <div className="popular-destinations__content">
        <h2
          className="popular-destinations__title"
          id="popular-destinations-title"
        >
          {t("popularDestinations.title")}
        </h2>
        <p className="popular-destinations__subtitle">
          {t("popularDestinations.subtitle")}
        </p>

        <div className="popular-destinations__grid">
          {destinations.map((destination) => (
            <button
              className="popular-destinations__card"
              key={`${destination.from.id}:${destination.to.id}`}
              type="button"
              aria-label={t("popularDestinations.chooseRoute", {
                from: destination.from.name,
                to: destination.to.name,
              })}
              onClick={() => handleSelect(destination)}
            >
              <Landmark
                className="popular-destinations__city-icon"
                aria-hidden="true"
                size={22}
                strokeWidth={1.5}
              />
              <span className="popular-destinations__details">
                <span className="popular-destinations__cities">
                  <span>{destination.from.name}</span>
                  <ArrowRight
                    aria-hidden="true"
                    className="popular-destinations__route-arrow"
                    size={15}
                  />
                  <span>{destination.to.name}</span>
                </span>
                <span className="popular-destinations__action">
                  <span>{t("popularDestinations.selectRoute")}</span>
                  <ChevronRight
                    className="popular-destinations__action-icon"
                    aria-hidden="true"
                    size={15}
                  />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
