/**
 * BusNet Design Tokens — Premium Dark Tech & Premium Daylight Tech
 *
 * Rules:
 * - NO turquoise/cyan (#00D4FF or greenish cyans are excluded)
 * - Pure shades of blue & sky blue: #087DFF, #168BFF, #38BDF8, #60A5FA, #009DFF
 * - Consistent Geist typography, layout structure and spatial depth across themes
 */

export interface ThemeTokens {
  /* Surfaces */
  colorBg: string;
  colorBgDeep: string;
  colorBgCard: string;
  colorBgCardGlass: string;
  colorBgSecondary: string;
  colorBgInput: string;

  /* Typography */
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorTextInverse: string;

  /* Brand & Accents (strictly blue & sky-blue shades, no turquoise) */
  colorPrimary: string;
  colorPrimaryHover: string;
  colorAccentBlue: string;
  colorSkyBlue: string;
  gradientHighlight: string;
  gradientButton: string;

  /* Borders & Dividers */
  colorBorder: string;
  colorBorderSubtle: string;
  colorDivider: string;

  /* Feedback */
  colorSuccess: string;
  colorError: string;
  colorWarning: string;

  /* Shadows & Glows */
  shadowCard: string;
  shadowButton: string;
  glowSubtle: string;

  /* Assets & atmospheric filters */
  bgImage: string;
  mapLineColor: string;
  mapNodeGlow: string;
}

export const darkTokens: ThemeTokens = {
  /* Surfaces */
  colorBg: "#050912",
  colorBgDeep: "#071426",
  colorBgCard: "#0B1422",
  colorBgCardGlass: "rgba(7, 15, 27, 0.88)",
  colorBgSecondary: "#101D2B",
  colorBgInput: "rgba(11, 20, 34, 0.6)",

  /* Typography */
  colorText: "#F4F7FB",
  colorTextSecondary: "#8B9AAF",
  colorTextTertiary: "#64748B",
  colorTextInverse: "#050912",

  /* Brand & Accents */
  colorPrimary: "#087DFF",
  colorPrimaryHover: "#006EE6",
  colorAccentBlue: "#168BFF",
  colorSkyBlue: "#38BDF8",
  gradientHighlight: "linear-gradient(90deg, #38BDF8, #168BFF)",
  gradientButton: "linear-gradient(135deg, #168BFF, #0875F9)",

  /* Borders & Dividers */
  colorBorder: "rgba(255, 255, 255, 0.10)",
  colorBorderSubtle: "rgba(255, 255, 255, 0.07)",
  colorDivider: "rgba(255, 255, 255, 0.09)",

  /* Feedback */
  colorSuccess: "#10B981",
  colorError: "#EF4444",
  colorWarning: "#F59E0B",

  /* Shadows & Glows */
  shadowCard: "0 20px 50px rgba(0, 0, 0, 0.6)",
  shadowButton: "0 4px 16px rgba(8, 125, 255, 0.35)",
  glowSubtle: "0 0 20px rgba(22, 139, 255, 0.25)",

  /* Assets */
  bgImage: "/images/busnet-kyiv-background-night.png",
  mapLineColor: "rgba(56, 189, 248, 0.45)",
  mapNodeGlow: "rgba(56, 189, 248, 0.35)",
};

export const lightTokens: ThemeTokens = {
  /* Surfaces */
  colorBg: "#F4F7FB",
  colorBgDeep: "#EDF2F8",
  colorBgCard: "#FFFFFF",
  colorBgCardGlass: "rgba(255, 255, 255, 0.88)",
  colorBgSecondary: "#F8FAFD",
  colorBgInput: "rgba(248, 250, 253, 0.8)",

  /* Typography */
  colorText: "#101828",
  colorTextSecondary: "#66758A",
  colorTextTertiary: "#8A98A9",
  colorTextInverse: "#FFFFFF",

  /* Brand & Accents */
  colorPrimary: "#087DFF",
  colorPrimaryHover: "#006EE6",
  colorAccentBlue: "#168BFF",
  colorSkyBlue: "#38BDF8",
  gradientHighlight: "linear-gradient(90deg, #087DFF, #38BDF8)",
  gradientButton: "linear-gradient(135deg, #168BFF, #0875F9)",

  /* Borders & Dividers */
  colorBorder: "rgba(16, 24, 40, 0.08)",
  colorBorderSubtle: "rgba(16, 24, 40, 0.06)",
  colorDivider: "rgba(16, 24, 40, 0.07)",

  /* Feedback */
  colorSuccess: "#059669",
  colorError: "#DC2626",
  colorWarning: "#D97706",

  /* Shadows & Glows */
  shadowCard: "0 8px 30px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.03)",
  shadowButton: "0 4px 14px rgba(8, 125, 255, 0.22)",
  glowSubtle: "0 0 12px rgba(8, 125, 255, 0.12)",

  /* Assets */
  bgImage: "/images/busnet-kyiv-background-day.png",
  mapLineColor: "rgba(8, 125, 255, 0.32)",
  mapNodeGlow: "rgba(8, 125, 255, 0.18)",
};
