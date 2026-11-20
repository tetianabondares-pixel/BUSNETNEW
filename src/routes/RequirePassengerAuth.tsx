import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type AuthState = "loading" | "authenticated" | "guest";

export function RequirePassengerAuth({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const location = useLocation();

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setAuthState(error || !data.session ? "guest" : "authenticated");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthState(session ? "authenticated" : "guest");
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (authState === "loading") return null;
  if (authState === "guest") {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return children;
}
