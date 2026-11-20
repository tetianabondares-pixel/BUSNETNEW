import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";

type SyncResult = {
  providerError: false;
  importedLocations: number;
  importedRoutes: number;
  importedSchedules: number;
  importedScheduleStops: number;
};

function isSyncResult(value: unknown): value is SyncResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.providerError === false &&
    Number.isSafeInteger(result.importedLocations) &&
    Number.isSafeInteger(result.importedRoutes) &&
    Number.isSafeInteger(result.importedSchedules) &&
    Number.isSafeInteger(result.importedScheduleStops);
}

function errorCodeOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const errorCode = (value as Record<string, unknown>).errorCode;
  return typeof errorCode === "string" ? errorCode : null;
}

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const syncCatalog = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        setSyncMessage(t("admin.catalogSyncSignIn"));
        return;
      }

      const { data, error } = await supabase.functions.invoke("altrans-adapter", {
        body: { operation: "sync-catalog" },
      });
      if (error) {
        setSyncMessage(t("admin.catalogSyncFailed"));
        return;
      }
      if (!isSyncResult(data)) {
        const errorCode = errorCodeOf(data);
        setSyncMessage(
          errorCode
            ? t("admin.catalogSyncFailedWithCode", { code: errorCode })
            : t("admin.catalogSyncFailed"),
        );
        return;
      }

      setSyncMessage(t("admin.catalogSyncSuccess", {
        locations: data.importedLocations,
        routes: data.importedRoutes,
        schedules: data.importedSchedules,
        stops: data.importedScheduleStops,
      }));
    } catch {
      setSyncMessage(t("admin.catalogSyncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "2rem 1.5rem",
        minHeight: "60vh",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        {t("admin.dashboard")}
      </h1>
      <div
        style={{
          padding: "2rem",
          background: tokens.colorBgCard,
          borderRadius: "16px",
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <p style={{ color: tokens.colorTextSecondary }}>
          {t("admin.dashboardPlaceholder")}
        </p>
        <button
          type="button"
          onClick={() => void syncCatalog()}
          disabled={syncing}
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            border: 0,
            borderRadius: "10px",
            background: syncing ? tokens.colorBorder : "#087DFF",
            color: "#fff",
            cursor: syncing ? "wait" : "pointer",
          }}
        >
          {syncing ? t("admin.catalogSyncLoading") : t("admin.catalogSyncButton")}
        </button>
        {syncMessage && (
          <p role="status" aria-live="polite" style={{ color: tokens.colorTextSecondary }}>
            {syncMessage}
          </p>
        )}
      </div>
    </section>
  );
}
