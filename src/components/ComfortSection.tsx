import { Luggage, MapPin, PlugZap, Snowflake, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./ComfortSection.css";

const FEATURES = [
  { key: "power", Icon: PlugZap },
  { key: "wifi", Icon: Wifi },
  { key: "climate", Icon: Snowflake },
  { key: "luggage", Icon: Luggage },
  { key: "tracking", Icon: MapPin },
] as const;

interface ComfortSectionProps {
  isDark: boolean;
}

export function ComfortSection({ isDark }: ComfortSectionProps) {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="comfort-title"
      className="comfort-section"
      data-theme={isDark ? "dark" : "light"}
      id="comfort"
    >
      <div className="comfort-section__content">
        <header className="comfort-section__header">
          <span className="comfort-section__eyebrow">{t("comfort.eyebrow")}</span>
          <h2 className="comfort-section__title" id="comfort-title">
            {t("comfort.title")}
          </h2>
          <p className="comfort-section__subtitle">{t("comfort.subtitle")}</p>
        </header>

        <ul className="comfort-section__grid">
          {FEATURES.map(({ key, Icon }) => (
            <li className="comfort-section__card" key={key}>
              <span className="comfort-section__icon" aria-hidden="true">
                <Icon size={22} strokeWidth={1.8} />
              </span>
              <h3>{t(`comfort.features.${key}.title`)}</h3>
              <p>{t(`comfort.features.${key}.description`)}</p>
              <span className="comfort-section__highlight">
                {t(`comfort.features.${key}.highlight`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
