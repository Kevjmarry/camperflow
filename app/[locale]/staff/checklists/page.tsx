'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import PageContainer from '@/components/PageContainer';

type ChecklistScope = 'all' | 'booking' | 'vehicle';
type ChecklistStatus = 'all' | 'not_started' | 'in_progress' | 'completed';

interface ChecklistItem {
  id: string;
  name: string;
  type: string;
  status: string;
  booking_number: string;
  customer_name: string;
  vehicle_name: string;
  vehicle_plate: string;
  pickup_at?: string;
  return_at?: string;
  created_at: string;
}

interface IssueItem {
  id: string;
  checklist_instance_id: string;
  name: string;
  severity: string;
  status: string;
  booking_number: string;
  vehicle_name: string;
  vehicle_plate: string;
  created_at: string;
}

// ─── Chip style helpers ───────────────────────────────────────────────────────

type ChipColors = { color: string; background: string; border: string };

const chipTokens: Record<string, ChipColors> = {
  success: {
    color: 'rgb(var(--success))',
    background: 'rgb(var(--success) / 0.12)',
    border: '1px solid rgb(var(--success) / 0.3)',
  },
  warning: {
    color: 'rgb(var(--warning))',
    background: 'rgb(var(--warning) / 0.12)',
    border: '1px solid rgb(var(--warning) / 0.3)',
  },
  error: {
    color: 'rgb(var(--error))',
    background: 'rgb(var(--error) / 0.12)',
    border: '1px solid rgb(var(--error) / 0.3)',
  },
  muted: {
    color: 'rgb(var(--muted))',
    background: 'rgb(var(--muted) / 0.12)',
    border: '1px solid rgb(var(--muted) / 0.3)',
  },
};

const baseChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: '9999px',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '1.5',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const getStatusChipStyle = (status: string): CSSProperties => {
  const map: Record<string, ChipColors> = {
    not_started: chipTokens.muted,
    pending:     chipTokens.muted,
    in_progress: chipTokens.warning,
    completed:   chipTokens.success,
  };
  return { ...baseChip, ...(map[status] ?? chipTokens.muted) };
};

const getSeverityChipStyle = (severity: string): CSSProperties => {
  const map: Record<string, ChipColors> = {
    low:    chipTokens.muted,
    medium: chipTokens.warning,
    high:   chipTokens.error,
  };
  return { ...baseChip, ...(map[severity] ?? chipTokens.muted) };
};

// ─── Shared table style tokens ───────────────────────────────────────────────

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  border: '1px solid rgb(var(--border))',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const TH: CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: 'rgb(var(--muted))',
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: '1px solid rgb(var(--border))',
  whiteSpace: 'nowrap' as const,
  background: 'rgb(var(--background))',
};

const TD: CSSProperties = {
  padding: 'var(--space-3)',
  fontSize: '14px',
  color: 'rgb(var(--text))',
  verticalAlign: 'middle' as const,
  borderBottom: '1px solid rgb(var(--border))',
};

const TD_MUTED: CSSProperties = {
  ...TD,
  color: 'rgb(var(--muted))',
  fontSize: '13px',
};

const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

const CARD_CONTAINER: CSSProperties = {
  border: '1px solid rgb(var(--border))',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseScopeParam(value: string | null): ChecklistScope {
  if (value === 'booking' || value === 'vehicle') return value;
  return 'all';
}

function parseStatusParam(value: string | null): ChecklistStatus {
  if (value === 'not_started' || value === 'in_progress' || value === 'completed') return value;
  return 'all';
}

// ─── Main component ──────────────────────────────────────────────────────────

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

  // Initialise directly from searchParams so the very first render uses the
  // correct values. When no query params are present (e.g. after navigating
  // back from a detail page via a plain href), the helpers fall back to 'all'.
  const [scopeFilter, setScopeFilter] = useState<ChecklistScope>(() =>
    parseScopeParam(searchParams.get('scope'))
  );
  const [statusFilter, setStatusFilter] = useState<ChecklistStatus>(() =>
    parseStatusParam(searchParams.get('status'))
  );

  const typeLabel = (type: string): string => {
    const map: Record<string, string> = {
      cleaning: t('checklistTypes.cleaning'),
      pickup: t('checklistTypes.pickup'),
      handover: t('checklistTypes.pickup'),
      return: t('checklistTypes.return'),
      guest_prereturn: t('checklistTypes.guest_prereturn'),
      vehicle_readiness: t('checklistTypes.vehicle_readiness'),
      maintenance: t('checklistTypes.maintenance'),
    };
    return map[type] ?? type;
  };

  const statusLabel = (s: string): string => {
    const map: Record<string, string> = {
      not_started: t('status.not_started'),
      pending: t('status.not_started'),
      in_progress: t('status.in_progress'),
      completed: t('status.completed'),
    };
    return map[s] ?? s;
  };

  const severityLabel = (s: string): string => {
    const map: Record<string, string> = {
      low: t('severity.low'),
      medium: t('severity.medium'),
      high: t('severity.high'),
    };
    return map[s] ?? s;
  };

  // Keep filters in sync with URL changes (e.g. browser back/forward).
  // Using the same parse helpers guarantees missing params always resolve to
  // 'all' rather than inheriting a previously active filter value.
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

  const status = statusFilter;

  // ─── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push(`/${locale}/staff/login`);
        return;
      }

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

      // Booking checklists
      try {
        let ciQuery = supabase
          .from('checklist_instances')
          .select('id, checklist_type, status, created_at, booking_id')
          .eq('company_id', companyId)
          .in('checklist_type', ['cleaning', 'pickup', 'return', 'guest_prereturn', 'handover'])
          .not('booking_id', 'is', null)
          .order('created_at', { ascending: false });

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

          const scopedIssues = (issueRows || []).filter((it: any) => {
            return it.checklist_instance_id && instancesById.has(it.checklist_instance_id);
          });

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
  }, [locale, router, status]);

  // ─── Derived display values ──────────────────────────────────────────────────

  let displayBookingChecklists = bookingChecklists;
  let displayOpenIssues = openIssues;

  if (scopeFilter === 'booking') {
    // already filtered to booking types
  } else if (scopeFilter === 'vehicle') {
    displayBookingChecklists = [];
  }

  const notStarted = displayBookingChecklists.filter((c) => c.status === 'not_started');
  const inProgress  = displayBookingChecklists.filter((c) => c.status === 'in_progress');
  const completed   = displayBookingChecklists.filter((c) => c.status === 'completed');

  const handleScopeChange = (newScope: ChecklistScope) => {
    setScopeFilter(newScope);
    router.push(`/${locale}/staff/checklists?scope=${newScope}&status=${statusFilter}`);
  };

  const handleStatusChange = (newStatus: ChecklistStatus) => {
    setStatusFilter(newStatus);
    router.push(`/${locale}/staff/checklists?scope=${scopeFilter}&status=${newStatus}`);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  // Builds the detail page URL, forwarding current filter state so the
  // detail page can restore them when the user clicks "Back to checklists".
  const detailHref = (instanceId: string) =>
    `/${locale}/staff/checklists/${instanceId}?listScope=${scopeFilter}&listStatus=${statusFilter}`;

  const issueDetailHref = (instanceId: string) =>
    `/${locale}/staff/checklists/${instanceId}?from=list&listScope=${scopeFilter}&listStatus=${statusFilter}`;

  // ─── Loading state ───────────────────────────────────────────────────────────

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

  // ─── Sub-components (defined inside render to access locale/router/isMobile) ─

  function ChecklistTableRow({ checklist }: { checklist: ChecklistItem }) {
    return (
      <tr
        style={{ cursor: 'pointer' }}
        onClick={() => router.push(detailHref(checklist.id))}
      >
        <td style={TD}>
          <span style={{ fontWeight: 500 }}>{typeLabel(checklist.name)}</span>
        </td>
        <td style={TD}>{checklist.booking_number}</td>
        <td style={TD}>{checklist.customer_name}</td>
        <td style={TD}>
          <div>{checklist.vehicle_name}</div>
          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{checklist.vehicle_plate}</div>
        </td>
        <td style={TD_MUTED}>
          {checklist.pickup_at && checklist.return_at
            ? `${fmtDate(checklist.pickup_at)} → ${fmtDate(checklist.return_at)}`
            : '—'}
        </td>
        <td style={TD}>
          <span style={getStatusChipStyle(checklist.status)}>
            {statusLabel(checklist.status)}
          </span>
        </td>
      </tr>
    );
  }

  function ChecklistMobileCard({ checklist, isLast }: { checklist: ChecklistItem; isLast: boolean }) {
    return (
      <Link
        href={detailHref(checklist.id)}
        style={{
          display: 'block',
          padding: 'var(--space-4)',
          borderBottom: isLast ? 'none' : '1px solid rgb(var(--border))',
          textDecoration: 'none',
          color: 'rgb(var(--text))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>
            {typeLabel(checklist.name)}
            <span style={{ fontWeight: 400, fontSize: '13px', color: 'rgb(var(--muted))', marginLeft: 'var(--space-2)' }}>
              #{checklist.booking_number}
            </span>
          </span>
          <span style={getStatusChipStyle(checklist.status)}>
            {statusLabel(checklist.status)}
          </span>
        </div>
        <div style={{ fontSize: '14px', marginBottom: '2px' }}>{checklist.customer_name}</div>
        <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
          {checklist.vehicle_name} · {checklist.vehicle_plate}
        </div>
        {checklist.pickup_at && checklist.return_at && (
          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
            {fmtDate(checklist.pickup_at)} → {fmtDate(checklist.return_at)}
          </div>
        )}
      </Link>
    );
  }

  function IssueTableRow({ issue }: { issue: IssueItem }) {
    return (
      <tr
        style={{ cursor: 'pointer' }}
        onClick={() => router.push(issueDetailHref(issue.checklist_instance_id))}
      >
        <td style={{ ...TD, borderLeft: '3px solid rgb(var(--warning))' }}>
          <span style={{ fontWeight: 500 }}>{issue.name}</span>
        </td>
        <td style={TD}>{issue.booking_number !== 'N/A' ? issue.booking_number : '—'}</td>
        <td style={TD}>
          <div>{issue.vehicle_name}</div>
          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{issue.vehicle_plate}</div>
        </td>
        <td style={TD}>
          <span style={getSeverityChipStyle(issue.severity)}>{severityLabel(issue.severity)}</span>
        </td>
      </tr>
    );
  }

  function IssueMobileCard({ issue, isLast }: { issue: IssueItem; isLast: boolean }) {
    return (
      <Link
        href={issueDetailHref(issue.checklist_instance_id)}
        style={{
          display: 'block',
          padding: 'var(--space-4)',
          borderBottom: isLast ? 'none' : '1px solid rgb(var(--border))',
          borderLeft: '3px solid rgb(var(--warning))',
          textDecoration: 'none',
          color: 'rgb(var(--text))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>{issue.name}</span>
          <span style={getSeverityChipStyle(issue.severity)}>{severityLabel(issue.severity)}</span>
        </div>
        {issue.booking_number !== 'N/A' && (
          <div style={{ fontSize: '14px', marginBottom: '2px' }}>{t('bookingRef', { number: issue.booking_number })}</div>
        )}
        <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
          {issue.vehicle_name} · {issue.vehicle_plate}
        </div>
      </Link>
    );
  }

  function ChecklistSection({
    title,
    items,
    collapsible,
    collapsed,
    onToggle,
  }: {
    title: string;
    items: ChecklistItem[];
    collapsible?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
  }) {
    if (items.length === 0) return null;
    const isOpen = !collapsible || !collapsed;

    return (
      <div>
        <h2
          style={{
            ...SECTION_HEADING,
            ...(collapsible
              ? { cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }
              : {}),
          }}
          onClick={collapsible ? onToggle : undefined}
        >
          {title} ({items.length})
          {collapsible && (
            <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
              {isOpen ? '▾' : '▸'}
            </span>
          )}
        </h2>

        {isOpen && (
          <>
            {/* Desktop: <table> */}
            {!isMobile && (
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={TH}>{t('table.type')}</th>
                    <th style={TH}>{t('table.booking')}</th>
                    <th style={TH}>{t('table.customer')}</th>
                    <th style={TH}>{t('table.vehicle')}</th>
                    <th style={TH}>{t('table.dates')}</th>
                    <th style={TH}>{t('table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => <ChecklistTableRow key={c.id} checklist={c} />)}
                </tbody>
              </table>
            )}

            {/* Mobile: stacked cards */}
            {isMobile && (
              <div style={CARD_CONTAINER}>
                {items.map((c, idx) => (
                  <ChecklistMobileCard
                    key={c.id}
                    checklist={c}
                    isLast={idx === items.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Display flags ───────────────────────────────────────────────────────────

  const showBooking = scopeFilter === 'all' || scopeFilter === 'booking';
  const showVehicle = scopeFilter === 'all' || scopeFilter === 'vehicle';
  const showIssues  = scopeFilter === 'all' && displayOpenIssues.length > 0;

  const noBookingResults =
    showBooking &&
    notStarted.length === 0 &&
    inProgress.length === 0 &&
    completed.length === 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* ── Page header ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Link
                href={`/${locale}/staff`}
                style={{
                  display: 'inline-block',
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {t('backToDashboard')}
              </Link>
              <h1
                style={{
                  fontSize: '28px',
                  fontWeight: 600,
                  color: 'rgb(var(--text))',
                  margin: 0,
                }}
              >
                {t('title')}
              </h1>
              <p
                style={{
                  margin: 'var(--space-2) 0 0 0',
                  color: 'rgb(var(--muted))',
                  fontSize: '14px',
                }}
              >
                {t('subtitle')}
              </p>
            </div>

            {canManage && (
              <Link
                href={`/${locale}/staff/checklists/templates`}
                className="btn btn-primary"
              >
                {t('manageTemplates')}
              </Link>
            )}
          </div>

          {/* ── Filters ── */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
              paddingBottom: 'var(--space-4)',
              borderBottom: '1px solid rgb(var(--border))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label
                htmlFor="scope-filter"
                style={{ fontSize: '14px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}
              >
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
              <label
                htmlFor="status-filter"
                style={{ fontSize: '14px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}
              >
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
                <div
                  style={{
                    textAlign: 'center',
                    padding: 'var(--space-8)',
                    color: 'rgb(var(--muted))',
                    fontSize: '14px',
                  }}
                >
                  {t('empty.bookingChecklists')}
                </div>
              ) : (
                <>
                  <ChecklistSection title={t('sections.notStarted')} items={notStarted} />
                  <ChecklistSection title={t('sections.inProgress')} items={inProgress} />
                  <ChecklistSection
                    title={t('sections.completed')}
                    items={completed}
                    collapsible
                    collapsed={completedCollapsed}
                    onToggle={() => setCompletedCollapsed(!completedCollapsed)}
                  />
                </>
              )}
            </div>
          )}

          {/* ── Vehicle checklists placeholder ── */}
          {showVehicle && (
            <div>
              <h2 style={SECTION_HEADING}>{t('sections.vehicleChecklists')}</h2>
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: 'rgb(var(--background) / 0.5)',
                  border: '1px solid rgb(var(--border))',
                  borderLeft: '3px solid rgb(var(--brand))',
                  borderRadius: 'var(--radius)',
                }}
              >
                <p style={{ margin: 0, color: 'rgb(var(--muted))', fontSize: '14px' }}>
                  {t('empty.vehicleChecklists')}
                </p>
              </div>
            </div>
          )}

          {/* ── Open issues ── */}
          {showIssues && (
            <div>
              <h2 style={SECTION_HEADING}>{t('sections.openIssues', { count: displayOpenIssues.length })}</h2>

              {/* Desktop: <table> */}
              {!isMobile && (
                <table style={TABLE_STYLE}>
                  <thead>
                    <tr>
                      <th style={TH}>{t('table.issue')}</th>
                      <th style={TH}>{t('table.booking')}</th>
                      <th style={TH}>{t('table.vehicle')}</th>
                      <th style={TH}>{t('table.severity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayOpenIssues.map((issue) => (
                      <IssueTableRow key={issue.id} issue={issue} />
                    ))}
                  </tbody>
                </table>
              )}

              {/* Mobile: stacked cards */}
              {isMobile && (
                <div style={CARD_CONTAINER}>
                  {displayOpenIssues.map((issue, idx) => (
                    <IssueMobileCard
                      key={issue.id}
                      issue={issue}
                      isLast={idx === displayOpenIssues.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </PageContainer>
  );
}