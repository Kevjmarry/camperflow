"use client";

import { useLocale } from "next-intl";
import { useState, useRef, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";

interface Props {
  value: string;       // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}

const NAV_BTN: CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 18, lineHeight: 1, padding: "0 4px", color: "rgb(var(--text))",
};

export default function LocalizedDateInput({ value, onChange, className, style }: Props) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date();

  const [viewYear, setViewYear] = useState(() =>
    value ? new Date(value + "T00:00:00").getFullYear() : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    value ? new Date(value + "T00:00:00").getMonth() : today.getMonth()
  );

  // Sync calendar view when value is changed externally (e.g. clear filters)
  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Mon-first weekday headers using app locale
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 2024-01-01 is a Monday
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [locale]);

  // Localized "Month Year" header
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(viewYear, viewMonth)),
    [locale, viewYear, viewMonth]
  );

  // Day cells with Monday-first offset
  const cells = useMemo(() => {
    const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const count = new Date(viewYear, viewMonth + 1, 0).getDate();
    const arr: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= count; d++) arr.push(d);
    return arr;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const pick = (day: number) => {
    const yyyy = String(viewYear).padStart(4, "0");
    const mm   = String(viewMonth + 1).padStart(2, "0");
    const dd   = String(day).padStart(2, "0");
    onChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };

  const parsed = value ? new Date(value + "T00:00:00") : null;

  const isSelected = (d: number) =>
    !!parsed &&
    parsed.getFullYear() === viewYear &&
    parsed.getMonth()    === viewMonth &&
    parsed.getDate()     === d;

  const isToday = (d: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth()    === viewMonth &&
    today.getDate()     === d;

  const displayLocale = locale === "en" ? "en-GB" : locale;
  const display = parsed
    ? new Intl.DateTimeFormat(displayLocale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed)
    : "";

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: "relative", ...style, display: "inline-flex", alignItems: "center", cursor: "pointer" }}
    >
      {/* Trigger: looks like an input via className, transparent button fills it */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", padding: 0,
          font: "inherit", color: "inherit",
        }}
      >
        {display || <span style={{ opacity: 0.4 }}>—</span>}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 9999,
          background: "rgb(var(--surface))",
          border: "1px solid rgb(var(--border))",
          borderRadius: "var(--radius)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          padding: "12px", minWidth: 240,
        }}>
          {/* Month / year navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" style={NAV_BTN} onClick={prevMonth}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgb(var(--text))" }}>{monthLabel}</span>
            <button type="button" style={NAV_BTN} onClick={nextMonth}>›</button>
          </div>

          {/* Localized weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 2 }}>
            {weekdays.map(wd => (
              <div key={wd} style={{ textAlign: "center", fontSize: 10, color: "rgb(var(--muted))", padding: "2px 0" }}>
                {wd}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {cells.map((day, i) =>
              day === null ? (
                <div key={`_${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  style={{
                    border: "none", borderRadius: 4, padding: "5px 0",
                    cursor: "pointer", fontSize: 12,
                    background: isSelected(day)
                      ? "rgb(var(--brand))"
                      : isToday(day)
                      ? "rgb(var(--primary) / 0.12)"
                      : "transparent",
                    color: isSelected(day) ? "#fff" : "rgb(var(--text))",
                    fontWeight: isSelected(day) || isToday(day) ? 600 : 400,
                  }}
                >
                  {day}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
