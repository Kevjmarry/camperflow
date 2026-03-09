"use client";

import { useState, useEffect, CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getStatusChipStyle } from "@/lib/statusChip";

interface ChecklistInstance {
  id: string;
  booking_id: string;
  status: string;
  checklist_instance_items: { checked: boolean }[];
}

interface Booking {
  id: string;
  booking_number?: string;
  status: string;
  pickup_at: string;
  return_at: string;
  vehicle_id: string | null;
  customer_name?: string;
  customer_phone?: string;
  vehicles?: {
    id: string;
    name: string;
    status: string;
  } | null;
  vehicle_name?: string;
  vehicle_status?: string;
  checklists?: ChecklistInstance[];
}

export default function BookingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("bookings");
  const supabase = createClient();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    checkUserCapabilities();
  }, []);

  useEffect(() => {
    if (canManage !== null) {
      fetchBookings();
    }
  }, [statusFilter, canManage]);

  const checkUserCapabilities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(t("error.notAuthenticated"));
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('can_manage, role')
        .eq('auth_user_id', user.id)
        .single();

      setCanManage(profile?.can_manage ?? false);
      setIsAdmin(profile?.role === 'admin');
    } catch (err: any) {
      setError(err.message || t("error.permissionsFailed"));
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError("");

      let rawBookings: Booking[] = [];

      if (canManage) {
        let query = supabase
          .from('bookings')
          .select('*, vehicles(id, name, status)')
          .order('pickup_at', { ascending: false });

        if (statusFilter === 'pending') {
          query = query.eq('status', 'draft');
        } else if (statusFilter === 'confirmed') {
          query = query.in('status', ['confirmed', 'blocked']);
        } else if (statusFilter === 'on_rent') {
          query = query.eq('status', 'on_rent');
        } else if (statusFilter === 'completed') {
          query = query.eq('status', 'completed');
        } else if (statusFilter === 'cancelled') {
          query = query.eq('status', 'cancelled');
        }

        const { data, error } = await query;
        if (error) throw error;
        rawBookings = data || [];
      } else {
        const { data, error } = await supabase.rpc('list_staff_bookings_redacted');
        if (error) throw error;

        let filtered = data || [];
        if (statusFilter === 'pending') {
          filtered = filtered.filter((b: Booking) => b.status === 'draft');
        } else if (statusFilter === 'confirmed') {
          filtered = filtered.filter((b: Booking) => ['confirmed', 'blocked'].includes(b.status));
        } else if (statusFilter === 'on_rent') {
          filtered = filtered.filter((b: Booking) => b.status === 'on_rent');
        } else if (statusFilter === 'completed') {
          filtered = filtered.filter((b: Booking) => b.status === 'completed');
        } else if (statusFilter === 'cancelled') {
          filtered = filtered.filter((b: Booking) => b.status === 'cancelled');
        }

        const vehicleIds = [...new Set(filtered.map((b: Booking) => b.vehicle_id).filter(Boolean))];
        if (vehicleIds.length > 0) {
          const { data: vehicles } = await supabase
            .from('vehicles')
            .select('id, name, status')
            .in('id', vehicleIds);

          const vehicleMap = new Map(vehicles?.map(v => [v.id, { name: v.name, status: v.status }]) || []);
          filtered = filtered.map((b: Booking) => ({
            ...b,
            vehicle_name: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.name : null,
            vehicle_status: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.status : null,
          }));
        }

        rawBookings = filtered;
      }

      // Fetch checklist instances with item counts for all bookings
      const bookingIds = rawBookings.map(b => b.id);
      let checklistsByBooking: Record<string, ChecklistInstance[]> = {};

      if (bookingIds.length > 0) {
        const { data: instances } = await supabase
          .from('checklist_instances')
          .select('id, booking_id, status, checklist_instance_items(checked)')
          .in('booking_id', bookingIds);

        if (instances) {
          for (const inst of instances) {
            if (!checklistsByBooking[inst.booking_id]) {
              checklistsByBooking[inst.booking_id] = [];
            }
            checklistsByBooking[inst.booking_id].push(inst as ChecklistInstance);
          }
        }
      }

      const enriched = rawBookings.map(b => ({
        ...b,
        checklists: checklistsByBooking[b.id] || [],
      }));

      setBookings(enriched);
    } catch (err: any) {
      setError(err.message || t("error.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return t("statusLabels.draft");
      case 'confirmed': return t("statusLabels.confirmed");
      case 'blocked': return t("statusLabels.blocked");
      case 'on_rent': return t("statusLabels.onRent");
      case 'completed': return t("statusLabels.completed");
      case 'cancelled': return t("statusLabels.cancelled");
      default: return status;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(t("date.locale"), {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTimeToPickup = (pickupAt: string) => {
    const now = new Date();
    const pickup = new Date(pickupAt);
    const diffMs = pickup.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return `${diffDays}d`;
  };

  const getVehicleReadinessChip = (booking: Booking) => {
    const vStatus = canManage
      ? booking.vehicles?.status
      : booking.vehicle_status;

    if (!vStatus) return null;

    const colors: Record<string, { bg: string; text: string }> = {
      ready: { bg: 'rgb(var(--success) / 0.12)', text: 'rgb(var(--success))' },
      preparing: { bg: 'rgb(var(--warning) / 0.12)', text: 'rgb(var(--warning))' },
      on_rent: { bg: 'rgb(var(--brand) / 0.12)', text: 'rgb(var(--brand))' },
    };
    const style = colors[vStatus] ?? { bg: 'rgb(var(--muted) / 0.12)', text: 'rgb(var(--muted))' };

    const label =
      vStatus === 'ready' ? 'Ready' :
      vStatus === 'preparing' ? 'Preparing' :
      vStatus === 'on_rent' ? 'On rent' :
      vStatus;

    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        background: style.bg,
        color: style.text,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    );
  };

  const getTaskSummary = (booking: Booking) => {
    const checklists = booking.checklists || [];
    if (checklists.length === 0) return null;

    let total = 0;
    let checked = 0;
    for (const cl of checklists) {
      for (const item of cl.checklist_instance_items) {
        total++;
        if (item.checked) checked++;
      }
    }

    const allDone = checklists.every(cl => cl.status === 'completed');
    const color = allDone
      ? 'rgb(var(--success))'
      : checked > 0
        ? 'rgb(var(--warning))'
        : 'rgb(var(--muted))';

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
        <span style={{ fontSize: '14px', color }}>
          {checked}/{total}
        </span>
      </div>
    );
  };

  const getNextAction = (booking: Booking) => {
    const checklists = booking.checklists || [];

    if (booking.status === 'draft') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            Confirm booking
          </Link>
        </div>
      );
    }

    if (['confirmed', 'blocked'].includes(booking.status)) {
      const hasIncomplete = checklists.some(cl => cl.status !== 'completed');
      if (hasIncomplete) {
        const first = checklists.find(cl => cl.status !== 'completed');
        if (first) {
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
              <Link href={`/${locale}/staff/checklists/${first.id}?from=booking`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
                Complete checklist
              </Link>
            </div>
          );
        }
      }
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            View booking
          </Link>
        </div>
      );
    }

    if (booking.status === 'on_rent') {
      const hasIncomplete = checklists.some(cl => cl.status !== 'completed');
      if (hasIncomplete) {
        const first = checklists.find(cl => cl.status !== 'completed');
        if (first) {
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
              <Link href={`/${locale}/staff/checklists/${first.id}?from=booking`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
                Return checklist
              </Link>
            </div>
          );
        }
      }
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            View booking
          </Link>
        </div>
      );
    }

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
        <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
          View
        </Link>
      </div>
    );
  };

  const getVehicleName = (booking: Booking) => {
    const name = canManage ? booking.vehicles?.name : booking.vehicle_name;
    const vehicleId = booking.vehicle_id;

    if (!name) {
      return <span style={{ color: 'rgb(var(--muted))' }}>{t("unassigned")}</span>;
    }

    if (vehicleId) {
      return (
        <Link
          href={`/${locale}/staff/vehicles/${vehicleId}`}
          style={{ color: 'rgb(var(--brand))', textDecoration: 'none', fontWeight: 500 }}
        >
          {name}
        </Link>
      );
    }

    return <span style={{ color: 'rgb(var(--text))' }}>{name}</span>;
  };

  // Shared desktop table cell styles — only change from original
  const td: CSSProperties = {
    padding: 'var(--space-3)',
    fontSize: '14px',
    lineHeight: '1.5',
    verticalAlign: 'middle',
    color: 'rgb(var(--text))',
  };
  const tdMuted: CSSProperties = { ...td, color: 'rgb(var(--muted))' };

  return (
    <PageContainer maxWidth="1400px">
      <style jsx>{`
        .desktop-table {
          display: block;
        }
        .mobile-cards {
          display: none;
        }
        @media (max-width: 768px) {
          .desktop-table {
            display: none;
          }
          .mobile-cards {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
          }
        }
      `}</style>

      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 'var(--space-4)'
          }}>
            <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
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
                {t("backToDashboardArrow")}
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
                href={`/${locale}/staff/bookings/new`}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                {t("action.newBooking")}
              </Link>
            )}
          </div>

          <div style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid rgb(var(--border))'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <label htmlFor="status-filter" style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
                {t("filter.statusLabel")}
              </label>
              <select
                id="status-filter"
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: 'auto', minHeight: '36px', padding: 'var(--space-2) var(--space-3)' }}
              >
                <option value="all">{t("filter.all")}</option>
                <option value="pending">{t("filter.pending")}</option>
                <option value="confirmed">{t("filter.confirmed")}</option>
                <option value="on_rent">{t("filter.onRent")}</option>
                <option value="completed">{t("filter.completed")}</option>
                <option value="cancelled">{t("filter.cancelled")}</option>
              </select>
            </div>
          </div>

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

          {loading && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              {t("loading")}
            </div>
          )}

          {!loading && !error && bookings.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              <p style={{ marginBottom: 'var(--space-4)' }}>
                {t("empty")}{canManage && t("emptyAdminSuffix")}
              </p>
              {canManage && (
                <Link
                  href={`/${locale}/staff/bookings/new`}
                  className="btn btn-primary"
                >
                  {t("action.newBooking")}
                </Link>
              )}
            </div>
          )}

          {!loading && !error && bookings.length > 0 && (
            <>
              {/* Desktop Table View */}
              <div className="desktop-table" style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px'
                }}>
                  <thead>
                    <tr style={{
                      borderBottom: '1px solid rgb(var(--border))',
                      textAlign: 'left'
                    }}>
                      {canManage && (
                        <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                          {t("table.bookingNumber")}
                        </th>
                      )}
                      {canManage && (
                        <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                          {t("table.customer")}
                        </th>
                      )}
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.vehicle")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        Vehicle status
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.pickup")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        Pickup in
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.return")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.status")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        Tasks
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        Next action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => {
                      const timeToPickup = getTimeToPickup(booking.pickup_at);
                      return (
                        <tr
                          key={booking.id}
                          style={{ borderBottom: '1px solid rgb(var(--border))' }}
                        >
                          {canManage && (
                            <td style={td}>
                              <Link
                                href={`/${locale}/staff/bookings/${booking.id}`}
                                style={{ color: 'rgb(var(--brand))', textDecoration: 'none', fontWeight: 500 }}
                              >
                                {booking.booking_number}
                              </Link>
                            </td>
                          )}
                          {canManage && (
                            <td style={td}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: '1.35' }}>
                                <div style={{ color: 'rgb(var(--text))' }}>{booking.customer_name || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}</div>
                                <div style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{booking.customer_phone || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}</div>
                              </div>
                            </td>
                          )}
                          <td style={td}>
                            {getVehicleName(booking)}
                          </td>
                          <td style={td}>
                            {getVehicleReadinessChip(booking)}
                          </td>
                          <td style={td}>
                            {formatDate(booking.pickup_at)}
                          </td>
                          <td style={tdMuted}>
                            {timeToPickup ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>}
                          </td>
                          <td style={td}>
                            {formatDate(booking.return_at)}
                          </td>
                          <td style={td}>
                            <span style={getStatusChipStyle(booking.status)}>
                              {getStatusLabel(booking.status)}
                            </span>
                          </td>
                          <td style={td}>
                            {getTaskSummary(booking) ?? <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}><span style={{ color: 'rgb(var(--muted))' }}>—</span></div>}
                          </td>
                          <td style={td}>
                            {getNextAction(booking)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards">
                {bookings.map((booking) => {
                  const timeToPickup = getTimeToPickup(booking.pickup_at);
                  return (
                    <div
                      key={booking.id}
                      style={{
                        padding: 'var(--space-4)',
                        border: '1px solid rgb(var(--border))',
                        borderRadius: 'var(--radius)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-3)'
                      }}
                    >
                      {canManage && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 'var(--space-3)',
                          paddingBottom: 'var(--space-3)',
                          borderBottom: '1px solid rgb(var(--border))'
                        }}>
                          <div>
                            <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                              {t("table.bookingNumber")}
                            </div>
                            <div style={{ fontWeight: 500, color: 'rgb(var(--text))' }}>
                              {booking.booking_number}
                            </div>
                          </div>
                          <span style={getStatusChipStyle(booking.status)}>
                            {getStatusLabel(booking.status)}
                          </span>
                        </div>
                      )}

                      {!canManage && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          paddingBottom: 'var(--space-3)',
                          borderBottom: '1px solid rgb(var(--border))'
                        }}>
                          <span style={getStatusChipStyle(booking.status)}>
                            {getStatusLabel(booking.status)}
                          </span>
                        </div>
                      )}

                      {canManage && (
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                            {t("table.customer")}
                          </div>
                          <div style={{ color: 'rgb(var(--text))' }}>
                            {booking.customer_name || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}
                          </div>
                          <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginTop: 'var(--space-1)' }}>
                            {booking.customer_phone || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 auto' }}>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                            {t("table.vehicle")}
                          </div>
                          <div style={{ color: 'rgb(var(--text))' }}>
                            {getVehicleName(booking)}
                          </div>
                        </div>
                        <div>
                          {getVehicleReadinessChip(booking)}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                            {t("table.pickup")}
                          </div>
                          <div style={{ color: 'rgb(var(--text))' }}>
                            {formatDate(booking.pickup_at)}
                          </div>
                          {timeToPickup && (
                            <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: '2px' }}>
                              {timeToPickup}
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                            {t("table.return")}
                          </div>
                          <div style={{ color: 'rgb(var(--text))' }}>
                            {formatDate(booking.return_at)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                            Tasks
                          </div>
                          {getTaskSummary(booking) ?? <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>—</span>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {getNextAction(booking)}
                        </div>
                      </div>

                      <div style={{ paddingTop: 'var(--space-2)', borderTop: '1px solid rgb(var(--border))' }}>
                        <Link
                          href={`/${locale}/staff/bookings/${booking.id}`}
                          className="btn btn-secondary"
                          style={{ display: 'block', textAlign: 'center', fontSize: '14px' }}
                        >
                          {canManage ? 'View & edit booking' : 'View booking'}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}