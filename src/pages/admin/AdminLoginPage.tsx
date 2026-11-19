import React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

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
          borderRadius: "16px",
          boxShadow: tokens.shadowCard,
          border: `1px solid ${tokens.colorBorder}`,
          width: "100%",
          maxWidth: "24rem",
          textAlign: "center",
        }}
      >
        <p style={{ color: tokens.colorTextSecondary }}>
          {t("admin.loginPlaceholder")}
        </p>
      </div>
    </section>
  );
}
