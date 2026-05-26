"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "@/i18n";

function AuthLocaleSwitcher() {
  const pathname = usePathname();
  const currentLocale = pathname.split("/")[1];

  function switchLocale(newLocale: Locale) {
    const parts = window.location.pathname.split("/");
    if (parts[1] === newLocale) return;
    parts[1] = newLocale;
    const next = parts.join("/") + window.location.search + window.location.hash;
    window.location.assign(next);
  }

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          disabled={currentLocale === loc}
          style={{
            padding: "3px 8px",
            borderRadius: "var(--radius)",
            border: "1px solid",
            borderColor: currentLocale === loc ? "rgb(var(--brand))" : "transparent",
            background: currentLocale === loc ? "rgb(var(--brand) / 0.08)" : "transparent",
            color: currentLocale === loc ? "rgb(var(--brand))" : "rgb(var(--muted))",
            fontSize: "12px",
            fontWeight: currentLocale === loc ? 600 : 400,
            cursor: currentLocale === loc ? "default" : "pointer",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            lineHeight: "1.4",
          }}
        >
          {loc}
        </button>
      ))}
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
