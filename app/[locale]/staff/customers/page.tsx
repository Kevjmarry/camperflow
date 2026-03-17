import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";

export const dynamic = "force-dynamic";

interface Customer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
}

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

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

  return (
    <PageContainer maxWidth="1400px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
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
              gap: "var(--space-4)",
            }}
          >
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))", margin: 0 }}>
              Customers
            </h1>
            <Link href="#" className="btn btn-primary">
              + New Customer
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
              No customers yet
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
                      Name
                    </th>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        fontWeight: 500,
                      }}
                    >
                      Email
                    </th>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        fontWeight: 500,
                      }}
                    >
                      Phone
                    </th>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        fontWeight: 500,
                      }}
                    >
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      style={{
                        borderBottom: "1px solid rgb(var(--border))",
                      }}
                    >
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
                        style={{
                          padding: "var(--space-3) var(--space-4)",
                          color: "rgb(var(--muted))",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {customer.created_at
                          ? new Date(customer.created_at).toLocaleDateString(
                              locale,
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
