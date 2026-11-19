import React from "react";
import { useTheme } from "@/theme";
import { useTranslation } from "react-i18next";

interface Props {
  className?: string;
}

export function BusnetLogo({ className = "" }: Props) {
  const { resolved, tokens } = useTheme();
  const { t } = useTranslation();
  const isDark = resolved === "dark";

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        textDecoration: "none",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {/* Aerodynamic Bus Icon with Tech Orbit */}
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "10px",
          background: isDark
            ? "rgba(8, 125, 255, 0.12)"
            : "rgba(8, 125, 255, 0.08)",
          border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(8, 125, 255, 0.2)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isDark
            ? "0 0 16px rgba(8, 125, 255, 0.2)"
            : "0 2px 8px rgba(8, 125, 255, 0.1)",
          transition: "all 200ms ease",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isDark ? "#38BDF8" : "#087DFF"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Aerodynamic Bus Body */}
          <path d="M 4 6 C 4 4.5 5.5 3.5 7 3.5 H 17 C 19 3.5 20.5 5 21 7.5 L 21.5 13 C 21.5 14.5 20.5 15.5 19 15.5 H 5 C 4 15.5 3.5 14.8 3.5 14 V 7 C 3.5 6.5 3.7 6.2 4 6 Z" />
          {/* Windshield & Windows */}
          <path d="M 6 6.5 H 11 V 10.5 H 5 V 7.5 C 5 7 5.5 6.5 6 6.5 Z" />
          <path d="M 13 6.5 H 18.5 C 19.2 6.5 19.8 7.2 20 8 L 20 10.5 H 13 V 6.5 Z" />
          {/* Headlight */}
          <circle cx="19.5" cy="13.5" r="0.8" fill={isDark ? "#38BDF8" : "#087DFF"} />
          {/* Wheels */}
          <circle cx="7" cy="16.5" r="2" fill={isDark ? "#050912" : "#FFFFFF"} strokeWidth="1.8" />
          <circle cx="17" cy="16.5" r="2" fill={isDark ? "#050912" : "#FFFFFF"} strokeWidth="1.8" />
        </svg>
      </div>

      {/* Typography */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem", lineHeight: 1.1 }}>
          <span
            style={{
              fontSize: "1.18rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: tokens.colorText,
            }}
          >
            BUSNET
          </span>
          <span
            style={{
              fontSize: "1.18rem",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: isDark ? "#38BDF8" : "#087DFF",
            }}
          >
            UA
          </span>
        </div>
        <span
          style={{
            fontSize: "0.68rem",
            color: tokens.colorTextSecondary,
            letterSpacing: "0.02em",
            fontWeight: 400,
            marginTop: "1px",
          }}
        >
          {t("app.tagline")}
        </span>
      </div>
    </div>
  );
}
