/**
 * BusNet Design Tokens — light / dark themes
 *
 * Usage: apply `data-theme="light"` or `data-theme="dark"` on <html>.
 * Default follows `prefers-color-scheme`.
 */

export interface ThemeTokens {
  /* surfaces */
  colorBg: string;
  colorBgSecondary: string;
  colorBgCard: string;

  /* text */
  colorText: string;
  colorTextSecondary: string;
  colorTextInverse: string;

  /* brand */
  colorPrimary: string;
  colorPrimaryHover: string;
  colorAccent: string;

  /* borders */
  colorBorder: string;

  /* feedback */
  colorSuccess: string;
  colorError: string;
  colorWarning: string;

  /* shadows */
  shadow: string;
  shadowLg: string;

  /* radii */
  radius: string;
  radiusLg: string;
}

export const lightTokens: ThemeTokens = {
  colorBg: "#ffffff",
  colorBgSecondary: "#f5f7fa",
  colorBgCard: "#ffffff",

  colorText: "#1a1a2e",
  colorTextSecondary: "#64748b",
  colorTextInverse: "#ffffff",

  colorPrimary: "#2563eb",
  colorPrimaryHover: "#1d4ed8",
  colorAccent: "#f59e0b",

  colorBorder: "#e2e8f0",

  colorSuccess: "#16a34a",
  colorError: "#dc2626",
  colorWarning: "#f59e0b",

  shadow: "0 1px 3px rgba(0,0,0,0.1)",
  shadowLg: "0 10px 25px rgba(0,0,0,0.1)",

  radius: "0.5rem",
  radiusLg: "1rem",
};

export const darkTokens: ThemeTokens = {
  colorBg: "#0f172a",
  colorBgSecondary: "#1e293b",
  colorBgCard: "#1e293b",

  colorText: "#f1f5f9",
  colorTextSecondary: "#94a3b8",
  colorTextInverse: "#0f172a",

  colorPrimary: "#3b82f6",
  colorPrimaryHover: "#60a5fa",
  colorAccent: "#fbbf24",

  colorBorder: "#334155",

  colorSuccess: "#22c55e",
  colorError: "#ef4444",
  colorWarning: "#fbbf24",

  shadow: "0 1px 3px rgba(0,0,0,0.4)",
  shadowLg: "0 10px 25px rgba(0,0,0,0.5)",

  radius: "0.5rem",
  radiusLg: "1rem",
};

