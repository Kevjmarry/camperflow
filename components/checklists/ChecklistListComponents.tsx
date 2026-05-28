'use client';

import React, { useState, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ChecklistItem, IssueItem, ChecklistLabels } from './checklistListTypes';
import {
  TABLE_STYLE, TH, TD, TD_MUTED, SECTION_HEADING, CARD_CONTAINER,
  getStatusChipStyle, getSeverityChipStyle,
} from './checklistListStyles';

// ─── Checklist table headers shape ───────────────────────────────────────────

export interface ChecklistTableHeaders {
  type: string;
  name: string;
  booking: string;
  customer: string;
  vehicle: string;
  dates: string;
  status: string;
}

export interface IssueTableHeaders {
  issue: string;
  booking: string;
  vehicle: string;
  severity: string;
}

// ─── ChecklistTableRow ────────────────────────────────────────────────────────

export function ChecklistTableRow({
  checklist,
  labels,
  href,
}: {
  checklist: ChecklistItem;
  labels: ChecklistLabels;
  href: string;
}) {
  const router = useRouter();
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => router.push(href)}>
      <td style={TD}>{checklist.template_name ?? '—'}</td>
      <td style={TD}>
        <span style={{ fontWeight: 500 }}>{labels.typeLabel(checklist.name)}</span>
      </td>
      <td style={TD}>{checklist.booking_number}</td>
      <td style={TD}>{checklist.customer_name}</td>
      <td style={TD}>
        <div>{checklist.vehicle_name}</div>
        <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{checklist.vehicle_plate}</div>
      </td>
      <td style={TD_MUTED}>
        {checklist.pickup_at && checklist.return_at
          ? `${labels.fmtDate(checklist.pickup_at)} → ${labels.fmtDate(checklist.return_at)}`
          : '—'}
      </td>
      <td style={TD}>
        <span style={getStatusChipStyle(checklist.status)}>
          {labels.statusLabel(checklist.status)}
        </span>
      </td>
    </tr>
  );
}

// ─── ChecklistMobileCard ──────────────────────────────────────────────────────

export function ChecklistMobileCard({
  checklist,
  labels,
  href,
  isLast,
}: {
  checklist: ChecklistItem;
  labels: ChecklistLabels;
  href: string;
  isLast: boolean;
}) {
  return (
    <Link
      href={href}
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
          {labels.typeLabel(checklist.name)}
          {checklist.template_name && (
            <span style={{ fontWeight: 400, fontSize: '12px', color: 'rgb(var(--muted))', marginLeft: 'var(--space-2)' }}>
              {checklist.template_name}
            </span>
          )}
          <span style={{ fontWeight: 400, fontSize: '13px', color: 'rgb(var(--muted))', marginLeft: 'var(--space-2)' }}>
            #{checklist.booking_number}
          </span>
        </span>
        <span style={getStatusChipStyle(checklist.status)}>
          {labels.statusLabel(checklist.status)}
        </span>
      </div>
      <div style={{ fontSize: '14px', marginBottom: '2px' }}>{checklist.customer_name}</div>
      <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
        {checklist.vehicle_name} · {checklist.vehicle_plate}
      </div>
      {checklist.pickup_at && checklist.return_at && (
        <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
          {labels.fmtDate(checklist.pickup_at)} → {labels.fmtDate(checklist.return_at)}
        </div>
      )}
    </Link>
  );
}

// ─── IssueTableRow ────────────────────────────────────────────────────────────

export function IssueTableRow({
  issue,
  labels,
  href,
}: {
  issue: IssueItem;
  labels: ChecklistLabels;
  href: string;
}) {
  const router = useRouter();
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => router.push(href)}>
      <td style={{ ...TD, borderLeft: '3px solid rgb(var(--warning))' }}>
        <span style={{ fontWeight: 500 }}>{issue.name}</span>
      </td>
      <td style={TD}>{issue.booking_number !== 'N/A' ? issue.booking_number : '—'}</td>
      <td style={TD}>
        <div>{issue.vehicle_name}</div>
        <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{issue.vehicle_plate}</div>
      </td>
      <td style={TD}>
        <span style={getSeverityChipStyle(issue.severity)}>
          {labels.severityLabel(issue.severity)}
        </span>
      </td>
    </tr>
  );
}

// ─── IssueMobileCard ──────────────────────────────────────────────────────────

export function IssueMobileCard({
  issue,
  labels,
  href,
  isLast,
}: {
  issue: IssueItem;
  labels: ChecklistLabels;
  href: string;
  isLast: boolean;
}) {
  return (
    <Link
      href={href}
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
        <span style={getSeverityChipStyle(issue.severity)}>
          {labels.severityLabel(issue.severity)}
        </span>
      </div>
      {issue.booking_number !== 'N/A' && (
        <div style={{ fontSize: '14px', marginBottom: '2px' }}>
          {labels.bookingRef(issue.booking_number)}
        </div>
      )}
      <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
        {issue.vehicle_name} · {issue.vehicle_plate}
      </div>
    </Link>
  );
}

// ─── Year grouping helpers ────────────────────────────────────────────────────

const PICKUP_TYPES = new Set(['pickup', 'handover']);

function getItemYear(item: ChecklistItem): number {
  const isPickup = PICKUP_TYPES.has(item.type);
  const dateStr = isPickup
    ? (item.pickup_at ?? item.return_at ?? item.created_at)
    : (item.return_at ?? item.pickup_at ?? item.created_at);
  return new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr).getFullYear();
}

// ─── ChecklistSection (booking checklists, grouped by status) ────────────────

export function ChecklistSection({
  title,
  items,
  isMobile,
  collapsible,
  collapsed,
  onToggle,
  headers,
  labels,
  getHref,
}: {
  title: string;
  items: ChecklistItem[];
  isMobile: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  headers: ChecklistTableHeaders;
  labels: ChecklistLabels;
  getHref: (id: string) => string;
}) {
  if (items.length === 0) return null;

  const currentYear = new Date().getFullYear();
  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set([currentYear])
  );

  const yearGroups = useMemo(() => {
    const map = new Map<number, ChecklistItem[]>();
    for (const item of items) {
      const year = getItemYear(item);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(item);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, yearItems]) => ({ year, items: yearItems }));
  }, [items]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

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
          {!isMobile && (
            <table style={TABLE_STYLE}>
              <thead>
                <tr>
                  <th style={TH}>{headers.name}</th>
                  <th style={TH}>{headers.type}</th>
                  <th style={TH}>{headers.booking}</th>
                  <th style={TH}>{headers.customer}</th>
                  <th style={TH}>{headers.vehicle}</th>
                  <th style={TH}>{headers.dates}</th>
                  <th style={TH}>{headers.status}</th>
                </tr>
              </thead>
              <tbody>
                {yearGroups.map(({ year, items: yearItems }) => {
                  const yearExpanded = expandedYears.has(year);
                  return (
                    <Fragment key={`year-${year}`}>
                      <tr>
                        <td
                          colSpan={7}
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
                              {yearExpanded ? '▾' : '▸'}
                            </span>
                            {year}
                            <span style={{ fontWeight: 400, color: 'rgb(var(--muted))' }}>
                              · {yearItems.length}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {yearExpanded && yearItems.map((c) => (
                        <ChecklistTableRow
                          key={c.id}
                          checklist={c}
                          labels={labels}
                          href={getHref(c.id)}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {isMobile && (
            <div style={CARD_CONTAINER}>
              {yearGroups.map(({ year, items: yearItems }) => {
                const yearExpanded = expandedYears.has(year);
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
                        marginBottom: yearExpanded ? 'var(--space-3)' : '0',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>
                        {yearExpanded ? '▾' : '▸'}
                      </span>
                      {year}
                      <span style={{ fontWeight: 400, color: 'rgb(var(--muted))' }}>
                        · {yearItems.length}
                      </span>
                    </button>
                    {yearExpanded && yearItems.map((c, idx) => (
                      <ChecklistMobileCard
                        key={c.id}
                        checklist={c}
                        labels={labels}
                        href={getHref(c.id)}
                        isLast={idx === yearItems.length - 1}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── OpenIssuesSection ────────────────────────────────────────────────────────

export function OpenIssuesSection({
  title,
  issues,
  isMobile,
  headers,
  labels,
  getHref,
}: {
  title: string;
  issues: IssueItem[];
  isMobile: boolean;
  headers: IssueTableHeaders;
  labels: ChecklistLabels;
  getHref: (instanceId: string) => string;
}) {
  return (
    <div>
      <h2 style={SECTION_HEADING}>{title}</h2>
      {!isMobile && (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH}>{headers.issue}</th>
              <th style={TH}>{headers.booking}</th>
              <th style={TH}>{headers.vehicle}</th>
              <th style={TH}>{headers.severity}</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <IssueTableRow
                key={issue.id}
                issue={issue}
                labels={labels}
                href={getHref(issue.checklist_instance_id)}
              />
            ))}
          </tbody>
        </table>
      )}
      {isMobile && (
        <div style={CARD_CONTAINER}>
          {issues.map((issue, idx) => (
            <IssueMobileCard
              key={issue.id}
              issue={issue}
              labels={labels}
              href={getHref(issue.checklist_instance_id)}
              isLast={idx === issues.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BookingGroupSection ──────────────────────────────────────────────────────
// Groups checklists by booking, with year grouping (current year open) and
// per-booking expand/collapse. Locking rules match BookingChecklistsSection:
//   prep (not pickup/handover/return) → always clickable
//   pickup/handover → locked until every prep is completed
//   return → locked until at least one pickup/handover is completed

interface BookingGroup {
  booking_id: string;
  booking_number: string;
  customer_name: string;
  vehicle_name: string;
  vehicle_plate: string;
  pickup_at?: string;
  return_at?: string;
  checklists: ChecklistItem[];
}

function bgLockState(cls: ChecklistItem[]) {
  const prep = cls.filter(c => !PICKUP_TYPES.has(c.type) && c.type !== 'return');
  const ph   = cls.filter(c => PICKUP_TYPES.has(c.type));
  return {
    phLocked:   prep.length > 0 && !prep.every(c => c.status === 'completed'),
    retBlocked: ph.length   > 0 && !ph.some(c => c.status === 'completed'),
  };
}

function bgIsLocked(c: ChecklistItem, phLocked: boolean, retBlocked: boolean): boolean {
  return (PICKUP_TYPES.has(c.type) && phLocked) || (c.type === 'return' && retBlocked);
}

function bgWorkflowOrder(c: ChecklistItem, phLocked: boolean, retBlocked: boolean): number {
  if (c.status === 'completed') return 5;
  const isPH  = PICKUP_TYPES.has(c.type);
  const isRet = c.type === 'return';
  if (!isPH && !isRet)           return 0; // prep: always first
  if (isPH  && !phLocked)        return 1; // pickup/handover: unlocked
  if (isRet && !retBlocked)      return 2; // return: unlocked
  if (isPH)                      return 3; // pickup/handover: locked
  return 4;                                // return: locked
}

function bgOverallStatus(cls: ChecklistItem[]): string {
  if (cls.every(c => c.status === 'completed'))  return 'completed';
  if (cls.some(c => c.status === 'in_progress')) return 'in_progress';
  return 'not_started';
}

function bgActionLabel(c: ChecklistItem, t: (key: string) => string): string {
  if (c.status === 'completed')   return t('actions.viewReport');
  if (c.status === 'in_progress') return t('actions.continue');
  return t('actions.open');
}

// Matches the bookings-page getTimeToPickup chip style; returns null when past/missing.
function daysUntil(isoDate: string | undefined, t: (key: string, values?: Record<string, string | number | Date>) => string): React.ReactNode {
  if (!isoDate) return null;
  const diffDays = Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) return null;
  const label = diffDays === 0 ? t('daysUntil.today') : diffDays === 1 ? t('daysUntil.tomorrow') : t('daysUntil.days', { count: diffDays });
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
}

export function BookingGroupSection({
  items,
  statusFilter,
  isMobile,
  headers,
  labels,
  locale,
  getHref,
  emptyText,
}: {
  items: ChecklistItem[];
  statusFilter: string;
  isMobile: boolean;
  headers: ChecklistTableHeaders;
  labels: ChecklistLabels;
  locale: string;
  getHref: (id: string) => string;
  emptyText: string;
}) {
  const t = useTranslations('staff.checklistsPage');
  const currentYear = new Date().getFullYear();
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([currentYear]));
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(() => new Set());

  const yearGroups = useMemo(() => {
    // Group by booking_id
    const bMap = new Map<string, ChecklistItem[]>();
    for (const item of items) {
      if (!bMap.has(item.booking_id)) bMap.set(item.booking_id, []);
      bMap.get(item.booking_id)!.push(item);
    }

    // Build booking groups, applying status filter at the booking level
    const groups: BookingGroup[] = [];
    for (const [bid, cls] of bMap) {
      if (statusFilter !== 'all') {
        const ms = statusFilter === 'not_started' ? ['not_started', 'pending'] : [statusFilter];
        if (!cls.some(c => ms.includes(c.status))) continue;
      }
      const { phLocked, retBlocked } = bgLockState(cls);
      const first = cls[0];
      groups.push({
        booking_id:    bid,
        booking_number: first.booking_number,
        customer_name:  first.customer_name,
        vehicle_name:   first.vehicle_name,
        vehicle_plate:  first.vehicle_plate,
        pickup_at:  first.pickup_at,
        return_at:  first.return_at,
        checklists: [...cls].sort(
          (a, b) => bgWorkflowOrder(a, phLocked, retBlocked) - bgWorkflowOrder(b, phLocked, retBlocked)
        ),
      });
    }

    // Sort: upcoming first (asc by pickup_at), past most-recent first (desc)
    const now = new Date().toISOString();
    groups.sort((a, b) => {
      const da = a.pickup_at ?? '';
      const db = b.pickup_at ?? '';
      const af = da >= now, bf = db >= now;
      if (af && bf)   return da.localeCompare(db);
      if (!af && !bf) return db.localeCompare(da);
      return af ? -1 : 1;
    });

    // Group by year (keyed by booking pickup_at year)
    const yMap = new Map<number, BookingGroup[]>();
    for (const g of groups) {
      const yr = g.pickup_at ? new Date(g.pickup_at).getFullYear() : currentYear;
      if (!yMap.has(yr)) yMap.set(yr, []);
      yMap.get(yr)!.push(g);
    }
    return Array.from(yMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, gs]) => ({ year, groups: gs }));
  }, [items, statusFilter, currentYear]);

  const toggleYear = (yr: number) =>
    setExpandedYears(prev => { const n = new Set(prev); n.has(yr) ? n.delete(yr) : n.add(yr); return n; });

  const toggleBooking = (id: string) =>
    setExpandedBookings(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalGroups = yearGroups.reduce((s, yg) => s + yg.groups.length, 0);

  if (totalGroups === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))', fontSize: '14px' }}>
        {emptyText}
      </div>
    );
  }

  const yearHeaderCell = {
    padding: 'var(--space-2) var(--space-3)',
    background: 'rgb(var(--surface-raised, var(--surface)))',
    borderBottom: '1px solid rgb(var(--border))',
    borderTop: '1px solid rgb(var(--border))',
  };

  // ── Desktop table ─────────────────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH}>{headers.booking}</th>
            <th style={TH}>{headers.customer}</th>
            <th style={TH}>{headers.vehicle}</th>
            <th style={TH}>{t('table.pickup')}</th>
            <th style={TH}>{t('table.pickupIn')}</th>
            <th style={TH}>{t('table.return')}</th>
            <th style={TH}>{t('table.returnIn')}</th>
            <th style={TH}>{t('table.progress')}</th>
            <th style={TH}>{t('table.nextAction')}</th>
          </tr>
        </thead>
        <tbody>
          {yearGroups.map(({ year, groups }) => {
            const yearExpanded = expandedYears.has(year);
            return (
              <Fragment key={`y-${year}`}>
                <tr>
                  <td colSpan={9} style={yearHeaderCell}>
                    <button
                      type="button"
                      onClick={() => toggleYear(year)}
                      style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px', fontWeight: 600, color: 'rgb(var(--text))', userSelect: 'none' }}
                    >
                      <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>{yearExpanded ? '▾' : '▸'}</span>
                      {year}
                      <span style={{ fontWeight: 400, color: 'rgb(var(--muted))' }}>· {groups.length}</span>
                    </button>
                  </td>
                </tr>
                {yearExpanded && groups.map(group => {
                  const isExpanded = expandedBookings.has(group.booking_id);
                  const { phLocked, retBlocked } = bgLockState(group.checklists);
                  const status = bgOverallStatus(group.checklists);
                  const completedCount = group.checklists.filter(c => c.status === 'completed').length;
                  const actionable = group.checklists.find(
                    c => c.status !== 'completed' && !bgIsLocked(c, phLocked, retBlocked)
                  ) ?? null;
                  const pickupIn = daysUntil(group.pickup_at, t);
                  const returnIn = daysUntil(group.return_at, t);
                  return (
                    <Fragment key={group.booking_id}>
                      <tr
                        style={{ cursor: 'pointer', borderBottom: '1px solid rgb(var(--border))' }}
                        onClick={() => toggleBooking(group.booking_id)}
                      >
                        <td style={TD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>{isExpanded ? '▾' : '▸'}</span>
                            <Link
                              href={`/${locale}/staff/bookings/${group.booking_id}`}
                              onClick={e => e.stopPropagation()}
                              style={{ color: 'rgb(var(--brand))', fontWeight: 500, textDecoration: 'none' }}
                            >
                              {group.booking_number}
                            </Link>
                          </div>
                        </td>
                        <td style={TD}>{group.customer_name}</td>
                        <td style={TD}>
                          <div>{group.vehicle_name}</div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{group.vehicle_plate}</div>
                        </td>
                        <td style={TD_MUTED}>{group.pickup_at ? labels.fmtDate(group.pickup_at) : '—'}</td>
                        <td style={TD}>{pickupIn ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>}</td>
                        <td style={TD_MUTED}>{group.return_at ? labels.fmtDate(group.return_at) : '—'}</td>
                        <td style={TD}>{returnIn ?? <span style={{ color: 'rgb(var(--muted))' }}>—</span>}</td>
                        <td style={TD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span style={getStatusChipStyle(status)}>{labels.statusLabel(status)}</span>
                            <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                              {completedCount}/{group.checklists.length}
                            </span>
                          </div>
                        </td>
                        <td style={TD}>
                          {actionable ? (
                            <Link
                              href={getHref(actionable.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none' }}
                            >
                              {labels.typeLabel(actionable.name)}
                            </Link>
                          ) : status === 'completed' ? (
                            <span style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>—</span>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{t('table.waitingForPrep')}</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ padding: 'var(--space-3)', background: 'rgb(var(--background))' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
                              {group.checklists.map(c => {
                                const locked = bgIsLocked(c, phLocked, retBlocked);
                                return (
                                  <div
                                    key={c.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 'var(--space-3)',
                                      padding: 'var(--space-2) var(--space-3)',
                                      border: '1px solid rgb(var(--border))',
                                      borderRadius: 'var(--radius)',
                                      background: 'rgb(var(--surface))',
                                      opacity: locked ? 0.6 : 1,
                                    }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontWeight: 500, fontSize: '14px' }}>
                                        {labels.typeLabel(c.name)}
                                      </span>
                                      {c.template_name && (
                                        <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginLeft: 'var(--space-2)' }}>
                                          {c.template_name}
                                        </span>
                                      )}
                                    </div>
                                    <span style={getStatusChipStyle(c.status)}>
                                      {labels.statusLabel(c.status)}
                                    </span>
                                    {locked ? (
                                      <span
                                        className="btn btn-secondary"
                                        style={{ fontSize: '13px', padding: 'var(--space-1) var(--space-3)', minHeight: '28px', opacity: 0.5, cursor: 'not-allowed', userSelect: 'none' }}
                                      >
                                        {t('actions.locked')}
                                      </span>
                                    ) : (
                                      <Link
                                        href={getHref(c.id)}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '13px', padding: 'var(--space-1) var(--space-3)', minHeight: '28px' }}
                                      >
                                        {bgActionLabel(c, t)}
                                      </Link>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── Mobile cards ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {yearGroups.map(({ year, groups }) => {
        const yearExpanded = expandedYears.has(year);
        return (
          <div key={`ym-${year}`}>
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
                marginBottom: yearExpanded ? 'var(--space-3)' : '0',
              }}
            >
              <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>{yearExpanded ? '▾' : '▸'}</span>
              {year}
              <span style={{ fontWeight: 400, color: 'rgb(var(--muted))' }}>· {groups.length}</span>
            </button>
            {yearExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {groups.map(group => {
                  const isExpanded = expandedBookings.has(group.booking_id);
                  const { phLocked, retBlocked } = bgLockState(group.checklists);
                  const status = bgOverallStatus(group.checklists);
                  const completedCount = group.checklists.filter(c => c.status === 'completed').length;
                  const mPickupIn = daysUntil(group.pickup_at, t);
                  const mReturnIn = daysUntil(group.return_at, t);
                  return (
                    <div
                      key={group.booking_id}
                      style={{ border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}
                    >
                      <div
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 'var(--space-4)', cursor: 'pointer', gap: 'var(--space-3)' }}
                        onClick={() => toggleBooking(group.booking_id)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                            <span style={{ fontSize: '11px', color: 'rgb(var(--muted))' }}>{isExpanded ? '▾' : '▸'}</span>
                            <Link
                              href={`/${locale}/staff/bookings/${group.booking_id}`}
                              onClick={e => e.stopPropagation()}
                              style={{ fontWeight: 600, color: 'rgb(var(--brand))', textDecoration: 'none' }}
                            >
                              {labels.bookingRef(group.booking_number)}
                            </Link>
                          </div>
                          <div style={{ fontSize: '14px', color: 'rgb(var(--text))', marginBottom: '2px' }}>
                            {group.customer_name}
                          </div>
                          <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: '2px' }}>
                            {group.vehicle_name} · {group.vehicle_plate}
                          </div>
                          {group.pickup_at && (
                            <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                              {labels.fmtDate(group.pickup_at)}
                              {mPickupIn && <> {mPickupIn}</>}
                            </div>
                          )}
                          {group.return_at && (
                            <div style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                              {labels.fmtDate(group.return_at)}
                              {mReturnIn && <> {mReturnIn}</>}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={getStatusChipStyle(status)}>{labels.statusLabel(status)}</span>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: '4px' }}>
                            {completedCount}/{group.checklists.length}
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid rgb(var(--border))', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                          {group.checklists.map(c => {
                            const locked = bgIsLocked(c, phLocked, retBlocked);
                            return (
                              <div
                                key={c.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 'var(--space-3)',
                                  padding: 'var(--space-2) var(--space-3)',
                                  border: '1px solid rgb(var(--border))',
                                  borderRadius: 'var(--radius)',
                                  opacity: locked ? 0.6 : 1,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>
                                    {labels.typeLabel(c.name)}
                                    {c.template_name && (
                                      <span style={{ fontWeight: 400, fontSize: '12px', color: 'rgb(var(--muted))', marginLeft: 'var(--space-2)' }}>
                                        {c.template_name}
                                      </span>
                                    )}
                                  </div>
                                  <span style={getStatusChipStyle(c.status)}>{labels.statusLabel(c.status)}</span>
                                </div>
                                {locked ? (
                                  <span
                                    className="btn btn-secondary"
                                    style={{ fontSize: '13px', padding: 'var(--space-1) var(--space-3)', minHeight: '28px', opacity: 0.5, cursor: 'not-allowed', userSelect: 'none', whiteSpace: 'nowrap' }}
                                  >
                                    {t('actions.locked')}
                                  </span>
                                ) : (
                                  <Link
                                    href={getHref(c.id)}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '13px', padding: 'var(--space-1) var(--space-3)', minHeight: '28px', whiteSpace: 'nowrap' }}
                                  >
                                    {bgActionLabel(c, t)}
                                  </Link>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}