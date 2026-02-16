'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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

function getChecklistTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cleaning: 'Cleaning',
    pickup: 'Pickup',
    return: 'Return',
    guest_prereturn: 'Guest Pre-Return',
    vehicle_readiness: 'Vehicle Readiness',
    maintenance: 'Maintenance',
  };
  return labels[type] || type;
}

export default function ChecklistsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;

  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState<boolean>(false);
  const [bookingChecklists, setBookingChecklists] = useState<ChecklistItem[]>([]);
  const [openIssues, setOpenIssues] = useState<IssueItem[]>([]);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  const [scopeFilter, setScopeFilter] = useState<ChecklistScope>('all');
  const [statusFilter, setStatusFilter] = useState<ChecklistStatus>('all');

  useEffect(() => {
    const scope = (searchParams.get('scope') as ChecklistScope) || 'all';
    const status = (searchParams.get('status') as ChecklistStatus) || 'all';
    setScopeFilter(scope);
    setStatusFilter(status);
  }, [searchParams]);

  const status = statusFilter;

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

      // Check if user can manage (admin or can_manage flag)
      const userCanManage = profile.can_manage === true || profile.role === 'admin';
      setCanManage(userCanManage);

      const companyId = profile.company_id;

      // Booking checklists
      try {
        let ciQuery = supabase
          .from('checklist_instances')
          .select('id, checklist_type, status, created_at, booking_id')
          .eq('company_id', companyId)
          .in('checklist_type', ['cleaning', 'pickup', 'return', 'guest_prereturn'])
          .not('booking_id', 'is', null)
          .order('created_at', { ascending: false });

        if (status !== 'all') {
          ciQuery = ciQuery.eq('status', status);
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

            return {
              id: item.id,
              name: getChecklistTypeLabel(item.checklist_type),
              type: item.checklist_type,
              status: item.status,
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

    return () => {
      cancelled = true;
    };
  }, [locale, router, status]);

  let displayBookingChecklists = bookingChecklists;
  let displayOpenIssues = openIssues;

  if (scopeFilter === 'booking') {
    // Already filtered to booking types
  } else if (scopeFilter === 'vehicle') {
    displayBookingChecklists = [];
  }

  const notStarted = displayBookingChecklists.filter((c) => c.status === 'not_started');
  const inProgress = displayBookingChecklists.filter((c) => c.status === 'in_progress');
  const completed = displayBookingChecklists.filter((c) => c.status === 'completed');

  const handleScopeChange = (newScope: ChecklistScope) => {
    setScopeFilter(newScope);
    router.push(`/${locale}/staff/checklists?scope=${newScope}&status=${statusFilter}`);
  };

  const handleStatusChange = (newStatus: ChecklistStatus) => {
    setStatusFilter(newStatus);
    router.push(`/${locale}/staff/checklists?scope=${scopeFilter}&status=${newStatus}`);
  };

  if (loading) {
    return (
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>
            Loading...
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="1200px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        {/* Header */}
        <div className="page-header">
          <div>
            <Link href={`/${locale}/staff`} className="back-link">
              ← Back to Dashboard
            </Link>
            <h1>Checklists</h1>
            <p className="subtitle">Manage pickup, return, and cleaning checklists</p>
          </div>
          {canManage && (
            <Link href={`/${locale}/staff/checklists/templates`} className="btn btn-primary">
              Manage Default Checklists
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="filters">
          <div className="filter-item">
            <label htmlFor="scope-filter">Scope:</label>
            <select
              id="scope-filter"
              className="input"
              value={scopeFilter}
              onChange={(e) => handleScopeChange(e.target.value as ChecklistScope)}
            >
              <option value="all">All</option>
              <option value="booking">Booking</option>
              <option value="vehicle">Vehicle</option>
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="status-filter">Status:</label>
            <select
              id="status-filter"
              className="input"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as ChecklistStatus)}
            >
              <option value="all">All</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Results */}
        {(scopeFilter === 'all' || scopeFilter === 'booking') && (
          <div className="results-section">
            {displayBookingChecklists.length === 0 ? (
              <div className="empty-state">No booking checklists found.</div>
            ) : (
              <>
                {notStarted.length > 0 && (
                  <div className="group">
                    <h2 className="group-heading">Not Started</h2>
                    <div className="list-container">
                      {notStarted.map((checklist) => (
                        <Link
                          key={checklist.id}
                          href={`/${locale}/staff/checklists/${checklist.id}`}
                          className="list-row"
                        >
                          <div className="row-header">
                            <span className="row-title">
                              {checklist.name} · {checklist.booking_number}
                            </span>
                            <span className="badge badge-not-started">Not Started</span>
                          </div>
                          <div className="row-line">{checklist.customer_name}</div>
                          <div className="row-line row-muted">
                            {checklist.vehicle_name} ({checklist.vehicle_plate})
                          </div>
                          {checklist.pickup_at && checklist.return_at && (
                            <div className="row-line row-muted row-small">
                              {new Date(checklist.pickup_at).toLocaleDateString()} →{' '}
                              {new Date(checklist.return_at).toLocaleDateString()}
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {inProgress.length > 0 && (
                  <div className="group">
                    <h2 className="group-heading">In Progress</h2>
                    <div className="list-container">
                      {inProgress.map((checklist) => (
                        <Link
                          key={checklist.id}
                          href={`/${locale}/staff/checklists/${checklist.id}`}
                          className="list-row"
                        >
                          <div className="row-header">
                            <span className="row-title">
                              {checklist.name} · {checklist.booking_number}
                            </span>
                            <span className="badge badge-in-progress">In Progress</span>
                          </div>
                          <div className="row-line">{checklist.customer_name}</div>
                          <div className="row-line row-muted">
                            {checklist.vehicle_name} ({checklist.vehicle_plate})
                          </div>
                          {checklist.pickup_at && checklist.return_at && (
                            <div className="row-line row-muted row-small">
                              {new Date(checklist.pickup_at).toLocaleDateString()} →{' '}
                              {new Date(checklist.return_at).toLocaleDateString()}
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {completed.length > 0 && (
                  <div className="group">
                    <h2
                      className="group-heading group-heading-collapsible"
                      onClick={() => setCompletedCollapsed(!completedCollapsed)}
                    >
                      Completed ({completed.length})
                      <span className="collapse-icon">{completedCollapsed ? '▸' : '▾'}</span>
                    </h2>
                    {!completedCollapsed && (
                      <div className="list-container">
                        {completed.map((checklist) => (
                          <Link
                            key={checklist.id}
                            href={`/${locale}/staff/checklists/${checklist.id}`}
                            className="list-row"
                          >
                            <div className="row-header">
                              <span className="row-title">
                                {checklist.name} · {checklist.booking_number}
                              </span>
                              <span className="badge badge-completed">Completed</span>
                            </div>
                            <div className="row-line">{checklist.customer_name}</div>
                            <div className="row-line row-muted">
                              {checklist.vehicle_name} ({checklist.vehicle_plate})
                            </div>
                            {checklist.pickup_at && checklist.return_at && (
                              <div className="row-line row-muted row-small">
                                {new Date(checklist.pickup_at).toLocaleDateString()} →{' '}
                                {new Date(checklist.return_at).toLocaleDateString()}
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(scopeFilter === 'all' || scopeFilter === 'vehicle') && (
          <div className="group">
            <h2 className="group-heading">Vehicle Checklists</h2>
            <div className="info-box">
              <p>Vehicle readiness checklists are being updated. Check back soon.</p>
            </div>
          </div>
        )}

        {scopeFilter === 'all' && displayOpenIssues.length > 0 && (
          <div className="group">
            <h2 className="group-heading">Open Issues</h2>
            <div className="list-container">
              {displayOpenIssues.map((issue) => (
                <Link
                  key={issue.id}
                  href={`/${locale}/staff/checklists/${issue.checklist_instance_id}?from=list`}
                  className="list-row list-row-issue"
                >
                  <div className="row-header">
                    <span className="row-title">{issue.name}</span>
                    <span className={`badge badge-severity-${issue.severity}`}>
                      {issue.severity}
                    </span>
                  </div>
                  {issue.booking_number !== 'N/A' && (
                    <div className="row-line">Booking {issue.booking_number}</div>
                  )}
                  <div className="row-line row-muted">
                    {issue.vehicle_name} ({issue.vehicle_plate})
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--space-4);
          margin-bottom: var(--space-6);
          flex-wrap: wrap;
        }

        .back-link {
          display: inline-block;
          font-size: 14px;
          color: rgb(var(--brand));
          text-decoration: none;
          margin-bottom: var(--space-2);
        }

        h1 {
          font-size: 28px;
          font-weight: 600;
          color: rgb(var(--text));
          margin: 0;
        }

        .subtitle {
          margin: var(--space-2) 0 0 0;
          color: rgb(var(--muted));
          font-size: 14px;
        }

        .filters {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          padding-bottom: var(--space-4);
          border-bottom: 1px solid rgb(var(--border));
          margin-bottom: var(--space-6);
        }

        @media (min-width: 640px) {
          .filters {
            flex-direction: row;
          }
        }

        .filter-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .filter-item label {
          font-size: 14px;
          color: rgb(var(--muted));
          white-space: nowrap;
        }

        .filter-item .input {
          min-height: 36px;
          padding: var(--space-2) var(--space-3);
        }

        .results-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .group {
          margin-bottom: var(--space-6);
        }

        .group-heading {
          font-size: 18px;
          font-weight: 600;
          color: rgb(var(--text));
          margin: 0 0 var(--space-3) 0;
        }

        .group-heading-collapsible {
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .collapse-icon {
          font-size: 12px;
          color: rgb(var(--muted));
        }

        .list-container {
          border: 1px solid rgb(var(--border));
          border-radius: var(--radius);
          overflow: hidden;
        }

        .list-row {
          display: block;
          padding: var(--space-4);
          text-decoration: none;
          color: rgb(var(--text));
          border-bottom: 1px solid rgb(var(--border));
          transition: background-color 0.15s ease;
        }

        .list-row:last-child {
          border-bottom: none;
        }

        .list-row:hover {
          background: rgb(var(--background) / 0.5);
        }

        .list-row-issue {
          border-left: 3px solid #f59e0b;
        }

        .row-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }

        .row-title {
          font-size: 16px;
          font-weight: 600;
          color: rgb(var(--text));
          flex: 1;
          min-width: 0;
        }

        .row-line {
          font-size: 15px;
          color: rgb(var(--text));
          margin-bottom: var(--space-1);
        }

        .row-line:last-child {
          margin-bottom: 0;
        }

        .row-muted {
          color: rgb(var(--muted));
          font-size: 14px;
        }

        .row-small {
          font-size: 13px;
        }

        .badge {
          display: inline-block;
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .badge-not-started {
          background: #f3f4f6;
          color: #374151;
        }

        .badge-in-progress {
          background: #dbeafe;
          color: #1e40af;
        }

        .badge-completed {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-severity-low {
          background: #fef3c7;
          color: #92400e;
          text-transform: capitalize;
        }

        .badge-severity-medium {
          background: #fed7aa;
          color: #9a3412;
          text-transform: capitalize;
        }

        .badge-severity-high {
          background: #fecaca;
          color: #991b1b;
          text-transform: capitalize;
        }

        .info-box {
          padding: var(--space-4);
          background: rgb(var(--background) / 0.5);
          border: 1px solid rgb(var(--border));
          border-left: 3px solid rgb(var(--brand));
          border-radius: var(--radius);
        }

        .info-box p {
          margin: 0;
          color: rgb(var(--muted));
          font-size: 14px;
        }

        .empty-state {
          text-align: center;
          padding: var(--space-8);
          color: rgb(var(--muted));
          font-size: 14px;
        }
      `}</style>
    </PageContainer>
  );
}