// app/[locale]/staff/vehicles/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getStatusChipStyle } from "@/lib/statusChip";
import BackLink from "@/components/staff/BackLink";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  photo_url: string | null;
  status: 'ready' | 'preparing' | 'on_rent';
  operational_hold: boolean;
  hold_reason: string | null;
  created_at: string;
  updated_at: string;
  blockingReason?: string;
  isExcess?: boolean;
}

export default function VehiclesPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffVehicles");
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOverLimitBanner, setShowOverLimitBanner] = useState(false);
  const companyIdRef = useRef<string | null>(null);

  useEffect(() => {
    checkUserCapabilities();
  }, []);

  useEffect(() => {
    if (canManage !== null) {
      fetchVehicles();
    }
  }, [canManage]);

  const checkUserCapabilities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(t("errors.notAuthenticated"));
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('role, can_manage, company_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      companyIdRef.current = profile?.company_id ?? null;
      setCanManage(profile ? (profile.role === 'admin' || profile.can_manage === true) : false);
    } catch (err: any) {
      setError(err.message || t("errors.failedCheckPermissions"));
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      const vehicleList: Vehicle[] = data || [];

      // Fetch plan limits from billing API (Stripe-derived source of truth)
      let billingLimit = 0;
      try {
        const billingRes = await fetch('/api/billing/info');
        if (billingRes.ok) {
          const billingData = await billingRes.json();
          billingLimit = billingData.included_vehicles ?? 0;
        }
      } catch {}

      const markExcess = (list: Vehicle[]): Vehicle[] => {
        if (billingLimit === 0) return list;
        const excessCount = Math.max(0, list.length - billingLimit);
        if (excessCount === 0) return list;
        const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const newest = sorted.slice(0, excessCount).map(v => v.id);
        const excessSet = new Set(newest);
        return list.map(v => excessSet.has(v.id) ? { ...v, isExcess: true } : v);
      };

      setShowOverLimitBanner(
        billingLimit > 0 &&
        vehicleList.length > billingLimit
      );

      // Enrich both preparing and ready vehicles with warning signals.
      // on_rent vehicles are skipped — their status is authoritative and
      // there's nothing actionable to surface here.
      const enrichIds = vehicleList.filter(v => v.status === 'preparing' || v.status === 'ready').map(v => v.id);

      if (enrichIds.length === 0) {
        setVehicles(markExcess(vehicleList));
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // ── Enrichment queries ─────────────────────────────────────────────────
      // Run across all preparing+ready vehicles.
      const [r1, r2, r3] = await Promise.all([
        // 1. Open unresolved vehicle issues
        supabase
          .from('vehicle_issues')
          .select('vehicle_id')
          .in('vehicle_id', enrichIds)
          .eq('resolved', false),
        // 2. Expired blocking compliance
        supabase
          .from('vehicle_compliance')
          .select('vehicle_id, compliance_types!inner(name, slug, is_system, blocks_readiness)')
          .in('vehicle_id', enrichIds)
          .eq('compliance_types.blocks_readiness', true)
          .lte('expiry_date', today),
        // 3. Next confirmed booking per vehicle (soonest pickup_at).
        // Used to scope the stale-state checklist guard to match the DB function.
        supabase
          .from('bookings')
          .select('id, vehicle_id')
          .in('vehicle_id', enrichIds)
          .eq('status', 'confirmed')
          .order('pickup_at', { ascending: true }),
      ]);

      // Map vehicle_id → next confirmed booking id (first row per vehicle since ordered).
      const nextBookingByVehicle = new Map<string, string>();
      for (const b of (r3.data || []) as any[]) {
        if (!nextBookingByVehicle.has(b.vehicle_id)) {
          nextBookingByVehicle.set(b.vehicle_id, b.id);
        }
      }
      const nextBookingIds = [...nextBookingByVehicle.values()];

      // 4. Incomplete prep checklists for the next confirmed booking only.
      // Stale-state guard: DB may say 'ready' if a booking was inserted after
      // the last recompute trigger fired (INSERT does not trigger recompute).
      const { data: checklistData } = nextBookingIds.length > 0
        ? await supabase
            .from('checklist_instances')
            .select('vehicle_id')
            .in('booking_id', nextBookingIds)
            .in('checklist_type', ['cleaning', 'mechanical', 'vehicle_readiness', 'pre_season', 'post_season'])
            .neq('status', 'completed')
        : { data: [] as any[] };

      const issues     = r1.data || [];
      const compliance = r2.data || [];
      const checklists = checklistData || [];

      // ── Build enriched list ─────────────────────────────────────────────────
      const issueSet = new Set(issues.map((r: any) => r.vehicle_id));

      const complianceNameByVehicle = new Map<string, string>();
      for (const r of compliance as any[]) {
        if (r.vehicle_id && r.compliance_types?.name && !complianceNameByVehicle.has(r.vehicle_id)) {
          complianceNameByVehicle.set(r.vehicle_id, r.compliance_types.name);
        }
      }

      // Vehicle IDs with at least one incomplete prep checklist for a confirmed booking.
      // Used as a stale-state guard when the DB hasn't recomputed yet.
      const openPrepVehicleSet = new Set(
        checklists.map((r: any) => r.vehicle_id).filter(Boolean)
      );

      const withReasons = vehicleList.map(v => {
        if (v.status === 'on_rent') return v;

        // Stale-state guard: DB says 'ready' but there are incomplete prep checklists
        // for a confirmed booking (can happen when a booking is inserted after the last
        // recompute trigger fired, since INSERT doesn't trigger recompute).
        const effectiveStatus: Vehicle['status'] =
          v.status === 'ready' && openPrepVehicleSet.has(v.id)
            ? 'preparing'
            : v.status;

        let blockingReason = '';
        if (issueSet.has(v.id)) {
          blockingReason = t("blockingReason.openIssue");
        } else {
          const complianceName = complianceNameByVehicle.get(v.id);
          if (complianceName !== undefined) {
            blockingReason = t("blockingReason.expiredComplianceWithName", { name: complianceName });
          } else if (effectiveStatus === 'preparing' && openPrepVehicleSet.has(v.id)) {
            blockingReason = t("blockingReason.checklistIncomplete");
          }
        }

        if (effectiveStatus !== v.status) {
          return { ...v, status: effectiveStatus, ...(blockingReason ? { blockingReason } : {}) };
        }
        return blockingReason ? { ...v, blockingReason } : v;
      });

      setVehicles(markExcess(withReasons));
    } catch (err: any) {
      setError(err.message || t("errors.failedLoadVehicles"));
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return t("status.ready");
      case 'preparing': return t("status.preparing");
      case 'on_rent': return t("status.onRent");
      default: return status;
    }
  };

  return (
    <PageContainer maxWidth="1400px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={`/${locale}/staff`}>{t("navigation.backToDashboard")}</BackLink>
        </div>
      <div className="surface page-surface">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-4)'
          }}>
            <div>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))', margin: 0 }}>
                {t("title")}
              </h1>
              <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
                {t("subtitle")}
              </p>
            </div>
            {canManage && (
              <Link 
                href={`/${locale}/staff/vehicles/new`}
                className="btn btn-primary"
              >
                {t("actions.addVehicle")}
              </Link>
            )}
          </div>

          {/* Over-limit banner */}
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

          {/* Error State */}
          {error && (
            <div style={{ 
              padding: 'var(--space-4)',
              background: 'rgb(var(--error) / 0.1)',
              border: '1px solid rgb(var(--error) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--error))',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div style={{ 
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              {t("loading")}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && vehicles.length === 0 && (
            <div style={{ 
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              <p style={{ marginBottom: 'var(--space-4)' }}>
                {t("empty.noVehicles")}{canManage && t("empty.addFirstVehicle")}
              </p>
              {canManage && (
                <Link 
                  href={`/${locale}/staff/vehicles/new`}
                  className="btn btn-primary"
                >
                  {t("actions.addVehicle")}
                </Link>
              )}
            </div>
          )}

          {/* Vehicles List */}
          {!loading && !error && vehicles.length > 0 && (
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)'
            }}>
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="surface"
                  style={{
                    padding: 'var(--space-4)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap',
                    // Subtle tint for held vehicles
                    background: vehicle.operational_hold
                      ? 'rgb(var(--error) / 0.03)'
                      : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: '200px' }}>
                    {/* Vehicle Photo/Placeholder */}
                    {vehicle.photo_url ? (
                      <img
                        src={vehicle.photo_url}
                        alt={vehicle.name}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius)',
                          objectFit: 'cover',
                          flexShrink: 0,
                          opacity: vehicle.operational_hold ? 0.5 : 1,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius)',
                          background: 'rgb(var(--muted) / 0.2)',
                          border: '1px solid rgb(var(--border))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgb(var(--muted))"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      </div>
                    )}
                    
                    {/* Vehicle Details */}
                    <div style={{ flex: 1 }}>
                      <h3 style={{ 
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'rgb(var(--text))',
                        marginBottom: 'var(--space-1)'
                      }}>
                        {vehicle.name}
                      </h3>
                      <p style={{ 
                        fontSize: '14px',
                        color: 'rgb(var(--muted))'
                      }}>
                        {vehicle.registration_plate}
                      </p>
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap'
                  }}>
                    {/* Operational hold badge — shown prominently, before status chip */}
                    {vehicle.operational_hold && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius)',
                        background: 'rgb(var(--error) / 0.12)',
                        border: '1px solid rgb(var(--error) / 0.35)',
                        color: 'rgb(var(--error))',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 'min(280px, calc(100vw - 80px))',
                      }}>
                        {/* Stop-sign icon */}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        {vehicle.hold_reason
                          ? t("holdStatus.outOfServiceWithReason", { reason: vehicle.hold_reason })
                          : t("holdStatus.outOfService")}
                      </span>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgb(var(--muted))' }}>
                        Live vehicle status
                      </span>
                      <span style={getStatusChipStyle(vehicle.status)}>
                        {getStatusLabel(vehicle.status)}
                      </span>
                    </div>

                    {vehicle.blockingReason && !vehicle.operational_hold && (
                      <span style={{
                        fontSize: '13px',
                        color: 'rgb(var(--warning, var(--muted)))',
                        fontStyle: 'italic'
                      }}>
                        {vehicle.blockingReason}
                      </span>
                    )}

                    {vehicle.isExcess && (
                      <Link href={`/${locale}/staff/settings/billing`} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        background: 'rgb(var(--warning) / 0.12)',
                        border: '1px solid rgb(var(--warning) / 0.35)',
                        color: 'rgb(var(--warning))',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}>
                        {t("overLimitChip")}
                      </Link>
                    )}

                    <Link
                      href={`/${locale}/staff/vehicles/${vehicle.id}`}
                      className="btn btn-secondary"
                      style={{
                        padding: 'var(--space-2) var(--space-4)',
                        fontSize: '14px',
                        minHeight: '36px'
                      }}
                    >
                      {t("buttons.view")}
                    </Link>
                    {canManage && (
                      <Link
                        href={`/${locale}/staff/vehicles/${vehicle.id}/edit`}
                        className="btn btn-secondary"
                        style={{
                          padding: 'var(--space-2) var(--space-4)',
                          fontSize: '14px',
                          minHeight: '36px'
                        }}
                      >
                        {t("buttons.edit")}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </PageContainer>
  );
}