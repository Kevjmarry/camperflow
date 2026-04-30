import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | string;

interface GuestBooking {
  status: BookingStatus | null;
  vehicle_id: string | null;

  booking_number: string | null;
  pickup_at: string | null;
  return_at: string | null;
  notes: string | null;

  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;

  company_id: string | null;
  company_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
}

interface CompanySettings {
  included_items: string | null;
}

interface VehicleRow {
  id: string;
  name: string | null;
  registration_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  photo_url: string | null;
  youtube_url: string | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
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

const STORAGE_KEY = "camperflow:last_company_theme";

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0 0";
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

function adjustBrightness(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  const r = Math.max(0, Math.min(255, parseInt(result[1], 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(result[2], 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(result[3], 16) + amount));

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
}

export default async function GuestBookingPage({ params }: PageProps) {
  const { locale, id: codeRaw } = await params;
  const code = decodeURIComponent(codeRaw || "").trim();
  const supabase = await createClient();
  const t = await getTranslations("guestBooking");

  // Map locale to date locale string
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const { data: booking, error: bookingError } = await supabase
    .rpc("get_guest_booking_by_code", { p_code: code })
    .maybeSingle<GuestBooking>();

  if (bookingError) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{t("notAccessibleTitle")}</h1>
        <p style={{ marginBottom: "var(--space-2)", color: "rgb(var(--muted))" }}>
          {t("notAccessibleMessage")}{" "}
          <span style={{ fontFamily: "monospace", fontWeight: "600", color: "rgb(var(--text))" }}>{code}</span>{" "}
          {t("notAccessibleMessageEnd")}
        </p>
        <p style={{ color: "rgb(var(--muted))" }}>{t("contactUs")}</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="surface" style={{ padding: "var(--space-8)", maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-4)" }}>{t("notFoundTitle")}</h1>
        <p style={{ color: "rgb(var(--muted))" }}>
          {t("notFoundMessage")}{" "}
          <span style={{ fontFamily: "monospace", fontWeight: "600", color: "rgb(var(--text))" }}>{code}</span>{" "}
          {t("notFoundMessageEnd")}
        </p>
      </div>
    );
  }

  const safeStatus: string = booking.status || "pending";

  let vehicle: VehicleRow | null = null;
  if (booking.vehicle_id) {
    const serviceClient = createServiceClient();
    const { data, error: vehicleError } = await serviceClient
      .from("vehicles")
      .select("id, name, registration_plate, make, model, year, photo_url, youtube_url, length_m, width_m, height_m")
      .eq("id", booking.vehicle_id)
      .maybeSingle<VehicleRow>();

    if (!vehicleError) {
      vehicle = data || null;
    }
  }

  let companySettings: CompanySettings = { included_items: null };
  if (booking.company_id) {
    const { data } = await supabase
      .from("company_settings")
      .select("included_items")
      .eq("id", booking.company_id)
      .maybeSingle<CompanySettings>();
    if (data) companySettings = data;
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("notSpecified");
    const date = new Date(dateString);
    return date.toLocaleDateString(dateLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  const getStatusStyle = (status: string) => {
    const styles: Record<string, { bg: string; text: string; border: string }> = {
      confirmed: { bg: "rgb(var(--success) / 0.1)", text: "rgb(var(--success))", border: "rgb(var(--success) / 0.3)" },
      pending: { bg: "rgb(var(--warning) / 0.1)", text: "rgb(var(--warning))", border: "rgb(var(--warning) / 0.3)" },
      completed: { bg: "rgb(var(--brand-light))", text: "rgb(var(--brand))", border: "rgb(var(--brand) / 0.3)" },
      cancelled: { bg: "rgb(var(--error) / 0.1)", text: "rgb(var(--error))", border: "rgb(var(--error) / 0.3)" },
    };
    return styles[status.toLowerCase()] || {
      bg: "rgb(var(--surface))",
      text: "rgb(var(--text-secondary))",
      border: "rgb(var(--border))",
    };
  };

  const statusStyle = getStatusStyle(safeStatus);

  const hasTheme =
    !!booking.company_id &&
    !!booking.company_name &&
    !!booking.primary_color &&
    !!booking.secondary_color &&
    !!booking.accent_color;

  const themeObj = hasTheme
    ? {
        id: booking.company_id as string,
        name: booking.company_name as string,
        logo_url: booking.logo_url ?? null,
        primary_color: booking.primary_color as string,
        secondary_color: booking.secondary_color as string,
        accent_color: booking.accent_color as string,
      }
    : null;

  const themeStyleTag = themeObj
    ? `
:root{
  --brand:${hexToRgb(themeObj.primary_color)};
  --brand-hover:${hexToRgb(adjustBrightness(themeObj.primary_color, -20))};
  --brand-light:${hexToRgb(adjustBrightness(themeObj.primary_color, 200))};
  --brand-2:${hexToRgb(themeObj.secondary_color)};
  --accent:${hexToRgb(themeObj.accent_color)};
}
`
    : "";

  const themeScript = themeObj
    ? `
try{
  localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(themeObj))});
}catch(e){}
`
    : "";

  return (
    <div>
      <style>{`
        .gbooking-sp { padding: var(--space-4); }
        .gbooking-title { padding: var(--space-4); margin-bottom: var(--space-4); }
        @media (min-width: 768px) {
          .gbooking-sp { padding: var(--space-8); }
          .gbooking-title { padding: var(--space-6); margin-bottom: var(--space-6); }
        }
        .gbooking-photo-fields { display: grid; gap: var(--space-6); grid-template-columns: minmax(0,1fr); }
        @media (min-width: 481px) { .gbooking-photo-fields { grid-template-columns: minmax(0,1fr) minmax(0,1fr); } }
        .gbooking-dims { display: grid; gap: var(--space-4); grid-template-columns: 1fr; }
        @media (min-width: 481px) { .gbooking-dims { grid-template-columns: 1fr 1fr 1fr; } }
        .gbooking-included-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-6); }
        @media (min-width: 768px) { .gbooking-included-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
      {themeObj && (
        <>
          <style dangerouslySetInnerHTML={{ __html: themeStyleTag }} />
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </>
      )}

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
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("back")}
        </Link>
      </div>

      <div
        className="surface gbooking-title"
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
          {t("guestAccess")}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

        {/* Customer */}
        {(booking.customer_name || booking.customer_email || booking.customer_phone) && (
          <div className="surface gbooking-sp">
            <h2
              style={{
                marginBottom: "var(--space-6)",
                paddingBottom: "var(--space-4)",
                borderBottom: "1px solid rgb(var(--border-light))",
              }}
            >
              {t("customerInformation")}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "var(--space-6)",
              }}
            >
              {booking.customer_name && (
                <div>
                  <p style={{ fontSize: "12px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))", marginBottom: "var(--space-2)" }}>
                    {t("name")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{booking.customer_name}</p>
                </div>
              )}
              {booking.customer_email && (
                <div>
                  <p style={{ fontSize: "12px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))", marginBottom: "var(--space-2)" }}>
                    {t("email")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{booking.customer_email}</p>
                </div>
              )}
              {booking.customer_phone && (
                <div>
                  <p style={{ fontSize: "12px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.05em", color: "rgb(var(--text-secondary))", marginBottom: "var(--space-2)" }}>
                    {t("phone")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{booking.customer_phone}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Booking */}
        <div className="surface gbooking-sp">
          <h2
            style={{
              marginBottom: "var(--space-6)",
              paddingBottom: "var(--space-4)",
              borderBottom: "1px solid rgb(var(--border-light))",
            }}
          >
            {t("bookingInformation")}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "var(--space-6)",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgb(var(--text-secondary))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("bookingNumber")}
              </p>
              <p style={{ fontSize: "20px", fontFamily: "monospace", fontWeight: "600", color: "rgb(var(--text))" }}>
                {booking.booking_number}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgb(var(--text-secondary))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("status")}
              </p>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: statusStyle.bg,
                  color: statusStyle.text,
                  border: `1px solid ${statusStyle.border}`,
                  borderRadius: "var(--radius-xl)",
                  padding: "var(--space-2) var(--space-4)",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                {t(`statusValues.${safeStatus.toLowerCase()}`)}
              </span>
            </div>
            <div>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgb(var(--text-secondary))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("pickupDate")}
              </p>
              <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{formatDate(booking.pickup_at)}</p>
            </div>
            <div>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "rgb(var(--text-secondary))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("returnDate")}
              </p>
              <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{formatDate(booking.return_at)}</p>
            </div>
          </div>
        </div>

        {/* Vehicle */}
        {vehicle && (
          <>
            {/* Photo + Fields */}
            <div className="gbooking-photo-fields">
              <div className="surface gbooking-sp">
                {vehicle.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vehicle.photo_url}
                    alt={vehicle.name ?? "Vehicle"}
                    style={{
                      width: "100%",
                      height: 240,
                      objectFit: "cover",
                      borderRadius: "var(--radius)",
                      border: "1px solid rgb(var(--border))",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 240,
                      borderRadius: "var(--radius)",
                      border: "1px solid rgb(var(--border))",
                      background: "rgb(var(--muted) / 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgb(var(--muted))",
                      fontSize: "14px",
                    }}
                  >
                    —
                  </div>
                )}
              </div>
              <div className="surface gbooking-sp">
                <h2
                  style={{
                    marginBottom: "var(--space-6)",
                    paddingBottom: "var(--space-4)",
                    borderBottom: "1px solid rgb(var(--border-light))",
                  }}
                >
                  {t("vehicleInformation")}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  {vehicle.name && (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>{t("vehicle")}</p>
                      <p style={{ fontSize: "14px", fontWeight: "600", color: "rgb(var(--text))" }}>{vehicle.name}</p>
                    </div>
                  )}
                  {vehicle.registration_plate && (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>{t("licensePlate")}</p>
                      <p style={{ fontSize: "14px", fontWeight: "600", fontFamily: "monospace", color: "rgb(var(--text))" }}>{vehicle.registration_plate}</p>
                    </div>
                  )}
                  {vehicle.make && (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>Make</p>
                      <p style={{ fontSize: "14px", fontWeight: "600", color: "rgb(var(--text))" }}>{vehicle.make}</p>
                    </div>
                  )}
                  {vehicle.model && (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>Model</p>
                      <p style={{ fontSize: "14px", fontWeight: "600", color: "rgb(var(--text))" }}>{vehicle.model}</p>
                    </div>
                  )}
                  {vehicle.year != null && (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>Year</p>
                      <p style={{ fontSize: "14px", fontWeight: "600", color: "rgb(var(--text))" }}>{vehicle.year}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Dimensions */}
            {(vehicle.length_m != null || vehicle.width_m != null || vehicle.height_m != null) && (
              <div className="surface gbooking-sp">
                <div style={{ fontSize: "14px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                  {t("dimensions")}
                </div>
                <div className="gbooking-dims">
                  {vehicle.length_m != null && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{t("dimensionLength")}</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "rgb(var(--text))" }}>{vehicle.length_m} m</div>
                    </div>
                  )}
                  {vehicle.width_m != null && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{t("dimensionWidth")}</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "rgb(var(--text))" }}>{vehicle.width_m} m</div>
                    </div>
                  )}
                  {vehicle.height_m != null && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{t("dimensionHeight")}</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "rgb(var(--text))" }}>{vehicle.height_m} m</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Included in your booking */}
            {(() => {
              const items = companySettings.included_items
                ? companySettings.included_items.split("\n").map((l) => l.trim()).filter(Boolean)
                : [];
              if (items.length === 0) return null;

              const colonIndices = items.reduce<number[]>((acc, item, i) => {
                if (item.endsWith(":")) acc.push(i);
                return acc;
              }, []);
              const splitAt = colonIndices.length >= 2 ? colonIndices[1] : null;
              const group1 = splitAt !== null ? items.slice(0, splitAt) : items;
              const group2 = splitAt !== null ? items.slice(splitAt) : [];

              const renderGroup = (lines: string[]) => (
                <div>
                  {lines.map((item, index) => {
                    if (item.endsWith(":")) {
                      return (
                        <p
                          key={index}
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "rgb(var(--text-secondary))",
                            margin: index > 0 ? "var(--space-5) 0 var(--space-3)" : "0 0 var(--space-3)",
                          }}
                        >
                          {item.slice(0, -1)}
                        </p>
                      );
                    }
                    const isLast = index === lines.length - 1;
                    const nextIsHeader = lines[index + 1]?.endsWith(":");
                    return (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          gap: "var(--space-3)",
                          alignItems: "flex-start",
                          paddingTop: "var(--space-3)",
                          paddingBottom: "var(--space-3)",
                          borderBottom: !isLast && !nextIsHeader ? "1px solid rgb(var(--border-light))" : "none",
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
                  })}
                </div>
              );

              return (
                <div className="surface gbooking-sp">
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                    Included in your booking
                  </div>
                  <div className="gbooking-included-grid">
                    <div>{renderGroup(group1)}</div>
                    {group2.length > 0 && <div>{renderGroup(group2)}</div>}
                  </div>
                </div>
              );
            })()}

            {/* Video */}
            {vehicle.youtube_url && getYouTubeEmbedId(vehicle.youtube_url) && (
              <div className="surface gbooking-sp">
                <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-4)" }}>
                  Video Tour
                </div>
                <div style={{ maxWidth: 854, margin: "0 auto", width: "100%" }}>
                  <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid rgb(var(--border))" }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${getYouTubeEmbedId(vehicle.youtube_url)}`}
                      title="Vehicle video tour"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}