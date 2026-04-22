import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}

interface GuestBooking {
  pickup_at: string | null;
  vehicle_id: string | null;
  company_id: string | null;
}

interface VehicleRow {
  id: string;
  name: string | null;
}

interface CompanyGuestInfo {
  pickup_info: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  before_arrival_info: string | null;
}

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

function renderPickupLines(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const [first, ...rest] = lines;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          background: "rgb(var(--app-bg))",
          border: "1px solid rgb(var(--border-light))",
          borderLeft: "3px solid rgb(var(--brand))",
          borderRadius: "var(--radius)",
        }}
      >
        <p style={{ fontSize: "15px", fontWeight: "500", color: "rgb(var(--text))", margin: 0, lineHeight: "1.5" }}>
          {first}
        </p>
      </div>
      {rest.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {rest.map((line, i) => (
            <p key={i} style={{ fontSize: "15px", lineHeight: "1.7", color: "rgb(var(--text-secondary))", margin: 0 }}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function GuestPickupPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const t = await getTranslations("guestPickup");
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

  let guestInfo: CompanyGuestInfo = { pickup_info: null, contact_phone: null, contact_whatsapp: null, before_arrival_info: null };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("pickup_info, contact_phone, contact_whatsapp, before_arrival_info")
      .eq("id", booking.company_id)
      .maybeSingle<CompanyGuestInfo>();
    if (data) guestInfo = data;
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
        .gpickup-sp { padding: var(--space-5); }
        @media (min-width: 768px) { .gpickup-sp { padding: var(--space-6); } }
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
        className="surface gpickup-sp"
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
      <div className="surface gpickup-sp">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--space-6)",
          }}
        >
          <div>
            <p style={labelStyle}>{t("pickupDateTime")}</p>
            <p style={valueStyle}>{formatDateTime(booking.pickup_at)}</p>
          </div>

          {vehicle?.name && (
            <div>
              <p style={labelStyle}>{t("vehicle")}</p>
              <p style={valueStyle}>{vehicle.name}</p>
            </div>
          )}

          {guestInfo.contact_phone && (
            <div>
              <p style={labelStyle}>{t("contactPhone")}</p>
              <a href={toTelHref(guestInfo.contact_phone)} style={linkStyle}>
                {guestInfo.contact_phone}
              </a>
            </div>
          )}

          {guestInfo.contact_whatsapp && (
            <div>
              <p style={labelStyle}>{t("contactWhatsapp")}</p>
              <a href={toWaHref(guestInfo.contact_whatsapp)} style={linkStyle} target="_blank" rel="noopener noreferrer">
                {guestInfo.contact_whatsapp}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Before you arrive */}
      <div
        className="surface gpickup-sp"
        style={{
          background: "rgb(var(--brand-light))",
          border: "1px solid rgb(var(--brand))",
        }}
      >
        <p style={sectionLabel("rgb(var(--brand))")}>
          {t("beforeYouArriveTitle")}
        </p>
        <div style={{ maxWidth: "640px" }}>
          {guestInfo.before_arrival_info ? (
            renderLines(guestInfo.before_arrival_info)
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {([0, 1, 2] as const).map((i) => (
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
                    {t(`beforeYouArrive${i}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pickup instructions */}
      <div className="surface gpickup-sp">
        <p style={sectionLabel("rgb(var(--text-secondary))")}>
          {t("pickupInfo")}
        </p>
        <div style={{ maxWidth: "640px" }}>
          {guestInfo.pickup_info ? (
            renderPickupLines(guestInfo.pickup_info)
          ) : (
            <p style={{ fontSize: "14px", lineHeight: "1.65", color: "rgb(var(--muted))", margin: 0 }}>
              {t("placeholder")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
