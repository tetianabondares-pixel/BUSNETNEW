import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { Header } from "@/components/layout/Header";
import { SearchWidget } from "@/components/SearchWidget";
import { TrustStats } from "@/components/TrustStats";
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
        justifyContent: "flex-start",
        padding: 0,
        backgroundColor: tokens.colorBg,
        color: tokens.colorText,
        transition: "background-color 300ms ease, color 300ms ease",
      }}
    >
      {/* Outer Cinematic Tech Container matching the Mockups */}
      <div
        className="home-hero"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "none",
          minHeight: "100vh",
          borderRadius: 0,
          overflow: "visible",
          border: "none",
          boxShadow: "none",
          display: "flex",
          flexDirection: "column",
          background: isDark ? "#050912" : "#F4F7FB",
        }}
      >
        {/* Crossfade both images so theme changes do not replace the background abruptly. */}
        <div
          className="home-hero__background"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/images/busnet-kyiv-background-day.png)",
            backgroundSize: "cover",
            backgroundPosition: "right center",
            backgroundRepeat: "no-repeat",
            opacity: isDark ? 0 : 1,
            filter: isDark ? "blur(8px)" : "blur(0)",
            transition: "opacity 850ms cubic-bezier(0.22, 1, 0.36, 1), filter 850ms cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: 1,
          }}
          aria-hidden="true"
        />
        <div
          className="home-hero__background"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/images/busnet-kyiv-background-night.png)",
            backgroundSize: "cover",
            backgroundPosition: "right calc(50% + 42px)",
            backgroundRepeat: "no-repeat",
            opacity: isDark ? 0.95 : 0,
            filter: isDark ? "blur(0)" : "blur(8px)",
            transition: "opacity 850ms cubic-bezier(0.22, 1, 0.36, 1), filter 850ms cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: 1,
          }}
          aria-hidden="true"
        />

        {/* Crossfade theme-specific shading with the images. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(244,247,251,0.96) 0%, rgba(244,247,251,0.86) 35%, rgba(244,247,251,0.5) 60%, rgba(244,247,251,0.12) 100%), linear-gradient(180deg, rgba(244,247,251,0.5) 0%, transparent 20%, transparent 75%, rgba(244,247,251,0.8) 100%)",
            opacity: isDark ? 0 : 1,
            transition: "opacity 850ms cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: 2,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(5,9,18,0.96) 0%, rgba(5,9,18,0.85) 35%, rgba(5,9,18,0.55) 58%, rgba(5,9,18,0.15) 100%), linear-gradient(180deg, rgba(5,9,18,0.6) 0%, transparent 20%, transparent 75%, rgba(5,9,18,0.85) 100%)",
            opacity: isDark ? 1 : 0,
            transition: "opacity 850ms cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: 2,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />

        {/* Layer 4: Global Header */}
        <Header />

        {/* Layer 5: Hero Content (Left-aligned, Asymmetrical composition) */}
        <div
          className="home-hero__content"
          style={{
            position: "relative",
            zIndex: 10,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "2rem 3rem 4.5rem",
            maxWidth: "820px",
          }}
        >
          {/* Upper Kicker */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "1rem",
            }}
          >
            <span
              style={{
                width: "4px",
                height: "4px",
                borderRadius: "50%",
                background: isDark ? "#38BDF8" : "#087DFF",
              }}
            />
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: isDark ? "#8B9AAF" : "#7A8A9D",
              }}
            >
              {t("app.heroKicker")}
            </span>
          </div>

          {/* Main Headline */}
          <h1
            style={{
              fontSize: "clamp(3rem, 4.8vw, 4rem)",
              fontWeight: 650,
              letterSpacing: "-0.045em",
              lineHeight: 1.05,
              color: isDark ? "#FFFFFF" : "#101828",
              marginBottom: "1rem",
              textWrap: "balance",
            }}
          >
            {t("app.heroTitle1")}{" "}
            <span
              style={{
                color: isDark ? "#38BDF8" : "#087DFF",
              }}
            >
              {t("app.heroTitleAccent")}
            </span>
            <br />
            {t("app.heroTitle2")}
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: "0.96rem",
              lineHeight: 1.5,
              fontWeight: 500,
              color: isDark ? "#B6C2D2" : "#53647A",
              marginBottom: "2rem",
              maxWidth: "520px",
            }}
          >
            {t("app.heroSubtitle")}
          </p>

          {/* Interactive Search Widget */}
          <SearchWidget selectedRoute={selectedRoute} />

          {/* Trust Metrics */}
          <TrustStats />
        </div>
      </div>
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
