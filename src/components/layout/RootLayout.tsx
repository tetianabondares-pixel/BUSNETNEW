import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { BackToTopButton } from "./BackToTopButton";
import { useTheme } from "@/theme";

export function RootLayout() {
  const { tokens } = useTheme();
  const location = useLocation();
  const isHome = location.pathname === "/";

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
        <Outlet />
      </main>

      {!isHome && <Footer />}
      <BackToTopButton />
    </div>
  );
}
