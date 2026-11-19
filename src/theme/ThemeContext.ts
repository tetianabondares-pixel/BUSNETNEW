import { createContext, useContext } from "react";
import { lightTokens, darkTokens, type ThemeTokens } from "./tokens";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  tokens: ThemeTokens;
  setMode: (m: ThemeMode) => void;
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getTokens(mode: ThemeMode): ThemeTokens {
  return resolveMode(mode) === "dark" ? darkTokens : lightTokens;
}

export const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  resolved: "light",
  tokens: lightTokens,
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export { resolveMode };
