'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import PageContainer from '@/components/PageContainer';
import type { ChecklistScope, ChecklistStatus, ChecklistItem, IssueItem, ChecklistLabels } from '@/components/checklists/checklistListTypes';
import { ChecklistSection, OpenIssuesSection } from '@/components/checklists/ChecklistListComponents';

// ─── URL param helpers ────────────────────────────────────────────────────────

function parseScopeParam(value: string | null): ChecklistScope {
  if (value === 'booking' || value === 'vehicle') return value;
  return 'all';
}

function parseStatusParam(value: string | null): ChecklistStatus {
  if (value === 'not_started' || value === 'in_progress' || value === 'completed') return value;
  return 'all';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChecklistsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;

  const t = useTranslations('staff.checklistsPage');

  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState<boolean>(false);
  const [bookingChecklists, setBookingChecklists] = useState<ChecklistItem[]>([]);
  const [openIssues, setOpenIssues] = useState<IssueItem[]>([]);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [scopeFilter, setScopeFilter] = useState<ChecklistScope>(() =>
    parseScopeParam(searchParams.get('scope'))
  );
  const [statusFilter, setStatusFilter] = useState<ChecklistStatus>(() =>
    parseStatusParam(searchParams.get('status'))
  );

  // Keep filters in sync with URL changes (e.g. browser back/forward).
  useEffect(() => {
    setScopeFilter(parseScopeParam(searchParams.get('scope')));
    setStatusFilter(parseStatusParam(searchParams.get('status')));
  }, [searchParams]);

  // Responsive breakpoint detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ─── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const supabase = createClient();

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push(`/${locale}/staff/login`); return; }

      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('company_id, can_manage, role')
        .eq('auth_user_id', user.id)
        .single();

      if (profileError || !profile?.company_id) {
        console.error('Error fetching profile:', profileError);
        router.push(`/${locale}/staff/login`);
        return;
      }

      if (cancelled) return;

      const userCanManage = profile.can_manage === true || profile.role === 'admin';
      setCanManage(userCanManage);

      const companyId = profile.company_id;
      const status = statusFilter;

      // Booking checklists
      try {
        let ciQuery = supabase
          .from('checklist_instances')
          .select(
            'id, checklist_type, status, created_at, booking_id, template:checklist_templates!checklist_instances_template_id_fkey(name, title)'
          )
          .eq('company_id', companyId)
          .in('checklist_type', ['cleaning', 'pickup', 'return', 'guest_prereturn', 'handover', 'mechanical'])
          .not('booking_id', 'is', null);

        if (status !== 'all') {
          if (status === 'not_started') {
            ciQuery = ciQuery.in('status', ['not_started', 'pending']);
          } else {
            ciQuery = ciQuery.eq('status', status);
          }
        }

        const { data: ciRows, error: ciError } = await ciQuery;

        if (ciError) {
          console.error('Error fetching booking checklists:', ciError);
          if (!cancelled) setBookingChecklists([]);
        } else {
          const bookingIds = Array.from(
            new Set((ciRows || []).map((r: any) => r.booking_id).filter(Boolean))
          );

          const bookingsById = new Map<string, any>();
          const vehiclesById = new Map<string, any>();

          if (bookingIds.length > 0) {
            const { data: bookingRows, error: bookingError } = await supabase
              .from('bookings')
              .select('id, booking_number, customer_name, pickup_at, return_at, vehicle_id')
              .eq('company_id', companyId)
              .in('id', bookingIds);

            if (bookingError) {
              console.error('Error fetching bookings for checklists:', bookingError);
            } else {
              for (const b of bookingRows || []) bookingsById.set(b.id, b);

              const vehicleIds = Array.from(
                new Set((bookingRows || []).map((b: any) => b.vehicle_id).filter(Boolean))
              );

              if (vehicleIds.length > 0) {
                const { data: vehicleRows, error: vehicleError } = await supabase
                  .from('vehicles')
                  .select('id, name, registration_plate')
                  .eq('company_id', companyId)
                  .in('id', vehicleIds);

                if (vehicleError) {
                  console.error('Error fetching vehicles for checklists:', vehicleError);
                } else {
                  for (const v of vehicleRows || []) vehiclesById.set(v.id, v);
                }
              }
            }
          }

          const formatted: ChecklistItem[] = (ciRows || []).map((item: any) => {
            const booking = item.booking_id ? bookingsById.get(item.booking_id) : null;
            const vehicle = booking?.vehicle_id ? vehiclesById.get(booking.vehicle_id) : null;
            const normalizedStatus = item.status === 'pending' ? 'not_started' : item.status;
            console.log('CI STATUS RAW', item.id, item.status);
            return {
              id: item.id,
              name: item.checklist_type,
              type: item.checklist_type,
              template_name: item.template?.title ?? item.template?.name ?? undefined,
              status: normalizedStatus,
              booking_number: booking?.booking_number || 'N/A',
              customer_name: booking?.customer_name || 'N/A',
              vehicle_name: vehicle?.name || 'N/A',
              vehicle_plate: vehicle?.registration_plate || 'N/A',
              pickup_at: booking?.pickup_at || undefined,
              return_at: booking?.return_at || undefined,
              created_at: item.created_at,
            };
          });

          // Sort by operational next-action date:
          //   pickup / handover → pickup_at ASC
          //   all others (return, cleaning, mechanical, guest_prereturn) → return_at ASC
          // Fall back to the other date, then created_at when both are absent.
          const PICKUP_TYPES = new Set(['pickup', 'handover']);
          formatted.sort((a, b) => {
            const pickA = PICKUP_TYPES.has(a.type);
            const pickB = PICKUP_TYPES.has(b.type);
            const dateA = pickA
              ? (a.pickup_at ?? a.return_at ?? a.created_at)
              : (a.return_at ?? a.pickup_at ?? a.created_at);
            const dateB = pickB
              ? (b.pickup_at ?? b.return_at ?? b.created_at)
              : (b.return_at ?? b.pickup_at ?? b.created_at);
            return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
          });

          if (!cancelled) setBookingChecklists(formatted);
        }
      } catch (e) {
        console.error('Unexpected error fetching booking checklists:', e);
        if (!cancelled) setBookingChecklists([]);
      }

      // Open issues
      try {
        const { data: issueRows, error: issueError } = await supabase
          .from('issue_flags')
          .select('id, note, severity, status, created_at, checklist_instance_id')
          .eq('company_id', companyId)
          .eq('status', 'open')
          .order('created_at', { ascending: false });

        if (issueError) {
          console.error('Error fetching open issues:', issueError);
          if (!cancelled) setOpenIssues([]);
        } else {
          const issueInstanceIds = Array.from(
            new Set((issueRows || []).map((r: any) => r.checklist_instance_id).filter(Boolean))
          );

          const instancesById = new Map<string, any>();
          const bookingsById = new Map<string, any>();
          const vehiclesById = new Map<string, any>();

          if (issueInstanceIds.length > 0) {
            const { data: instanceRows, error: instanceError } = await supabase
              .from('checklist_instances')
              .select('id, company_id, booking_id')
              .eq('company_id', companyId)
              .in('id', issueInstanceIds);

            if (instanceError) {
              console.error('Error fetching checklist instances for issues:', instanceError);
            } else {
              for (const ci of instanceRows || []) instancesById.set(ci.id, ci);

              const bookingIds = Array.from(
                new Set((instanceRows || []).map((ci: any) => ci.booking_id).filter(Boolean))
              );

              if (bookingIds.length > 0) {
                const { data: bookingRows, error: bookingError } = await supabase
                  .from('bookings')
                  .select('id, booking_number, vehicle_id')
                  .eq('company_id', companyId)
                  .in('id', bookingIds);

                if (bookingError) {
                  console.error('Error fetching bookings for issues:', bookingError);
                } else {
                  for (const b of bookingRows || []) bookingsById.set(b.id, b);

                  const vehicleIds = Array.from(
                    new Set((bookingRows || []).map((b: any) => b.vehicle_id).filter(Boolean))
                  );

                  if (vehicleIds.length > 0) {
                    const { data: vehicleRows, error: vehicleError } = await supabase
                      .from('vehicles')
                      .select('id, name, registration_plate')
                      .eq('company_id', companyId)
                      .in('id', vehicleIds);

                    if (vehicleError) {
                      console.error('Error fetching vehicles for issues:', vehicleError);
                    } else {
                      for (const v of vehicleRows || []) vehiclesById.set(v.id, v);
                    }
                  }
                }
              }
            }
          }

          const scopedIssues = (issueRows || []).filter((it: any) =>
            it.checklist_instance_id && instancesById.has(it.checklist_instance_id)
          );

          const formattedIssues: IssueItem[] = scopedIssues.map((item: any) => {
            const instance = instancesById.get(item.checklist_instance_id);
            const booking = instance?.booking_id ? bookingsById.get(instance.booking_id) : null;
            const vehicle = booking?.vehicle_id ? vehiclesById.get(booking.vehicle_id) : null;
            return {
              id: item.id,
              checklist_instance_id: item.checklist_instance_id,
              name: item.note || 'Issue',
              severity: item.severity,
              status: item.status,
              booking_number: booking?.booking_number || 'N/A',
              vehicle_name: vehicle?.name || 'N/A',
              vehicle_plate: vehicle?.registration_plate || 'N/A',
              created_at: item.created_at,
            };
          });

          if (!cancelled) setOpenIssues(formattedIssues);
        }
      } catch (e) {
        console.error('Unexpected error fetching open issues:', e);
        if (!cancelled) setOpenIssues([]);
      }

      if (!cancelled) setLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [locale, router, statusFilter]);

  // ─── Label helpers (i18n, built once per render) ────────────────────────────

  const labels: ChecklistLabels = {
    typeLabel: (type: string) => {
      const map: Record<string, string> = {
        cleaning:          t('checklistTypes.cleaning'),
        pickup:            t('checklistTypes.pickup'),
        handover:          t('checklistTypes.pickup'),
        return:            t('checklistTypes.return'),
        guest_prereturn:   t('checklistTypes.guest_prereturn'),
        vehicle_readiness: t('checklistTypes.vehicle_readiness'),
        maintenance:       t('checklistTypes.maintenance'),
        mechanical:        'Mechanical Checklist',
      };
      return map[type] ?? type;
    },
    statusLabel: (s: string) => {
      const map: Record<string, string> = {
        not_started: t('status.not_started'),
        pending:     t('status.not_started'),
        in_progress: t('status.in_progress'),
        completed:   t('status.completed'),
      };
      return map[s] ?? s;
    },
    severityLabel: (s: string) => {
      const map: Record<string, string> = {
        low:    t('severity.low'),
        medium: t('severity.medium'),
        high:   t('severity.high'),
      };
      return map[s] ?? s;
    },
    fmtDate: (iso: string) =>
      new Date(iso).toLocaleDateString(params.locale as string, {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
    bookingRef: (num: string) => t('bookingRef', { number: num }),
  };

  const checklistHeaders = {
    type:     t('table.type'),
    name:     t('table.name'),
    booking:  t('table.booking'),
    customer: t('table.customer'),
    vehicle:  t('table.vehicle'),
    dates:    t('table.dates'),
    status:   t('table.status'),
  };

  const issueHeaders = {
    issue:    t('table.issue'),
    booking:  t('table.booking'),
    vehicle:  t('table.vehicle'),
    severity: t('table.severity'),
  };

  // ─── Derived display values ─────────────────────────────────────────────────

  const displayBookingChecklists =
    scopeFilter === 'vehicle' ? [] : bookingChecklists;
  const displayOpenIssues = openIssues;

  const notStarted = displayBookingChecklists.filter((c) => c.status === 'not_started');
  const inProgress  = displayBookingChecklists.filter((c) => c.status === 'in_progress');
  const completed   = displayBookingChecklists.filter((c) => c.status === 'completed');

  const handleScopeChange  = (v: ChecklistScope)  => { setScopeFilter(v);  router.push(`/${locale}/staff/checklists?scope=${v}&status=${statusFilter}`); };
  const handleStatusChange = (v: ChecklistStatus) => { setStatusFilter(v); router.push(`/${locale}/staff/checklists?scope=${scopeFilter}&status=${v}`); };

  // Builds detail URL, forwarding current filter state for back-navigation.
  const detailHref      = (id: string) => `/${locale}/staff/checklists/${id}?listScope=${scopeFilter}&listStatus=${statusFilter}`;
  const issueDetailHref = (id: string) => `/${locale}/staff/checklists/${id}?from=list&listScope=${scopeFilter}&listStatus=${statusFilter}`;

  const showBooking = scopeFilter === 'all' || scopeFilter === 'booking';
  const showVehicle = scopeFilter === 'all' || scopeFilter === 'vehicle';
  const showIssues  = scopeFilter === 'all' && displayOpenIssues.length > 0;

  const noBookingResults =
    showBooking &&
    notStarted.length === 0 &&
    inProgress.length === 0 &&
    completed.length === 0;

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>
            {t('loading')}
          </div>
        </div>
      </PageContainer>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* ── Page header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div>
              <Link
                href={`/${locale}/staff`}
                style={{ display: 'inline-block', fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none', marginBottom: 'var(--space-2)' }}
              >
                {t('backToDashboard')}
              </Link>
              <h1 style={{ fontSize: '28px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
                {t('title')}
              </h1>
              <p style={{ margin: 'var(--space-2) 0 0 0', color: 'rgb(var(--muted))', fontSize: '14px' }}>
                {t('subtitle')}
              </p>
            </div>

            {canManage && (
              <Link href={`/${locale}/staff/checklists/templates`} className="btn btn-primary">
                {t('manageTemplates')}
              </Link>
            )}
          </div>

          {/* ── Filters ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid rgb(var(--border))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label htmlFor="scope-filter" style={{ fontSize: '14px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}>
                {t('filters.scope')}
              </label>
              <select
                id="scope-filter"
                className="input"
                style={{ minHeight: '36px', padding: 'var(--space-2) var(--space-3)', width: 'auto' }}
                value={scopeFilter}
                onChange={(e) => handleScopeChange(e.target.value as ChecklistScope)}
              >
                <option value="all">{t('scope.all')}</option>
                <option value="booking">{t('scope.booking')}</option>
                <option value="vehicle">{t('scope.vehicle')}</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label htmlFor="status-filter" style={{ fontSize: '14px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}>
                {t('filters.status')}
              </label>
              <select
                id="status-filter"
                className="input"
                style={{ minHeight: '36px', padding: 'var(--space-2) var(--space-3)', width: 'auto' }}
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value as ChecklistStatus)}
              >
                <option value="all">{t('status.all')}</option>
                <option value="not_started">{t('status.not_started')}</option>
                <option value="in_progress">{t('status.in_progress')}</option>
                <option value="completed">{t('status.completed')}</option>
              </select>
            </div>
          </div>

          {/* ── Booking checklist sections ── */}
          {showBooking && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {noBookingResults ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))', fontSize: '14px' }}>
                  {t('empty.bookingChecklists')}
                </div>
              ) : (
                <>
                  <ChecklistSection
                    title={t('sections.notStarted')}
                    items={notStarted}
                    isMobile={isMobile}
                    headers={checklistHeaders}
                    labels={labels}
                    getHref={detailHref}
                  />
                  <ChecklistSection
                    title={t('sections.inProgress')}
                    items={inProgress}
                    isMobile={isMobile}
                    headers={checklistHeaders}
                    labels={labels}
                    getHref={detailHref}
                  />
                  <ChecklistSection
                    title={t('sections.completed')}
                    items={completed}
                    isMobile={isMobile}
                    collapsible
                    collapsed={completedCollapsed}
                    onToggle={() => setCompletedCollapsed(!completedCollapsed)}
                    headers={checklistHeaders}
                    labels={labels}
                    getHref={detailHref}
                  />
                </>
              )}
            </div>
          )}

          {/* ── Vehicle checklists placeholder ── */}
          {showVehicle && (
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))', margin: '0 0 var(--space-3) 0' }}>
                {t('sections.vehicleChecklists')}
              </h2>
              <div style={{ padding: 'var(--space-4)', background: 'rgb(var(--background) / 0.5)', border: '1px solid rgb(var(--border))', borderLeft: '3px solid rgb(var(--brand))', borderRadius: 'var(--radius)' }}>
                <p style={{ margin: 0, color: 'rgb(var(--muted))', fontSize: '14px' }}>
                  {t('empty.vehicleChecklists')}
                </p>
              </div>
            </div>
          )}

          {/* ── Open issues ── */}
          {showIssues && (
            <OpenIssuesSection
              title={t('sections.openIssues', { count: displayOpenIssues.length })}
              issues={displayOpenIssues}
              isMobile={isMobile}
              headers={issueHeaders}
              labels={labels}
              getHref={issueDetailHref}
            />
          )}

        </div>
      </div>
    </PageContainer>
  );
}
