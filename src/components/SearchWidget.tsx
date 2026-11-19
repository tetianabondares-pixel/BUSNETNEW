import React, { useState, useRef, useEffect } from "react";
import { MapPin, ArrowLeftRight, Calendar, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme";
import { useNavigate } from "react-router-dom";
import { BusnetCalendar } from "@/features/search/components/DatePicker/BusnetCalendar";
import "@/features/search/components/DatePicker/BusnetCalendar.css";

const POPULAR_CITIES = [
  "Київ",
  "Варшава",
  "Берлін",
  "Прага",
  "Львів",
  "Одеса",
  "Краків",
  "Вроцлав",
  "Відень",
  "Будапешт",
];

interface SearchRouteSelection {
  from: string;
  to: string;
}

interface SearchWidgetProps {
  selectedRoute?: SearchRouteSelection | null;
}

export function SearchWidget({ selectedRoute = null }: SearchWidgetProps) {
  const { t, i18n } = useTranslation();
  const { resolved, tokens } = useTheme();
  const navigate = useNavigate();
  const isDark = resolved === "dark";

  const [fromCity, setFromCity] = useState("Київ");
  const [toCity, setToCity] = useState("");
  const [dateISO, setDateISO] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  const [activeDropdown, setActiveDropdown] = useState<"from" | "to" | "date" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);

  const locale = i18n.language?.startsWith("it")
    ? "it-IT"
    : i18n.language?.startsWith("en")
      ? "en-US"
      : "uk-UA";

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
    }).format(new Date(`${iso}T12:00:00`));

  const dateStr = formatDate(dateISO);

  useEffect(() => {
    if (!selectedRoute) return;
    setFromCity(selectedRoute.from);
    setToCity(selectedRoute.to);
    setActiveDropdown(null);
  }, [selectedRoute]);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const temp = fromCity;
    setFromCity(toCity || "Варшава");
    setToCity(temp);
  };

  const handleSearch = () => {
    navigate(`/booking?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity || "Варшава")}&date=${encodeURIComponent(dateISO)}`);
  };

  const accentBlue = isDark ? "#38BDF8" : "#087DFF";

  return (
    <div
      id="trip-search"
      ref={containerRef}
      style={{
        position: "relative",
        zIndex: 15,
        width: "100%",
        maxWidth: "680px",
      }}
    >
      {/* Main Glass Panel */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "56px",
          padding: "4px 6px 4px 14px",
          borderRadius: "16px",
          background: isDark ? "rgba(7, 15, 27, 0.88)" : "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(18px)",
          border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(16, 24, 40, 0.08)"}`,
          boxShadow: isDark
            ? "0 14px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
            : "0 8px 30px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.03)",
          transition: "all 200ms ease",
        }}
      >
        {/* Field 1: From City */}
        <div
          onClick={() => setActiveDropdown(activeDropdown === "from" ? null : "from")}
          style={{
            flex: "1 1 28%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: "10px",
            minWidth: 0,
          }}
        >
          <MapPin size={16} color={accentBlue} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span
              style={{
                fontSize: "10px",
                color: isDark ? "#8B9AAF" : "#8A98A9",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
              }}
            >
              {t("search.fromLabel")}
            </span>
            <input
              type="text"
              value={fromCity}
              onChange={(e) => setFromCity(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder={t("search.cityPlaceholder")}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "13px",
                fontWeight: 600,
                color: isDark ? "#FFFFFF" : "#172033",
                width: "100%",
                padding: 0,
                marginTop: "1px",
              }}
            />
          </div>
        </div>

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          title={t("search.swap")}
          aria-label={t("search.swap")}
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(16, 24, 40, 0.04)",
            border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(16, 24, 40, 0.08)"}`,
            color: isDark ? "#8B9AAF" : "#66758A",
            cursor: "pointer",
            margin: "0 4px",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = accentBlue;
            e.currentTarget.style.borderColor = accentBlue;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = isDark ? "#8B9AAF" : "#66758A";
            e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(16, 24, 40, 0.08)";
          }}
        >
          <ArrowLeftRight size={13} />
        </button>

        {/* Field 2: To City */}
        <div
          onClick={() => setActiveDropdown(activeDropdown === "to" ? null : "to")}
          style={{
            flex: "1 1 32%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: "10px",
            minWidth: 0,
          }}
        >
          <MapPin size={16} color={accentBlue} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span
              style={{
                fontSize: "10px",
                color: isDark ? "#8B9AAF" : "#8A98A9",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
              }}
            >
              {t("search.toLabel")}
            </span>
            <input
              type="text"
              value={toCity}
              onChange={(e) => setToCity(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder={t("search.toPlaceholder")}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "13px",
                fontWeight: toCity ? 600 : 400,
                color: toCity ? (isDark ? "#FFFFFF" : "#172033") : (isDark ? "#64748B" : "#8A98A9"),
                width: "100%",
                padding: 0,
                marginTop: "1px",
              }}
            />
          </div>
        </div>

        {/* Vertical Divider */}
        <div
          style={{
            width: "1px",
            height: "28px",
            background: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(16, 24, 40, 0.08)",
            margin: "0 8px",
            flexShrink: 0,
          }}
        />

        {/* Field 3: Date */}
        <button
          ref={dateTriggerRef}
          type="button"
          onClick={() => setActiveDropdown(activeDropdown === "date" ? null : "date")}
          aria-haspopup="dialog"
          aria-expanded={activeDropdown === "date"}
          className="busnet-date-trigger"
          style={{
            flex: "1 1 25%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: "10px",
            minWidth: 0,
          }}
        >
          <Calendar size={16} color={accentBlue} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span
              style={{
                fontSize: "10px",
                color: isDark ? "#8B9AAF" : "#8A98A9",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
              }}
            >
              {t("search.dateLabel")}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: isDark ? "#FFFFFF" : "#172033",
                whiteSpace: "nowrap",
                marginTop: "1px",
              }}
            >
              {dateStr}
            </span>
          </div>
        </button>

        {/* Search Submit Button */}
        <button
          onClick={handleSearch}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            height: "40px",
            padding: "0 20px",
            borderRadius: "11px",
            background: "linear-gradient(135deg, #168BFF 0%, #0875F9 100%)",
            color: "#FFFFFF",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
            boxShadow: isDark
              ? "0 4px 14px rgba(8, 125, 255, 0.35)"
              : "0 4px 12px rgba(8, 125, 255, 0.22)",
            transition: "all 200ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.08)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          <Search size={15} strokeWidth={2.2} />
          <span>{t("search.submit")}</span>
        </button>
      </div>

      {/* Dropdown Popovers */}
      {activeDropdown === "from" && (
        <div
          style={{
            position: "absolute",
            top: "64px",
            left: 0,
            width: "240px",
            background: isDark ? "#0B1422" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(16,24,40,0.1)"}`,
            borderRadius: "12px",
            boxShadow: tokens.shadowCard,
            padding: "8px",
            zIndex: 30,
          }}
        >
          <div style={{ fontSize: "11px", color: isDark ? "#64748B" : "#8A98A9", padding: "4px 8px", fontWeight: 600 }}>
            {t("search.popularFrom")}
          </div>
          {POPULAR_CITIES.slice(0, 5).map((city) => (
            <div
              key={city}
              onClick={() => {
                setFromCity(city);
                setActiveDropdown(null);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                fontSize: "13px",
                cursor: "pointer",
                color: isDark ? "#F1F5F9" : "#101828",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {city}
            </div>
          ))}
        </div>
      )}

      {activeDropdown === "to" && (
        <div
          style={{
            position: "absolute",
            top: "64px",
            left: "160px",
            width: "240px",
            background: isDark ? "#0B1422" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(16,24,40,0.1)"}`,
            borderRadius: "12px",
            boxShadow: tokens.shadowCard,
            padding: "8px",
            zIndex: 30,
          }}
        >
          <div style={{ fontSize: "11px", color: isDark ? "#64748B" : "#8A98A9", padding: "4px 8px", fontWeight: 600 }}>
            {t("search.popularTo")}
          </div>
          {["Варшава", "Берлін", "Прага", "Вроцлав", "Відень", "Краків"].map((city) => (
            <div
              key={city}
              onClick={() => {
                setToCity(city);
                setActiveDropdown(null);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                fontSize: "13px",
                cursor: "pointer",
                color: isDark ? "#F1F5F9" : "#101828",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {city}
            </div>
          ))}
        </div>
      )}

      <BusnetCalendar
        open={activeDropdown === "date"}
        selectedDate={dateISO}
        fromCity={fromCity}
        toCity={toCity}
        onChange={setDateISO}
        onClose={() => {
          setActiveDropdown(null);
          window.requestAnimationFrame(() => dateTriggerRef.current?.focus());
        }}
        triggerRef={dateTriggerRef}
      />
    </div>
  );
}
