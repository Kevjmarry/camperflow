import { createClient } from "@/lib/supabase/server";
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

interface VehicleRow {
  id: string;
  name: string | null;
  registration_plate: string | null;
  vin: string | null;
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
    const { data, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, name, registration_plate, vin")
      .eq("id", booking.vehicle_id)
      .maybeSingle<VehicleRow>();

    if (!vehicleError) {
      vehicle = data || null;
    }
  }

  const { data: checklistsData } = await supabase.rpc("get_guest_checklists_by_code", { p_code: code });
  const checklists = (checklistsData as any[]) || [];

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
          {t("guestAccess")}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <div className="surface" style={{ padding: "var(--space-8)" }}>
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

          {booking.notes && (
            <div
              style={{
                marginTop: "var(--space-6)",
                padding: "var(--space-4)",
                background: "rgb(var(--app-bg))",
                border: "1px solid rgb(var(--border-light))",
                borderRadius: "var(--radius)",
              }}
            >
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
                {t("additionalNotes")}
              </p>
              <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgb(var(--muted))" }}>{booking.notes}</p>
            </div>
          )}
        </div>

        {vehicle && (
          <div className="surface" style={{ padding: "var(--space-8)" }}>
            <h2
              style={{
                marginBottom: "var(--space-6)",
                paddingBottom: "var(--space-4)",
                borderBottom: "1px solid rgb(var(--border-light))",
              }}
            >
              {t("vehicleInformation")}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "var(--space-6)",
              }}
            >
              {vehicle.name && (
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
                    {t("vehicle")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{vehicle.name}</p>
                </div>
              )}

              {vehicle.registration_plate && (
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
                    {t("licensePlate")}
                  </p>
                  <p style={{ fontFamily: "monospace", fontWeight: "500", color: "rgb(var(--text))" }}>
                    {vehicle.registration_plate}
                  </p>
                </div>
              )}

              {vehicle.vin && (
                <div style={{ gridColumn: "1 / -1" }}>
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
                    {t("vin")}
                  </p>
                  <p style={{ fontFamily: "monospace", fontSize: "14px", color: "rgb(var(--muted))" }}>{vehicle.vin}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {(booking.customer_name || booking.customer_email || booking.customer_phone) && (
          <div className="surface" style={{ padding: "var(--space-8)" }}>
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
                    {t("name")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{booking.customer_name}</p>
                </div>
              )}

              {booking.customer_email && (
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
                    {t("email")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{booking.customer_email}</p>
                </div>
              )}

              {booking.customer_phone && (
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
                    {t("phone")}
                  </p>
                  <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>{booking.customer_phone}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {checklists.length > 0 && (
          <div className="surface" style={{ padding: "var(--space-8)" }}>
            <h2
              style={{
                marginBottom: "var(--space-6)",
                paddingBottom: "var(--space-4)",
                borderBottom: "1px solid rgb(var(--border-light))",
              }}
            >
              {t("checklists")}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {checklists.map((checklist: any) => (
                <div
                  key={checklist.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    padding: "var(--space-4)",
                    background: "rgb(var(--app-bg))",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <div>
                    <p style={{ fontWeight: "500", color: "rgb(var(--text))" }}>
                      {checklist.type || t("checklistDefault")}
                    </p>
                    {checklist.created_at && (
                      <p style={{ marginTop: "var(--space-1)", fontSize: "14px", color: "rgb(var(--muted))" }}>
                        {new Date(checklist.created_at).toLocaleString(dateLocale)}
                      </p>
                    )}
                  </div>

                  {checklist.completed_at ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "rgb(var(--success) / 0.1)",
                        color: "rgb(var(--success))",
                        borderRadius: "var(--radius-xl)",
                        padding: "var(--space-1) var(--space-3)",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {t("checklistCompleted")}
                    </span>
                  ) : checklist.can_submit ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "rgb(var(--brand-light))",
                        color: "rgb(var(--brand))",
                        borderRadius: "var(--radius-xl)",
                        padding: "var(--space-1) var(--space-3)",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {t("checklistAvailable")}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "rgb(var(--muted) / 0.1)",
                        color: "rgb(var(--muted))",
                        borderRadius: "var(--radius-xl)",
                        padding: "var(--space-1) var(--space-3)",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {t("checklistLocked")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}