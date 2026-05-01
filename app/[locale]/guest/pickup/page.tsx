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
  important_before_pickup: string | null;
}

function parsePickupInfo(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Matches maps.app.goo.gl and other common map URL patterns
  const mapUrlRe =
    /https?:\/\/(maps\.app\.goo\.gl|maps\.google\.[a-z]+|goo\.gl\/maps|maps\.apple\.com|openstreetmap\.org|google\.com\/maps)/i;

  // Find the first line containing a recognised maps URL
  let mapLineIdx = -1;
  let navUrl: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const urlMatch = lines[i].match(/https?:\/\/[^\s]+/);
    if (urlMatch && mapUrlRe.test(urlMatch[0])) {
      mapLineIdx = i;
      navUrl = urlMatch[0];
      break;
    }
  }

  let locationDisplayLines: string[] = [];
  let otherLines: string[] = [];

  if (mapLineIdx >= 0) {
    // One line before and one line after the map URL become the visible location text
    const locStart = Math.max(0, mapLineIdx - 1);
    const locEnd = Math.min(lines.length - 1, mapLineIdx + 1);
    const locSet = new Set<number>();
    for (let i = locStart; i <= locEnd; i++) locSet.add(i);

    for (let i = 0; i < lines.length; i++) {
      if (locSet.has(i)) {
        // The URL line itself becomes the Navigate button — skip displaying it raw
        if (i !== mapLineIdx) locationDisplayLines.push(lines[i]);
      } else {
        otherLines.push(lines[i]);
      }
    }
  } else {
    // Fallback: address label / street-word heuristics
    const addressLabelRe =
      /^(address|adresse|ort|location|standort|treffpunkt|anschrift)\s*[:：]/i;
    const addressWordRe =
      /(str\.|straße|strasse|\bstreet\b|\bavenue\b|\bave\b|\broad\b|\brd\b|\bweg\b|\bgasse\b|\bplatz\b|\ballee\b)/i;

    for (const line of lines) {
      if (addressLabelRe.test(line) || addressWordRe.test(line)) {
        locationDisplayLines.push(line);
      } else {
        otherLines.push(line);
      }
    }

    if (locationDisplayLines.length > 0 && !navUrl) {
      const addressText = locationDisplayLines[0].replace(
        /^(address|adresse|ort|location|standort|treffpunkt|anschrift)\s*[:：]\s*/i,
        ""
      );
      navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
    }
  }

  const hasLocation = locationDisplayLines.length > 0 || navUrl !== null;
  return { locationDisplayLines, otherLines, navUrl, hasLocation, raw: lines };
}


const inlineHeaderStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "rgb(var(--text-secondary))",
  margin: 0,
};

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

  let guestInfo: CompanyGuestInfo = {
    pickup_info: null,
    contact_phone: null,
    contact_whatsapp: null,
    before_arrival_info: null,
    important_before_pickup: null,
  };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("pickup_info, contact_phone, contact_whatsapp, before_arrival_info, important_before_pickup, guest_content_i18n")
      .eq("id", booking.company_id)
      .maybeSingle();
    if (data) {
      const raw = data as any;
      const langKey = locale.toUpperCase();
      const i18n = raw.guest_content_i18n?.[langKey] ?? {};
      const isSk = langKey === "SK";
      guestInfo = {
        contact_phone:            raw.contact_phone,
        contact_whatsapp:         raw.contact_whatsapp,
        pickup_info:              i18n.pickup_info              || (isSk ? raw.pickup_info              : null),
        before_arrival_info:      i18n.before_arrival_info      || (isSk ? raw.before_arrival_info      : null),
        important_before_pickup:  i18n.important_before_pickup  || (isSk ? raw.important_before_pickup  : null),
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
  const toWaHref = (phone: string) =>
    `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

  const importantItems = guestInfo.important_before_pickup
    ? guestInfo.important_before_pickup.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const beforeArriveItems = guestInfo.before_arrival_info
    ? guestInfo.before_arrival_info.split("\n").map((l) => l.trim()).filter(Boolean)
    : [t("beforeYouArrive0"), t("beforeYouArrive1"), t("beforeYouArrive2")];

  const parsed = guestInfo.pickup_info
    ? parsePickupInfo(guestInfo.pickup_info)
    : null;

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
          borderBottom:
            !isLast && !nextIsHeader
              ? "1px solid rgb(var(--border-light))"
              : "none",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, marginTop: "2px", color: "rgb(var(--brand))" }}
        >
          <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5.5 9L7.5 11L12.5 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--text))", margin: 0 }}>
          {item}
        </p>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <style>{`
        .gpickup-sp { padding: var(--space-5); }
        @media (min-width: 768px) { .gpickup-sp { padding: var(--space-6); } }
        .gpickup-details summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; }
        .gpickup-details summary::-webkit-details-marker { display: none; }
        .gpickup-details[open] .gpickup-chevron { transform: rotate(180deg); }
        .gpickup-phone-btn:hover { background: rgb(var(--app-bg)) !important; }
        .gpickup-wa-btn:hover { opacity: 0.88; }
        .gpickup-nav-btn:hover { opacity: 0.88; }
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
        </div>

        {(guestInfo.contact_phone || guestInfo.contact_whatsapp) && (
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
            {guestInfo.contact_phone && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))" }}>
                  Phone
                </span>
                <a
                  href={toTelHref(guestInfo.contact_phone)}
                  className="gpickup-phone-btn"
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
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {guestInfo.contact_phone}
                </a>
              </div>
            )}
            {guestInfo.contact_whatsapp && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))" }}>
                  WhatsApp
                </span>
                <a
                  href={toWaHref(guestInfo.contact_whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gpickup-wa-btn"
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
                  {guestInfo.contact_whatsapp}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Important before pickup — lines matching key topics */}
      {importantItems.length > 0 && (
        <div className="surface gpickup-sp">
          <p style={sectionLabel("rgb(var(--warning, var(--text-secondary)))")}>
            {t("importantBeforePickup")}
          </p>
          <div>
            {importantItems.map((item, i) => (
              <ChecklistRow key={i} item={item} index={i} items={importantItems} />
            ))}
          </div>
        </div>
      )}

      {/* Before you arrive — remaining lines */}
      {beforeArriveItems.length > 0 && (
        <div className="surface gpickup-sp">
          <p style={sectionLabel("rgb(var(--text-secondary))")}>
            {t("beforeYouArriveTitle")}
          </p>
          <div>
            {beforeArriveItems.map((item, i) => {
              const isHeader = item.endsWith(":");
              if (isHeader) {
                return (
                  <p
                    key={i}
                    style={{
                      ...inlineHeaderStyle,
                      marginTop: i > 0 ? "var(--space-5)" : 0,
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    {item}
                  </p>
                );
              }
              return (
                <ChecklistRow key={i} item={item} index={i} items={beforeArriveItems} />
              );
            })}
          </div>
        </div>
      )}

      {/* Pickup instructions */}
      {guestInfo.pickup_info ? (
        parsed && parsed.hasLocation ? (
          <>
            {/* Location card with Navigate button */}
            <div className="surface gpickup-sp">
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, color: "rgb(var(--brand))", marginTop: "1px" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M10 2C7.24 2 5 4.24 5 7c0 3.75 5 11 5 11s5-7.25 5-11c0-2.76-2.24-5-5-5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
                {parsed.locationDisplayLines.length > 0 && (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    {parsed.locationDisplayLines.map((line, i) => (
                      <p
                        key={i}
                        style={{
                          fontSize: i === 0 ? "15px" : "14px",
                          fontWeight: i === 0 ? ("500" as const) : ("400" as const),
                          color: "rgb(var(--text))",
                          margin: 0,
                          lineHeight: "1.5",
                        }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              {parsed.navUrl && (
                <a
                  href={parsed.navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gpickup-nav-btn"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-4)",
                    padding: "var(--space-2) var(--space-4)",
                    background: "rgb(var(--brand))",
                    color: "white",
                    borderRadius: "var(--radius)",
                    fontSize: "14px",
                    fontWeight: "500",
                    textDecoration: "none",
                    transition: "opacity 0.15s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M1 7H13M9 3L13 7L9 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t("navigate")}
                </a>
              )}
            </div>

            {/* Remaining lines collapsed under More details; lines ending ":" render as section headers */}
            {parsed.otherLines.length > 0 && (
              <details className="surface gpickup-sp gpickup-details">
                <summary>
                  <span style={{ fontSize: "15px", fontWeight: "600", color: "rgb(var(--text))" }}>
                    {t("moreDetails")}
                  </span>
                  <svg
                    className="gpickup-chevron"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      color: "rgb(var(--text-secondary))",
                      transition: "transform 0.2s",
                    }}
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div
                  style={{
                    marginTop: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  {parsed.otherLines.map((line, i) =>
                    line.endsWith(":") ? (
                      <p
                        key={i}
                        style={{
                          ...inlineHeaderStyle,
                          marginTop: i > 0 ? "var(--space-2)" : 0,
                        }}
                      >
                        {line}
                      </p>
                    ) : (
                      <p
                        key={i}
                        style={{
                          fontSize: "14px",
                          lineHeight: "1.7",
                          color: "rgb(var(--text-secondary))",
                          margin: 0,
                        }}
                      >
                        {line}
                      </p>
                    )
                  )}
                </div>
              </details>
            )}
          </>
        ) : (
          /* Fallback: no location detected — render all lines plainly */
          <div className="surface gpickup-sp">
            <p style={sectionLabel("rgb(var(--text-secondary))")}>
              {t("pickupInfo")}
            </p>
            <div
              style={{
                maxWidth: "640px",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
              }}
            >
              {parsed &&
                parsed.raw.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      fontSize: "15px",
                      lineHeight: "1.7",
                      color: "rgb(var(--text-secondary))",
                      margin: 0,
                    }}
                  >
                    {line}
                  </p>
                ))}
            </div>
          </div>
        )
      ) : (
        /* No pickup_info set */
        <div className="surface gpickup-sp">
          <p style={sectionLabel("rgb(var(--text-secondary))")}>
            {t("pickupInfo")}
          </p>
          <p style={{ fontSize: "14px", lineHeight: "1.65", color: "rgb(var(--muted))", margin: 0 }}>
            {t("placeholder")}
          </p>
        </div>
      )}
    </div>
  );
}
