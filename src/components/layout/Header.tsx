import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { User, Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme";
import { BusnetLogo } from "@/components/BusnetLogo";
import { supabase } from "@/lib/supabase";

export function Header() {
  const { t, i18n } = useTranslation();
  const { mode, resolved, setMode, tokens } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const isDark = resolved === "dark";
  const isPassengerAuthPage = pathname === "/auth" || pathname === "/login" || pathname === "/register";
  const isLandingPage = pathname === "/";

  const languages = ["ua", "en", "it"] as const;
  const currentLang = (i18n.language || "uk").toLowerCase().replace("uk", "ua");

  const setLanguage = (lang: string) => {
    const target = lang === "ua" ? "uk" : lang;
    i18n.changeLanguage(target);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setIsSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleAccountNavigation = () => {
    if (!isSignedIn) {
      navigate("/auth");
      return;
    }
    navigate("/account");
  };

  const toggleTheme = () => {
    setMode(isDark ? "light" : "dark");
  };

  const navItems = [
    { label: t("nav.routes"), href: isLandingPage ? "#routes" : "/#routes" },
    { label: t("nav.partners"), href: "mailto:support@busnet.ua?subject=BUSNET%20partnership" },
    { label: t("nav.faq"), href: isLandingPage ? "#faq" : "/#faq" },
  ];

  return (
    <header
      className={
        isPassengerAuthPage
          ? "app-header--passenger-auth"
          : isLandingPage
            ? "app-header--landing"
            : undefined
      }
      style={{
        position: "relative",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.25rem 2.25rem",
        background: "transparent",
        color: tokens.colorText,
      }}
    >
      {/* Brand Logo */}
      <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
        <BusnetLogo />
      </Link>

      {/* Center Navigation */}
      <nav
        style={{
          display: "flex",
          gap: "1.75rem",
          alignItems: "center",
        }}
        aria-label="Main Navigation"
      >
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            style={{
              fontSize: "0.82rem",
              fontWeight: 500,
              color: isDark ? "#8B9AAF" : "#475467",
              textDecoration: "none",
              transition: "color 180ms ease",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = isDark ? "#38BDF8" : "#087DFF")}
            onMouseLeave={(e) => (e.currentTarget.style.color = isDark ? "#8B9AAF" : "#475467")}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Right Controls: Languages, Theme Switcher, Login Button */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        {/* Language Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          {languages.map((lang) => {
            const isActive = currentLang === lang;
            return (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                style={{
                  position: "relative",
                  padding: "0.25rem 0.1rem 0.35rem",
                  fontSize: "0.78rem",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? (isDark ? "#FFFFFF" : "#101828") : (isDark ? "#64748B" : "#8A98A9"),
                  cursor: "pointer",
                  transition: "color 150ms ease",
                  textTransform: "uppercase",
                }}
              >
                {lang}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "2px",
                      borderRadius: "1px",
                      background: isDark ? "#38BDF8" : "#087DFF",
                      boxShadow: isDark ? "0 0 8px rgba(56, 189, 248, 0.6)" : "none",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Theme Mode Toggle (Night 🌙 / Day ☀️) */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Увімкнути денну тему (Daylight)" : "Увімкнути нічну тему (Dark Tech)"}
          aria-label="Toggle Theme"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34px",
            height: "34px",
            borderRadius: "8px",
            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(16, 24, 40, 0.05)",
            border: `1px solid ${tokens.colorBorderSubtle}`,
            color: isDark ? "#38BDF8" : "#087DFF",
            cursor: "pointer",
            transition: "all 180ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(8, 125, 255, 0.1)";
            e.currentTarget.style.borderColor = isDark ? "rgba(56, 189, 248, 0.3)" : "rgba(8, 125, 255, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(16, 24, 40, 0.05)";
            e.currentTarget.style.borderColor = tokens.colorBorderSubtle;
          }}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Login Button (Outline with icon) */}
        <button
          type="button"
          onClick={handleAccountNavigation}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.45rem 1rem",
            borderRadius: "10px",
            fontSize: "0.78rem",
            fontWeight: 500,
            textDecoration: "none",
            color: isDark ? "#F4F7FB" : "#344054",
            background: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.75)",
            border: `1px solid ${isDark ? "rgba(56, 189, 248, 0.35)" : "rgba(8, 125, 255, 0.22)"}`,
            backdropFilter: "blur(8px)",
            boxShadow: isDark ? "0 0 12px rgba(8, 125, 255, 0.12)" : "0 2px 6px rgba(16, 24, 40, 0.04)",
            transition: "all 200ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDark ? "#38BDF8" : "#087DFF";
            e.currentTarget.style.boxShadow = isDark
              ? "0 0 16px rgba(56, 189, 248, 0.25)"
              : "0 3px 10px rgba(8, 125, 255, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDark ? "rgba(56, 189, 248, 0.35)" : "rgba(8, 125, 255, 0.22)";
            e.currentTarget.style.boxShadow = isDark ? "0 0 12px rgba(8, 125, 255, 0.12)" : "0 2px 6px rgba(16, 24, 40, 0.04)";
          }}
        >
          <User size={14} color={isDark ? "#38BDF8" : "#087DFF"} />
          <span>{isSignedIn ? t("nav.account") : t("nav.passengerLogin")}</span>
        </button>
      </div>
    </header>
  );
}
