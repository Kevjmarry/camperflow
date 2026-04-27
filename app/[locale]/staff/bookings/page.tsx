"use client";

import { useState, useEffect, useMemo, Fragment, CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import LocalizedDateInput from "@/components/LocalizedDateInput";
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
  booking_code?: string;
  status: string;
  pickup_at: string;
  return_at: string;
  vehicle_id: string | null;
  customer_name?: string;
  customer_phone?: string;
  source_type?: string | null;
  created_at?: string;
  updated_at?: string;
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

  // Filter + sort state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("nextPickup");
  const [hideCancelled, setHideCancelled] = useState<boolean>(true);
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [completedOnly, setCompletedOnly] = useState<boolean>(false);
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]));

  useEffect(() => {
    checkUserCapabilities();
  }, []);

  useEffect(() => {
    if (canManage !== null) {
      fetchBookings();
    }
  }, [canManage]);

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
        const { data, error } = await supabase
          .from('bookings')
          .select('*, vehicles(id, name, status)')
          .order('pickup_at', { ascending: true });

        if (error) throw error;
        rawBookings = data || [];
      } else {
        const { data, error } = await supabase.rpc('list_staff_bookings_redacted');
        if (error) throw error;

        const filtered = data || [];
        const vehicleIds = [...new Set(filtered.map((b: Booking) => b.vehicle_id).filter(Boolean))];
        if (vehicleIds.length > 0) {
          const { data: vehicles } = await supabase
            .from('vehicles')
            .select('id, name, status')
            .in('id', vehicleIds);

          const vehicleMap = new Map(vehicles?.map(v => [v.id, { name: v.name, status: v.status }]) || []);
          rawBookings = filtered.map((b: Booking) => ({
            ...b,
            vehicle_name: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.name : null,
            vehicle_status: b.vehicle_id ? vehicleMap.get(b.vehicle_id)?.status : null,
          }));
        } else {
          rawBookings = filtered;
        }
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

      setBookings(rawBookings.map(b => ({ ...b, checklists: checklistsByBooking[b.id] || [] })));
    } catch (err: any) {
      setError(err.message || t("error.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Derived dropdown options from loaded data
  const vehicleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of bookings) {
      const name = canManage ? b.vehicles?.name : b.vehicle_name;
      if (name) seen.set(name, name);
    }
    return Array.from(seen.keys()).sort((a, b) => a.localeCompare(b));
  }, [bookings, canManage]);

// Filtered + sorted view — no re-fetch needed
  const displayedBookings = useMemo(() => {
    let result = bookings;

    if (statusFilter === 'pending') {
      result = result.filter(b => b.status === 'draft');
    } else if (statusFilter === 'confirmed') {
      result = result.filter(b => ['confirmed', 'blocked'].includes(b.status));
    } else if (statusFilter === 'on_rent') {
      result = result.filter(b => b.status === 'on_rent');
    } else if (statusFilter === 'completed') {
      result = result.filter(b => b.status === 'completed');
    } else if (statusFilter === 'cancelled') {
      result = result.filter(b => b.status === 'cancelled');
    }

    if (hideCancelled && statusFilter !== 'cancelled') result = result.filter(b => b.status !== 'cancelled');
    if (activeOnly) result = result.filter(b => ['confirmed', 'blocked', 'on_rent'].includes(b.status));
    if (completedOnly) result = result.filter(b => b.status === 'completed');

    if (vehicleFilter !== 'all') {
      result = result.filter(b => {
        const name = canManage ? b.vehicles?.name : b.vehicle_name;
        return name === vehicleFilter;
      });
    }

if (dateFrom) {
      result = result.filter(b => b.pickup_at >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(b => b.pickup_at.slice(0, 10) <= dateTo);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(b =>
        (b.customer_name ?? '').toLowerCase().includes(q) ||
        (b.booking_number ?? '').toLowerCase().includes(q) ||
        (b.booking_code ?? '').toLowerCase().includes(q),
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'nextPickup': {
          const now = new Date().toISOString();
          const aOnRent = a.status === 'on_rent';
          const bOnRent = b.status === 'on_rent';
          if (aOnRent !== bOnRent) return aOnRent ? -1 : 1;
          const aFuture = a.pickup_at >= now;
          const bFuture = b.pickup_at >= now;
          if (aFuture && bFuture) return a.pickup_at.localeCompare(b.pickup_at);
          if (!aFuture && !bFuture) return b.pickup_at.localeCompare(a.pickup_at);
          return aFuture ? -1 : 1;
        }
        case 'rentingNow': {
          const aOnRent = a.status === 'on_rent';
          const bOnRent = b.status === 'on_rent';
          if (aOnRent !== bOnRent) return aOnRent ? -1 : 1;
          return a.pickup_at.localeCompare(b.pickup_at);
        }
        case 'lastReturned':    return b.return_at.localeCompare(a.return_at);
        case 'newestCreated':   return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        case 'recentlyUpdated': return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
        default:                return 0;
      }
    });

    return result;
  }, [bookings, statusFilter, vehicleFilter, dateFrom, dateTo, searchQuery, sortBy, canManage, hideCancelled, activeOnly, completedOnly]);

  const groupedBookings = useMemo(() => {
    const map = new Map<number, Booking[]>();
    for (const b of displayedBookings) {
      const year = new Date(b.pickup_at).getFullYear();
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(b);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => ({ year, items }));
  }, [displayedBookings]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

  const hasActiveFilters =
    statusFilter !== 'all' || vehicleFilter !== 'all' ||
    dateFrom !== '' || dateTo !== '' || searchQuery.trim() !== '' || sortBy !== 'nextPickup' ||
    !hideCancelled || activeOnly || completedOnly;

  const clearFilters = () => {
    setStatusFilter('all');
    setVehicleFilter('all');
setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setSortBy('nextPickup');
    setHideCancelled(true);
    setActiveOnly(false);
    setCompletedOnly(false);
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

  const getTimeToReturn = (returnAt: string) => {
    const now = new Date();
    const ret = new Date(returnAt);
    const diffMs = ret.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;

    const label =
      diffDays === 0 ? t("time.today") :
      diffDays === 1 ? t("time.tomorrow") :
      t("time.daysAhead", { count: diffDays });

    const urgent = diffDays <= 3;
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        background: urgent ? 'rgb(var(--error) / 0.12)' : 'rgb(var(--muted) / 0.12)',
        color: urgent ? 'rgb(var(--error))' : 'rgb(var(--muted))',
      }}>
        {label}
      </span>
    );
  };

  const getTimeToPickup = (pickupAt: string) => {
    const now = new Date();
    const pickup = new Date(pickupAt);
    const diffMs = pickup.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;

    const label =
      diffDays === 0 ? t("time.today") :
      diffDays === 1 ? t("time.tomorrow") :
      t("time.daysAhead", { count: diffDays });

    const urgent = diffDays <= 3;
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        background: urgent ? 'rgb(var(--error) / 0.12)' : 'rgb(var(--muted) / 0.12)',
        color: urgent ? 'rgb(var(--error))' : 'rgb(var(--muted))',
      }}>
        {label}
      </span>
    );
  };

  const getVehicleReadinessChip = (booking: Booking) => {
    // Hide live vehicle status for future bookings — it reflects garage state, not booking readiness
    const now = new Date().toISOString();
    if (['draft', 'confirmed', 'blocked'].includes(booking.status) && booking.pickup_at > now) {
      return null;
    }

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
      vStatus === 'ready' ? t("vehicleReadiness.ready") :
      vStatus === 'preparing' ? t("vehicleReadiness.preparing") :
      vStatus === 'on_rent' ? t("vehicleReadiness.onRent") :
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

  const getRentalDays = (booking: Booking) => {
    const pickup = new Date(booking.pickup_at);
    const ret = new Date(booking.return_at);
    const days = Math.round((ret.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24));
    if (isNaN(days) || days < 0) return null;
    return (
      <span style={{ fontSize: '14px', color: 'rgb(var(--text))' }}>
        {t("time.days", { count: days })}
      </span>
    );
  };

  const getNextAction = (booking: Booking) => {
    const checklists = booking.checklists || [];

    if (booking.status === 'draft') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            {t("nextAction.confirmBooking")}
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
                {t("nextAction.completeChecklist")}
              </Link>
            </div>
          );
        }
      }
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            {t("nextAction.viewBooking")}
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
                {t("nextAction.returnChecklist")}
              </Link>
            </div>
          );
        }
      }
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            {t("nextAction.viewBooking")}
          </Link>
        </div>
      );
    }

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
        <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
          {t("nextAction.view")}
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

  const selectStyle: CSSProperties = { width: 'auto', minHeight: '36px', padding: 'var(--space-2) var(--space-3)' };
  const filterLabelStyle: CSSProperties = { fontSize: '14px', color: 'rgb(var(--muted))', whiteSpace: 'nowrap' };

  // Shared desktop table cell styles
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

      <div className="surface page-surface">
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
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexShrink: 0, flexWrap: 'wrap' }}>
                <Link
                  href={`/${locale}/staff/bookings/import`}
                  className="btn btn-secondary"
                >
                  {t("action.importBookings")}
                </Link>
                <Link
                  href={`/${locale}/staff/bookings/new`}
                  className="btn btn-primary"
                >
                  {t("action.newBooking")}
                </Link>
              </div>
            )}
          </div>

          {/* Filter + sort toolbar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid rgb(var(--border))'
          }}>
            {/* Row 1: search + sort */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                className="input"
                placeholder={t("filter.searchPlaceholder")}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: '1 1 200px', minWidth: '160px', minHeight: '36px', padding: 'var(--space-2) var(--space-3)' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                <label style={filterLabelStyle}>{t("sort.label")}</label>
                <select
                  className="input"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={selectStyle}
                >
                  <option value="nextPickup">{t("sort.nextPickup")}</option>
                  <option value="rentingNow">{t("sort.rentingNow")}</option>
                  <option value="lastReturned">{t("sort.lastReturned")}</option>
                  <option value="newestCreated">{t("sort.newestCreated")}</option>
                  <option value="recentlyUpdated">{t("sort.recentlyUpdated")}</option>
                </select>
              </div>
            </div>

            {/* Row 2: filters */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <label style={filterLabelStyle}>{t("filter.statusLabel")}</label>
                <select
                  className="input"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={selectStyle}
                >
                  <option value="all">{t("filter.all")}</option>
                  <option value="pending">{t("filter.pending")}</option>
                  <option value="confirmed">{t("filter.confirmed")}</option>
                  <option value="on_rent">{t("filter.onRent")}</option>
                  <option value="completed">{t("filter.completed")}</option>
                  <option value="cancelled">{t("filter.cancelled")}</option>
                </select>
              </div>

              {vehicleOptions.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <label style={filterLabelStyle}>{t("filter.vehicleLabel")}</label>
                  <select
                    className="input"
                    value={vehicleFilter}
                    onChange={e => setVehicleFilter(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="all">{t("filter.allVehicles")}</option>
                    {vehicleOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}



              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <label style={filterLabelStyle}>{t("filter.dateFromLabel")}</label>
                <LocalizedDateInput
                  className="input"
                  value={dateFrom}
                  onChange={setDateFrom}
                  style={{ ...selectStyle, minWidth: '130px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <label style={filterLabelStyle}>{t("filter.dateToLabel")}</label>
                <LocalizedDateInput
                  className="input"
                  value={dateTo}
                  onChange={setDateTo}
                  style={{ ...selectStyle, minWidth: '130px' }}
                />
              </div>

              <label style={{ ...filterLabelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
                {t("filter.activeOnly")}
              </label>
              <label style={{ ...filterLabelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={completedOnly} onChange={e => setCompletedOnly(e.target.checked)} />
                {t("filter.completedOnly")}
              </label>
              <label style={{ ...filterLabelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={hideCancelled} onChange={e => setHideCancelled(e.target.checked)} />
                {t("filter.hideCancelled")}
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={clearFilters}
                  style={{ minHeight: '36px', fontSize: '14px', padding: 'var(--space-2) var(--space-3)' }}
                >
                  {t("filter.clearFilters")}
                </button>
              )}
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

          {!loading && !error && bookings.length > 0 && displayedBookings.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              {t("noResults")}
            </div>
          )}

          {!loading && !error && displayedBookings.length > 0 && (
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
                        {t("table.pickup")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.pickupIn")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.return")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.returnIn")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.status")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.days")}
                      </th>
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.nextAction")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedBookings.map(({ year, items }) => {
                      const isExpanded = expandedYears.has(year);
                      const colSpan = canManage ? 10 : 8;
                      return (
                        <Fragment key={`year-${year}`}>
                          <tr>
                            <td
                              colSpan={colSpan}
                              style={{
                                padding: 'var(--space-2) var(--space-3)',
                                background: 'rgb(var(--surface-raised, var(--surface)))',
                                borderBottom: '1px solid rgb(var(--border))',
                                borderTop: '1px solid rgb(var(--border))',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleYear(year)}
                                style={{
                                  all: 'unset',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 'var(--space-2)',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: 'rgb(var(--text))',
                                  userSelect: 'none',
                                }}
                              >
                                <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                                  {isExpanded ? '▾' : '▸'}
                                </span>
                                {year}
                                <span style={{ fontWeight: 400, color: 'rgb(var(--muted))' }}>
                                  · {t("yearGroupBookings", { count: items.length })}
                                </span>
                              </button>
                            </td>
                          </tr>
                          {isExpanded && items.map((booking) => {
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
                                  {formatDate(booking.pickup_at)}
                                </td>
                                <td style={td}>
                                  {timeToPickup ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>}
                                </td>
                                <td style={td}>
                                  {formatDate(booking.return_at)}
                                </td>
                                <td style={td}>
                                  {['completed', 'cancelled'].includes(booking.status)
                                    ? <span style={{ color: 'rgb(var(--muted))' }}>—</span>
                                    : (getTimeToReturn(booking.return_at) ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>)}
                                </td>
                                <td style={td}>
                                  <span style={getStatusChipStyle(booking.status)}>
                                    {getStatusLabel(booking.status)}
                                  </span>
                                </td>
                                <td style={td}>
                                  {getRentalDays(booking) ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>}
                                </td>
                                <td style={td}>
                                  {getNextAction(booking)}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards">
                {groupedBookings.map(({ year, items }) => {
                  const isExpanded = expandedYears.has(year);
                  return (
                    <div key={`year-mobile-${year}`}>
                      <button
                        type="button"
                        onClick={() => toggleYear(year)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          width: '100%',
                          padding: 'var(--space-2) 0',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'rgb(var(--text))',
                          userSelect: 'none',
                          borderBottom: '1px solid rgb(var(--border))',
                          marginBottom: isExpanded ? 'var(--space-3)' : 0,
                        }}
                      >
                        <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        {year}
                        <span style={{ fontWeight: 400, color: 'rgb(var(--muted))' }}>
                          · {t("yearGroupBookings", { count: items.length })}
                        </span>
                      </button>
                      {isExpanded && items.map((booking) => {
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
                            <div style={{ marginTop: '4px' }}>
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
                            {t("table.days")}
                          </div>
                          {getRentalDays(booking) ?? <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>—</span>}
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
                          {canManage ? t("action.viewEditBooking") : t("action.viewBooking")}
                        </Link>
                      </div>
                    </div>
                  );
                      })}
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
