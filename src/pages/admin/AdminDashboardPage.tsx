import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

/**
 * Admin dashboard page stub.
 * Separate and protected section of the application.
 */
export function AdminDashboardPage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "2rem 1.5rem",
        minHeight: "60vh",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        {t("admin.dashboard")}
      </h1>
      <div
        style={{
          padding: "2rem",
          background: tokens.colorBgCard,
          borderRadius: tokens.radiusLg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <p style={{ color: tokens.colorTextSecondary }}>
          Dashboard content placeholder
        </p>
      </div>
    </section>
  );
}
