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
  /** When present, guards pickup ('handover') and return checklists from item-sync auto-completion. */
  checklist_type?: string | null;
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
 * Works for all checklist types: cleaning, mechanical, pickup, handover, return, etc.
 *
 * Return checklists are a special case: they contain phantom item rows for
 * vehicle_data, return_close_out, and deposit_status sections whose .checked
 * field is never written by the UI (those sections are backed by
 * checklist_instances columns and bookings.staff_metadata instead).
 * Only checklist_actions items count toward return progress, and completion
 * is always triggered by the explicit button — never by item-toggle auto-complete.
 */
export function computeInstanceUpdate(
  items: ChecklistItemType[],
  snapshot: InstanceStatusSnapshot,
  userId: string,
  now: string
): InstanceUpdate {
  const isReturn = snapshot.checklist_type === 'return';

  // For return checklists only count the audit (checklist_actions) items.
  // Phantom items (vehicle_data / return_close_out / deposit_status) are excluded.
  const countableItems = isReturn
    ? items.filter((it) => it.template.ui_section === 'checklist_actions')
    : items;

  const checkedCount = countableItems.filter((it) => it.checked).length;
  const totalCount = countableItems.length;
  const noneChecked = checkedCount === 0;
  const isPending = snapshot.status === 'pending' || snapshot.status === 'not_started';

  // Return checklists are completed only via the explicit button (handleReturnCompleteButton)
  // which runs its own close-out + extras validation. Never auto-complete here.
  const allChecked = !isReturn && checkedCount === totalCount;

  if (allChecked && totalCount > 0) {
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

/**
 * Matches the P0001 exceptions raised by the completion-lock triggers in
 * migration 080 (checklist_instances / checklist_instance_items / bookings
 * staff_metadata) plus the handover-before-return guard from migration 007.
 */
export function isLockError(error: any): boolean {
  if (!(error?.code === 'P0001') || typeof error?.message !== 'string') return false;
  const msg: string = error.message;
  return (
    msg.includes('Cannot modify checklist after completion.') ||
    msg.includes('Cannot modify checklist item after completion.') ||
    msg.includes('Cannot remove existing evidence photos after checklist completion.') ||
    msg.includes('Cannot complete return checklist: handover must be completed first')
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

/**
 * Returns null → hide from interactive Audit checklist (covered by Phase 1 VehicleDataBlock or Phase 3 ReturnOfficeSectionCard).
 * Returns string → display this label instead of the DB template label.
 */
export function getReturnAuditDisplayLabel(label: string): string | null {
  const l = label.toLowerCase();
  // Hide vehicle data items — covered by Phase 1 VehicleDataBlock
  if (l.includes('fuel') || l.includes('fluid') || l.includes('adblue') || l.includes('kilometre') || l.includes('kilometer') || l.includes('odometer') || l.includes('mileage')) return null;
  // Hide return office close-out items — covered by Phase 3 ReturnOfficeSectionCard
  if (l.includes('key') && (l.includes('return') || l.includes('received') || l.includes('hand'))) return null;
  if (l.includes('document') && (l.includes('return') || l.includes('received') || l.includes('hand'))) return null;
  if (l.includes('contract') && (l.includes('close') || l.includes('sign') || l.includes('complete'))) return null;
  // Hide deposit-status radio options — covered by Phase 3 deposit radio in ReturnOfficeSectionCard.
  // These are phantom item rows whose checked state is tracked via checklist_instances.return_deposit_status.
  // Guard covers both correctly-classified (deposit_status ui_section) items via the ui_section filter
  // upstream, AND wrongly-classified (checklist_actions) items on old templates before migration 061 runs.
  if (l.includes('deposit') && (l.includes('return') || l.includes('refund') || l.includes('held') || l.includes('status'))) return null;
  if (l.includes('returned to customer') || l.includes('pending admin return') || l.includes('held for damage')) return null;
  // Hide return-specific items not surfaced in this stage
  if (l.includes('deposit') && (l.includes('decision') || l.includes('ready'))) return null;
  if ((l.includes('issue') || l.includes('flagged')) && l.includes('follow')) return null;
  if (l.includes('return') && (l.includes('complete') || l.includes('signed off')) && (l.includes('sign') || l.includes('customer'))) return null;

  // Normalise condition/inspection labels
  if (l.includes('awning')) return 'Awning checked';
  if (l.includes('bike') && l.includes('rack')) return 'Bike rack checked';
  if (l.includes('bumper') || l.includes('bodywork')) return 'Bumper and bodywork checked';
  if (l.includes('cassette') || (l.includes('toilet') && !l.includes('paper'))) return 'Cassette toilet emptied';
  if (l.includes('grey water') || l.includes('gray water') || l.includes('greywater') || l.includes('graywater')) return 'Grey water emptied';
  if (l.includes('exterior') && (l.includes('clean') || l.includes('wash'))) return 'Exterior cleaned';
  if (l.includes('exterior')) return 'Exterior checked for new damage';
  if (l.includes('interior') && (l.includes('clean'))) return 'Interior cleaned';
  if (l.includes('interior')) return 'Interior checked for damage';
  if (l.includes('photo') && (l.includes('damage') || l.includes('new'))) return null;
  if (l.includes('damage') && (l.includes('inspect') || l.includes('check') || l.includes('assess'))) return 'Damage assessment completed';
  if (
    (l.includes('standard') && (l.includes('kit') || l.includes('equipment'))) ||
    (l.includes('kit') && !l.includes('first aid') && !l.includes('tool')) ||
    (l.includes('equipment') && (l.includes('return') || l.includes('verify') || l.includes('check')))
  ) return 'Equipment returned and verified';
  if (l.includes('add-on') || l.includes('addon') || l.includes('add on') || l.includes('extra') || l.includes('optional'))
    return 'Special add-ons returned';

  return label;
}
