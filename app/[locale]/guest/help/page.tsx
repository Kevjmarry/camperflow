import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface GuestBooking {
  company_id: string | null;
}

interface CompanyHelpInfo {
  contact_phone: string | null;
  contact_whatsapp: string | null;
  included_items: string | null;
  rules_and_tips: string | null;
  help_videos: string | null;
}

function getYouTubeEmbedId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1].split("?")[0] || null;
      return u.searchParams.get("v");
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function parseVideoSections(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: { title: string; urls: string[] }[] = [];
  let cur: { title: string; urls: string[] } | null = null;
  for (const line of lines) {
    if (line.endsWith(":")) {
      if (cur) sections.push(cur);
      cur = { title: line.slice(0, -1).trim(), urls: [] };
    } else {
      if (!cur) cur = { title: "", urls: [] };
      cur.urls.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections.filter((s) => s.urls.some((u) => getYouTubeEmbedId(u)));
}

function parseAccordionSections(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: { title: string; steps: string[] }[] = [];
  let cur: { title: string; steps: string[] } | null = null;
  for (const line of lines) {
    if (line.endsWith(":")) {
      if (cur) sections.push(cur);
      cur = { title: line.slice(0, -1).trim(), steps: [] };
    } else if (cur) {
      cur.steps.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections.filter((s) => s.steps.length > 0);
}


export default async function GuestHelpPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const tBooking = await getTranslations("guestBooking");
  const t = await getTranslations("guestHelp");

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: booking } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  let helpInfo: CompanyHelpInfo = {
    contact_phone: null,
    contact_whatsapp: null,
    included_items: null,
    rules_and_tips: null,
    help_videos: null,
  };

  if (booking?.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("contact_phone, contact_whatsapp, included_items, rules_and_tips, help_videos, guest_content_i18n")
      .eq("id", booking.company_id)
      .maybeSingle();
    if (data) {
      const raw = data as any;
      const langKey = locale.toUpperCase();
      const i18n = raw.guest_content_i18n?.[langKey] ?? {};
      const isSk = langKey === "SK";
      helpInfo = {
        contact_phone:    raw.contact_phone    ?? null,
        contact_whatsapp: raw.contact_whatsapp ?? null,
        // i18n key for quick-fixes is help_quick_fixes; legacy flat column is included_items
        included_items: i18n.help_quick_fixes || (isSk ? raw.included_items : null),
        rules_and_tips: i18n.rules_and_tips   || (isSk ? raw.rules_and_tips : null),
        help_videos:    i18n.help_videos      || (isSk ? raw.help_videos    : null),
      };
    }
  }

  const quickFixSections = helpInfo.included_items
    ? parseAccordionSections(helpInfo.included_items)
    : [];

  const rulesLines = helpInfo.rules_and_tips
    ? helpInfo.rules_and_tips.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const videoSections = helpInfo.help_videos ? parseVideoSections(helpInfo.help_videos) : [];

  const hasContact = !!(helpInfo.contact_phone || helpInfo.contact_whatsapp);

  const chevron = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const sectionLabelStyle = {
    fontSize: "11px",
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color: "rgb(var(--text-secondary))",
    margin: "0 0 var(--space-4) 0",
  };

  const accordionItemStyle = {
    border: "1px solid rgb(var(--border-light))",
    borderRadius: "var(--radius)",
    overflow: "hidden",
  };

  const summaryStyle = {
    padding: "var(--space-4) var(--space-5)",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "500" as const,
    color: "rgb(var(--text))",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    userSelect: "none" as const,
    listStyle: "none" as const,
    background: "rgb(var(--app-bg))",
  };

  function contactCard() {
    return (
      <div
        className="surface gh-sp"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <p style={{ fontSize: "14px", color: "rgb(var(--text-secondary))", margin: 0 }}>
          {t("contactIntro")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
          {helpInfo.contact_phone && (
            <a
              href={`tel:${helpInfo.contact_phone}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-3) var(--space-4)",
                background: "rgb(var(--brand))",
                color: "#fff",
                borderRadius: "var(--radius-lg)",
                fontSize: "15px",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 5a2 2 0 012-2h1.5a.5.5 0 01.5.5v3a.5.5 0 01-.5.5H5a1 1 0 00-1 1v1a7 7 0 007 7h1a1 1 0 001-1v-1.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V17a2 2 0 01-2 2h-1C7.163 19 3 14.837 3 9V8a2 2 0 012-2z" />
              </svg>
              {helpInfo.contact_phone}
            </a>
          )}
          {helpInfo.contact_whatsapp && (
            <a
              href={`https://wa.me/${helpInfo.contact_whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-3) var(--space-4)",
                background: "#25D366",
                color: "#fff",
                borderRadius: "var(--radius-lg)",
                fontSize: "15px",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <style>{`
        .gh-sp { padding: var(--space-5); }
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

      {/* Top contact card */}
      {hasContact && contactCard()}

      {/* Quick fixes accordion */}
      {quickFixSections.length > 0 && (
        <div className="surface gh-sp">
          <p style={sectionLabelStyle}>{t("quickFixesTitle")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {quickFixSections.map((section, i) => (
              <details key={i} style={accordionItemStyle}>
                <summary style={summaryStyle}>
                  {section.title}
                  {chevron}
                </summary>
                <div style={{ padding: "var(--space-4) var(--space-5)", borderTop: "1px solid rgb(var(--border-light))" }}>
                  <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {section.steps.map((step, j) => (
                      <li key={j} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                        <span style={{
                          flexShrink: 0,
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: "rgb(var(--brand-light))",
                          color: "rgb(var(--brand))",
                          fontSize: "12px",
                          fontWeight: "600",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: "1px",
                        }}>
                          {j + 1}
                        </span>
                        <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text-secondary))", margin: 0, paddingTop: "3px" }}>
                          {step}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Driving & safety bullet rows */}
      {rulesLines.length > 0 && (
        <div className="surface gh-sp">
          <p style={sectionLabelStyle}>{t("drivingTitle")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {rulesLines.map((line, i) => (
              <div key={i} style={{
                display: "flex",
                gap: "var(--space-3)",
                alignItems: "flex-start",
                padding: "var(--space-3) var(--space-4)",
                background: "rgb(var(--app-bg))",
                borderRadius: "var(--radius)",
                border: "1px solid rgb(var(--border-light))",
              }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  aria-hidden="true"
                  style={{ flexShrink: 0, marginTop: "2px", color: "rgb(var(--brand))" }}
                >
                  <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5.5 9L7.5 11L12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text-secondary))", margin: 0 }}>
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How-to videos */}
      {videoSections.length > 0 && (
        videoSections.length === 1 && !videoSections[0].title ? (
          <div className="surface gh-sp">
            <p style={{ ...sectionLabelStyle, marginBottom: "var(--space-3)" }}>{t("howToVideosTitle")}</p>
            {videoSections[0].urls.map((url, j) => {
              const embedId = getYouTubeEmbedId(url);
              if (!embedId) return null;
              return (
                <div key={j} style={{ maxWidth: 854, width: "100%", marginTop: j > 0 ? "var(--space-3)" : 0 }}>
                  <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid rgb(var(--border))" }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${embedId}`}
                      title={`Video ${j + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="surface gh-sp">
            <p style={sectionLabelStyle}>{t("howToVideosTitle")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {videoSections.map((section, i) => {
                const embeds = (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                    {section.urls.map((url, j) => {
                      const embedId = getYouTubeEmbedId(url);
                      if (!embedId) return null;
                      return (
                        <div key={j} style={{ maxWidth: 854, width: "100%" }}>
                          <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid rgb(var(--border))" }}>
                            <iframe
                              src={`https://www.youtube.com/embed/${embedId}`}
                              title={section.title || `Video ${j + 1}`}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );

                if (!section.title) {
                  return <div key={i}>{embeds}</div>;
                }

                return (
                  <details key={i} style={accordionItemStyle}>
                    <summary style={summaryStyle}>
                      {section.title}
                      {chevron}
                    </summary>
                    <div style={{ padding: "var(--space-4) var(--space-5)", borderTop: "1px solid rgb(var(--border-light))" }}>
                      {embeds}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Bottom contact card */}
      {hasContact && contactCard()}
    </div>
  );
}
