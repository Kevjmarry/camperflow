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

  let guestInfo: CompanyGuestInfo = { pickup_info: null, contact_phone: null, contact_whatsapp: null };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("pickup_info, contact_phone, contact_whatsapp")
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
    fontSize: "12px",
    fontWeight: "500" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "rgb(var(--text-secondary))",
    marginBottom: "var(--space-2)",
  };

  const hasContactInfo = guestInfo.contact_phone || guestInfo.contact_whatsapp;

  const BEFORE_YOU_ARRIVE = [
    "Let us know your estimated arrival time",
    "Please allow enough time; handover takes approximately 1 hour",
    "If your deposit was not sent by bank transfer, it must be paid in cash",
  ];

  return (
    <div>
      <div style={{ marginBottom: "var(--space-4)" }}>
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

      <div
        className="surface"
        style={{
          padding: "var(--space-6)",
          marginBottom: "var(--space-6)",
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

      {/* Reminder card */}
      <div
        className="surface"
        style={{
          padding: "var(--space-6)",
          marginBottom: "var(--space-6)",
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
          Before you arrive
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
          {BEFORE_YOU_ARRIVE.map((item, i) => (
            <li key={i} style={{ fontSize: "13px", lineHeight: "1.5", color: "rgb(var(--text))" }}>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "var(--space-6)",
            marginBottom: "var(--space-8)",
          }}
        >
          <div>
            <p style={labelStyle}>{t("pickupDateTime")}</p>
            <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{formatDateTime(booking.pickup_at)}</p>
          </div>

          {vehicle?.name && (
            <div>
              <p style={labelStyle}>{t("vehicle")}</p>
              <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{vehicle.name}</p>
            </div>
          )}
        </div>

        {guestInfo.pickup_info ? (
          <div
            style={{
              padding: "var(--space-4)",
              background: "rgb(var(--app-bg))",
              border: "1px solid rgb(var(--border-light))",
              borderRadius: "var(--radius)",
              marginBottom: hasContactInfo ? "var(--space-6)" : undefined,
            }}
          >
            <p style={labelStyle}>{t("pickupInfo")}</p>
            <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text))", whiteSpace: "pre-wrap" }}>
              {guestInfo.pickup_info}
            </p>
          </div>
        ) : (
          <div
            style={{
              padding: "var(--space-4)",
              background: "rgb(var(--app-bg))",
              border: "1px solid rgb(var(--border-light))",
              borderRadius: "var(--radius)",
              marginBottom: hasContactInfo ? "var(--space-6)" : undefined,
            }}
          >
            <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--muted))" }}>
              {t("placeholder")}
            </p>
          </div>
        )}

        {hasContactInfo && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {guestInfo.contact_phone && (
              <div>
                <p style={labelStyle}>{t("contactPhone")}</p>
                <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{guestInfo.contact_phone}</p>
              </div>
            )}
            {guestInfo.contact_whatsapp && (
              <div>
                <p style={labelStyle}>{t("contactWhatsapp")}</p>
                <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{guestInfo.contact_whatsapp}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
