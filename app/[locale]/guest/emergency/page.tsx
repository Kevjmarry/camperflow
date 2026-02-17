"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { ReactNode } from "react";

function PhoneRow({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "rgb(var(--surface-raised, var(--bg-subtle, 0 0 0) / 0.04))",
        border: "1px solid rgb(var(--border))",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "var(--radius-lg)",
          background: "rgb(var(--error) / 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" stroke="rgb(var(--error))" fill="none">
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 5a2 2 0 012-2h1.5a.5.5 0 01.5.5v3a.5.5 0 01-.5.5H5a1 1 0 00-1 1v1a7 7 0 007 7h1a1 1 0 001-1v-1.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V17a2 2 0 01-2 2h-1C7.163 19 3 14.837 3 9V8a2 2 0 012-2z"
          />
        </svg>
      </div>
      <div>
        <p
          style={{
            fontSize: "11px",
            fontWeight: "500",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "rgb(var(--muted))",
            marginBottom: "2px",
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: "14px",
            color: "rgb(var(--text-secondary))",
            fontStyle: "italic",
          }}
        >
          Not yet configured
        </p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  instructions,
  phone1Label,
  phone2Label,
}: {
  title: string;
  icon: ReactNode;
  instructions: string;
  phone1Label: string;
  phone2Label: string;
}) {
  return (
    <div className="surface" style={{ padding: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-4)",
        }}
      >
        {icon}
        <h2 style={{ fontSize: "20px", color: "rgb(var(--text))", margin: 0 }}>{title}</h2>
      </div>

      <p
        style={{
          fontSize: "14px",
          lineHeight: "1.65",
          color: "rgb(var(--muted))",
          marginBottom: "var(--space-5)",
        }}
      >
        {instructions}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <PhoneRow label={phone1Label} />
        <PhoneRow label={phone2Label} />
      </div>
    </div>
  );
}

export default function EmergencyPage() {
  const t = useTranslations("guestEmergency");
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

  const iconWrapError = {
    width: "48px",
    height: "48px",
    borderRadius: "var(--radius-lg)",
    background: "rgb(var(--error) / 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const iconWrapNeutral = {
    width: "48px",
    height: "48px",
    borderRadius: "var(--radius-lg)",
    background: "rgb(var(--warning) / 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "var(--space-6)" }}>

      {/* Back link */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <Link
          href={`/${locale}/guest?code=${code}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "14px",
            color: "rgb(var(--muted))",
            textDecoration: "none",
          }}
        >
          <svg width="16" height="16" stroke="currentColor" fill="none">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 13l-5-5 5-5" />
          </svg>
          {t("back")}
        </Link>
      </div>

      {/* Page header surface */}
      <div
        className="surface"
        style={{
          padding: "var(--space-6)",
          marginBottom: "var(--space-5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={iconWrapError}>
            <svg width="24" height="24" stroke="rgb(var(--error))" fill="none">
              <path strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: "24px", color: "rgb(var(--text))", margin: 0 }}>{t("title")}</h1>
            <p style={{ fontSize: "14px", color: "rgb(var(--muted))", marginTop: "var(--space-1)" }}>
              {t("subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Accident section */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <SectionCard
          title={t("accident.title")}
          icon={
            <div style={iconWrapError}>
              <svg width="24" height="24" stroke="rgb(var(--error))" fill="none">
                <path strokeWidth="2" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          }
          instructions={t("accident.instructions")}
          phone1Label={t("accident.phone1Label")}
          phone2Label={t("accident.phone2Label")}
        />
      </div>

      {/* Breakdown section */}
      <SectionCard
        title={t("breakdown.title")}
        icon={
          <div style={iconWrapNeutral}>
            <svg width="24" height="24" stroke="rgb(var(--warning))" fill="none">
              <path strokeWidth="2" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
        }
        instructions={t("breakdown.instructions")}
        phone1Label={t("breakdown.phone1Label")}
        phone2Label={t("breakdown.phone2Label")}
      />

    </div>
  );
}