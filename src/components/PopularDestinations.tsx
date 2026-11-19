import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import "./PopularDestinations.css";

export interface PopularDestination {
  from: string;
  to: string;
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

    supabase
      .from("popular_routes")
      .select("routes(from_location_id,to_location_id)")
      .eq("active", true)
      .eq("locale", locale)
      .order("sort_order")
      .then(async ({ data, error }) => {
        if (cancelled || error || !data?.length) return;

        const routeIds = data as unknown as Array<{
          routes: { from_location_id: string; to_location_id: string };
        }>;
        const locationIds = routeIds.flatMap((row) =>
          [row.routes.from_location_id, row.routes.to_location_id],
        );
        const { data: locations, error: locationsError } = await supabase
          .from("locations")
          .select("id,name_uk,name_en,name_it")
          .in("id", locationIds);

        if (cancelled || locationsError || !locations) return;
        const byId = new Map(locations.map((location) => [location.id, location]));
        setDestinations(routeIds.map((row) => {
          const from = byId.get(row.routes.from_location_id);
          const to = byId.get(row.routes.to_location_id);
          return {
            from: locale === "en" ? (from?.name_en ?? from?.name_uk ?? "") : locale === "it" ? (from?.name_it ?? from?.name_uk ?? "") : (from?.name_uk ?? ""),
            to: locale === "en" ? (to?.name_en ?? to?.name_uk ?? "") : locale === "it" ? (to?.name_it ?? to?.name_uk ?? "") : (to?.name_uk ?? ""),
          };
        }).filter((destination) => destination.from && destination.to));
      });

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
              key={`${destination.from}-${destination.to}`}
              type="button"
              aria-label={t("popularDestinations.chooseRoute", {
                from: destination.from,
                to: destination.to,
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
                  <span>{destination.from}</span>
                  <ArrowRight
                    aria-hidden="true"
                    className="popular-destinations__route-arrow"
                    size={15}
                  />
                  <span>{destination.to}</span>
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
