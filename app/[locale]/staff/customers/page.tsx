"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";

export default function CustomersPage() {
  const { locale } = useParams<{ locale: string }>();

  return (
    <PageContainer maxWidth="900px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              Customers
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              This section is being prepared.
            </p>
          </div>

          <div>
            <Link href={`/${locale}/staff`} className="btn btn-secondary">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}