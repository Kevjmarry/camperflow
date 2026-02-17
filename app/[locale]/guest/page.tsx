"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { ReactNode } from "react";

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
  rulesAndTips: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    </div>
  ),
  messages: (
    <div style={iconWrap}>
      <svg width="24" height="24" stroke="currentColor" fill="none">
        <path strokeWidth="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </div>
  ),
};

export default function GuestPage() {
  const t = useTranslations("guestDashboard");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

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

  const cards: { key: string; functional: boolean; href: string }[] = [
    { key: "bookingDetails", functional: true,  href: `/${locale}/guest/bookings/${code}` },
    { key: "emergency",      functional: true,  href: `/${locale}/guest/emergency?code=${code}` },
    { key: "pickupInfo",     functional: false, href: "#" },
    { key: "returnInfo",     functional: false, href: "#" },
    { key: "rulesAndTips",   functional: false, href: "#" },
    { key: "messages",       functional: false, href: "#" },
  ];

  const sharedCardStyle = {
    padding: "var(--space-6)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--space-3)",
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "var(--space-6)" }}>

      {/* Header */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>{t("title")}</h1>
        <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>{t("subtitle")}</p>
      </div>

      {/* Booking summary strip */}
      <div
        className="surface"
        style={{
          padding: "var(--space-4) var(--space-6)",
          marginBottom: "var(--space-8)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-6)",
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {cards.map(({ key, functional, href }) => {
          if (functional) {
            return (
              <Link
                key={key}
                href={href}
                className="surface"
                style={{
                  ...sharedCardStyle,
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
              className="surface"
              style={{
                ...sharedCardStyle,
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
  );
}