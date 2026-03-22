// _pageHelpers.ts
// Pure types, constants, style tokens, and stateless helpers for the
// checklist-template detail page. No React, no Supabase, no side-effects.

import type { CSSProperties } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateScope = 'booking' | 'vehicle';

export interface ChecklistTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  type: string;
  active: boolean;
  created_at: string;
  is_system?: boolean;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  label: string;
  section: string | null;   // null = General; stored as-is in DB (never localised)
  sort_order: number;       // global cross-section ordering
  position: number;         // per-section ordering (unique per section)
  required: boolean;
  input_type: string;
  ui_section?: string | null;  // 'checklist_actions' | 'office' | 'vehicle_data' | null
  options: string[] | null;   // dropdown option labels; null = use runtime default
}

export interface ItemEditState {
  label: string;
  required: boolean;
  input_type: string;
  options: string[];          // editable dropdown options (empty = no override)
  // null = General (DB null), any string = named section, NEW_SECTION_SENTINEL = user typing a new name
  section: string | null;
  newSectionName: string;
  saving: boolean;
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ALL_STANDARD_TYPE_VALUES = [
  'pickup',
  'return',
  'cleaning',
  'mechanical',
  'guest_prereturn',
  'vehicle_readiness',
  'pre_season',
  'post_season',
];

/** Local UI sentinel for the General (null) section. Never written to DB. */
export const GENERAL_SENTINEL = '__general__';

/** Local UI sentinel meaning "user is typing a new section name". Never written to DB. */
export const NEW_SECTION_SENTINEL = '__new__';

// ─── Style tokens ─────────────────────────────────────────────────────────────

export const ERROR_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--error) / 0.08)',
  border: '1px solid rgb(var(--error) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--error))',
  fontSize: '14px',
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function normaliseInputType(raw: string): string {
  if (raw === 'number') return 'number';
  if (raw === 'dropdown') return 'dropdown';
  return 'checkbox';
}

export function isSystemTemplate(template: ChecklistTemplate): boolean {
  return template.is_system === true;
}

/** Returns the local grouping key for an item. null DB section → GENERAL_SENTINEL. */
export function sectionKey(item: ChecklistTemplateItem): string {
  return item.section?.trim() || GENERAL_SENTINEL;
}

export function groupItemsBySection(
  items: ChecklistTemplateItem[],
): { section: string; items: ChecklistTemplateItem[] }[] {
  const map = new Map<string, ChecklistTemplateItem[]>();
  for (const item of items) {
    const key = sectionKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .map(([section, sectionItems]) => ({
      section,
      items: [...sectionItems].sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => {
      const minA = Math.min(...a.items.map((i) => i.sort_order));
      const minB = Math.min(...b.items.map((i) => i.sort_order));
      return minA - minB;
    });
}

/**
 * Given a desired section order (array of section keys), compute new sort_order
 * values for every item so that:
 *   - All items in section[0] get the globally lowest sort_orders (0, 1, 2, …)
 *   - All items in section[1] get the next batch, etc.
 *   - Within each section, per-item relative order (position) is preserved.
 *
 * Returns a Map<itemId, newSortOrder>.
 */
export function computeSortOrdersForSectionReorder(
  allItems: ChecklistTemplateItem[],
  newSectionOrder: string[],
): Map<string, number> {
  const grouped = groupItemsBySection(allItems);
  const sectionItemsMap = new Map(grouped.map((g) => [g.section, g.items]));

  const updateMap = new Map<string, number>();
  let cursor = 0;
  for (const sec of newSectionOrder) {
    const secItems = sectionItemsMap.get(sec) ?? [];
    for (const item of secItems) {
      updateMap.set(item.id, cursor++);
    }
  }
  return updateMap;
}