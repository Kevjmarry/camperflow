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

const hasPhone = (c: Customer) => Boolean(c.phone && c.phone.trim().length > 0);

function CustomerRow({
  customer,
  locale,
}: {
  customer: Customer;
  locale: string;
}) {
  return (
    <tr style={{ borderBottom: "1px solid rgb(var(--border))" }}>
      <td style={{ padding: "var(--space-3) var(--space-4)" }}>
        <Link
          href={`/${locale}/staff/customers/${customer.id}`}
          style={{
            color: "rgb(var(--accent))",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {customer.full_name ?? "—"}
        </Link>
      </td>
      <td
        className="customers-col-email"
        style={{
          padding: "var(--space-3) var(--space-4)",
          color: "rgb(var(--text))",
        }}
      >
        {customer.email ?? "—"}
      </td>
      <td
        style={{
          padding: "var(--space-3) var(--space-4)",
          color: "rgb(var(--text))",
        }}
      >
        {customer.phone ?? "—"}
      </td>
      <td
        className="customers-col-created"
        style={{
          padding: "var(--space-3) var(--space-4)",
          color: "rgb(var(--muted))",
          whiteSpace: "nowrap",
        }}
      >
        {customer.created_at
          ? new Date(customer.created_at).toLocaleDateString(locale, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </td>
    </tr>
  );
}

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staffCustomers" });

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

  let customers: Customer[] = [];
  if (companyId) {
    const { data } = await supabase
      .from("customers")
      .select("id, full_name, email, phone, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    customers = data ?? [];
  }

  const withPhone = customers.filter(hasPhone);
  const withoutPhone = customers.filter((c) => !hasPhone(c));

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  };

  const thStyle: React.CSSProperties = {
    padding: "var(--space-3) var(--space-4)",
    fontWeight: 500,
  };

  return (
    <PageContainer maxWidth="1400px" showSignOut={false}>
      <style>{`
        @media (max-width: 767px) {
          .customers-col-email,
          .customers-col-created { display: none; }
        }
      `}</style>
      <div className="surface page-surface">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "var(--space-4)",
            }}
          >
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))", margin: 0 }}>
              {t("title")}
            </h1>
            <Link href="#" className="btn btn-primary">
              {t("newCustomer")}
            </Link>
          </div>

          {/* Table or empty state */}
          {customers.length === 0 ? (
            <div
              style={{
                padding: "var(--space-10)",
                textAlign: "center",
                color: "rgb(var(--muted))",
                border: "1px dashed rgb(var(--border))",
                borderRadius: "var(--radius-md)",
              }}
            >
              {t("empty")}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              {/* Customers with a phone number — always visible */}
              {withPhone.length > 0 && (
                <table style={tableStyle}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid rgb(var(--border))",
                        color: "rgb(var(--muted))",
                        textAlign: "left",
                      }}
                    >
                      <th style={thStyle}>{t("table.name")}</th>
                      <th className="customers-col-email" style={thStyle}>{t("table.email")}</th>
                      <th style={thStyle}>{t("table.phone")}</th>
                      <th className="customers-col-created" style={thStyle}>{t("table.created")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withPhone.map((customer) => (
                      <CustomerRow
                        key={customer.id}
                        customer={customer}
                        locale={locale}
                      />
                    ))}
                  </tbody>
                </table>
              )}

              {/* Customers without a phone number — collapsed by default */}
              {withoutPhone.length > 0 && (
                <details
                  style={{
                    marginTop: withPhone.length > 0 ? "var(--space-4)" : 0,
                  }}
                >
                  <summary
                    style={{
                      listStyle: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-2) var(--space-1)",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "rgb(var(--text))",
                      userSelect: "none",
                      borderTop: withPhone.length === 0
                        ? "1px solid rgb(var(--border))"
                        : "none",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "rgb(var(--muted))" }}>▸</span>
                    {t("missingPhone", { count: withoutPhone.length })}
                  </summary>

                  {/* Asterisk note */}
                  <p
                    style={{
                      margin: "var(--space-2) 0 var(--space-3)",
                      fontSize: "13px",
                      color: "rgb(var(--muted))",
                      paddingLeft: "var(--space-1)",
                    }}
                  >
                    {t("missingPhoneNote")}
                  </p>

                  {/* Show header if the main table above is empty */}
                  <table style={tableStyle}>
                    {withPhone.length === 0 && (
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid rgb(var(--border))",
                            color: "rgb(var(--muted))",
                            textAlign: "left",
                          }}
                        >
                          <th style={thStyle}>{t("table.name")}</th>
                          <th className="customers-col-email" style={thStyle}>{t("table.email")}</th>
                          <th style={thStyle}>{t("table.phone")}</th>
                          <th className="customers-col-created" style={thStyle}>{t("table.created")}</th>
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {withoutPhone.map((customer) => (
                        <CustomerRow
                          key={customer.id}
                          customer={customer}
                          locale={locale}
                        />
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
