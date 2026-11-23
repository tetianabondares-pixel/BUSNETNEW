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
        <div className="home-hero__glow" aria-hidden="true" />
        <div className="home-hero__route-art" aria-hidden="true">
          <svg viewBox="0 0 560 460" fill="none">
            <path className="home-hero__route-line" d="M92 310C165 288 168 174 260 195s107 116 208 51" />
            <path className="home-hero__route-line home-hero__route-line--secondary" d="M92 310C170 366 241 357 301 292s90-113 167-126" />
            <circle className="home-hero__route-node" cx="92" cy="310" r="7" />
            <circle className="home-hero__route-node" cx="260" cy="195" r="7" />
            <circle className="home-hero__route-node" cx="301" cy="292" r="7" />
            <circle className="home-hero__route-node home-hero__route-node--end" cx="468" cy="167" r="7" />
            <circle className="home-hero__route-node home-hero__route-node--end" cx="468" cy="246" r="7" />
            <circle className="home-hero__route-halo" cx="92" cy="310" r="20" />
            <text x="69" y="350">KYIV</text>
            <text x="226" y="175">WARSAW</text>
            <text x="275" y="330">PRAGUE</text>
            <text x="444" y="146">BERLIN</text>
            <text x="446" y="278">MILAN</text>
          </svg>
          <div className="home-hero__route-caption">
            <span />
            {t("app.routeCaption")}
          </div>
        </div>

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
