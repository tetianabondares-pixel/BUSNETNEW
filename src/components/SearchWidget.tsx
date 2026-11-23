import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeftRight, Calendar, MapPin, Search } from "lucide-react";
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
  const [suggestions, setSuggestions] = useState<ResolvedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"rpc" | "empty" | null>(null);
  const [validationError, setValidationError] = useState<SearchValidationError | null>(null);
  const [retrySearch, setRetrySearch] = useState(0);
  const [highlighted, setHighlighted] = useState(-1);
  const [composing, setComposing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fromFieldRef = useRef<HTMLDivElement>(null);
  const toFieldRef = useRef<HTMLDivElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef(0);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!selectedRoute) return;
    setFromLocation(selectedRoute.from); setToLocation(selectedRoute.to);
    setFromText(selectedRoute.from.name); setToText(selectedRoute.to.name);
    setValidationError(null);
  }, [selectedRoute]);

  useEffect(() => {
    if (!routePrefill) return;
    requestRef.current += 1;
    setFromLocation(null);
    setToLocation(null);
    setFromText(routePrefill.from);
    setToText(routePrefill.to);
    setSuggestions([]);
    setError(null);
    setValidationError(null);
    setActive(null);
  }, [routePrefill]);

  useEffect(() => {
    setFromLocation((location) => location ? { ...location, name: localizedName(location, language) } : null);
    setToLocation((location) => location ? { ...location, name: localizedName(location, language) } : null);
    setFromText((text) => fromLocation ? localizedName(fromLocation, language) : text);
    setToText((text) => toLocation ? localizedName(toLocation, language) : text);
  }, [language]);

  useLayoutEffect(() => {
    if (active !== "from" && active !== "to") return;
    const updatePosition = () => {
      const container = containerRef.current;
      const panel = panelRef.current;
      const field = active === "from" ? fromFieldRef.current : toFieldRef.current;
      if (!container || !panel || !field) return;

      const containerRect = container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      const narrow = window.matchMedia("(max-width: 640px)").matches;
      const width = narrow
        ? Math.min(containerRect.width, window.innerWidth - 24)
        : Math.min(300, window.innerWidth - 24);
      const left = narrow
        ? 0
        : Math.max(0, Math.min(
          (active === "to" ? fieldRect.right : fieldRect.left) - containerRect.left -
            (active === "to" ? width : 0),
          containerRect.width - width,
        ));
      const top = narrow
        ? panelRect.bottom - containerRect.top + 8
        : fieldRect.bottom - containerRect.top + 8;
      setPopoverStyle({ left, top, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active]);

  useEffect(() => {
    if (active !== "from" && active !== "to") return;
    const text = active === "from" ? fromText : toText;
    const fromId = fromLocation?.id;
    const toId = toLocation?.id;
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      if (text.trim().length === 1) {
        setSuggestions([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true); setError(null);
      const rpc = active === "to" ? "search_destination_locations" : "search_origin_locations";
      const { data, error: rpcError } = await supabase.rpc(rpc, {
        p_query: text.trim(), p_language: language, p_limit: 8,
        ...(active === "to" ? { p_from_location_id: fromId ?? null } : { p_to_location_id: toId ?? null }),
      });
      if (requestId !== requestRef.current) return;
      setLoading(false);
      if (rpcError) { setSuggestions([]); setError("rpc"); return; }
      const rows = Array.isArray(data) ? data : [];
      setSuggestions(rows.map((row) => rowToLocation(row as Record<string, unknown>, language)));
      setError(rows.length ? null : "empty");
      setHighlighted(-1);
    }, text.trim().length ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [active, fromText, toText, fromLocation?.id, toLocation?.id, language, retrySearch]);

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

  const select = (field: Field, location: ResolvedLocation) => {
    if (field === "from") { setFromLocation(location); setFromText(location.name); }
    else { setToLocation(location); setToText(location.name); }
    setValidationError(null);
    setSuggestions([]); setActive(null); setHighlighted(-1);
  };
  const edit = (field: Field, value: string) => {
    requestRef.current += 1;
    setSuggestions([]);
    setError(null);
    setValidationError(null);
    if (field === "from") { setFromText(value); setFromLocation(null); }
    else { setToText(value); setToLocation(null); }
    setActive(field);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, field: Field) => {
    if (composing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => event.key === "ArrowDown"
        ? Math.min(current + 1, suggestions.length - 1) : Math.max(current - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlighted >= 0) select(field, suggestions[highlighted]);
      else {
        setActive(null);
        handleSearch();
      }
    } else if (event.key === "Escape" || event.key === "Tab") setActive(null);
  };
  const swap = () => {
    const oldFrom = fromLocation; setFromLocation(toLocation); setToLocation(oldFrom);
    const oldText = fromText; setFromText(toText); setToText(oldText);
    setSuggestions([]); setValidationError(null);
  };
  const handleSearch = () => {
    if (!fromLocation) { setValidationError("origin"); return; }
    if (!toLocation) { setValidationError("destination"); return; }
    if (fromLocation.id === toLocation.id) { setValidationError("sameLocation"); return; }
    if (!fromLocation.providerLocationId || !toLocation.providerLocationId) {
      setValidationError("unavailableLocation");
      return;
    }
    if (dateISO < todayISO()) { setValidationError("pastDate"); return; }
    setValidationError(null);
    navigate(`/booking?fromId=${encodeURIComponent(fromLocation.id)}&toId=${encodeURIComponent(toLocation.id)}&date=${encodeURIComponent(dateISO)}`);
  };
  const renderField = (field: Field) => {
    const text = field === "from" ? fromText : toText;
    const inputId = `search-${field}`;
    return <div ref={field === "from" ? fromFieldRef : toFieldRef}
      className={`search-widget-field search-widget-field--${field}`}
      style={{ flex: "1 1 32%", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
      <MapPin size={16} color={resolved === "dark" ? "#38BDF8" : "#087DFF"} />
      <div style={{ minWidth: 0, width: "100%" }}>
        <label htmlFor={inputId} style={{ fontSize: 10, color: resolved === "dark" ? "#8B9AAF" : "#8A98A9" }}>
          {t(`search.${field}Label`)}
        </label>
        <input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={active === field}
          aria-controls={`${inputId}-list`} aria-activedescendant={highlighted >= 0 ? `${inputId}-option-${highlighted}` : undefined}
          name={`busnet-${field}-city`} autoComplete="off" autoCorrect="off" spellCheck={false}
          value={text} onFocus={() => {
            if (active !== field) {
              requestRef.current += 1;
              setSuggestions([]);
              setError(null);
            }
            setActive(field);
          }} onChange={(event) => edit(field, event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, field)} onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)} placeholder={t("search.cityPlaceholder")}
          style={{ background: "transparent", border: 0, outline: 0, width: "100%", color: resolved === "dark" ? "#fff" : "#172033", fontWeight: 600 }} />
      </div>
    </div>;
  };
  const isDark = resolved === "dark";
  return <div id="trip-search" ref={containerRef} style={{ position: "relative", zIndex: 15, width: "100%", maxWidth: 680 }}>
    <div ref={panelRef} className="search-widget-panel" style={{ display: "flex", alignItems: "center", minHeight: 56, padding: "4px 6px 4px 14px", borderRadius: 16 }}>
      {renderField("from")}
      <button type="button" className="search-widget-swap" onClick={swap} aria-label={t("search.swap")}><ArrowLeftRight size={13} /></button>
      {renderField("to")}
      <div className="search-widget-divider" style={{ width: 1, height: 28, background: isDark ? "rgba(255,255,255,.1)" : "rgba(16,24,40,.08)", margin: "0 4px" }} />
      <button ref={dateTriggerRef} type="button" className="search-widget-field search-widget-field--date" onClick={() => setActive(active === "date" ? null : "date")} aria-haspopup="dialog" aria-expanded={active === "date"} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", color: isDark ? "#fff" : "#172033" }}>
        <Calendar size={16} /><span>{new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long" }).format(new Date(`${dateISO}T12:00:00`))}</span>
      </button>
      <button type="button" className="search-widget-submit" onClick={handleSearch} aria-label={t("search.submit")} style={{ height: 40, padding: "0 14px", border: 0, borderRadius: 11, background: "#087DFF", color: "#fff" }}><Search size={15} /></button>
    </div>
    {validationError && (
      <p role="alert" style={{ margin: "8px 4px 0", color: tokens.colorWarning, fontSize: "0.875rem" }}>
        {t(`search.validation.${validationError}`)}
      </p>
    )}
    {(active === "from" || active === "to") && <div
      className={`search-widget-popover search-widget-popover--${active}`}
      style={popoverStyle}>
      {loading && <div role="status" style={{ padding: 10 }}>{t("search.loading")}</div>}
      {!loading && error === "rpc" && (
        <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 10 }}>
          <span>{t("search.locationLoadError")}</span>
          <button type="button" onClick={() => setRetrySearch((value) => value + 1)}>
            {t("search.retry")}
          </button>
        </div>
      )}
      {!loading && error === "empty" && <div role="status" style={{ padding: 10 }}>{t("search.noLocations")}</div>}
      <div id={`search-${active}-list`} role="listbox">
        {!loading && !error && suggestions.map((location, index) => <button type="button" role="option"
          className="search-widget-option" id={`search-${active}-option-${index}`}
          aria-selected={highlighted === index} key={location.id}
          onMouseDown={(event) => event.preventDefault()} onClick={() => select(active, location)}
          style={{ background: highlighted === index ? (isDark ? "#17263a" : "#eef5ff") : "transparent", color: isDark ? "#fff" : "#101828" }}>
          {location.name}{location.countryCode ? ` · ${location.countryCode}` : ""}
        </button>)}
      </div>
    </div>}
    <BusnetCalendar open={active === "date"} selectedDate={dateISO} fromLocationId={fromLocation?.id ?? null} toLocationId={toLocation?.id ?? null} onChange={(nextDate) => { setDateISO(nextDate); setValidationError(null); }} onClose={() => setActive(null)} triggerRef={dateTriggerRef} />
  </div>;
}
