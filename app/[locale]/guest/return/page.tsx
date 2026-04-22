import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface GuestBooking {
  id: string | null;
  return_at: string | null;
  vehicle_id: string | null;
  company_id: string | null;
}

interface VehicleRow {
  id: string;
  name: string | null;
}

interface CompanyReturnInfo {
  return_info: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  before_return_info: string | null;
}

interface ChecklistTemplate {
  id: string;
}

interface ChecklistItem {
  id: string;
  checked: boolean | null;
  notes: string | null;
  template: {
    label: string;
    sort_order: number;
    section: string | null;
  } | null;
}

type RawTemplateItem = {
  id: string;
  label: string | null;
  sort_order: number | null;
  section: string | null;
};

function renderLines(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {lines.map((line, i) => (
        <p key={i} style={{ fontSize: "15px", lineHeight: "1.7", color: "rgb(var(--text-secondary))", margin: 0 }}>
          {line}
        </p>
      ))}
    </div>
  );
}

export default async function GuestReturnPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const t = await getTranslations("guestReturn");
  const tBooking = await getTranslations("guestBooking");

  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  const { data: booking, error: bookingError } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  if (bookingError || !booking) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{tBooking("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>{tBooking("contactUs")}</p>
      </div>
    );
  }

  let vehicle: VehicleRow | null = null;
  if (booking.vehicle_id) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, name")
      .eq("id", booking.vehicle_id)
      .maybeSingle<VehicleRow>();
    vehicle = data || null;
  }

  let returnInfo: CompanyReturnInfo = { return_info: null, contact_phone: null, contact_whatsapp: null, before_return_info: null };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("return_info, contact_phone, contact_whatsapp, before_return_info")
      .eq("id", booking.company_id)
      .maybeSingle<CompanyReturnInfo>();
    if (data) returnInfo = data;
  }

  let checklistTemplate: ChecklistTemplate | null = null;
  let checklistItems: ChecklistItem[] = [];
  if (booking.company_id) {
    const { data: templateRaw } = await supabase
      .from("checklist_templates")
      .select("id")
      .eq("company_id", booking.company_id)
      .eq("type", "return")
      .eq("active", true)
      .maybeSingle();

    const template = templateRaw as ChecklistTemplate | null;

    if (template) {
      checklistTemplate = template;
      const { data: itemsRaw } = await supabase
        .from("checklist_template_items")
        .select("id, label, sort_order, section")
        .eq("template_id", template.id)
        .order("sort_order", { ascending: true });

      const items = (itemsRaw ?? []) as RawTemplateItem[];
      checklistItems = items.map((item) => ({
        id: item.id,
        checked: null,
        notes: null,
        template: {
          label: item.label ?? t("untitledItem"),
          sort_order: item.sort_order ?? 0,
          section: item.section ?? null,
        },
      }));
    }
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return tBooking("notSpecified");
    return new Date(dateString).toLocaleString(dateLocale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const labelStyle = {
    fontSize: "11px",
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "rgb(var(--text-secondary))",
    marginBottom: "var(--space-2)",
  };

  const valueStyle = {
    fontWeight: "500" as const,
    color: "rgb(var(--text))",
    margin: 0,
    fontSize: "15px",
  };

  const linkStyle = {
    fontWeight: "500" as const,
    color: "rgb(var(--brand))",
    margin: 0,
    fontSize: "15px",
    textDecoration: "none" as const,
  };

  const toTelHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;
  const toWaHref = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

  const hasDetailSection = returnInfo.return_info || returnInfo.contact_phone || returnInfo.contact_whatsapp;

  const sectionLabel = (color: string) => ({
    fontSize: "11px",
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color,
    margin: "0 0 var(--space-6) 0",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <style>{`
        .greturn-sp { padding: var(--space-5); }
        .greturn-details summary { padding: var(--space-4) var(--space-5); }
        .greturn-details-body { padding: var(--space-5); }
        @media (min-width: 768px) {
          .greturn-sp { padding: var(--space-6); }
          .greturn-details summary { padding: var(--space-5) var(--space-6); }
          .greturn-details-body { padding: var(--space-5) var(--space-6); }
        }
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
        className="surface greturn-sp"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <h1>{t("title")}</h1>
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
          {tBooking("guestAccess")}
        </span>
      </div>

      {/* Summary card */}
      <div className="surface greturn-sp">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--space-6)",
          }}
        >
          <div>
            <p style={labelStyle}>{t("returnDateTime")}</p>
            <p style={valueStyle}>{formatDateTime(booking.return_at)}</p>
          </div>

          {vehicle?.name && (
            <div>
              <p style={labelStyle}>{t("vehicle")}</p>
              <p style={valueStyle}>{vehicle.name}</p>
            </div>
          )}

          {returnInfo.contact_phone && (
            <div>
              <p style={labelStyle}>{t("contactPhone")}</p>
              <a href={toTelHref(returnInfo.contact_phone)} style={linkStyle}>
                {returnInfo.contact_phone}
              </a>
            </div>
          )}

          {returnInfo.contact_whatsapp && (
            <div>
              <p style={labelStyle}>{t("contactWhatsapp")}</p>
              <a href={toWaHref(returnInfo.contact_whatsapp)} style={linkStyle} target="_blank" rel="noopener noreferrer">
                {returnInfo.contact_whatsapp}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Before you return */}
      <div
        className="surface greturn-sp"
        style={{
          background: "rgb(var(--brand-light))",
          border: "1px solid rgb(var(--brand))",
        }}
      >
        <p style={sectionLabel("rgb(var(--brand))")}>
          {t("beforeYouReturnTitle")}
        </p>
        <div style={{ maxWidth: "640px" }}>
          {returnInfo.before_return_info ? (
            renderLines(returnInfo.before_return_info)
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {([0, 1, 2, 3, 4, 5] as const).map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                  <div
                    style={{
                      flexShrink: 0,
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: "rgb(var(--brand))",
                      color: "white",
                      fontSize: "10px",
                      fontWeight: "700",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: "2px",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text))" }}>
                    {t(`beforeYouReturn${i}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Return checklist */}
      <div className="surface greturn-sp">
        <h2 style={{ marginBottom: "var(--space-5)" }}>{t("checklistTitle")}</h2>

        {!checklistTemplate ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              padding: "var(--space-8) var(--space-4)",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "var(--radius-lg)",
                background: "rgb(var(--app-bg))",
                border: "1px solid rgb(var(--border-light))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ color: "rgb(var(--muted))" }}
              >
                <rect x="9" y="2" width="6" height="4" rx="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="M9 12h6M9 16h4" />
              </svg>
            </div>
            <p style={{ fontSize: "14px", color: "rgb(var(--muted))", margin: 0 }}>
              {t("noChecklist")}
            </p>
          </div>
        ) : checklistItems.length === 0 ? (
          <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("noItems")}</p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                alignItems: "flex-start",
                padding: "var(--space-3) var(--space-4)",
                background: "rgb(var(--app-bg))",
                border: "1px solid rgb(var(--border-light))",
                borderRadius: "var(--radius)",
                marginBottom: "var(--space-5)",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                style={{ flexShrink: 0, marginTop: "2px", color: "rgb(var(--brand))" }}
              >
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <p style={{ fontSize: "13px", lineHeight: "1.5", color: "rgb(var(--text-secondary))", margin: "0 0 var(--space-1) 0" }}>
                  {t("checklistGuideNote")}
                </p>
                <p style={{ fontSize: "12px", lineHeight: "1.5", color: "rgb(var(--muted))", margin: 0 }}>
                  {t("checklistPolicyNote")}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {checklistItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "var(--space-4)",
                    background: "rgb(var(--app-bg))",
                    border: "1px solid rgb(var(--border-light))",
                    borderRadius: "var(--radius)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: "2px" }}>
                    {item.checked ? (
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          background: "rgb(var(--brand))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    ) : (
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          border: "2px solid rgb(var(--border))",
                          background: "rgb(var(--surface))",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: item.checked ? "rgb(var(--muted))" : "rgb(var(--text))",
                        textDecoration: item.checked ? "line-through" : "none",
                      }}
                    >
                      {item.template?.label ?? t("untitledItem")}
                    </p>
                    {item.notes && (
                      <p style={{ fontSize: "13px", color: "rgb(var(--muted))", marginTop: "var(--space-1)" }}>
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detailed return instructions — collapsed by default */}
      {hasDetailSection && (
        <details
          className="surface greturn-details"
          style={{ padding: 0, overflow: "hidden" }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: "rgb(var(--text))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              userSelect: "none",
              listStyle: "none",
            }}
          >
            {t("detailedReturnInstructions")}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>

          <div className="greturn-details-body" style={{ borderTop: "1px solid rgb(var(--border-light))" }}>
            {returnInfo.return_info && (
              <div style={{ marginBottom: (returnInfo.contact_phone || returnInfo.contact_whatsapp) ? "var(--space-6)" : undefined, maxWidth: "640px" }}>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "rgb(var(--text-secondary))",
                    margin: "0 0 var(--space-5) 0",
                  }}
                >
                  {t("returnInfo")}
                </p>
                {renderLines(returnInfo.return_info)}
              </div>
            )}

            {(returnInfo.contact_phone || returnInfo.contact_whatsapp) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "var(--space-4)",
                  paddingTop: returnInfo.return_info ? "var(--space-5)" : undefined,
                  borderTop: returnInfo.return_info ? "1px solid rgb(var(--border-light))" : undefined,
                }}
              >
                {returnInfo.contact_phone && (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "rgb(var(--text-secondary))",
                        marginBottom: "var(--space-2)",
                      }}
                    >
                      {t("contactPhone")}
                    </p>
                    <a
                      href={toTelHref(returnInfo.contact_phone)}
                      style={{ fontSize: "15px", fontWeight: "500", color: "rgb(var(--brand))", textDecoration: "none" }}
                    >
                      {returnInfo.contact_phone}
                    </a>
                  </div>
                )}
                {returnInfo.contact_whatsapp && (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "rgb(var(--text-secondary))",
                        marginBottom: "var(--space-2)",
                      }}
                    >
                      {t("contactWhatsapp")}
                    </p>
                    <a
                      href={toWaHref(returnInfo.contact_whatsapp)}
                      style={{ fontSize: "15px", fontWeight: "500", color: "rgb(var(--brand))", textDecoration: "none" }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {returnInfo.contact_whatsapp}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
