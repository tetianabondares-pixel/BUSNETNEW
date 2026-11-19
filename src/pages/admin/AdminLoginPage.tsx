import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

/**
 * Admin login page stub.
 * Protected — will require authentication before accessing /admin.
 */
export function AdminLoginPage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 1.5rem",
        minHeight: "60vh",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        {t("admin.login")}
      </h1>
      <div
        style={{
          padding: "2rem",
          background: tokens.colorBgCard,
          borderRadius: tokens.radiusLg,
          boxShadow: tokens.shadowLg,
          border: `1px solid ${tokens.colorBorder}`,
          width: "100%",
          maxWidth: "24rem",
          textAlign: "center",
        }}
      >
        <p style={{ color: tokens.colorTextSecondary }}>
          Login form placeholder
        </p>
      </div>
    </section>
  );
}
