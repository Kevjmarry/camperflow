import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface GuestBooking {
  company_id: string | null;
  company_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
}

const STORAGE_KEY = "camperflow:last_company_theme";

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0 0";
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

function adjustBrightness(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.max(0, Math.min(255, parseInt(result[1], 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(result[2], 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(result[3], 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const iconWrap = {
  width: "48px",
  height: "48px",
  borderRadius: "var(--radius-lg)",
  background: "rgb(var(--brand-light))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const icons: Record<string, ReactNode> = {
  bookingDetails: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M8 7V3m8 4V3M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z" />
      </svg>
    </div>
  ),
  emergency: (
    <div style={{ ...iconWrap, background: "rgb(var(--error) / 0.1)" }}>
      <svg width="24" height="24" stroke="rgb(var(--error))" fill="none">
        <path strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    </div>
  ),
  pickupInfo: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    </div>
  ),
  returnInfo: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-1" />
      </svg>
    </div>
  ),
  faq: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-6v.01M12 8a2 2 0 00-2 2" />
      </svg>
    </div>
  ),
  help: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 14v.01M12 7a3 3 0 013 3c0 1.5-1.5 2.5-2.5 3-.5.25-.5.75-.5 1" />
      </svg>
    </div>
  ),
};

export default async function GuestPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const t = await getTranslations({ locale, namespace: "guestDashboard" });

  if (!code) {
    return (
      <div
        className="surface"
        style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}
      >
        <h1 style={{ marginBottom: "var(--space-4)" }}>{t("noCodeTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{t("noCodeMessage")}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  if (!booking) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Link
            href={`/${locale}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              fontSize: "14px",
              fontWeight: "500",
              color: "rgb(var(--text-secondary))",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("back")}
          </Link>
        </div>
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <h1 style={{ marginBottom: "var(--space-4)" }}>{t("notFoundTitle")}</h1>
          <p style={{ color: "rgb(var(--muted))" }}>
            {t("notFoundMessage")}{" "}
            <span style={{ fontFamily: "monospace", fontWeight: "600", color: "rgb(var(--text))" }}>{code}</span>{" "}
            {t("notFoundMessageEnd")}
          </p>
          <p style={{ marginTop: "var(--space-4)", fontSize: "13px", color: "rgb(var(--muted))" }}>
            {t("notFoundHint")}
          </p>
        </div>
      </div>
    );
  }

  const hasTheme =
    !!booking?.company_id &&
    !!booking?.company_name &&
    !!booking?.primary_color &&
    !!booking?.secondary_color &&
    !!booking?.accent_color;

  const themeObj = hasTheme
    ? {
        id: booking!.company_id as string,
        name: booking!.company_name as string,
        logo_url: booking!.logo_url ?? null,
        primary_color: booking!.primary_color as string,
        secondary_color: booking!.secondary_color as string,
        accent_color: booking!.accent_color as string,
      }
    : null;

  const themeStyleTag = themeObj
    ? `
:root{
  --brand:${hexToRgb(themeObj.primary_color)};
  --brand-hover:${hexToRgb(adjustBrightness(themeObj.primary_color, -20))};
  --brand-light:${hexToRgb(adjustBrightness(themeObj.primary_color, 200))};
  --brand-2:${hexToRgb(themeObj.secondary_color)};
  --accent:${hexToRgb(themeObj.accent_color)};
}
`
    : "";

  const themeScript = themeObj
    ? `
try{
  var _t=${JSON.stringify(themeObj)};
  localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(_t));
  var _r=document.documentElement;
  _r.style.setProperty("--brand","${hexToRgb(themeObj.primary_color)}");
  _r.style.setProperty("--brand-hover","${hexToRgb(adjustBrightness(themeObj.primary_color, -20))}");
  _r.style.setProperty("--brand-light","${hexToRgb(adjustBrightness(themeObj.primary_color, 200))}");
  _r.style.setProperty("--brand-2","${hexToRgb(themeObj.secondary_color)}");
  _r.style.setProperty("--accent","${hexToRgb(themeObj.accent_color)}");
}catch(_e){}
`
    : "";

  const cards: { key: string; functional: boolean; href: string }[] = [
    { key: "bookingDetails", functional: true, href: `/${locale}/guest/bookings/${code}` },
    { key: "pickupInfo",     functional: true, href: `/${locale}/guest/pickup?code=${code}` },
    { key: "returnInfo",     functional: true, href: `/${locale}/guest/return?code=${code}` },
    { key: "faq",            functional: true, href: `/${locale}/guest/faq?code=${code}` },
    { key: "help",           functional: true, href: `/${locale}/guest/help?code=${code}` },
    { key: "emergency",      functional: true, href: `/${locale}/guest/emergency?code=${code}` },
  ];

  return (
    <div className="gp-wrap">
      <style>{`
        .gp-wrap { max-width: 900px; margin: 0 auto; }
        .gp-strip { padding: var(--space-3) var(--space-4); margin-bottom: var(--space-5); gap: var(--space-3); }
        .gp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
        .gp-card { padding: var(--space-4); }
        @media (min-width: 480px) {
          .gp-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        }
        @media (min-width: 768px) {
          .gp-strip { padding: var(--space-4) var(--space-6); margin-bottom: var(--space-8); gap: var(--space-6); }
          .gp-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); }
          .gp-card { padding: var(--space-6); }
        }
      `}</style>
      {themeObj && (
        <>
          <style dangerouslySetInnerHTML={{ __html: themeStyleTag }} />
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </>
      )}

      <div className="surface page-surface">

      {/* Header */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h1 style={{ color: "rgb(var(--text))" }}>{t("title")}</h1>
        <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>{t("subtitle")}</p>
      </div>

      {/* Booking summary strip */}
      <div
        className="surface gp-strip"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: "500",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "rgb(var(--text-secondary))",
              marginBottom: "var(--space-1)",
            }}
          >
            {t("summaryCode")}
          </p>
          <p style={{ fontFamily: "monospace", fontWeight: "600", fontSize: "18px", color: "rgb(var(--text))" }}>
            {code}
          </p>
        </div>
        <span
          style={{
            background: "rgb(var(--brand-light))",
            color: "rgb(var(--brand))",
            padding: "var(--space-2) var(--space-4)",
            borderRadius: "var(--radius-xl)",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          {t("guestAccess")}
        </span>
      </div>

      {/* Card grid */}
      <div className="gp-grid">
        {cards.map(({ key, functional, href }) => {
          if (functional) {
            return (
              <Link
                key={key}
                href={href}
                className="surface gp-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                {icons[key]}
                <div>
                  <h3 style={{ fontSize: "18px", marginBottom: "var(--space-1)", color: "rgb(var(--text))" }}>
                    {t(`cards.${key}`)}
                  </h3>
                </div>
              </Link>
            );
          }

          return (
            <div
              key={key}
              className="surface gp-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
                opacity: 0.5,
                cursor: "not-allowed",
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "var(--space-3)",
                  right: "var(--space-3)",
                  background: "rgb(var(--warning) / 0.15)",
                  color: "rgb(var(--warning))",
                  fontSize: "11px",
                  fontWeight: "600",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-xl)",
                }}
              >
                {t("comingSoon")}
              </span>
              {icons[key]}
              <div>
                <h3 style={{ fontSize: "18px", marginBottom: "var(--space-1)", color: "rgb(var(--text))" }}>
                  {t(`cards.${key}`)}
                </h3>
              </div>
            </div>
          );
        })}
      </div>

      </div>
    </div>
  );
}
