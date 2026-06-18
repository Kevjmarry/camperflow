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

// Fixed display order: handover/pickup → return → cleaning → mechanical → everything else
const TYPE_ORDER: Record<string, number> = {
  handover:   0,
  pickup:     0,
  return:     1,
  cleaning:   2,
  mechanical: 3,
};

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

  const sorted = [...instances].sort((a, b) => {
    const pa = TYPE_ORDER[a.checklist_type] ?? 99;
    const pb = TYPE_ORDER[b.checklist_type] ?? 99;
    return pa - pb;
  });

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
          {sorted.map((instance) => (
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
                <span style={getStatusChipStyle(instance.status)}>
                  {getChecklistStatusLabel(instance.status)}
                </span>
              </div>
              <Link
                href={`/${locale}/staff/checklists/${instance.id}?from=booking`}
                className="btn btn-secondary"
                style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px' }}
              >
                {getChecklistActionLabel(instance)}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
