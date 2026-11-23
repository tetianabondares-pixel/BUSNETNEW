import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CalendarAvailability } from "./calendar.types";
import { addDays, getKyivToday, isWithinSearchLimit, parseDateKey, toDateKey } from "./calendar.utils";
import { useCalendarAvailability } from "./useCalendarAvailability";
import "./BusnetCalendar.css";

type BusnetCalendarProps = {
  open: boolean;
  selectedDate: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  onChange: (date: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null> | null;
};

function usePresentationMode(): "sheet" | "popover" {
  const getMode = (): "sheet" | "popover" => {
    if (typeof window === "undefined") return "popover";
    return window.matchMedia("(max-width: 767px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
      ? "sheet"
      : "popover";
  };
  const [mode, setMode] = useState(getMode);
  useEffect(() => {
    const update = () => setMode(getMode());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return mode;
}

export function BusnetCalendar({
  open,
  selectedDate,
  fromLocationId,
  toLocationId,
  onChange,
  onClose,
  triggerRef,
}: BusnetCalendarProps) {
  const { t, i18n } = useTranslation();
  const mode = usePresentationMode();
  const locale = i18n.language?.startsWith("it") ? "it-IT" : i18n.language?.startsWith("en") ? "en-US" : "uk-UA";
  const today = getKyivToday();
  const [visibleMonth, setVisibleMonth] = useState(() => parseDateKey(selectedDate || today));
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) setVisibleMonth(parseDateKey(selectedDate || today));
  }, [open, selectedDate, today]);

  useLayoutEffect(() => {
    if (!open || mode !== "popover" || !triggerRef?.current) return;
    const updatePosition = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = triggerRef!.current!.getBoundingClientRect();
      const width = Math.min(336, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = Math.min(panel.scrollHeight, window.innerHeight - 24);
      const opensBelow = below >= height || below >= above;
      const top = opensBelow
        ? rect.bottom + 8
        : Math.max(12, rect.top - height - 8);
      const maxHeight = opensBelow ? below : above;
      setPopoverStyle({ left, top, width, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, mode, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const handleOutside = (event: MouseEvent) => {
      if (mode === "popover" &&
          panelRef.current &&
          !panelRef.current.contains(event.target as Node) &&
          !triggerRef?.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [open, mode, onClose, triggerRef]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => panelRef.current?.focus());
  }, [open]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth() + 1;
  const availability = useCalendarAvailability({
    year,
    month,
    fromLocationId,
    toLocationId,
    timezone: "Europe/Kyiv",
  });
  const availabilityByDate = useMemo(
    () => new Map(availability.data.map((item) => [item.date, item])),
    [availability.data],
  );

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(visibleMonth);
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long" }).format(visibleMonth);
  const yearLabel = String(year);
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2023, 0, 2 + index)).replace(/\.$/, "").slice(0, 2)
        .replace(/^./, (letter) => letter.toLocaleUpperCase(locale))
        .replace(/.$/, (letter) => letter.toLocaleLowerCase(locale)),
    );
  }, [locale]);

  const firstGridDate = useMemo(() => {
    const first = new Date(year, month - 1, 1, 12);
    const mondayOffset = (first.getDay() + 6) % 7;
    first.setDate(first.getDate() - mondayOffset);
    return toDateKey(first);
  }, [year, month]);

  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(firstGridDate, index)),
    [firstGridDate],
  );

  const todayDate = parseDateKey(today);
  const currentMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1, 12);
  const previousDisabled = visibleMonth.getFullYear() === todayDate.getFullYear() &&
    visibleMonth.getMonth() === todayDate.getMonth();
  const nextMonthKey = toDateKey(new Date(year, month, 1, 12));
  const nextDisabled = !isWithinSearchLimit(nextMonthKey, today);

  const changeMonth = (offset: number) => {
    const next = new Date(year, month - 1 + offset, 1, 12);
    const candidateKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    if (!isWithinSearchLimit(candidateKey, today) && offset > 0) return;
    if (next.getTime() < currentMonthStart.getTime() && offset < 0) return;
    setVisibleMonth(next);
  };

  const chooseDate = (date: string) => {
    if (!isWithinSearchLimit(date, today)) return;
    onChange(date);
    onClose();
  };

  const handleGridKey = (event: React.KeyboardEvent, date: string) => {
    let target: string | null = null;
    if (event.key === "ArrowLeft") target = addDays(date, -1);
    if (event.key === "ArrowRight") target = addDays(date, 1);
    if (event.key === "ArrowUp") target = addDays(date, -7);
    if (event.key === "ArrowDown") target = addDays(date, 7);
    if (event.key === "Home") target = addDays(date, -((parseDateKey(date).getDay() + 6) % 7));
    if (event.key === "End") target = addDays(date, 6 - ((parseDateKey(date).getDay() + 6) % 7));
    if (event.key === "PageUp") {
      event.preventDefault();
      changeMonth(-1);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      changeMonth(1);
      return;
    }
    if (target && isWithinSearchLimit(target, today)) {
      event.preventDefault();
      setVisibleMonth(parseDateKey(target));
      window.requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus();
      });
    }
  };

  if (!open) return null;

  const closeOnSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current == null) return;
    const distance = event.clientY - dragStartRef.current;
    if (distance > 70) onClose();
    dragStartRef.current = null;
  };
  const statusText = availability.loading
    ? t("calendar.loading")
    : availability.error
      ? availability.error.startsWith("calendar.")
        ? t(availability.error)
        : t("calendar.providerError")
      : t("calendar.scheduledDatesCount", { count: availability.data.filter((item) => item.isAvailable).length });
  const missingRoute = availability.error === "calendar.selectRouteError";

  const calendar = (
    <>
      {mode === "sheet" && (
        <div
          className="busnet-calendar-drag"
          aria-hidden="true"
          onPointerDown={(event) => { dragStartRef.current = event.clientY; }}
          onPointerUp={closeOnSwipe}
        />
      )}
      <div className="busnet-calendar-header">
        <button
          type="button"
          className="busnet-calendar-icon-button"
          onClick={() => changeMonth(-1)}
          disabled={previousDisabled}
          aria-label={t("calendar.previousMonth")}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="busnet-calendar-heading">
          <h2>{monthTitle}</h2>
          <span>{yearLabel}</span>
        </div>
        <button
          type="button"
          className="busnet-calendar-icon-button"
          onClick={() => changeMonth(1)}
          disabled={nextDisabled}
          aria-label={t("calendar.nextMonth")}
        >
          <ChevronRight size={18} />
        </button>
        {mode === "popover" ? (
          <button type="button" className="busnet-calendar-icon-button" onClick={onClose} aria-label={t("calendar.close")}>
            <X size={18} />
          </button>
        ) : (
          <button type="button" className="busnet-calendar-icon-button" onClick={onClose} aria-label={t("calendar.close")}>
            <X size={18} />
          </button>
        )}
      </div>

      {!missingRoute && (availability.loading || availability.error || availability.data.length > 0) && (
        <div className="busnet-calendar-status-row" aria-live="polite">
          <span className={availability.error ? "busnet-calendar-status-error" : ""}>{statusText}</span>
          {availability.error && (
            <button type="button" onClick={availability.retry}>{t("calendar.retry")}</button>
          )}
        </div>
      )}

      <div className="busnet-calendar-quick-actions">
        {[today, addDays(today, 1)].map((date, index) => {
          const label = index === 0 ? t("search.today") : t("search.tomorrow");
          const dateLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(parseDateKey(date));
          return (
            <button
              type="button"
              key={date}
              className={`busnet-calendar-quick-action ${date === selectedDate ? "is-selected" : ""}`}
              onClick={() => chooseDate(date)}
              aria-pressed={date === selectedDate}
            >
              <span>{label}</span>
              <strong>{dateLabel}</strong>
            </button>
          );
        })}
      </div>

      <div className="busnet-calendar-weekdays" aria-hidden="true">
        {weekdayLabels.map((label, index) => (
          <span className={index >= 5 ? "is-weekend" : ""} key={index}>{label}</span>
        ))}
      </div>
      <div
        className="busnet-calendar-grid"
        role="grid"
        aria-label={`${t("calendar.regionLabel")}: ${monthLabel}`}
      >
        {cells.map((date) => {
          const parsed = parseDateKey(date);
          const outside = parsed.getMonth() !== month - 1;
          const past = date < today;
          const maxLimit = !isWithinSearchLimit(date, today);
          const disabled = outside || past || maxLimit;
          const item = availabilityByDate.get(date);
          const available = Boolean(item?.isAvailable && item.scheduledServicesCount > 0);
          const selected = date === selectedDate;
          const ariaParts = [
            new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(parsed),
            past ? t("calendar.past") : "",
            available ? t("calendar.scheduledService") : t("calendar.noScheduledService"),
            selected ? t("calendar.selected") : "",
          ].filter(Boolean);

          return (
            <button
              type="button"
              role="gridcell"
              key={date}
              data-date={date}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={ariaParts.join(", ")}
              className={[
                "busnet-calendar-cell",
                outside ? "is-outside" : "",
                past ? "is-past" : "",
                date === today ? "is-today" : "",
                available ? "is-available" : "",
                selected ? "is-selected" : "",
              ].join(" ").trim()}
              onClick={() => chooseDate(date)}
              onKeyDown={(event) => handleGridKey(event, date)}
            >
              <span>{parsed.getDate()}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  const dialog = mode === "sheet" ? (
      <>
        <div className="busnet-calendar-backdrop" onPointerDown={onClose} aria-hidden="true" />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="busnet-calendar-sheet"
        >
          {calendar}
        </div>
      </>
    ) : (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("calendar.regionLabel")}
      tabIndex={-1}
      className="busnet-calendar-popover"
      style={popoverStyle}
    >
      {calendar}
    </div>
  );
  return createPortal(dialog, document.body);
}
