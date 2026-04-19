import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

interface Customer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
}

interface Booking {
  id: string;
  booking_number: string | null;
  status: string | null;
  pickup_at: string | null;
  return_at: string | null;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}


export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "staffCustomerDetail" });

  const statusLabels: Record<string, string> = {
    pending: t("status.pending"),
    confirmed: t("status.confirmed"),
    blocked: t("status.blocked"),
    on_rent: t("status.on_rent"),
    completed: t("status.completed"),
    cancelled: t("status.cancelled"),
  };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/staff/login`);
  }

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("company_id")
    .eq("auth_user_id", user!.id)
    .maybeSingle();

  const companyId = profile?.company_id;

  // Fetch customer — must belong to this company (security)
  let customer: Customer | null = null;
  if (companyId) {
    const { data } = await supabase
      .from("customers")
      .select("id, full_name, email, phone, created_at")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    customer = data ?? null;
  }

  if (!customer) {
    return (
      <PageContainer maxWidth="1400px" showSignOut={false}>
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <p style={{ color: "rgb(var(--muted))" }}>{t("notFound")}</p>
            <Link
              href={`/${locale}/staff/customers`}
              className="btn btn-secondary"
              style={{ alignSelf: "flex-start" }}
            >
              {t("backToCustomers")}
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Fetch bookings for this customer, sorted by pickup_at DESC
  let bookings: Booking[] = [];
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("id, booking_number, status, pickup_at, return_at")
    .eq("customer_id", customer.id)
    .order("pickup_at", { ascending: false });
  bookings = bookingsData ?? [];

  const totalBookings = bookings.length;
  const lastBookingDate = bookings.find((b) => b.pickup_at)?.pickup_at ?? null;

  return (
    <PageContainer maxWidth="1400px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-8)",
          }}
        >
          {/* Back link */}
          <div>
            <Link
              href={`/${locale}/staff/customers`}
              style={{
                fontSize: "14px",
                color: "rgb(var(--muted))",
                textDecoration: "none",
              }}
            >
              {t("backLink")}
            </Link>
          </div>

          {/* Header */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                flexWrap: "wrap",
              }}
            >
              <h1
                style={{
                  fontSize: "28px",
                  color: "rgb(var(--text))",
                  margin: 0,
                }}
              >
                {customer.full_name ?? t("unnamedCustomer")}
              </h1>
              <Link
                href={`/${locale}/staff/bookings`}
                className="btn btn-secondary"
                style={{ whiteSpace: "nowrap" }}
              >
                {t("viewAllBookings")}
              </Link>
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-5)",
                flexWrap: "wrap",
                fontSize: "14px",
                color: "rgb(var(--muted))",
              }}
            >
              {customer.email && <span>{customer.email}</span>}
              {customer.phone && <span>{customer.phone}</span>}
              {!customer.email && !customer.phone && <span>{t("noContactInfo")}</span>}
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "flex",
                gap: "var(--space-6)",
                flexWrap: "wrap",
                fontSize: "14px",
                marginTop: "var(--space-2)",
              }}
            >
              <span style={{ color: "rgb(var(--muted))" }}>
                {t("totalBookings")}{" "}
                <strong style={{ color: "rgb(var(--text))" }}>
                  {totalBookings}
                </strong>
              </span>
              <span style={{ color: "rgb(var(--muted))" }}>
                {t("lastBooking")}{" "}
                <strong style={{ color: "rgb(var(--text))" }}>
                  {formatDate(lastBookingDate, locale)}
                </strong>
              </span>
            </div>
          </div>

          {/* Bookings section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "rgb(var(--text))",
                margin: 0,
              }}
            >
              {t("bookingsTitle")}
            </h2>

            {bookings.length === 0 ? (
              <div
                style={{
                  padding: "var(--space-8)",
                  textAlign: "center",
                  color: "rgb(var(--muted))",
                  border: "1px dashed rgb(var(--border))",
                  borderRadius: "var(--radius-md)",
                  fontSize: "14px",
                }}
              >
                {t("noBookings")}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid rgb(var(--border))",
                        color: "rgb(var(--muted))",
                        textAlign: "left",
                      }}
                    >
                      <th
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          fontWeight: 500,
                        }}
                      >
                        {t("table.bookingNumber")}
                      </th>
                      <th
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          fontWeight: 500,
                        }}
                      >
                        {t("table.status")}
                      </th>
                      <th
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          fontWeight: 500,
                        }}
                      >
                        {t("table.pickup")}
                      </th>
                      <th
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          fontWeight: 500,
                        }}
                      >
                        {t("table.return")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr
                        key={booking.id}
                        style={{
                          borderBottom: "1px solid rgb(var(--border))",
                        }}
                      >
                        <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                          <Link
                            href={`/${locale}/staff/bookings/${booking.id}`}
                            style={{
                              color: "rgb(var(--accent))",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {booking.booking_number ?? booking.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td
                          style={{
                            padding: "var(--space-3) var(--space-4)",
                            color: "rgb(var(--text))",
                          }}
                        >
                          {booking.status
                            ? (statusLabels[booking.status] ?? booking.status)
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "var(--space-3) var(--space-4)",
                            color: "rgb(var(--text))",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDate(booking.pickup_at, locale)}
                        </td>
                        <td
                          style={{
                            padding: "var(--space-3) var(--space-4)",
                            color: "rgb(var(--text))",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDate(booking.return_at, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
