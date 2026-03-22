/**
 * Pure stateless helpers shared across checklist-detail hooks and components.
 * No React, no Supabase — importable anywhere.
 */

import type { ChecklistItemType, SyncError, IssueSeverity, DbIssueSeverity } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InstanceStatusSnapshot = {
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

export type InstanceUpdate = {
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

// ─── Severity mapping ─────────────────────────────────────────────────────────

/** Map UI severity → DB severity for persistence */
export function uiToDbSeverity(ui: IssueSeverity): DbIssueSeverity {
  switch (ui) {
    case 'attention': return 'medium';
    case 'urgent': return 'high';
  }
}

// ─── Instance status ──────────────────────────────────────────────────────────

/**
 * Computes the next instance status from checked-item counts.
 * Used only for non-handover auto-complete paths (pickup, return, etc.).
 */
export function computeInstanceUpdate(
  items: ChecklistItemType[],
  snapshot: InstanceStatusSnapshot,
  userId: string,
  now: string
): InstanceUpdate {
  const checkedCount = items.filter((it) => it.checked).length;
  const totalCount = items.length;
  const allChecked = checkedCount === totalCount;
  const noneChecked = checkedCount === 0;
  const isPending = snapshot.status === 'pending' || snapshot.status === 'not_started';

  if (allChecked) {
    return {
      status: 'completed',
      started_at: snapshot.started_at ?? now,
      started_by: snapshot.started_by ?? userId,
      completed_at: now,
      completed_by: userId,
    };
  }

  if (noneChecked) {
    return {
      status: 'pending',
      started_at: snapshot.started_at,
      started_by: snapshot.started_by,
      completed_at: null,
      completed_by: null,
    };
  }

  return {
    status: 'in_progress',
    started_at: isPending ? now : (snapshot.started_at ?? now),
    started_by: isPending ? userId : (snapshot.started_by ?? userId),
    completed_at: null,
    completed_by: null,
  };
}

// ─── Error helpers ────────────────────────────────────────────────────────────

export function parseSyncError(error: any, kind: SyncError['kind']): SyncError {
  return {
    kind,
    message:
      typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : JSON.stringify(error),
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    raw: JSON.stringify(error, null, 2),
  };
}

export function isLockError(error: any): boolean {
  if (!(error?.code === 'P0001') || typeof error?.message !== 'string') return false;
  const msg: string = error.message;
  return (
    msg.includes('Cannot modify handover/return checklists after booking is completed.') ||
    (msg.includes('Cannot edit a') && (msg.includes('handover') || msg.includes('return')) && msg.includes('after')) ||
    (msg.includes('Cannot edit') && msg.includes('checklist item') && msg.includes('must be completed first')) ||
    (msg.includes('Cannot') && (msg.includes('before pickup') || msg.includes('before handover')))
  );
}

export function isReturnAfterCompletionLockError(error: any): boolean {
  return (
    error?.code === 'P0001' &&
    typeof error?.message === 'string' &&
    error.message.includes('Cannot edit a return checklist after the booking has been completed.')
  );
}

// ─── Audit display label ──────────────────────────────────────────────────────

/**
 * Returns null → hide from interactive Audit checklist (covered by Phase 3 Office).
 * Returns string → display this label instead of the DB template label.
 */
export function getPickupAuditDisplayLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes('fuel') || l.includes('fluid')) return null;
  if (l.includes('document') && l.includes('contact')) return null;
  if (l.includes('handover completed') || l.includes('ready to depart') || l.includes('customer ready')) return null;

  if (l.includes('exterior')) return 'Exterior condition checked';
  if (l.includes('interior') && l.includes('condition')) return 'Interior condition checked';
  if (
    (l.includes('standard') && (l.includes('kit') || l.includes('equipment'))) ||
    (l.includes('kit') && !l.includes('first aid') && !l.includes('tool'))
  ) return 'Standard kit present';
  if (l.includes('add-on') || l.includes('addon') || l.includes('add on') || l.includes('extra') || l.includes('optional'))
    return 'Special add-ons loaded';
  if (
    l.includes('key system') || l.includes('controls explained') ||
    (l.includes('explain') && !l.includes('contract')) || l.includes('features')
  ) return 'Key systems explained';
  if (l.includes('interior readiness') || l.includes('interior ready') || (l.includes('ready') && l.includes('interior')))
    return 'Interior readiness confirmed';

  return label;
}
