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

const BEFORE_YOU_RETURN = [
  "Complete the return checklist",
  "Let us know your estimated arrival time",
  "Allow extra travel time; motorhomes and caravans travel slower than a car",
  "Empty the toilet cassette and wastewater tank",
  "If applicable, refuel near our base before return",
  "Allow enough time to wash and clean the vehicle before handover",
];

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

  let returnInfo: CompanyReturnInfo = { return_info: null, contact_phone: null, contact_whatsapp: null };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("return_info, contact_phone, contact_whatsapp")
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
          label: item.label ?? "Untitled item",
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
    fontSize: "12px",
    fontWeight: "500" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "rgb(var(--text-secondary))",
    marginBottom: "var(--space-2)",
  };

  const hasContactInfo = returnInfo.contact_phone || returnInfo.contact_whatsapp;
  const hasDetailSection = returnInfo.return_info || hasContactInfo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
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
        className="surface"
        style={{
          padding: "var(--space-6)",
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

      {/* Booking info */}
      <div className="surface" style={{ padding: "var(--space-6)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "var(--space-6)",
          }}
        >
          <div>
            <p style={labelStyle}>{t("returnDateTime")}</p>
            <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{formatDateTime(booking.return_at)}</p>
          </div>
          {vehicle?.name && (
            <div>
              <p style={labelStyle}>{t("vehicle")}</p>
              <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{vehicle.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reminder card — full width */}
      <div
        className="surface"
        style={{
          padding: "var(--space-6)",
          background: "rgb(var(--brand-light))",
          border: "1px solid rgb(var(--brand))",
        }}
      >
        <p
          style={{
            fontSize: "12px",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "rgb(var(--brand))",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          Before you return
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: "var(--space-5)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {BEFORE_YOU_RETURN.map((item, i) => (
            <li key={i} style={{ fontSize: "13px", lineHeight: "1.5", color: "rgb(var(--text))" }}>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Return checklist — full width */}
      <div className="surface" style={{ padding: "var(--space-6)" }}>
        <h2 style={{ marginBottom: "var(--space-1)" }}>{t("checklistTitle")}</h2>
        <p
          style={{
            fontSize: "13px",
            color: "rgb(var(--muted))",
            marginTop: "var(--space-1)",
            marginBottom: "var(--space-5)",
          }}
        >
          If items are not completed, additional charges may apply according to company policy.
        </p>
        <p
          style={{
            fontSize: "13px",
            color: "rgb(var(--muted))",
            marginTop: "var(--space-2)",
            marginBottom: "var(--space-5)",
          }}
        >
          You'll be able to complete this checklist here before return. For now, please use it as a guide.
        </p>

        {!checklistTemplate ? (
          <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("noChecklist")}</p>
        ) : checklistItems.length === 0 ? (
          <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("noItems")}</p>
        ) : (
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
                    {item.template?.label ?? "Untitled item"}
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
        )}
      </div>

      {/* Detailed return instructions — collapsed by default */}
      {hasDetailSection && (
        <details
          className="surface"
          style={{ padding: 0, overflow: "hidden" }}
        >
          <summary
            style={{
              padding: "var(--space-5) var(--space-6)",
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
            Detailed return instructions
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>

          <div
            style={{
              padding: "var(--space-5) var(--space-6)",
              borderTop: "1px solid rgb(var(--border-light))",
            }}
          >
            {returnInfo.return_info && (
              <div style={{ marginBottom: hasContactInfo ? "var(--space-5)" : undefined }}>
                <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>{t("returnInfo")}</p>
                <p
                  style={{
                    fontSize: "13px",
                    lineHeight: "1.6",
                    color: "rgb(var(--text-secondary))",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {returnInfo.return_info}
                </p>
              </div>
            )}

            {hasContactInfo && (
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
                    <p style={labelStyle}>{t("contactPhone")}</p>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "rgb(var(--text))" }}>{returnInfo.contact_phone}</p>
                  </div>
                )}
                {returnInfo.contact_whatsapp && (
                  <div>
                    <p style={labelStyle}>{t("contactWhatsapp")}</p>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "rgb(var(--text))" }}>{returnInfo.contact_whatsapp}</p>
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
