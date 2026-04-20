import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

const SECTION_KEYS = ["water", "toilet", "electricity", "gas", "heating", "fridge", "beforeDriving", "driving"] as const;

export default async function GuestHelpPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const tBooking = await getTranslations("guestBooking");
  const t = await getTranslations("guestHelp");

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <style>{`
        .gh-sp { padding: var(--space-4); }
        @media (min-width: 768px) { .gh-sp { padding: var(--space-6); } }
      `}</style>
      {/* Back link */}
      <div>
        <Link
          href={`/${locale}/guest?code=${encodeURIComponent(code)}`}
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
          {tBooking("back")}
        </Link>
      </div>

      {/* Title bar */}
      <div
        className="surface gh-sp"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <div>
          <h1 style={{ marginBottom: "var(--space-2)" }}>{t("title")}</h1>
          <p style={{ fontSize: "14px", color: "rgb(var(--text-secondary))", margin: 0 }}>
            {t("subtitle")}
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
            flexShrink: 0,
          }}
        >
          {tBooking("guestAccess")}
        </span>
      </div>

      {/* Warning banner */}
      <div
        style={{
          padding: "var(--space-4) var(--space-5)",
          borderRadius: "var(--radius)",
          background: "rgb(var(--warning) / 0.1)",
          border: "1px solid rgb(var(--warning) / 0.3)",
          display: "flex",
          gap: "var(--space-3)",
          alignItems: "flex-start",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--warning))" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" />
        </svg>
        <p style={{ fontSize: "14px", lineHeight: "1.5", color: "rgb(var(--text-secondary))", margin: 0 }}>
          {t.rich("warning", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      {/* Accordion sections */}
      <div className="surface gh-sp">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {SECTION_KEYS.map((key) => (
            <details
              key={key}
              style={{
                border: "1px solid rgb(var(--border-light))",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  padding: "var(--space-4) var(--space-5)",
                  cursor: "pointer",
                  fontSize: "15px",
                  fontWeight: "500",
                  color: "rgb(var(--text))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  userSelect: "none",
                  listStyle: "none",
                  background: "rgb(var(--app-bg))",
                }}
              >
                {t(`sections.${key}.title`)}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div
                style={{
                  padding: "var(--space-4) var(--space-5)",
                  borderTop: "1px solid rgb(var(--border-light))",
                }}
              >
                <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text-secondary))", margin: 0 }}>
                  {t(`sections.${key}.body`)}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
