'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChecklistTemplateItem, ItemEditState } from '@/app/[locale]/staff/checklists/templates/[id]/_pageHelpers';

interface ChecklistItemsEditorProps {
  allItems: ChecklistTemplateItem[];
  visibleItems: ChecklistTemplateItem[];
  onReorder: (newAllItems: ChecklistTemplateItem[]) => void | Promise<void>;
  collapsedSections: Set<string>;
  onToggleSection: (section: string) => void;
  // Item editing
  editingItemId: string | null;
  itemEditStates: Map<string, ItemEditState>;
  isSystem: boolean;
  existingNamedSections: string[];
  reordering: boolean;
  movingSection: boolean;
  addingItem: boolean;
  onStartEdit: (item: ChecklistTemplateItem) => void;
  onCancelEdit: () => void;
  onUpdateEditField: <K extends keyof ItemEditState>(itemId: string, field: K, value: ItemEditState[K]) => void;
  onSaveItem: (item: ChecklistTemplateItem) => void | Promise<void>;
  // Section drag reorder + per-section add
  onAddItemToSection: (targetDbSection: string | null) => void | Promise<void>;
  onReorderSections: (newSectionOrder: string[]) => void | Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GENERAL_SENTINEL = '__general__';
const NEW_SECTION_SENTINEL = '__new__';
// Prefix section IDs in the outer DnD context to avoid clashes with item UUIDs
const SEC = 'sec:';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sectionKey(item: ChecklistTemplateItem): string {
  return item.section?.trim() || GENERAL_SENTINEL;
}

function groupItemsBySection(
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

// ─── DragHandle SVG ───────────────────────────────────────────────────────────

function DragHandleSVG() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1.5" width="10" height="1.5" rx="0.75" />
      <rect x="1" y="6.25" width="10" height="1.5" rx="0.75" />
      <rect x="1" y="11" width="10" height="1.5" rx="0.75" />
    </svg>
  );
}

// ─── SortableItem ─────────────────────────────────────────────────────────────

interface SortableItemProps {
  item: ChecklistTemplateItem;
  t: ReturnType<typeof useTranslations>;
  isEditing: boolean;
  editState: ItemEditState | undefined;
  existingNamedSections: string[];
  disabled: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveItem: () => void;
  onUpdateField: <K extends keyof ItemEditState>(field: K, value: ItemEditState[K]) => void;
}

function SortableItem({
  item,
  t,
  isEditing,
  editState,
  existingNamedSections,
  disabled,
  onStartEdit,
  onCancelEdit,
  onSaveItem,
  onUpdateField,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging
      ? 'rgb(var(--brand) / 0.05)'
      : isEditing
        ? 'rgb(var(--brand) / 0.02)'
        : 'rgb(var(--background))',
  };

  // ── Edit form ──
  if (isEditing && editState) {
    const sectionIsNew = editState.section === NEW_SECTION_SENTINEL;
    const canSave =
      !editState.saving &&
      editState.label.trim().length > 0 &&
      (!sectionIsNew || editState.newSectionName.trim().length > 0);

    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          padding: 'var(--space-3) var(--space-4)',
          borderTop: '1px solid rgb(var(--border))',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <input
          className="input"
          type="text"
          value={editState.label}
          onChange={(e) => onUpdateField('label', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSaveItem();
            if (e.key === 'Escape') onCancelEdit();
          }}
          disabled={editState.saving}
          style={{ fontSize: '13px' }}
          autoFocus
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '13px', color: 'rgb(var(--text))', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editState.required}
              onChange={(e) => onUpdateField('required', e.target.checked)}
              disabled={editState.saving}
              style={{ width: '14px', height: '14px', cursor: 'pointer' }}
            />
            {t('itemFieldRequired')}
          </label>
          <select
            className="input"
            value={editState.input_type}
            onChange={(e) => onUpdateField('input_type', e.target.value)}
            disabled={editState.saving}
            style={{ fontSize: '13px', flex: '1 1 120px', minWidth: 0 }}
          >
            <option value="checkbox">{t('inputTypeCheckbox')}</option>
            <option value="number">{t('inputTypeNumber')}</option>
            <option value="dropdown">{t('inputTypeDropdown')}</option>
          </select>
        </div>
        {editState.input_type === 'dropdown' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgb(var(--muted))' }}>{t('itemDropdownOptions')}</span>
            {editState.options.map((opt, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <input
                  className="input"
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const next = [...editState.options];
                    next[idx] = e.target.value;
                    onUpdateField('options', next);
                  }}
                  disabled={editState.saving}
                  placeholder={t('dropdownOptionPlaceholder', { n: idx + 1 })}
                  style={{ fontSize: '13px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => onUpdateField('options', editState.options.filter((_, i) => i !== idx))}
                  disabled={editState.saving}
                  aria-label={t('removeOptionAria')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgb(var(--error))', padding: '0 6px', fontSize: '16px', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onUpdateField('options', [...editState.options, ''])}
              disabled={editState.saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgb(var(--brand))', fontSize: '13px', padding: 0, textAlign: 'left' }}
            >
              {t('addOption')}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <select
            className="input"
            value={editState.section === NEW_SECTION_SENTINEL ? NEW_SECTION_SENTINEL : (editState.section ?? GENERAL_SENTINEL)}
            onChange={(e) => {
              const val = e.target.value;
              onUpdateField('section', val === GENERAL_SENTINEL ? null : val);
              if (val !== NEW_SECTION_SENTINEL) onUpdateField('newSectionName', '');
            }}
            disabled={editState.saving}
            style={{ fontSize: '13px' }}
          >
            <option value={GENERAL_SENTINEL}>{t('sectionDefault')}</option>
            {existingNamedSections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value={NEW_SECTION_SENTINEL}>{t('sectionOptionNewSection')}</option>
          </select>
          {sectionIsNew && (
            <input
              className="input"
              type="text"
              placeholder={t('newSectionNamePlaceholder')}
              value={editState.newSectionName}
              onChange={(e) => onUpdateField('newSectionName', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSaveItem(); }}
              disabled={editState.saving}
              style={{ fontSize: '13px' }}
            />
          )}
        </div>
        {editState.error && (
          <p style={{ margin: 0, fontSize: '12px', color: 'rgb(var(--error))' }}>{editState.error}</p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className="btn btn-primary"
            onClick={onSaveItem}
            disabled={!canSave}
            style={{ fontSize: '13px', padding: '4px 14px', height: '30px' }}
          >
            {editState.saving ? t('btnSaving') : t('btnSave')}
          </button>
          <button
            className="btn"
            onClick={onCancelEdit}
            disabled={editState.saving}
            style={{ fontSize: '13px', padding: '4px 14px', height: '30px' }}
          >
            {t('btnCancel')}
          </button>
        </div>
      </div>
    );
  }

  // ── Read view ──
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-4)',
        borderTop: '1px solid rgb(var(--border))',
        transition: 'background 0.15s, opacity 0.15s',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        aria-label={t('dragToReorderAria')}
        style={{
          flexShrink: 0,
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgb(var(--muted))',
          cursor: isDragging ? 'grabbing' : 'grab',
          opacity: 0.5,
          touchAction: 'none',
        }}
      >
        <DragHandleSVG />
      </span>
      <span
        style={{
          flex: 1,
          fontSize: '14px',
          color: 'rgb(var(--text))',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}>
        {item.input_type === 'number' && (
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: 'rgb(var(--brand) / 0.08)', color: 'rgb(var(--brand))', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {t('inputTypeNumber')}
          </span>
        )}
        {item.input_type === 'dropdown' && (
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: 'rgb(var(--brand) / 0.08)', color: 'rgb(var(--brand))', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {t('inputTypeDropdown')}
          </span>
        )}
        {item.required && (
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: 'rgb(var(--error) / 0.08)', color: 'rgb(var(--error))', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {t('itemFieldRequired')}
          </span>
        )}
      </div>
      <button
        onClick={onStartEdit}
        disabled={disabled}
        aria-label={t('btnEdit')}
        style={{
          flexShrink: 0,
          background: 'none',
          border: 'none',
          padding: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'rgb(var(--muted))',
          opacity: disabled ? 0.3 : 0.6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

// ─── SortableSectionWrapper ───────────────────────────────────────────────────
// Provides section-level drag-and-drop. Uses a render-prop to pass handle attrs
// down to the section header without needing to break the section card structure.

interface SortableSectionWrapperProps {
  sectionId: string;
  disabled: boolean;
  children: (props: { handleAttrs: object; isDragging: boolean }) => React.ReactNode;
}

function SortableSectionWrapper({ sectionId, disabled, children }: SortableSectionWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: SEC + sectionId, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: 'relative',
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      {children({ handleAttrs: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

// ─── ChecklistItemsEditor ─────────────────────────────────────────────────────

export default function ChecklistItemsEditor({
  allItems,
  visibleItems,
  onReorder,
  collapsedSections,
  onToggleSection,
  editingItemId,
  itemEditStates,
  existingNamedSections,
  reordering,
  movingSection,
  addingItem,
  onStartEdit,
  onCancelEdit,
  onUpdateEditField,
  onSaveItem,
  onAddItemToSection,
  onReorderSections,
}: ChecklistItemsEditorProps) {
  const t = useTranslations('staffChecklistTemplateDetail');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const allGrouped = useMemo(() => groupItemsBySection(allItems), [allItems]);

  const visibleBySectionKey = useMemo(() => {
    const map = new Map<string, ChecklistTemplateItem[]>();
    for (const item of visibleItems) {
      const key = sectionKey(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [visibleItems]);

  // Sections to render: in allItems order, only those with ≥1 visible item
  const grouped = useMemo(
    () =>
      allGrouped
        .map(({ section }) => ({
          section,
          items: visibleBySectionKey.get(section) ?? [],
        }))
        .filter((g) => g.items.length > 0),
    [allGrouped, visibleBySectionKey],
  );

  const isBusy = reordering || movingSection;
  // Disable section reorder when any filter is active — avoids hidden-section ordering ambiguity
  const canReorderSections = !isBusy && visibleItems.length === allItems.length;

  // ── Section drag end ──
  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sectionKeys = grouped.map((g) => g.section);
    const oldIdx = sectionKeys.findIndex((s) => SEC + s === active.id);
    const newIdx = sectionKeys.findIndex((s) => SEC + s === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorderSections(arrayMove(sectionKeys, oldIdx, newIdx));
  }

  // ── Item drag end (within section) ──
  function handleItemDragEnd(event: DragEndEvent, sectionVisibleItems: ChecklistTemplateItem[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionVisibleItems.findIndex((i) => i.id === active.id);
    const newIndex = sectionVisibleItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sectionVisibleItems, oldIndex, newIndex);
    const sortedPositions = [...sectionVisibleItems]
      .sort((a, b) => a.position - b.position)
      .map((i) => i.position);
    const updatedVisible = reordered.map((item, idx) => ({ ...item, position: sortedPositions[idx] }));
    const updatedById = new Map(updatedVisible.map((i) => [i.id, i]));
    onReorder(allItems.map((i) => updatedById.get(i.id) ?? i));
  }

  if (visibleItems.length === 0) {
    return (
      <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'rgb(var(--muted))', fontSize: '14px', border: '1px dashed rgb(var(--border))', borderRadius: 'var(--radius)' }}>
        {t('emptyItems')}
      </div>
    );
  }

  return (
    <DndContext
      id="sections"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleSectionDragEnd}
    >
      <SortableContext
        items={grouped.map((g) => SEC + g.section)}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {grouped.map(({ section, items: sectionItems }) => {
            const label = section === GENERAL_SENTINEL ? t('sectionDefault') : section;
            const isCollapsed = collapsedSections.has(section);
            const sectionDbValue = section === GENERAL_SENTINEL ? null : section;

            return (
              <SortableSectionWrapper
                key={section}
                sectionId={section}
                disabled={!canReorderSections}
              >
                {({ handleAttrs, isDragging: sectionDragging }) => (
                  <div
                    style={{
                      border: '1px solid rgb(var(--border))',
                      borderRadius: 'var(--radius)',
                      overflow: 'hidden',
                      background: sectionDragging ? 'rgb(var(--brand) / 0.02)' : 'rgb(var(--background))',
                    }}
                  >
                    {/* Section header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        padding: 'var(--space-2) var(--space-3) var(--space-2) var(--space-2)',
                        background: 'rgb(var(--surface))',
                        borderBottom: isCollapsed ? 'none' : '1px solid rgb(var(--border))',
                        minHeight: '40px',
                      }}
                    >
                      {/* Section drag handle */}
                      <span
                        {...handleAttrs}
                        aria-label={t('dragToReorderSectionAria')}
                        style={{
                          flexShrink: 0,
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'rgb(var(--muted))',
                          cursor: canReorderSections ? (sectionDragging ? 'grabbing' : 'grab') : 'not-allowed',
                          opacity: canReorderSections ? 0.45 : 0.2,
                          touchAction: 'none',
                        }}
                      >
                        <DragHandleSVG />
                      </span>

                      {/* Collapse toggle */}
                      <button
                        onClick={() => onToggleSection(section)}
                        aria-expanded={!isCollapsed}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          background: 'none',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderBottom: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'rgb(var(--text))',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: 'rgb(var(--brand) / 0.1)',
                            color: 'rgb(var(--brand))',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {sectionItems.length}
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'rgb(var(--muted))',
                            flexShrink: 0,
                            display: 'inline-block',
                            transition: 'transform 0.2s',
                            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                          }}
                        >
                          ▾
                        </span>
                      </button>
                    </div>

                    {/* Sortable items */}
                    {!isCollapsed && (
                      <>
                        <DndContext
                          id={`items-${section}`}
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleItemDragEnd(event, sectionItems)}
                        >
                          <SortableContext
                            items={sectionItems.map((i) => i.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div>
                              {sectionItems.map((item) => {
                                const isEditing = editingItemId === item.id;
                                const editState = itemEditStates.get(item.id);
                                return (
                                  <SortableItem
                                    key={item.id}
                                    item={item}
                                    t={t}
                                    isEditing={isEditing}
                                    editState={editState}
                                    existingNamedSections={existingNamedSections}
                                    disabled={isBusy && !isEditing}
                                    onStartEdit={() => onStartEdit(item)}
                                    onCancelEdit={onCancelEdit}
                                    onSaveItem={() => onSaveItem(item)}
                                    onUpdateField={(field, value) => onUpdateEditField(item.id, field, value)}
                                  />
                                );
                              })}
                            </div>
                          </SortableContext>
                        </DndContext>

                        {/* Per-section add item */}
                        <div
                          style={{
                            borderTop: '1px solid rgb(var(--border))',
                            padding: 'var(--space-2) var(--space-4)',
                          }}
                        >
                          <button
                            onClick={() => onAddItemToSection(sectionDbValue)}
                            disabled={addingItem || isBusy}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: '13px',
                              color: 'rgb(var(--brand))',
                              cursor: addingItem || isBusy ? 'not-allowed' : 'pointer',
                              opacity: addingItem || isBusy ? 0.4 : 1,
                            }}
                          >
                            + {t('btnAddItem')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </SortableSectionWrapper>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}