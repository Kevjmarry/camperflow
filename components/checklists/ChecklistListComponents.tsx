'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChecklistItem, IssueItem, ChecklistLabels } from './checklistListTypes';
import {
  TABLE_STYLE, TH, TD, TD_MUTED, SECTION_HEADING, CARD_CONTAINER,
  getStatusChipStyle, getSeverityChipStyle,
} from './checklistListStyles';

// ─── Checklist table headers shape ───────────────────────────────────────────

export interface ChecklistTableHeaders {
  type: string;
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
                  <th style={TH}>{headers.type}</th>
                  <th style={TH}>{headers.booking}</th>
                  <th style={TH}>{headers.customer}</th>
                  <th style={TH}>{headers.vehicle}</th>
                  <th style={TH}>{headers.dates}</th>
                  <th style={TH}>{headers.status}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <ChecklistTableRow
                    key={c.id}
                    checklist={c}
                    labels={labels}
                    href={getHref(c.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
          {isMobile && (
            <div style={CARD_CONTAINER}>
              {items.map((c, idx) => (
                <ChecklistMobileCard
                  key={c.id}
                  checklist={c}
                  labels={labels}
                  href={getHref(c.id)}
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