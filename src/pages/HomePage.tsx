import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { Header } from "@/components/layout/Header";
import { SearchWidget } from "@/components/SearchWidget";
import {
  PopularDestinations,
  type PopularDestination,
} from "@/components/PopularDestinations";
import { HowItWorks } from "@/components/HowItWorks";
import { ComfortSection } from "@/components/ComfortSection";
import { FAQSection } from "@/components/FAQSection";

export function HomePage() {
  const { t } = useTranslation();
  const { resolved, tokens } = useTheme();
  const isDark = resolved === "dark";
  const [selectedRoute, setSelectedRoute] =
    useState<PopularDestination | null>(null);

  return (
    <div
      className="home-hero"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 0,
        backgroundColor: tokens.colorBg,
        color: tokens.colorText,
        transition: "background-color 300ms ease, color 300ms ease",
      }}
    >
      <section
        className="home-hero__stage"
        data-theme={resolved}
        aria-labelledby="home-hero-title"
      >
        <div
          className="home-hero__glow"
          aria-hidden="true"
          style={{
            backgroundImage: isDark
              ? `linear-gradient(180deg, rgba(5, 9, 18, 0.12) 0%, rgba(5, 9, 18, 0.06) 58%, ${tokens.colorBg} 100%), url("${tokens.bgImage}")`
              : `linear-gradient(180deg, rgba(244, 247, 251, 0.14) 0%, rgba(244, 247, 251, 0.04) 58%, ${tokens.colorBg} 100%), url("${tokens.bgImage}")`,
          }}
        />

        <Header />

        <div className="home-hero__content">
          <h1 id="home-hero-title">{t("app.heroTitle1")}</h1>
          <p>{t("app.heroSubtitle")}</p>
          <SearchWidget selectedRoute={selectedRoute} />
        </div>
      </section>

      <PopularDestinations
        isDark={isDark}
        onSelectDestination={(destination) =>
          setSelectedRoute({ ...destination })
        }
      />
      <HowItWorks isDark={isDark} />
      <ComfortSection isDark={isDark} />
      <FAQSection />
    </div>
  );
}
