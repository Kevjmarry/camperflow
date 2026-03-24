// app/[locale]/staff/vehicles/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getStatusChipStyle } from "@/lib/statusChip";

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
}

export default function VehiclesPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffVehicles");
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        .select('role, can_manage')
        .eq('auth_user_id', user.id)
        .maybeSingle();

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
      const preparingIds = vehicleList.filter(v => v.status === 'preparing').map(v => v.id);
      const readyIds     = vehicleList.filter(v => v.status === 'ready').map(v => v.id);

      if (preparingIds.length === 0 && readyIds.length === 0) {
        setVehicles(vehicleList);
        return;
      }

      // ── Block A: enrichment queries for already-preparing vehicles ──────────
      let issues:     any[] = [];
      let compliance: any[] = [];
      let checklists: any[] = [];

      if (preparingIds.length > 0) {
        const today = new Date().toISOString().split('T')[0];

        const [r1, r2, r3] = await Promise.all([
          // 1. Open unresolved vehicle issues
          supabase
            .from('vehicle_issues')
            .select('vehicle_id')
            .in('vehicle_id', preparingIds)
            .eq('resolved', false),
          // 2. Expired blocking compliance
          supabase
            .from('vehicle_compliance')
            .select('vehicle_id, compliance_types!inner(name, slug, is_system, blocks_readiness)')
            .in('vehicle_id', preparingIds)
            .eq('compliance_types.blocks_readiness', true)
            .lte('expiry_date', today),
          // 3. Incomplete booking-linked checklist instances
          supabase
            .from('checklist_instances')
            .select('bookings!inner(vehicle_id)')
            .in('bookings.vehicle_id', preparingIds)
            .neq('status', 'completed'),
        ]);

        issues     = r1.data || [];
        compliance = r2.data || [];
        checklists = r3.data || [];
      }

      // ── Block B: checklist checks for ready vehicles ─────────────────────────
      // 1. Vehicle-scope instances (booking_id IS NULL, in_progress).
      // 2. Booking-linked cleaning/mechanical instances not yet completed.
      const vehicleScopeBlockers = new Set<string>();
      const postReturnBlockers    = new Set<string>();

      if (readyIds.length > 0) {
        const [vscResult, postReturnResult] = await Promise.all([
          supabase
            .from('checklist_instances')
            .select('vehicle_id, status')
            .in('vehicle_id', readyIds)
            .is('booking_id', null)
            .eq('status', 'in_progress'),
          supabase
            .from('checklist_instances')
            .select('checklist_type, bookings!inner(vehicle_id)')
            .in('bookings.vehicle_id', readyIds)
            .in('checklist_type', ['cleaning', 'mechanical'])
            .neq('status', 'completed'),
        ]);

        if (vscResult.error) {
          console.error('[VehiclesPage] vehicle-scope checklist query failed:', vscResult.error);
        }
        for (const r of (vscResult.data || []) as any[]) {
          if (r.vehicle_id && r.status === 'in_progress') {
            vehicleScopeBlockers.add(r.vehicle_id);
          }
        }

        if (postReturnResult.error) {
          console.error('[VehiclesPage] post-return checklist query failed:', postReturnResult.error);
        }
        for (const r of (postReturnResult.data || []) as any[]) {
          const vid = r.bookings?.vehicle_id;
          if (vid) postReturnBlockers.add(vid);
        }
      }

      // ── Build enriched list ─────────────────────────────────────────────────
      const issueSet = new Set(issues.map((r: any) => r.vehicle_id));

      const complianceNameByVehicle = new Map<string, string>();
      for (const r of compliance as any[]) {
        if (r.vehicle_id && r.compliance_types?.name && !complianceNameByVehicle.has(r.vehicle_id)) {
          complianceNameByVehicle.set(r.vehicle_id, r.compliance_types.name);
        }
      }

      const bookingChecklistSet = new Set(
        checklists.map((r: any) => r.bookings?.vehicle_id).filter(Boolean)
      );

      const withReasons = vehicleList.map(v => {
        // Override ready → preparing when a vehicle-scope checklist is incomplete
        // or when booking-linked cleaning/mechanical checklists are not yet completed
        if (v.status === 'ready' && (vehicleScopeBlockers.has(v.id) || postReturnBlockers.has(v.id))) {
          return {
            ...v,
            status: 'preparing' as const,
            blockingReason: t("blockingReason.checklistIncomplete"),
          };
        }
        if (v.status !== 'preparing') return v;
        let blockingReason = '';
        if (issueSet.has(v.id)) {
          blockingReason = t("blockingReason.openIssue");
        } else {
          const complianceName = complianceNameByVehicle.get(v.id);
          if (complianceName !== undefined) {
            blockingReason = t("blockingReason.expiredComplianceWithName", { name: complianceName });
          } else if (bookingChecklistSet.has(v.id)) {
            blockingReason = t("blockingReason.checklistIncomplete");
          }
        }
        return { ...v, blockingReason };
      });

      setVehicles(withReasons);
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
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
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
              <Link 
                href={`/${locale}/staff`}
                style={{
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                  display: 'inline-block'
                }}
              >
                {t("navigation.backToDashboard")}
              </Link>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
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

                    <span style={getStatusChipStyle(vehicle.status)}>
                      {getStatusLabel(vehicle.status)}
                    </span>

                    {vehicle.status === 'preparing' && vehicle.blockingReason && !vehicle.operational_hold && (
                      <span style={{
                        fontSize: '13px',
                        color: 'rgb(var(--warning, var(--muted)))',
                        fontStyle: 'italic'
                      }}>
                        {vehicle.blockingReason}
                      </span>
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
    </PageContainer>
  );
}