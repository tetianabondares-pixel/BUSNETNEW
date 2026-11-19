import { ArrowRight, ChevronRight, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./PopularDestinations.css";

export interface PopularDestination {
  from: string;
  to: string;
}

// Temporary local examples only; these are not verified or bookable routes.
export const MOCK_DESTINATIONS: readonly PopularDestination[] = [
  { from: "Київ", to: "Варшава" },
  { from: "Київ", to: "Прага" },
  { from: "Львів", to: "Краків" },
  { from: "Одеса", to: "Будапешт" },
];

interface PopularDestinationsProps {
  isDark: boolean;
  onSelectDestination: (destination: PopularDestination) => void;
}

export function PopularDestinations({
  isDark,
  onSelectDestination,
}: PopularDestinationsProps) {
  const { t } = useTranslation();

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
          {MOCK_DESTINATIONS.map((destination) => (
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
