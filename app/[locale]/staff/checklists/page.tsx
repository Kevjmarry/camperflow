'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

// Map checklist type to display label
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
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [bookingChecklists, setBookingChecklists] = useState<ChecklistItem[]>([]);
  const [openIssues, setOpenIssues] = useState<IssueItem[]>([]);

  const scope = (searchParams.get('scope') as ChecklistScope) || 'all';
  const status = (searchParams.get('status') as ChecklistStatus) || 'all';

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const supabase = createClient();

      // Check authentication
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push(`/${locale}/staff/login`);
        return;
      }

      // Get user's company
      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .single();

      if (profileError || !profile?.company_id) {
        console.error('Error fetching profile:', profileError);
        router.push(`/${locale}/staff/login`);
        return;
      }

      if (cancelled) return;
      setCompanyId(profile.company_id);

      // -----------------------------
      // Booking checklists (no joins)
      // -----------------------------
      try {
        let ciQuery = supabase
          .from('checklist_instances')
          .select('id, checklist_type, status, created_at, booking_id')
          .eq('company_id', profile.company_id)
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

      // -----------------------------
      // Open issues (no fragile joins)
      // -----------------------------
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
            // Only instances for this company (server-side scope)
            const { data: instanceRows, error: instanceError } = await supabase
              .from('checklist_instances')
              .select('id, company_id, booking_id')
              .eq('company_id', profile.company_id)
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

          // Filter to issues whose instance exists for this company (company scope enforced)
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

  // Filter based on scope
  let displayBookingChecklists = bookingChecklists;
  let displayOpenIssues = openIssues;

  if (scope === 'booking') {
    // Already filtered to booking types
  } else if (scope === 'vehicle') {
    // For now, show empty since vehicle_readiness would need separate handling
    displayBookingChecklists = [];
  }

  if (loading) {
    return (
      <div className="page-container">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Checklists</h1>
        <Link href={`/${locale}/staff/checklists/new`} className="button-primary">
          Create Checklist
        </Link>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Scope:</label>
          <div className="filter-buttons">
            <Link
              href={`/${locale}/staff/checklists?scope=all&status=${status}`}
              className={scope === 'all' ? 'filter-button active' : 'filter-button'}
            >
              All
            </Link>
            <Link
              href={`/${locale}/staff/checklists?scope=booking&status=${status}`}
              className={scope === 'booking' ? 'filter-button active' : 'filter-button'}
            >
              Booking
            </Link>
            <Link
              href={`/${locale}/staff/checklists?scope=vehicle&status=${status}`}
              className={scope === 'vehicle' ? 'filter-button active' : 'filter-button'}
            >
              Vehicle
            </Link>
          </div>
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <div className="filter-buttons">
            <Link
              href={`/${locale}/staff/checklists?scope=${scope}&status=all`}
              className={status === 'all' ? 'filter-button active' : 'filter-button'}
            >
              All
            </Link>
            <Link
              href={`/${locale}/staff/checklists?scope=${scope}&status=not_started`}
              className={status === 'not_started' ? 'filter-button active' : 'filter-button'}
            >
              Not Started
            </Link>
            <Link
              href={`/${locale}/staff/checklists?scope=${scope}&status=in_progress`}
              className={status === 'in_progress' ? 'filter-button active' : 'filter-button'}
            >
              In Progress
            </Link>
            <Link
              href={`/${locale}/staff/checklists?scope=${scope}&status=completed`}
              className={status === 'completed' ? 'filter-button active' : 'filter-button'}
            >
              Completed
            </Link>
          </div>
        </div>
      </div>

      {/* Booking Checklists Section */}
      {(scope === 'all' || scope === 'booking') && (
        <section className="checklists-section">
          <h2>Booking Checklists</h2>
          {displayBookingChecklists.length === 0 ? (
            <p className="empty-state">No booking checklists found.</p>
          ) : (
            <div className="checklist-grid">
              {displayBookingChecklists.map((checklist) => (
                <Link
                  key={checklist.id}
                  href={`/${locale}/staff/checklists/${checklist.id}`}
                  className="checklist-card"
                >
                  <div className="checklist-header">
                    <h3>{checklist.name}</h3>
                    <span className={`status-badge status-${checklist.status}`}>
                      {String(checklist.status || '').replace('_', ' ')}
                    </span>
                  </div>
                  <div className="checklist-details">
                    <p>
                      <strong>Type:</strong> {checklist.type}
                    </p>
                    <p>
                      <strong>Booking:</strong> {checklist.booking_number}
                    </p>
                    <p>
                      <strong>Customer:</strong> {checklist.customer_name}
                    </p>
                    <p>
                      <strong>Vehicle:</strong> {checklist.vehicle_name} ({checklist.vehicle_plate})
                    </p>
                    {checklist.pickup_at && (
                      <p>
                        <strong>Pickup:</strong> {new Date(checklist.pickup_at).toLocaleDateString()}
                      </p>
                    )}
                    {checklist.return_at && (
                      <p>
                        <strong>Return:</strong> {new Date(checklist.return_at).toLocaleDateString()}
                      </p>
                    )}
                    <p className="checklist-date">
                      Created: {new Date(checklist.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Vehicle Checklists Section */}
      {(scope === 'all' || scope === 'vehicle') && (
        <section className="checklists-section">
          <h2>Vehicle Checklists</h2>
          <div className="info-box">
            <p>Vehicle readiness checklists are being updated. Check back soon.</p>
          </div>
        </section>
      )}

      {/* Open Issues Section */}
      {scope === 'all' && (
        <section className="checklists-section">
          <h2>Open Issues</h2>
          {displayOpenIssues.length === 0 ? (
            <p className="empty-state">No open issues found.</p>
          ) : (
            <div className="checklist-grid">
              {displayOpenIssues.map((issue) => (
                <Link
                  key={issue.id}
                  href={`/${locale}/staff/checklists/${issue.checklist_instance_id}?from=list`}
                  className="checklist-card issue-card"
                >
                  <div className="checklist-header">
                    <h3>{issue.name}</h3>
                    <span className={`severity-badge severity-${issue.severity}`}>{issue.severity}</span>
                  </div>
                  <div className="checklist-details">
                    {issue.booking_number !== 'N/A' && (
                      <p>
                        <strong>Booking:</strong> {issue.booking_number}
                      </p>
                    )}
                    <p>
                      <strong>Vehicle:</strong> {issue.vehicle_name} ({issue.vehicle_plate})
                    </p>
                    <p className="checklist-date">
                      Created: {new Date(issue.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <style jsx>{`
        .page-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .page-header h1 {
          margin: 0;
          font-size: 2rem;
        }

        .button-primary {
          background-color: var(--primary-color);
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          text-decoration: none;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .button-primary:hover {
          background-color: var(--primary-hover);
        }

        .filters {
          display: flex;
          gap: 2rem;
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filter-group label {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .filter-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .filter-button {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 0.375rem;
          background: white;
          color: var(--text-primary);
          text-decoration: none;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .filter-button:hover {
          background: var(--background-secondary);
        }

        .filter-button.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .checklists-section {
          margin-bottom: 3rem;
        }

        .checklists-section h2 {
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }

        .info-box {
          padding: 1.5rem;
          background: var(--background-secondary);
          border-radius: 0.5rem;
          border-left: 4px solid var(--primary-color);
        }

        .info-box p {
          margin: 0;
          color: var(--text-secondary);
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: var(--text-secondary);
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .checklist-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
        }

        .checklist-card {
          background: white;
          border-radius: 0.5rem;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
        }

        .checklist-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-2px);
        }

        .issue-card {
          border-left: 4px solid var(--warning-color);
        }

        .checklist-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .checklist-header h3 {
          margin: 0;
          font-size: 1.125rem;
          flex: 1;
        }

        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .status-not_started {
          background: #f3f4f6;
          color: #374151;
        }

        .status-in_progress {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-completed {
          background: #d1fae5;
          color: #065f46;
        }

        .severity-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .severity-low {
          background: #fef3c7;
          color: #92400e;
        }

        .severity-medium {
          background: #fed7aa;
          color: #9a3412;
        }

        .severity-high {
          background: #fecaca;
          color: #991b1b;
        }

        .checklist-details p {
          margin: 0.5rem 0;
          font-size: 0.875rem;
        }

        .checklist-details strong {
          color: var(--text-secondary);
          font-weight: 600;
        }

        .checklist-date {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
          color: var(--text-secondary);
          font-size: 0.8125rem;
        }
      `}</style>
    </div>
  );
}
