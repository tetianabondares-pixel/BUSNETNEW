import { useState, useEffect, useMemo, type ReactNode } from "react";
import { ThemeContext, resolveMode, getTokens, type ThemeMode } from "./ThemeContext";

interface Props {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode = "system" }: Props) {
  const [mode, setMode] = useState<ThemeMode>(defaultMode);
  const resolved = resolveMode(mode);
  const tokens = useMemo(() => getTokens(mode), [mode]);

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
