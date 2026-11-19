import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { ThemeContext, resolveMode, getTokens, type ThemeMode } from "./ThemeContext";

interface Props {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode = "system" }: Props) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const stored = window.localStorage.getItem("busnet_theme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
    } catch {
      // localStorage may be unavailable in privacy-restricted environments.
    }
    return defaultMode;
  });
  const resolved = resolveMode(mode);
  const tokens = useMemo(() => getTokens(mode), [mode]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    try {
      window.localStorage.setItem("busnet_theme", nextMode);
    } catch {
      // Theme selection still works for the current page session.
    }
  }, []);

  /* sync <html data-theme> and color-scheme */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  /* listen to OS change when mode === "system" */
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setMode("system"); // triggers re-resolve
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  return (
    <ThemeContext value={{ mode, resolved, tokens, setMode }}>
      {children}
    </ThemeContext>
  );
}
