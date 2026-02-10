"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

export default function StaffPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const supabase = createClient();
  const t = useTranslations("staff.dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdminStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("role, can_manage")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const adminStatus =
        profile?.role === "admin" || profile?.can_manage === true;

      setIsAdmin(adminStatus);
      setLoading(false);
    }

    checkAdminStatus();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}`);
    router.refresh();
  };

  return (
    <PageContainer maxWidth="900px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-4)",
            }}
          >
            <div>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("title")}
              </h1>
              <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
                {t("subtitle")}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="btn btn-ghost"
              style={{
                fontSize: "14px",
                padding: "var(--space-2) var(--space-4)",
                minHeight: "36px",
              }}
            >
              {t("signOut")}
            </button>
          </div>

          {/* DASHBOARD GRID */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            <Link href={`/${locale}/staff/bookings`} className="surface" style={cardStyle}>
              {iconBookings}
              <div>
                <h3 style={cardTitle}>{t("cards.bookings.title")}</h3>
                <p style={cardText}>{t("cards.bookings.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/vehicles`} className="surface" style={cardStyle}>
              {iconVehicles}
              <div>
                <h3 style={cardTitle}>{t("cards.vehicles.title")}</h3>
                <p style={cardText}>{t("cards.vehicles.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/team`} className="surface" style={cardStyle}>
              {iconTeam}
              <div>
                <h3 style={cardTitle}>{t("cards.team.title")}</h3>
                <p style={cardText}>{t("cards.team.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/customers`} className="surface" style={cardStyle}>
              {iconCustomers}
              <div>
                <h3 style={cardTitle}>{t("cards.customers.title")}</h3>
                <p style={cardText}>{t("cards.customers.desc")}</p>
              </div>
            </Link>

            <Link href={`/${locale}/staff/company`} className="surface" style={cardStyle}>
              {iconCompany}
              <div>
                <h3 style={cardTitle}>{t("cards.company.title")}</h3>
                <p style={cardText}>{t("cards.company.desc")}</p>
              </div>
            </Link>
          </div>

          {!loading && (
            <div
              style={{
                borderTop: "1px solid rgb(var(--border))",
                paddingTop: "var(--space-6)",
              }}
            >
              <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)" }}>
                {t("quickActions.title")}
              </h2>
              {isAdmin ? (
                <div style={{ display: "flex", gap: "var(--space-3)" }}>
                  <Link href={`/${locale}/staff/bookings/new`} className="btn btn-primary">
                    {t("quickActions.newBooking")}
                  </Link>
                  <Link href={`/${locale}/staff/vehicles/new`} className="btn btn-secondary">
                    {t("quickActions.addVehicle")}
                  </Link>
                </div>
              ) : (
                <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>
                  {t("quickActions.nonAdminHint")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

/* shared styles + icons */

const cardStyle = {
  padding: "var(--space-6)",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--space-3)",
};

const cardTitle = {
  fontSize: "18px",
  marginBottom: "var(--space-2)",
  color: "rgb(var(--text))",
};

const cardText = {
  fontSize: "14px",
  color: "rgb(var(--muted))",
};

const iconWrap = {
  width: "48px",
  height: "48px",
  borderRadius: "var(--radius-lg)",
  background: "rgb(var(--brand-light))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconBookings = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M8 7V3m8 4V3M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z" />
    </svg>
  </div>
);

const iconVehicles = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  </div>
);

const iconTeam = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M17 20H7m10 0v-2a4 4 0 00-8 0v2m4-10a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  </div>
);

const iconCustomers = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 20a5 5 0 0110 0" />
    </svg>
  </div>
);

const iconCompany = (
  <div style={iconWrap}>
    <svg width="24" height="24" stroke="currentColor" fill="none">
      <path strokeWidth="2" d="M7 21V3h10v18M7 9h10" />
    </svg>
  </div>
);