// app/[locale]/staff/team/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import BackLink from "@/components/staff/BackLink";

interface StaffProfile {
  profile_id: string;
  id: string;
  auth_user_id: string;
  company_id: string;
  role: string;
  name: string | null;
  can_manage: boolean;
  can_clean: boolean;
  can_mechanical: boolean;
  photo_url: string | null;
  active: boolean;
  created_at: string;
}

export default function StaffTeamPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("staffTeam");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [showOverLimitBanner, setShowOverLimitBanner] = useState(false);
  const [excessStaffIds, setExcessStaffIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes?.user) {
          router.replace(`/${locale}/staff/login`);
          return;
        }

        const user = userRes.user;
        setCurrentAuthUserId(user.id);

        const { data: currentProfile, error: profileErr } = await supabase
          .from("staff_profiles")
          .select("company_id, role, can_manage")
          .eq("auth_user_id", user.id)
          .single();

        if (profileErr || !currentProfile?.company_id) {
          setError(t("errorNoProfile"));
          setLoading(false);
          return;
        }

        setCanManageTeam(currentProfile.role === "admin" || currentProfile.can_manage === true);

        const [staffRes, billingRes] = await Promise.all([
          supabase
            .from("staff_profiles")
            .select(
              "profile_id, id, auth_user_id, company_id, role, name, can_manage, can_clean, can_mechanical, photo_url, active, created_at"
            )
            .eq("company_id", currentProfile.company_id)
            .order("role", { ascending: false })
            .order("created_at", { ascending: true }),
          fetch('/api/billing/info'),
        ]);

        if (staffRes.error) throw staffRes.error;

        const profiles = (staffRes.data || []) as StaffProfile[];
        setStaff(profiles);

        let includedStaff = 0;
        if (billingRes.ok) {
          const billingData = await billingRes.json();
          includedStaff = billingData.included_staff ?? 0;
        }

        if (includedStaff > 0) {
          const active = profiles.filter(p => p.active);
          const excessCount = Math.max(0, active.length - includedStaff);
          if (excessCount > 0) {
            const newest = [...active]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, excessCount)
              .map(p => p.profile_id);
            setExcessStaffIds(new Set(newest));
            setShowOverLimitBanner(true);
          }
        }
      } catch (err: any) {
        setError(err?.message || t("errorLoadFailed"));
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [supabase, locale, router, t]);

  const activeStaff = staff.filter((s) => s.active);
  const inactiveStaff = staff.filter((s) => !s.active);

  return (
    <PageContainer maxWidth="1400px">
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
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "var(--space-4)",
              }}
            >
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("title")}
              </h1>
              {canManageTeam && (
                <Link
                  href={`/${locale}/staff/team/new`}
                  style={{
                    background: "rgb(var(--brand))",
                    color: "white",
                    padding: "8px 16px",
                    borderRadius: "var(--radius)",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {t("addMember")}
                </Link>
              )}
            </div>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {staff.length} {t("memberCount", { count: staff.length })}
            </p>
          </div>

          {showOverLimitBanner && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'rgb(var(--warning) / 0.1)',
              border: '1px solid rgb(var(--warning) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--warning))',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
            }}>
              {t("overLimitBanner")}{' '}
              <Link href={`/${locale}/staff/settings/billing`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
                {t("overLimitBannerLink")}
              </Link>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "var(--space-4)",
                background: "rgb(var(--error) / 0.1)",
                border: "1px solid rgb(var(--error) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--error))",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          {loading && (
            <div
              style={{
                textAlign: "center",
                padding: "var(--space-8)",
                color: "rgb(var(--muted))",
              }}
            >
              {t("loading")}
            </div>
          )}

          {!loading && !error && staff.length > 0 && (
            <>
              {activeStaff.length > 0 && (
                <div>
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "rgb(var(--text))",
                      marginBottom: "var(--space-4)",
                    }}
                  >
                    {t("sectionActive")}
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "var(--space-4)",
                    }}
                  >
                    {activeStaff.map((member) => (
                      <StaffCard
                        key={member.profile_id}
                        member={member}
                        isCurrentUser={member.auth_user_id === currentAuthUserId}
                        locale={locale}
                        t={t}
                        isExcess={excessStaffIds.has(member.profile_id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {inactiveStaff.length > 0 && (
                <div>
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "rgb(var(--text))",
                      marginBottom: "var(--space-4)",
                    }}
                  >
                    {t("sectionInactive")}
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "var(--space-4)",
                    }}
                  >
                    {inactiveStaff.map((member) => (
                      <StaffCard
                        key={member.profile_id}
                        member={member}
                        isCurrentUser={member.auth_user_id === currentAuthUserId}
                        locale={locale}
                        t={t}
                        isExcess={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </PageContainer>
  );
}

function StaffCard({
  member,
  isCurrentUser,
  locale,
  t,
  isExcess,
}: {
  member: StaffProfile;
  isCurrentUser: boolean;
  locale: string;
  t: any;
  isExcess?: boolean;
}) {
  const getTypeLabel = (): string => {
    if (member.can_manage) {
      return t("roleManager");
    }
    
    const capabilities: string[] = [];
    if (member.can_clean) capabilities.push(t("roleCleaner"));
    if (member.can_mechanical) capabilities.push(t("roleMechanical"));
    
    if (capabilities.length > 0) {
      return capabilities.join(t("capabilityJoiner"));
    }
    
    return "";
  };

  const displayName =
    member.name && member.name.trim().length > 0
      ? member.name
      : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  const typeLabel = getTypeLabel();

  const cardBody = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            overflow: "hidden",
            background: "rgb(var(--border))",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {member.photo_url ? (
            <Image
              src={member.photo_url}
              alt={t("photoAlt")}
              width={48}
              height={48}
            />
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(var(--muted))"
              strokeWidth="2"
            >
              <circle cx="12" cy="7" r="4" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <div style={{ fontWeight: 600, color: "rgb(var(--text))" }}>
              {displayName}
            </div>
            {isCurrentUser && (
              <span
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: "rgb(var(--brand) / 0.12)",
                  color: "rgb(var(--brand))",
                  fontWeight: 600,
                }}
              >
                {t("youBadge")}
              </span>
            )}
          </div>

          {typeLabel && (
            <div
              style={{
                fontSize: "12px",
                color: member.can_manage ? "rgb(var(--accent))" : "rgb(var(--muted))",
                fontWeight: member.can_manage ? 600 : 400,
                marginTop: 2,
              }}
            >
              {typeLabel}
            </div>
          )}

          {isExcess && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginTop: 4,
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'rgb(var(--warning) / 0.12)',
              border: '1px solid rgb(var(--warning) / 0.35)',
              color: 'rgb(var(--warning))',
              fontSize: '11px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              {t("overLimitChip")}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <Link
      href={`/${locale}/staff/team/${member.profile_id}`}
      className="surface"
      style={{
        padding: "var(--space-5)",
        textDecoration: "none",
        display: "block",
        cursor: "pointer",
      }}
    >
      {cardBody}
    </Link>
  );
}