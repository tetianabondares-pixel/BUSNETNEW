import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { FinalCta } from "./FinalCta";
import { BackToTopButton } from "./BackToTopButton";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";

export function RootLayout() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    let active = true;
    const loadMaintenance = async () => {
      const { data, error } = await supabase.rpc("get_public_admin_settings");
      if (error) {
        console.error("Public settings request failed", error.code);
        return;
      }
      if (!active) return;
      const mode = (data ?? []).find(
        (row: { setting_key: string; setting_value: unknown }) =>
          row.setting_key === "maintenance_mode",
      );
      setMaintenanceMode(mode?.setting_value === true);
    };
    void loadMaintenance();
    return () => { active = false; };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: tokens.colorBg,
        color: tokens.colorText,
        transition: "background-color 300ms ease, color 300ms ease",
      }}
    >
      {/* On non-home pages, show global header */}
      {!isHome && <Header />}

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {maintenanceMode ? (
          <section role="status" style={{ maxWidth: 680, margin: "4rem auto", padding: "2rem", textAlign: "center", minHeight: "40vh" }}>
            <h1>{t("maintenance.title")}</h1>
            <p>{t("maintenance.description")}</p>
          </section>
        ) : <Outlet />}
      </main>

      <FinalCta />
      <Footer />
      <BackToTopButton />
    </div>
  );
}
