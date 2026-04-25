"use client";

import Link from "next/link";
import { getStatusChipStyle } from "@/lib/statusChip";

type ChecklistType = 'pickup' | 'handover' | 'return' | 'cleaning' | 'mechanical';

export interface ChecklistInstance {
  id: string;
  checklist_type: ChecklistType;
  status: 'not_started' | 'pending' | 'in_progress' | 'completed';
  template: {
    id: string;
    name: string | null;
    title: string | null;
    type: string | null;
    scope: string | null;
    is_system: boolean;
  } | null;
}

interface Props {
  instances: ChecklistInstance[];
  locale: string;
  t: (key: string, values?: Record<string, unknown>) => string;
}

const SYSTEM_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  pickup: 'checklists.systemTypes.pickup',
  handover: 'checklists.systemTypes.handover',
  return: 'checklists.systemTypes.return',
  cleaning: 'checklists.systemTypes.cleaning',
  mechanical: 'checklists.systemTypes.mechanical',
};

const PICKUP_HANDOVER_TYPES = new Set(['pickup', 'handover']);

export function BookingChecklistsSection({ instances, locale, t }: Props) {
  const getChecklistDisplayName = (instance: ChecklistInstance): string => {
    if (instance.template?.is_system) {
      const key = SYSTEM_TYPE_TRANSLATION_KEYS[instance.checklist_type];
      return key ? t(key) : instance.checklist_type;
    }
    return (
      instance.template?.name ??
      instance.template?.title ??
      instance.checklist_type
    );
  };

  const getChecklistStatusLabel = (status: 'not_started' | 'pending' | 'in_progress' | 'completed') => {
    switch (status) {
      case 'not_started':
      case 'pending':     return t("checklists.status.notStarted");
      case 'in_progress': return t("checklists.status.inProgress");
      case 'completed':   return t("checklists.status.completed");
      default:            return t("checklists.status.notStarted");
    }
  };

  const getChecklistActionLabel = (instance: ChecklistInstance): string => {
    switch (instance.status) {
      case 'completed':   return t("checklists.viewReport");
      case 'in_progress': return t("checklists.continueChecklist");
      default:            return t("checklists.openChecklist");
    }
  };

  // pickup/handover are locked until every non-return prep checklist (cleaning, mechanical, …) is completed
  const blockingInstances = instances.filter(
    i => !PICKUP_HANDOVER_TYPES.has(i.checklist_type) && i.checklist_type !== 'return'
  );
  const pickupHandoverLocked = blockingInstances.length > 0 &&
    !blockingInstances.every(i => i.status === 'completed');
  const firstBlocker = pickupHandoverLocked
    ? blockingInstances.find(i => i.status !== 'completed') ?? null
    : null;

  // return is blocked until at least one pickup/handover checklist is completed
  const pickupHandoverInstances = instances.filter(i => PICKUP_HANDOVER_TYPES.has(i.checklist_type));
  const returnBlocked = pickupHandoverInstances.length > 0 &&
    !pickupHandoverInstances.some(i => i.status === 'completed');

  // Sort order (incomplete actionable first, then blocked, then completed):
  //   0 — incomplete prep (cleaning/mechanical): always actionable
  //   1 — incomplete pickup/handover: unlocked (prep done)
  //   2 — incomplete return: unblocked (pickup done)
  //   3 — locked pickup/handover: blocked by prep
  //   4 — blocked return: blocked by pickup
  //   5 — completed (all types)
  const workflowPriority = (i: ChecklistInstance): number => {
    const done = i.status === 'completed';
    const isPH = PICKUP_HANDOVER_TYPES.has(i.checklist_type);
    const isReturn = i.checklist_type === 'return';
    const isPrep = !isPH && !isReturn;

    if (!done && isPrep)                        return 0;
    if (!done && isPH && !pickupHandoverLocked) return 1;
    if (!done && isReturn && !returnBlocked)    return 2;
    if (!done && isPH && pickupHandoverLocked)  return 3;
    if (!done && isReturn && returnBlocked)     return 4;
    return 5;
  };
  const sorted = [...instances].sort((a, b) => workflowPriority(a) - workflowPriority(b));

  return (
    <div>
      <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
        {t("checklists.title")}
      </h2>
      {instances.length === 0 ? (
        <div style={{
          padding: 'var(--space-4)',
          background: 'rgb(var(--border) / 0.3)',
          borderRadius: 'var(--radius)',
          color: 'rgb(var(--muted))',
          fontSize: '14px',
          textAlign: 'center'
        }}>
          {t("checklists.empty")}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {sorted.map((instance) => {
            const isPickupHandover = PICKUP_HANDOVER_TYPES.has(instance.checklist_type);
            const isReturn = instance.checklist_type === 'return';
            const isLocked = (isPickupHandover && pickupHandoverLocked) || (isReturn && returnBlocked);
            return (
              <div
                key={instance.id}
                style={{
                  padding: 'var(--space-4)',
                  background: 'rgb(var(--border) / 0.3)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgb(var(--text))',
                    marginBottom: 'var(--space-1)'
                  }}>
                    {getChecklistDisplayName(instance)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={getStatusChipStyle(instance.status)}>
                      {getChecklistStatusLabel(instance.status)}
                    </span>
                    {isPickupHandover && isLocked && firstBlocker && (
                      <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                        {`${getChecklistDisplayName(firstBlocker)}: ${getChecklistStatusLabel(firstBlocker.status)}`}
                      </span>
                    )}
                  </div>
                </div>
                {isLocked ? (
                  <span
                    className="btn btn-secondary"
                    style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px', opacity: 0.5, cursor: 'not-allowed', userSelect: 'none' }}
                  >
                    {t('checklists.openChecklist')}
                  </span>
                ) : (
                  <Link
                    href={`/${locale}/staff/checklists/${instance.id}?from=booking`}
                    className="btn btn-secondary"
                    style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px' }}
                  >
                    {getChecklistActionLabel(instance)}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
