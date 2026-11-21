import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";

export type PublicContent = Record<string, unknown>;

export function usePublicContent(contentKey: string): PublicContent | null {
  const { i18n } = useTranslation();
  const [content, setContent] = useState<PublicContent | null>(null);

  useEffect(() => {
    let active = true;
    const locale = i18n.language?.startsWith("en")
      ? "en"
      : i18n.language?.startsWith("it")
        ? "it"
        : "uk";

    const load = async () => {
      const { data, error } = await supabase
        .from("public_content")
        .select("content")
        .eq("content_key", contentKey)
        .eq("locale", locale)
        .eq("active", true)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error("Public content request failed", {
          contentKey,
          errorCode: error.code,
        });
        setContent(null);
        return;
      }
      setContent(data?.content as PublicContent | null);
    };

    void load();
    return () => { active = false; };
  }, [contentKey, i18n.language]);

  return content;
}

export function contentString(
  content: PublicContent | null,
  key: string,
  fallback: string,
): string {
  const value = content?.[key];
  return typeof value === "string" ? value : fallback;
}

export function contentRecord(
  value: unknown,
): PublicContent | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PublicContent
    : null;
}
