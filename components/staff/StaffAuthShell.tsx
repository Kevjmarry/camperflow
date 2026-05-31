"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { activeLocales, localeNames, type Locale } from "@/i18n";

function AuthLocaleSwitcher() {
  const pathname = usePathname();
  const currentLocale = pathname.split("/")[1] as Locale;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function switchLocale(newLocale: Locale) {
    const parts = window.location.pathname.split("/");
    if (parts[1] === newLocale) return;
    parts[1] = newLocale;
    const next = parts.join("/") + window.location.search + window.location.hash;
    setOpen(false);
    window.location.assign(next);
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "3px 8px",
          borderRadius: "var(--radius)",
          border: "1px solid",
          borderColor: open ? "rgb(var(--brand))" : "rgb(var(--border))",
          background: open ? "rgb(var(--brand) / 0.08)" : "transparent",
          color: open ? "rgb(var(--brand))" : "rgb(var(--muted))",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          lineHeight: "1.4",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {currentLocale}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path
            d={open ? "M2 7l3-4 3 4" : "M2 3l3 4 3-4"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            background: "rgb(var(--surface))",
            border: "1px solid rgb(var(--border))",
            borderRadius: "var(--radius)",
            boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
            zIndex: 50,
            minWidth: "140px",
            padding: "4px",
          }}
        >
          {activeLocales.map((loc) => (
            <button
              key={loc}
              onClick={() => switchLocale(loc)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: currentLocale === loc ? "rgb(var(--brand) / 0.08)" : "transparent",
                color: currentLocale === loc ? "rgb(var(--brand))" : "rgb(var(--foreground))",
                fontSize: "13px",
                fontWeight: currentLocale === loc ? 600 : 400,
                cursor: currentLocale === loc ? "default" : "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "rgb(var(--muted))",
                  minWidth: "22px",
                }}
              >
                {loc}
              </span>
              {localeNames[loc]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StaffAuthShell({
  children,
  backLink,
}: {
  children: ReactNode;
  backLink?: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "rgb(var(--app-bg))",
        color: "rgb(var(--text))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        .staff-auth-card {
          padding: var(--space-6);
        }
        @media (min-width: 540px) {
          .staff-auth-card {
            padding: var(--space-8) var(--space-10);
          }
        }
      `}</style>

      {/* Header bar — locale switcher top-right */}
      <nav
        style={{
          width: "100%",
          background: "rgb(var(--surface))",
          borderBottom: "1px solid rgb(var(--border))",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "flex-end",
          minHeight: "44px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 var(--space-3)",
            borderLeft: "1px solid rgb(var(--border))",
          }}
        >
          <AuthLocaleSwitcher />
        </div>
      </nav>

      {/* Vertically centred card area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-8) var(--space-4)",
        }}
      >
        <div style={{ width: "100%", maxWidth: "440px" }}>
          {backLink && (
            <div style={{ marginBottom: "var(--space-3)" }}>{backLink}</div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
