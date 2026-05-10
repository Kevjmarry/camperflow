"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { useTranslations } from "next-intl";
import BackLink from "@/components/staff/BackLink";

interface Customer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
}
const hasPhone = (c: Customer) =>
  Boolean((c.email && c.email.trim()) || (c.phone && c.phone.trim()));

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
          {(customer.full_name ?? "").replace(/^(\[\?\]|\?)\s*/, '').trim() || "—"}
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

export default function CustomersPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffCustomers");
  const router = useRouter();
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/${locale}/staff/login`);
        return;
      }

      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("company_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (profile?.company_id) {
        const [{ data: withContact }, { data: noContact }] = await Promise.all([
          supabase
            .from("customers")
            .select("id, full_name, email, phone, created_at")
            .eq("company_id", profile.company_id)
            .or("email.not.is.null,phone.not.is.null")
            .order("created_at", { ascending: false }),
          supabase
            .from("customers")
            .select("id, full_name, email, phone, created_at")
            .eq("company_id", profile.company_id)
            .is("email", null)
            .is("phone", null)
            .order("created_at", { ascending: false }),
        ]);
        setCustomers([...(withContact ?? []), ...(noContact ?? [])]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter(
        (c) =>
          (c.full_name ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q),
      )
    : customers;

  const withPhone = filtered.filter(hasPhone);
  const withoutPhone = filtered.filter((c) => !hasPhone(c));

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  };

  const thStyle: React.CSSProperties = {
    padding: "var(--space-3) var(--space-4)",
    fontWeight: 500,
  };

  const tableHead = (
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
  );

  return (
    <PageContainer maxWidth="1400px">
      <style>{`
        @media (max-width: 767px) {
          .customers-col-created { display: none; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={`/${locale}/staff`}>{t("backToDashboard")}</BackLink>
        </div>
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

          {/* Search toolbar */}
          <div
            style={{
              paddingBottom: "var(--space-4)",
              borderBottom: "1px solid rgb(var(--border))",
            }}
          >
            <input
              type="text"
              className="input"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: "1 1 200px",
                width: "100%",
                maxWidth: "360px",
                minHeight: "36px",
                padding: "var(--space-2) var(--space-3)",
              }}
            />
          </div>

          {/* Body */}
          {loading ? (
            <div
              style={{
                padding: "var(--space-8)",
                textAlign: "center",
                color: "rgb(var(--muted))",
              }}
            >
              {t("loading")}
            </div>
          ) : customers.length === 0 ? (
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
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: "var(--space-8)",
                textAlign: "center",
                color: "rgb(var(--muted))",
              }}
            >
              {t("noResults")}
            </div>
          ) : q ? (
            /* Search active — flat list, phone-split collapsed */
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                {tableHead}
                <tbody>
                  {filtered.map((customer) => (
                    <CustomerRow key={customer.id} customer={customer} locale={locale} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* No search — original phone-split layout */
            <div style={{ overflowX: "auto" }}>
              {/* Customers with a phone number — always visible */}
              {withPhone.length > 0 && (
                <table style={tableStyle}>
                  {tableHead}
                  <tbody>
                    {withPhone.map((customer) => (
                      <CustomerRow key={customer.id} customer={customer} locale={locale} />
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
                      borderTop:
                        withPhone.length === 0
                          ? "1px solid rgb(var(--border))"
                          : "none",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "rgb(var(--muted))" }}>▸</span>
                    {t("missingPhone", { count: withoutPhone.length })}
                  </summary>

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

                  <table style={tableStyle}>
                    {tableHead}
                    <tbody>
                      {withoutPhone.map((customer) => (
                        <CustomerRow key={customer.id} customer={customer} locale={locale} />
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </PageContainer>
  );
}
