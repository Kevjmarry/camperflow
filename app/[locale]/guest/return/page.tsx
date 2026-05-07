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

interface NearbyPlace {
  title: string;
  url: string;
}

interface CompanyReturnInfo {
  return_info: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  before_return_info: string | null;
  return_nearby_places: NearbyPlace[] | null;
}

const inlineHeaderStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "rgb(var(--text-secondary))",
  margin: 0,
};

const PinIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, color }}>
    <path
      d="M8 1.5C5.52 1.5 3.5 3.52 3.5 6c0 3.25 4.5 8.5 4.5 8.5s4.5-5.25 4.5-8.5c0-2.48-2.02-4.5-4.5-4.5Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
    />
    <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export default async function GuestReturnPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { code: codeRaw } = await searchParams;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const t = await getTranslations("guestReturn");
  const tBooking = await getTranslations("guestBooking");

  const dateLocale = locale === "de" ? "de-DE" : "en-GB";

  if (!code) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)" }}>
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
      <div className="surface" style={{ padding: "var(--space-8)" }}>
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

  let returnInfo: CompanyReturnInfo = {
    return_info: null,
    contact_phone: null,
    contact_whatsapp: null,
    before_return_info: null,
    return_nearby_places: null,
  };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("return_info, contact_phone, contact_whatsapp, before_return_info, return_nearby_places, guest_content_i18n")
      .eq("id", booking.company_id)
      .maybeSingle();
    if (data) {
      const raw = data as any;
      const langKey = locale.toUpperCase();
      const i18n = raw.guest_content_i18n?.[langKey] ?? {};
      const isSk = langKey === "SK";
      returnInfo = {
        contact_phone:        raw.contact_phone,
        contact_whatsapp:     raw.contact_whatsapp,
        return_nearby_places: raw.return_nearby_places ?? null,
        return_info:          i18n.return_info       || (isSk ? raw.return_info       : null),
        before_return_info:   i18n.before_return_info || (isSk ? raw.before_return_info : null),
      };
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
    fontSize: "14px",
    fontWeight: "600" as const,
    color: "rgb(var(--text-secondary))",
    marginBottom: "var(--space-2)",
  };

  const valueStyle = {
    fontWeight: "500" as const,
    color: "rgb(var(--text))",
    margin: 0,
    fontSize: "15px",
  };

  const sectionLabel = (color: string) => ({
    fontSize: "11px",
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color,
    margin: "0 0 var(--space-4) 0",
  });

  const toTelHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;
  const toWaHref = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

  const beforeReturnItems = returnInfo.before_return_info
    ? returnInfo.before_return_info.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const moreDetailLines = returnInfo.return_info
    ? returnInfo.return_info.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const nearbyPlaces: NearbyPlace[] = returnInfo.return_nearby_places ?? [];

  const ChecklistRow = ({ item, index, items }: { item: string; index: number; items: string[] }) => {
    const prevIsHeader = items[index - 1]?.endsWith(":");
    const nextIsHeader = items[index + 1]?.endsWith(":");
    const isLast = index === items.length - 1;
    return (
      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          alignItems: "flex-start",
          paddingTop: index > 0 && !prevIsHeader ? "var(--space-4)" : 0,
          paddingBottom: !isLast && !nextIsHeader ? "var(--space-4)" : 0,
          borderBottom: !isLast && !nextIsHeader ? "1px solid rgb(var(--border-light))" : "none",
        }}
      >
        <svg
          width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"
          style={{ flexShrink: 0, marginTop: "2px", color: "rgb(var(--brand))" }}
        >
          <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.5 9L7.5 11L12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text))", margin: 0 }}>{item}</p>
      </div>
    );
  };

  const navRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3) var(--space-4)",
    border: "1px solid rgb(var(--border-light))",
    borderRadius: "var(--radius)",
    fontSize: "14px",
    fontWeight: "500",
    color: "rgb(var(--text))",
    textDecoration: "none",
    background: "rgb(var(--app-bg))",
    transition: "background 0.15s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <style>{`
        .greturn-sp { padding: var(--space-5); }
        @media (min-width: 768px) { .greturn-sp { padding: var(--space-6); } }
        .greturn-details summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; }
        .greturn-details summary::-webkit-details-marker { display: none; }
        .greturn-details[open] .greturn-chevron { transform: rotate(180deg); }
        .greturn-phone-btn:hover { background: rgb(var(--app-bg)) !important; }
        .greturn-wa-btn:hover { opacity: 0.88; }
        .greturn-nearby-btn:hover { background: rgb(var(--border-light)) !important; }
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

      <div className="surface page-surface" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-6)" }}>
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
        </div>

        {(returnInfo.contact_phone || returnInfo.contact_whatsapp) && (
          <div
            style={{
              marginTop: "var(--space-5)",
              paddingTop: "var(--space-5)",
              borderTop: "1px solid rgb(var(--border-light))",
              display: "flex",
              gap: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            {returnInfo.contact_phone && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))" }}>
                  {t("contactPhone")}
                </span>
                <a
                  href={toTelHref(returnInfo.contact_phone)}
                  className="greturn-phone-btn"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-3) var(--space-4)",
                    border: "1.5px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "rgb(var(--text))",
                    textDecoration: "none",
                    background: "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path
                      d="M14 10.5v2a1.01 1.01 0 0 1-1.1 1A13.93 13.93 0 0 1 2 3.1 1.01 1.01 0 0 1 3 2h2a1 1 0 0 1 1 .86 8.56 8.56 0 0 0 .47 1.89 1 1 0 0 1-.23 1.06L5.22 6.83a11.11 11.11 0 0 0 3.95 3.95l1.02-1.02a1 1 0 0 1 1.06-.23c.61.25 1.25.4 1.89.47A1 1 0 0 1 14 11Z"
                      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
                    />
                  </svg>
                  {returnInfo.contact_phone}
                </a>
              </div>
            )}
            {returnInfo.contact_whatsapp && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))" }}>
                  {t("contactWhatsapp")}
                </span>
                <a
                  href={toWaHref(returnInfo.contact_whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="greturn-wa-btn"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-3) var(--space-4)",
                    background: "#25D366",
                    borderRadius: "var(--radius)",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "white",
                    textDecoration: "none",
                    transition: "opacity 0.15s",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 1.41.37 2.73 1.01 3.87L0 16l4.25-.98A7.98 7.98 0 0 0 8 16c4.42 0 8-3.58 8-8s-3.58-8-8-8zm3.86 11.07c-.17.47-.98.9-1.35.95-.34.05-.77.07-1.25-.08a9.6 9.6 0 0 1-1.13-.43c-2-.99-3.3-3.04-3.4-3.18-.1-.14-.8-1.07-.8-2.03 0-.96.5-1.43.68-1.63.18-.2.39-.25.52-.25h.37c.12 0 .28-.04.44.34l.62 1.5c.06.14.1.3.02.48-.08.18-.12.3-.24.45l-.36.42c-.12.13-.25.27-.11.53.14.26.63 1.04 1.36 1.68.93.83 1.72 1.09 1.97 1.2.24.12.38.1.52-.06l.7-.83c.14-.19.28-.15.47-.09l1.47.69c.19.09.31.14.36.22.05.09.05.5-.12.97z" />
                  </svg>
                  {returnInfo.contact_whatsapp}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Before you return */}
      {beforeReturnItems.length > 0 && (
        <div className="surface greturn-sp">
          <p style={sectionLabel("rgb(var(--warning, var(--text-secondary)))")}>
            {t("beforeYouReturnTitle")}
          </p>
          <div>
            {beforeReturnItems.map((item, i) =>
              item.endsWith(":") ? (
                <p key={i} style={{ ...inlineHeaderStyle, marginTop: i > 0 ? "var(--space-4)" : 0, marginBottom: "var(--space-1)" }}>
                  {item}
                </p>
              ) : (
                <ChecklistRow key={i} item={item} index={i} items={beforeReturnItems} />
              )
            )}
          </div>
        </div>
      )}

      {/* Nearby places */}
      {nearbyPlaces.length > 0 && (
        <div className="surface greturn-sp">
          <p style={sectionLabel("rgb(var(--text-secondary))")}>
            {t("nearbyPlaces")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {nearbyPlaces.map((place, i) => (
              <a
                key={i}
                href={place.url}
                target="_blank"
                rel="noopener noreferrer"
                className="greturn-nearby-btn"
                style={navRowStyle}
              >
                <PinIcon color="rgb(var(--text-secondary))" />
                <span style={{ flex: 1 }}>{place.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* More details */}
      {moreDetailLines.length > 0 && (
        <details className="surface greturn-sp greturn-details">
          <summary>
            <span style={{ fontSize: "15px", fontWeight: "600", color: "rgb(var(--text))" }}>
              {t("moreDetails")}
            </span>
            <svg
              className="greturn-chevron"
              width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              style={{ flexShrink: 0, color: "rgb(var(--text-secondary))", transition: "transform 0.2s" }}
            >
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {moreDetailLines.map((line, i) =>
              line.endsWith(":") ? (
                <p key={i} style={{ ...inlineHeaderStyle, marginTop: i > 0 ? "var(--space-2)" : 0 }}>
                  {line}
                </p>
              ) : (
                <p key={i} style={{ fontSize: "14px", lineHeight: "1.7", color: "rgb(var(--text-secondary))", margin: 0 }}>
                  {line}
                </p>
              )
            )}
          </div>
        </details>
      )}

      </div>
    </div>
  );
}
