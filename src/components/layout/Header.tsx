import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";

export function Header() {
  const { t, i18n } = useTranslation();
  const { mode, setMode, tokens } = useTheme();

  const toggleLang = () =>
    i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk");

  const cycleTheme = () =>
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.5rem",
        background: tokens.colorBg,
        borderBottom: `1px solid ${tokens.colorBorder}`,
        color: tokens.colorText,
      }}
    >
      <Link to="/" style={{ fontWeight: 700, fontSize: "1.25rem", color: tokens.colorPrimary, textDecoration: "none" }}>
        {t("app.name")}
      </Link>

      <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <Link to="/" style={{ color: tokens.colorText, textDecoration: "none" }}>
          {t("nav.home")}
        </Link>
        <Link to="/booking" style={{ color: tokens.colorText, textDecoration: "none" }}>
          {t("nav.booking")}
        </Link>
        <button onClick={toggleLang} style={{ cursor: "pointer" }} aria-label="Toggle language">
          {i18n.language === "uk" ? "EN" : "UK"}
        </button>
        <button onClick={cycleTheme} style={{ cursor: "pointer" }} aria-label="Toggle theme">
          {mode === "light" ? "🌙" : mode === "dark" ? "💻" : "☀️"}
        </button>
      </nav>
    </header>
  );
}
