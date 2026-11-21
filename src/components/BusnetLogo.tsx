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
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "10px",
          background: "#fff",
          border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(8, 125, 255, 0.2)"}`,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          boxShadow: isDark
            ? "0 0 16px rgba(8, 125, 255, 0.2)"
            : "0 2px 8px rgba(8, 125, 255, 0.1)",
          transition: "all 200ms ease",
        }}
      >
        <img
          src="/icons/busnet-192.png"
          alt=""
          aria-hidden="true"
          width={48}
          height={48}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>

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
