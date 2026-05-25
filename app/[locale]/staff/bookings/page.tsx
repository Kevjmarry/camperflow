"use client";

import { useState, useEffect, useMemo, Fragment, CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import LocalizedDateInput from "@/components/LocalizedDateInput";
import { getStatusChipStyle } from "@/lib/statusChip";
import BackLink from "@/components/staff/BackLink";
import { useTheme } from "@/contexts/ThemeContext";
import OperationsBookingTimeline, { TimelineVehicleBlock } from "@/components/staff/operations/OperationsBookingTimeline";
import type { OpsTimelineVehicle, OpsTimelineBooking } from "@/lib/staff/operations/getOpsBookingTimeline";

interface BlockModalState {
  mode: 'create' | 'edit'
  blockId?: string
  vehicleId: string
  blockType: string
  label: string
  startAt: string
  endAt: string
  sourceType?: string | null
  syncLocked?: boolean | null
}

const BLOCK_TYPES = ['unavailable', 'maintenance', 'work', 'owner_use', 'manual_note', 'external_hold'] as const

function dateToDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isoToDatetimeLocal(iso: string): string {
  return dateToDatetimeLocal(new Date(iso))
}

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

interface BlockRow extends TimelineVehicleBlock {
  vehicleName: string | null
}

const BLOCK_TYPE_ICON: Record<string, string> = {
  maintenance:   '🔧',
  work:          '🛠',
  owner_use:     '🏠',
  manual_note:   '📝',
  external_hold: '🔗',
  unavailable:   '⛔',
}

export default function BookingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("bookings");
  const tBlockTypes = useTranslations("staff.operations.blockTypes");
  const tBM = useTranslations("bookings.blockModal");
  const { company } = useTheme();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicleBlocks, setVehicleBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vehicles, setVehicles] = useState<{ id: string; name: string }[]>([]);
  const [blockModal, setBlockModal] = useState<BlockModalState | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState('');

  // Filter + sort state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("nextPickup");
  const [hideCancelled, setHideCancelled] = useState<boolean>(true);
  const [showBlocks, setShowBlocks] = useState<boolean>(true);
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [completedOnly, setCompletedOnly] = useState<boolean>(false);
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]));

  useEffect(() => {
    fetchSnapshot();
  }, []);

  useEffect(() => {
    if (!canManage) return;
    fetch('/api/staff/vehicle-blocks')
      .then(r => r.json())
      .then(d => setVehicles(d.vehicles ?? []))
      .catch(() => {});
  }, [canManage]);

  const openCreateModal = () => {
    setBlockError('');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
    const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59);
    setBlockModal({
      mode: 'create',
      vehicleId: vehicles[0]?.id ?? '',
      blockType: 'unavailable',
      label: '',
      startAt: dateToDatetimeLocal(todayStart),
      endAt: dateToDatetimeLocal(tomorrowEnd),
    });
  };

  const handleEditBlock = (block: TimelineVehicleBlock & { vehicleName: string }) => {
    setBlockError('');
    setBlockModal({
      mode: 'edit',
      blockId: block.id,
      vehicleId: block.vehicleId,
      blockType: block.blockType ?? 'unavailable',
      label: block.label ?? '',
      startAt: isoToDatetimeLocal(block.startAt),
      endAt: isoToDatetimeLocal(block.endAt),
      sourceType: block.sourceType,
      syncLocked: block.syncLocked,
    });
  };

  const handleBlockDelete = async (blockId: string) => {
    try {
      await fetch(`/api/staff/vehicle-blocks/${blockId}`, { method: 'DELETE' });
      await fetchSnapshot();
    } catch {
      // silent — user can retry via edit modal
    }
  };

  const handleBlockSave = async () => {
    if (!blockModal) return;
    setBlockError('');
    if (!blockModal.vehicleId || !blockModal.blockType || !blockModal.startAt || !blockModal.endAt) {
      setBlockError(tBM('errorRequired'));
      return;
    }
    const startISO = new Date(blockModal.startAt).toISOString();
    const endISO = new Date(blockModal.endAt).toISOString();
    if (new Date(endISO) <= new Date(startISO)) {
      setBlockError(tBM('errorEndBeforeStart'));
      return;
    }
    setBlockSaving(true);
    try {
      const isEdit = blockModal.mode === 'edit';
      const res = await fetch(
        isEdit ? `/api/staff/vehicle-blocks/${blockModal.blockId}` : '/api/staff/vehicle-blocks',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId: blockModal.vehicleId,
            blockType: blockModal.blockType,
            label: blockModal.label || null,
            startAt: startISO,
            endAt: endISO,
          }),
        },
      );
      if (!res.ok) {
        const d = await res.json();
        setBlockError(d.error || tBM('errorSave'));
        return;
      }
      setBlockModal(null);
      await fetchSnapshot();
    } catch {
      setBlockError(tBM('errorSave'));
    } finally {
      setBlockSaving(false);
    }
  };

  const fetchSnapshot = async () => {
    try {
      setLoading(true);
      setError('');
      await fetch('/api/staff/bookings-snapshot', { method: 'POST' });
      const res = await fetch('/api/staff/bookings-snapshot');
      if (res.status === 401) {
        setError(t('error.notAuthenticated'));
        return;
      }
      if (!res.ok) throw new Error(t('error.loadFailed'));
      const { canManage: cm, isAdmin: ia, bookings: data, vehicleBlocks: blocks = [] } = await res.json();
      setCanManage(cm);
      setIsAdmin(ia);
      setBookings(data);
      setVehicleBlocks(blocks);
    } catch (err: any) {
      setError(err.message || t('error.loadFailed'));
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
    for (const bl of vehicleBlocks) {
      if (bl.vehicleName) seen.set(bl.vehicleName, bl.vehicleName);
    }
    return Array.from(seen.keys()).sort((a, b) => a.localeCompare(b));
  }, [bookings, vehicleBlocks, canManage]);

  const timelineVehicles = useMemo<OpsTimelineVehicle[]>(() => {
    const map = new Map<string, string>();
    for (const b of bookings) {
      const id = b.vehicle_id;
      const name = canManage ? b.vehicles?.name : b.vehicle_name;
      if (id && name) map.set(id, name);
    }
    for (const bl of vehicleBlocks) {
      if (!map.has(bl.vehicleId)) map.set(bl.vehicleId, '');
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bookings, vehicleBlocks, canManage]);

  const timelineBookings = useMemo<OpsTimelineBooking[]>(() => {
    return bookings
      .filter(b => b.vehicle_id && b.pickup_at && b.return_at && b.status !== 'cancelled')
      .map(b => ({
        id: b.id,
        bookingNumber: b.booking_number ?? '',
        customerName: canManage ? (b.customer_name?.replace(/^(\[\?\]|\?)\s*/, '') ?? '') : '',
        vehicleId: b.vehicle_id!,
        pickupAt: b.pickup_at,
        returnAt: b.return_at,
        status: b.status,
      }));
  }, [bookings, canManage]);

  // True when pickup_at has passed but return_at hasn't — regardless of DB status
  const isEffectivelyOnRent = (booking: Booking): boolean => {
    if (booking.status === 'cancelled' || booking.status === 'completed') return false;
    const now = new Date().toISOString();
    return booking.pickup_at <= now && booking.return_at > now;
  };

// Filtered + sorted view — no re-fetch needed
  const displayedBookings = useMemo(() => {
    let result = bookings;

    if (statusFilter === 'pending') {
      result = result.filter(b => b.status === 'draft');
    } else if (statusFilter === 'confirmed') {
      result = result.filter(b => ['confirmed', 'blocked'].includes(b.status) && !isEffectivelyOnRent(b));
    } else if (statusFilter === 'on_rent') {
      result = result.filter(b => b.status === 'on_rent' || isEffectivelyOnRent(b));
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
          const aOnRent = a.status === 'on_rent' || isEffectivelyOnRent(a);
          const bOnRent = b.status === 'on_rent' || isEffectivelyOnRent(b);
          if (aOnRent !== bOnRent) return aOnRent ? -1 : 1;
          const aFuture = a.pickup_at >= now;
          const bFuture = b.pickup_at >= now;
          if (aFuture && bFuture) return a.pickup_at.localeCompare(b.pickup_at);
          if (!aFuture && !bFuture) return b.pickup_at.localeCompare(a.pickup_at);
          return aFuture ? -1 : 1;
        }
        case 'rentingNow': {
          const aOnRent = a.status === 'on_rent' || isEffectivelyOnRent(a);
          const bOnRent = b.status === 'on_rent' || isEffectivelyOnRent(b);
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

  const displayedBlocks = useMemo(() => {
    if (!showBlocks || statusFilter !== 'all') return []
    let result = vehicleBlocks
    if (vehicleFilter !== 'all') {
      result = result.filter(bl => bl.vehicleName === vehicleFilter)
    }
    if (dateFrom) result = result.filter(bl => bl.startAt.slice(0, 10) >= dateFrom)
    if (dateTo) result = result.filter(bl => bl.startAt.slice(0, 10) <= dateTo)
    return result
  }, [vehicleBlocks, showBlocks, statusFilter, vehicleFilter, dateFrom, dateTo])

  const groupedRows = useMemo(() => {
    type Row = { kind: 'booking'; item: Booking } | { kind: 'block'; item: BlockRow }
    const rows: Row[] = [
      ...displayedBookings.map(item => ({ kind: 'booking' as const, item })),
      ...displayedBlocks.map(item => ({ kind: 'block' as const, item })),
    ]
    const map = new Map<number, Row[]>()
    for (const row of rows) {
      const year = new Date(row.kind === 'booking' ? row.item.pickup_at : row.item.startAt).getFullYear()
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(row)
    }
    const now = new Date().toISOString()
    for (const [, items] of map) {
      items.sort((a, b) => {
        const ad = a.kind === 'booking' ? a.item.pickup_at : a.item.startAt
        const bd = b.kind === 'booking' ? b.item.pickup_at : b.item.startAt
        const aEnd = a.kind === 'booking' ? a.item.return_at : a.item.endAt
        const bEnd = b.kind === 'booking' ? b.item.return_at : b.item.endAt
        switch (sortBy) {
          case 'nextPickup': {
            const aOnRent = a.kind === 'booking' ? (a.item.status === 'on_rent' || isEffectivelyOnRent(a.item)) : (a.item.startAt <= now && a.item.endAt > now)
            const bOnRent = b.kind === 'booking' ? (b.item.status === 'on_rent' || isEffectivelyOnRent(b.item)) : (b.item.startAt <= now && b.item.endAt > now)
            if (aOnRent !== bOnRent) return aOnRent ? -1 : 1
            const aFuture = ad >= now
            const bFuture = bd >= now
            if (aFuture && bFuture) return ad.localeCompare(bd)
            if (!aFuture && !bFuture) return bd.localeCompare(ad)
            return aFuture ? -1 : 1
          }
          case 'rentingNow': {
            const aOnRent = a.kind === 'booking' ? (a.item.status === 'on_rent' || isEffectivelyOnRent(a.item)) : (a.item.startAt <= now && a.item.endAt > now)
            const bOnRent = b.kind === 'booking' ? (b.item.status === 'on_rent' || isEffectivelyOnRent(b.item)) : (b.item.startAt <= now && b.item.endAt > now)
            if (aOnRent !== bOnRent) return aOnRent ? -1 : 1
            return ad.localeCompare(bd)
          }
          case 'lastReturned': return bEnd.localeCompare(aEnd)
          default: return ad.localeCompare(bd)
        }
      })
    }
    return Array.from(map.entries())
      .sort(([ya], [yb]) => yb - ya)
      .map(([year, items]) => ({ year, items }))
  }, [displayedBookings, displayedBlocks, sortBy]);

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
    !hideCancelled || activeOnly || completedOnly || !showBlocks;

  const clearFilters = () => {
    setStatusFilter('all');
    setVehicleFilter('all');
setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setSortBy('nextPickup');
    setHideCancelled(true);
    setShowBlocks(true);
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

  const tz = company?.company_timezone ?? 'Europe/Bratislava';
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(t("date.locale"), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz,
    });
  };

  const getTimeToReturn = (returnAt: string) => {
    const toYMD = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz });
    const todayYMD = toYMD(new Date());
    const retYMD = toYMD(new Date(returnAt));

    if (retYMD < todayYMD) return null;

    const diffDays = Math.round((new Date(retYMD).getTime() - new Date(todayYMD).getTime()) / 86400000);

    const label =
      diffDays === 0 ? t("time.today") :
      diffDays === 1 ? t("time.tomorrow") :
      t("time.daysAhead", { count: diffDays });

    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        background: 'rgb(var(--muted) / 0.12)',
        color: 'rgb(var(--muted))',
      }}>
        {label}
      </span>
    );
  };

  const getTimeToPickup = (pickupAt: string) => {
    const toYMD = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz });
    const todayYMD = toYMD(new Date());
    const pickupYMD = toYMD(new Date(pickupAt));

    if (pickupYMD < todayYMD) return null;

    const diffDays = Math.round((new Date(pickupYMD).getTime() - new Date(todayYMD).getTime()) / 86400000);

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
    const effectiveOnRent = booking.status === 'on_rent' || isEffectivelyOnRent(booking);

    if (booking.status === 'draft') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '18px' }}>
          <Link href={`/${locale}/staff/bookings/${booking.id}`} style={{ fontSize: '14px', color: 'rgb(var(--brand))' }}>
            {t("nextAction.confirmBooking")}
          </Link>
        </div>
      );
    }

    if (['confirmed', 'blocked'].includes(booking.status) && !isEffectivelyOnRent(booking)) {
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

    if (effectiveOnRent) {
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={`/${locale}/staff`}>{t("backToDashboardArrow")}</BackLink>
        </div>
        {!loading && timelineVehicles.length > 0 && (
          <OperationsBookingTimeline
            vehicles={timelineVehicles}
            bookings={timelineBookings}
            vehicleBlocks={vehicleBlocks}
            onEditBlock={canManage ? handleEditBlock : undefined}
            onDeleteBlock={canManage ? handleBlockDelete : undefined}
          />
        )}
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openCreateModal}
                >
                  {t("action.addBlockedPeriod")}
                </button>
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
              <label style={{ ...filterLabelStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={showBlocks} onChange={e => setShowBlocks(e.target.checked)} />
                {t("filter.showBlocks")}
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

          {!loading && !error && bookings.length > 0 && displayedBookings.length === 0 && displayedBlocks.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              {t("noResults")}
            </div>
          )}

          {!loading && !error && (displayedBookings.length > 0 || displayedBlocks.length > 0) && (
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
                    {groupedRows.map(({ year, items }) => {
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
                          {isExpanded && items.map((row) => {
                            if (row.kind === 'block') {
                              const bl = row.item;
                              const blockDays = Math.round((new Date(bl.endAt).getTime() - new Date(bl.startAt).getTime()) / 86_400_000);
                              return (
                                <tr
                                  key={`block-${bl.id}`}
                                  style={{ borderBottom: '1px solid rgb(var(--border))', background: 'rgb(var(--danger) / 0.04)' }}
                                >
                                  {canManage && <td style={tdMuted}>—</td>}
                                  {canManage && (
                                    <td style={td}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: '1.35' }}>
                                        <div style={{ fontWeight: 500, color: 'rgb(var(--text))' }}>
                                          {BLOCK_TYPE_ICON[bl.blockType ?? ''] ?? '⛔'} {tBlockTypes((bl.blockType ?? 'unavailable') as any)}
                                        </div>
                                        {bl.label && <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{bl.label}</div>}
                                      </div>
                                    </td>
                                  )}
                                  <td style={td}>
                                    {bl.vehicleName ? (
                                      <Link href={`/${locale}/staff/vehicles/${bl.vehicleId}`} style={{ color: 'rgb(var(--brand))', textDecoration: 'none', fontWeight: 500 }}>
                                        {bl.vehicleName}
                                      </Link>
                                    ) : <span style={{ color: 'rgb(var(--muted))' }}>{t("unassigned")}</span>}
                                  </td>
                                  <td style={td}>{formatDate(bl.startAt)}</td>
                                  <td style={td}>{getTimeToPickup(bl.startAt) ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>}</td>
                                  <td style={td}>{formatDate(bl.endAt)}</td>
                                  <td style={tdMuted}>—</td>
                                  <td style={td}>
                                    <span style={{ ...getStatusChipStyle('blocked'), fontSize: '11px' }}>
                                      {!canManage && `${BLOCK_TYPE_ICON[bl.blockType ?? ''] ?? '⛔'} `}{tBlockTypes((bl.blockType ?? 'unavailable') as any)}
                                    </span>
                                  </td>
                                  <td style={td}>
                                    {!isNaN(blockDays) && blockDays >= 0
                                      ? <span style={{ fontSize: '14px', color: 'rgb(var(--text))' }}>{t("time.days", { count: blockDays })}</span>
                                      : <span style={{ color: 'rgb(var(--muted))' }}>—</span>}
                                  </td>
                                  <td style={tdMuted}>
                                    {canManage
                                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                          {bl.sourceType && bl.sourceType !== 'manual' && (
                                            <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                                              {bl.syncLocked ? t("blockEditedLabel") : t("blockImportedLabel")}
                                            </span>
                                          )}
                                          <button type="button" onClick={() => handleEditBlock({ ...bl, vehicleName: bl.vehicleName ?? '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: '13px', color: 'rgb(var(--brand))' }}>{t("action.edit")}</button>
                                        </span>
                                      : bl.sourceType && bl.sourceType !== 'manual' && !bl.syncLocked
                                        ? <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{t("blockImportedLabel")}</span>
                                        : '—'}
                                  </td>
                                </tr>
                              );
                            }
                            const booking = row.item;
                            const timeToPickup = getTimeToPickup(booking.pickup_at);
                            const effectiveStatus = isEffectivelyOnRent(booking) ? 'on_rent' : booking.status;
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
                                      <div style={{ color: 'rgb(var(--text))' }}>{(booking.customer_name?.replace(/^(\[\?\]|\?)\s*/, '').trim()) || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}</div>
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
                                  {effectiveStatus !== 'on_rent' && timeToPickup ? timeToPickup : <span style={{ color: 'rgb(var(--muted))' }}>—</span>}
                                </td>
                                <td style={td}>
                                  {formatDate(booking.return_at)}
                                </td>
                                <td style={td}>
                                  {['completed', 'cancelled'].includes(effectiveStatus)
                                    ? <span style={{ color: 'rgb(var(--muted))' }}>—</span>
                                    : (getTimeToReturn(booking.return_at) ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>)}
                                </td>
                                <td style={td}>
                                  <span style={getStatusChipStyle(effectiveStatus)}>
                                    {getStatusLabel(effectiveStatus)}
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
                {groupedRows.map(({ year, items }) => {
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
                      {isExpanded && items.map((row) => {
                  if (row.kind === 'block') {
                    const bl = row.item;
                    return (
                      <div
                        key={`block-mob-${bl.id}`}
                        style={{
                          padding: 'var(--space-4)',
                          border: '1px solid rgb(var(--danger) / 0.35)',
                          borderRadius: 'var(--radius)',
                          background: 'rgb(var(--danger) / 0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-3)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 'var(--space-3)', borderBottom: '1px solid rgb(var(--border))' }}>
                          <span style={{ ...getStatusChipStyle('blocked'), fontSize: '12px' }}>
                            {BLOCK_TYPE_ICON[bl.blockType ?? ''] ?? '⛔'} {tBlockTypes((bl.blockType ?? 'unavailable') as any)}
                          </span>
                          {canManage ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {bl.sourceType && bl.sourceType !== 'manual' && (
                                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgb(var(--muted) / 0.12)', color: 'rgb(var(--muted))', fontWeight: 500 }}>
                                  {bl.syncLocked ? t("blockEditedLabel") : t("blockImportedLabel")}
                                </span>
                              )}
                              <button type="button" onClick={() => handleEditBlock({ ...bl, vehicleName: bl.vehicleName ?? '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: '13px', color: 'rgb(var(--brand))' }}>{t("action.edit")}</button>
                            </span>
                          ) : bl.sourceType && bl.sourceType !== 'manual' && !bl.syncLocked ? (
                            <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgb(var(--muted) / 0.12)', color: 'rgb(var(--muted))', fontWeight: 500 }}>
                              {t("blockImportedLabel")}
                            </span>
                          ) : null}
                        </div>
                        {bl.label && (
                          <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{bl.label}</div>
                        )}
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{t("table.vehicle")}</div>
                          {bl.vehicleName ? (
                            <Link href={`/${locale}/staff/vehicles/${bl.vehicleId}`} style={{ color: 'rgb(var(--brand))', textDecoration: 'none', fontWeight: 500 }}>
                              {bl.vehicleName}
                            </Link>
                          ) : <span style={{ color: 'rgb(var(--muted))' }}>{t("unassigned")}</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                          <div>
                            <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{t("table.pickup")}</div>
                            <div style={{ color: 'rgb(var(--text))' }}>{formatDate(bl.startAt)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{t("table.return")}</div>
                            <div style={{ color: 'rgb(var(--text))' }}>{formatDate(bl.endAt)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const booking = row.item;
                  const timeToPickup = getTimeToPickup(booking.pickup_at);
                  const effectiveStatus = isEffectivelyOnRent(booking) ? 'on_rent' : booking.status;
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
                          <span style={getStatusChipStyle(effectiveStatus)}>
                            {getStatusLabel(effectiveStatus)}
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
                          <span style={getStatusChipStyle(effectiveStatus)}>
                            {getStatusLabel(effectiveStatus)}
                          </span>
                        </div>
                      )}

                      {canManage && (
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                            {t("table.customer")}
                          </div>
                          <div style={{ color: 'rgb(var(--text))' }}>
                            {(booking.customer_name?.replace(/^(\[\?\]|\?)\s*/, '').trim()) || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}
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
                          {timeToPickup && effectiveStatus !== 'on_rent' && (
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
      </div>
      {/* Blocked period create/edit modal */}
      {blockModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / 0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setBlockModal(null)}
        >
          <div
            style={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', minWidth: '280px', maxWidth: '440px', width: '90vw', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
                {blockModal.mode === 'create' ? tBM('titleCreate') : tBM('titleEdit')}
              </h2>
              <button onClick={() => setBlockModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'rgb(var(--muted))', fontSize: '16px', lineHeight: 1 }} aria-label="Close">✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('vehicleLabel')}</label>
                <select
                  className="input"
                  value={blockModal.vehicleId}
                  onChange={e => setBlockModal(m => m && ({ ...m, vehicleId: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('blockTypeLabel')}</label>
                <select
                  className="input"
                  value={blockModal.blockType}
                  onChange={e => setBlockModal(m => m && ({ ...m, blockType: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  {BLOCK_TYPES.map(bt => (
                    <option key={bt} value={bt}>{BLOCK_TYPE_ICON[bt]} {tBlockTypes(bt)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('labelField')}</label>
                <input
                  type="text"
                  className="input"
                  value={blockModal.label}
                  onChange={e => setBlockModal(m => m && ({ ...m, label: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('startAtLabel')}</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={blockModal.startAt}
                    onChange={e => setBlockModal(m => m && ({ ...m, startAt: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>{tBM('endAtLabel')}</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={blockModal.endAt}
                    onChange={e => setBlockModal(m => m && ({ ...m, endAt: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {blockError && (
                <div style={{ fontSize: '13px', color: 'rgb(var(--error))' }}>{blockError}</div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBlockSave}
                  disabled={blockSaving}
                  style={{ flex: 1 }}
                >
                  {blockSaving ? '…' : tBM('save')}
                </button>
                {blockModal.mode === 'edit' && (!blockModal.sourceType || blockModal.sourceType === 'manual' || blockModal.syncLocked === true) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!blockModal.blockId) return;
                      setBlockSaving(true);
                      try {
                        await fetch(`/api/staff/vehicle-blocks/${blockModal.blockId}`, { method: 'DELETE' });
                        setBlockModal(null);
                        await fetchSnapshot();
                      } catch {
                        setBlockError(tBM('errorSave'));
                      } finally {
                        setBlockSaving(false);
                      }
                    }}
                    disabled={blockSaving}
                  >
                    {tBM('delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
