import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string; id: string; templateId: string }>;
}

interface GuestBooking {
  company_id: string | null;
}

export default async function GuestChecklistPage({ params }: PageProps) {
  const { locale, id: codeRaw, templateId } = await params;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const t = await getTranslations({ locale, namespace: "guestBooking" });
  const tc = await getTranslations({ locale, namespace: "guestChecklist" });

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{t("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{t("contactUs")}</p>
      </div>
    );
  }

  const { data: booking, error: bookingError } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  if (bookingError || !booking) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{t("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{t("contactUs")}</p>
      </div>
    );
  }

  if (!booking.company_id) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{t("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{t("contactUs")}</p>
      </div>
    );
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, type")
    .eq("id", templateId)
    .eq("company_id", booking.company_id)
    .maybeSingle();

  if (!template) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <div>
          <Link
            href={`/${locale}/guest/bookings/${encodeURIComponent(code)}`}
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
        <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px" }}>
          <p style={{ color: "rgb(var(--muted))" }}>{t("notFoundTitle")}</p>
        </div>
      </div>
    );
  }

  const { data: itemsData } = await supabase
    .from("checklist_template_items")
    .select("id, label, section, sort_order, required")
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true });

  const items = itemsData || [];

  // Group items by section
  const sections: { name: string | null; items: typeof items }[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (!last || last.name !== item.section) {
      sections.push({ name: item.section, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <style>{`
        .gcl-sp { padding: var(--space-4); }
        .gcl-notice { padding: var(--space-4); border-left: 3px solid rgb(var(--brand)); }
        @media (min-width: 768px) {
          .gcl-sp { padding: var(--space-6); }
          .gcl-notice { padding: var(--space-5) var(--space-6); }
        }
      `}</style>
      {/* Back link */}
      <div>
        <Link
          href={`/${locale}/guest/bookings/${encodeURIComponent(code)}`}
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

      {/* Title bar */}
      <div
        className="surface gcl-sp"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <h1>{template.name}</h1>
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

      {/* Guide notice */}
      <div className="surface gcl-notice">
        <p style={{ fontSize: "14px", color: "rgb(var(--text-secondary))", margin: 0 }}>
          {tc("guideNotice")}
        </p>
      </div>

      {/* Items */}
      <div className="surface gcl-sp">
        {items.length === 0 ? (
          <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
            {tc("noItemsAvailable")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {sections.map((section, si) => (
              <div key={si}>
                {section.name && (
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: "rgb(var(--text-secondary))",
                      marginBottom: "var(--space-3)",
                    }}
                  >
                    {section.name}
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "var(--space-3)",
                        padding: "var(--space-3) var(--space-4)",
                        background: "rgb(var(--app-bg))",
                        border: "1px solid rgb(var(--border-light))",
                        borderRadius: "var(--radius)",
                      }}
                    >
                      <div
                        style={{
                          flexShrink: 0,
                          marginTop: "2px",
                          width: "18px",
                          height: "18px",
                          border: "2px solid rgb(var(--border))",
                          borderRadius: "4px",
                          background: "rgb(var(--surface))",
                        }}
                      />
                      <p
                        style={{
                          fontSize: "14px",
                          fontWeight: item.required ? "500" : "400",
                          color: "rgb(var(--text))",
                          margin: 0,
                          lineHeight: "1.5",
                        }}
                      >
                        {item.label}
                        {item.required && (
                          <span
                            style={{
                              marginLeft: "var(--space-2)",
                              fontSize: "11px",
                              fontWeight: "600",
                              color: "rgb(var(--brand))",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {tc("required")}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
