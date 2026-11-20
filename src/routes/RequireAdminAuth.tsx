import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";

type AdminAuthState = "loading" | "authorized" | "guest" | "forbidden";

export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [authState, setAuthState] = useState<AdminAuthState>("loading");
  const location = useLocation();

  useEffect(() => {
    let active = true;

    const validateSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setAuthState("guest");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("admin_profiles")
        .select("role,active")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (!active) return;
      setAuthState(
        profileError || !profile?.active
          ? "forbidden"
          : "authorized",
      );
    };

    void validateSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        setAuthState("guest");
      } else {
        void validateSession();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (authState === "loading") {
    return (
      <main className="admin-dashboard">
        <p className="admin-dashboard__loading" role="status">
          {t("admin.loading")}
        </p>
      </main>
    );
  }
  if (authState === "guest") {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  if (authState === "forbidden") {
    return (
      <main className="admin-dashboard">
        <section className="admin-dashboard__denied" role="alert">
          <h1>{t("admin.accessDenied")}</h1>
          <p>{t("admin.accessDeniedDescription")}</p>
        </section>
      </main>
    );
  }
  return children;
}
