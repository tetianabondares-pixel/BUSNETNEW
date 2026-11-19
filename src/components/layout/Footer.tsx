import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

export function Footer() {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  return (
    <footer
      style={{
        padding: "1.5rem",
        textAlign: "center",
        background: tokens.colorBgSecondary,
        borderTop: `1px solid ${tokens.colorBorder}`,
        color: tokens.colorTextSecondary,
        fontSize: "0.875rem",
      }}
    >
      {t("footer.rights", { year: new Date().getFullYear() })}
    </footer>
  );
}
