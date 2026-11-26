import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Calendar,
  CircleDot,
  Search,
  MapPin,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import { BusnetCalendar } from "@/features/search/components/DatePicker/BusnetCalendar";
import { getKyivToday } from "@/features/search/components/DatePicker/calendar.utils";
import type { ResolvedLocation } from "@/features/search/location.types";
import "@/features/search/components/DatePicker/BusnetCalendar.css";

export interface SearchRouteSelection {
  from: ResolvedLocation;
  to: ResolvedLocation;
}

type Field = "from" | "to";
type SearchValidationError = "origin" | "destination" | "sameLocation" | "unavailableLocation" | "pastDate";
type Props = { selectedRoute?: SearchRouteSelection | null };

const todayISO = getKyivToday;
const languageOf = (language: string) => language.startsWith("en") ? "en" : language.startsWith("it") ? "it" : "uk";
const localizedName = (location: ResolvedLocation, language: string) =>
  language === "en" ? (location.nameEn ?? location.nameUk) :
    language === "it" ? (location.nameIt ?? location.nameEn ?? location.nameUk) : location.nameUk;
const FOOTER_ROUTE_PREFILLS: Record<
  string,
  Record<"uk" | "en" | "it", { from: string; to: string }>
> = {
  "kyiv-warsaw": {
    uk: { from: "Київ", to: "Варшава" },
    en: { from: "Kyiv", to: "Warsaw" },
    it: { from: "Kiev", to: "Varsavia" },
  },
  "lviv-krakow": {
    uk: { from: "Львів", to: "Краків" },
    en: { from: "Lviv", to: "Krakow" },
    it: { from: "Leopoli", to: "Cracovia" },
  },
};
const rowToLocation = (row: Record<string, unknown>, language: string): ResolvedLocation => {
  const nameUk = String(row.name_uk ?? row.name ?? "");
  const nameEn = row.name_en == null ? null : String(row.name_en);
  const nameIt = row.name_it == null ? null : String(row.name_it);
  return {
    id: String(row.id),
    name: language === "en" ? (nameEn ?? nameUk) : language === "it" ? (nameIt ?? nameEn ?? nameUk) : nameUk,
    nameUk,
    nameEn,
    nameIt,
    countryCode: row.country_code == null ? null : String(row.country_code),
    providerLocationId: row.provider_location_id == null ? null : String(row.provider_location_id),
  };
};

export function SearchWidget({ selectedRoute = null }: Props) {
  const { t, i18n } = useTranslation();
  const { resolved, tokens } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const language = languageOf(i18n.language);
  const routePrefill = FOOTER_ROUTE_PREFILLS[searchParams.get("route") ?? ""]?.[language];
  const [fromLocation, setFromLocation] = useState<ResolvedLocation | null>(null);
  const [toLocation, setToLocation] = useState<ResolvedLocation | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [dateISO, setDateISO] = useState(todayISO);
  const [active, setActive] = useState<Field | "date" | null>(null);
  const [isSwapped, setIsSwapped] = useState(false);
  const [validationError, setValidationError] = useState<SearchValidationError | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selectedRoute) return;
    setFromLocation(selectedRoute.from); setToLocation(selectedRoute.to);
    setFromText(selectedRoute.from.name); setToText(selectedRoute.to.name);
    setValidationError(null);
  }, [selectedRoute]);

  useEffect(() => {
    if (!routePrefill) return;
    setFromLocation(null);
    setToLocation(null);
    setFromText(routePrefill.from);
    setToText(routePrefill.to);
    setValidationError(null);
    setActive(null);
  }, [routePrefill]);

  useEffect(() => {
    setFromLocation((location) => location ? { ...location, name: localizedName(location, language) } : null);
    setToLocation((location) => location ? { ...location, name: localizedName(location, language) } : null);
    setFromText((text) => fromLocation ? localizedName(fromLocation, language) : text);
    setToText((text) => toLocation ? localizedName(toLocation, language) : text);
  }, [language]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      if (event.target instanceof Element &&
          event.target.closest(".busnet-calendar-sheet, .busnet-calendar-popover, .busnet-calendar-backdrop")) return;
      setActive(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const edit = (field: Field, value: string) => {
    setValidationError(null);
    if (field === "from") { setFromText(value); setFromLocation(null); }
    else { setToText(value); setToLocation(null); }
    setActive(null);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSearch();
    } else if (event.key === "Escape") setActive(null);
  };
  const swap = () => {
    const oldFrom = fromLocation; setFromLocation(toLocation); setToLocation(oldFrom);
    const oldText = fromText; setFromText(toText); setToText(oldText);
    setIsSwapped((current) => !current);
    setValidationError(null);
  };
  const resolveTypedLocation = async (
    text: string,
    rpc: "search_origin_locations" | "search_destination_locations",
    fromLocationId: string | null,
  ) => {
    const { data, error } = await supabase.rpc(rpc, {
      p_query: text.trim(),
      p_language: language,
      p_limit: 8,
      ...(rpc === "search_destination_locations"
        ? { p_from_location_id: fromLocationId }
        : { p_to_location_id: null }),
    });
    if (error || !Array.isArray(data)) return null;
    const normalized = text.trim().toLocaleLowerCase();
    const exactRow = data.find((row) => {
      const location = rowToLocation(row as Record<string, unknown>, language);
      return [location.nameUk, location.nameEn, location.nameIt, location.name]
        .filter((name): name is string => Boolean(name))
        .some((name) => name.toLocaleLowerCase() === normalized);
    });
    return exactRow ? rowToLocation(exactRow as Record<string, unknown>, language) : null;
  };
  const handleSearch = async () => {
    let resolvedFrom = fromLocation;
    let resolvedTo = toLocation;

    if (!resolvedFrom && fromText.trim()) {
      resolvedFrom = await resolveTypedLocation(fromText, "search_origin_locations", null);
      if (resolvedFrom) setFromLocation(resolvedFrom);
    }
    if (!resolvedTo && toText.trim() && resolvedFrom) {
      resolvedTo = await resolveTypedLocation(toText, "search_destination_locations", resolvedFrom.id);
      if (resolvedTo) setToLocation(resolvedTo);
    }

    if (!resolvedFrom) { setValidationError("origin"); return; }
    if (!resolvedTo) { setValidationError("destination"); return; }
    if (resolvedFrom.id === resolvedTo.id) { setValidationError("sameLocation"); return; }
    if (!resolvedFrom.providerLocationId || !resolvedTo.providerLocationId) {
      setValidationError("unavailableLocation");
      return;
    }
    if (dateISO < todayISO()) { setValidationError("pastDate"); return; }
    setValidationError(null);
    navigate(`/booking?fromId=${encodeURIComponent(resolvedFrom.id)}&toId=${encodeURIComponent(resolvedTo.id)}&date=${encodeURIComponent(dateISO)}`);
  };
  const renderField = (field: Field) => {
    const text = field === "from" ? fromText : toText;
    const inputId = `search-${field}`;
    return <div className={`search-widget-field search-widget-field--${field}`}
      style={{ flex: "1 1 32%", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
      {field === "from"
        ? <CircleDot className="search-widget-location-icon" size={16} color={resolved === "dark" ? "#38BDF8" : "#087DFF"} />
        : <MapPin className="search-widget-location-icon" size={16} color={resolved === "dark" ? "#38BDF8" : "#087DFF"} />}
      <div style={{ minWidth: 0, width: "100%" }}>
        <label htmlFor={inputId} style={{ fontSize: 10, color: resolved === "dark" ? "#8B9AAF" : "#8A98A9" }}>
          {t(`search.${field}Label`)}
        </label>
        <div className="search-widget-input-wrap">
          <input id={inputId}
            name={`busnet-${field}-city`} autoComplete="off" autoCorrect="off" spellCheck={false}
            value={text} onFocus={() => setActive(null)} onChange={(event) => edit(field, event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search.cityPlaceholder")}
            style={{ position: "relative", zIndex: 1, background: "transparent", border: 0, outline: 0, width: "100%", color: resolved === "dark" ? "#fff" : "#172033", fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.015em", textTransform: "none" }} />
        </div>
      </div>
    </div>;
  };
  const isDark = resolved === "dark";
  return <div id="trip-search" ref={containerRef} style={{ position: "relative", zIndex: 15, width: "100%", maxWidth: 920 }}>
    <div className="search-widget-panel" style={{ display: "flex", alignItems: "center", minHeight: 86, padding: "12px 12px 12px 18px", borderRadius: 20 }}>
      <div className="search-widget-route-fields">
        {renderField("from")}
        <button type="button" className="search-widget-swap" onClick={swap} disabled={!fromText.trim() && !toText.trim()} aria-label={t("search.swap")}><ArrowLeftRight className={isSwapped ? "is-swapped" : ""} size={16} /></button>
        {renderField("to")}
      </div>
      <div className="search-widget-divider" style={{ width: 1, height: 28, background: isDark ? "rgba(255,255,255,.1)" : "rgba(16,24,40,.08)", margin: "0 4px" }} />
      <button ref={dateTriggerRef} type="button" className="search-widget-field search-widget-field--date" onClick={() => setActive(active === "date" ? null : "date")} aria-haspopup="dialog" aria-expanded={active === "date"} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", color: isDark ? "#fff" : "#172033" }}>
        <Calendar size={17} /><span>{new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(new Date(`${dateISO}T12:00:00`))}</span>
      </button>
      <button type="button" className="search-widget-submit" onClick={handleSearch} aria-label={t("search.submit")} style={{ height: 56, padding: "0 22px", border: 0, borderRadius: 13, background: "#087DFF", color: "#fff" }}>
        <span>{t("search.submit")}</span><Search size={17} aria-hidden="true" />
      </button>
    </div>
    {validationError && (
      <p role="alert" style={{ margin: "8px 4px 0", color: tokens.colorWarning, fontSize: "0.875rem" }}>
        {t(`search.validation.${validationError}`)}
      </p>
    )}
    <BusnetCalendar open={active === "date"} selectedDate={dateISO} fromLocationId={fromLocation?.id ?? null} toLocationId={toLocation?.id ?? null} onChange={(nextDate) => { setDateISO(nextDate); setValidationError(null); }} onClose={() => setActive(null)} triggerRef={dateTriggerRef} />
  </div>;
}
