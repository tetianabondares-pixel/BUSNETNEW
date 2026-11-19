import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

/**
 * Landing page — hero section with search widget stub.
 * MVP scope: header, search, results area, footer.
 * Excludes: popular routes, FAQ, map, marketing sections.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        padding: "3rem 1.5rem",
        textAlign: "center",
        minHeight: "60vh",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>
        {t("app.name")}
      </h1>
      <p style={{ color: tokens.colorTextSecondary, maxWidth: "36rem" }}>
        {t("app.tagline")}
      </p>

      {/* Search widget stub */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "center",
          padding: "1.5rem",
          background: tokens.colorBgCard,
          borderRadius: tokens.radiusLg,
          boxShadow: tokens.shadowLg,
          border: `1px solid ${tokens.colorBorder}`,
          width: "100%",
          maxWidth: "40rem",
        }}
      >
        <input
          placeholder={t("search.from")}
          aria-label={t("search.from")}
          style={{ flex: 1, minWidth: "8rem", padding: "0.5rem 0.75rem", borderRadius: tokens.radius, border: `1px solid ${tokens.colorBorder}` }}
        />
        <input
          placeholder={t("search.to")}
          aria-label={t("search.to")}
          style={{ flex: 1, minWidth: "8rem", padding: "0.5rem 0.75rem", borderRadius: tokens.radius, border: `1px solid ${tokens.colorBorder}` }}
        />
        <input
          type="date"
          aria-label={t("search.date")}
          style={{ padding: "0.5rem 0.75rem", borderRadius: tokens.radius, border: `1px solid ${tokens.colorBorder}` }}
        />
        <button
          style={{
            padding: "0.5rem 1.5rem",
            background: tokens.colorPrimary,
            color: tokens.colorTextInverse,
            border: "none",
            borderRadius: tokens.radius,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("search.find")}
        </button>
      </div>

      {/* Note: passenger counter is absent from search — per audit */}
      <p style={{ fontSize: "0.75rem", color: tokens.colorTextSecondary }}>
        {/* Results area placeholder */}
      </p>
    </section>
  );
}
