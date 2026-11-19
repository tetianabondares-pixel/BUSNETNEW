import React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

export function Footer() {
  const { t } = useTranslation();
  const { tokens, resolved } = useTheme();
  const isDark = resolved === "dark";

  return (
    <footer
      style={{
        padding: "1.25rem 2rem",
        textAlign: "center",
        background: "transparent",
        color: isDark ? "#64748B" : "#8A98A9",
        fontSize: "0.78rem",
        borderTop: `1px solid ${tokens.colorBorderSubtle}`,
        marginTop: "auto",
      }}
    >
      {t("footer.rights", { year: new Date().getFullYear() })}
    </footer>
  );
}
