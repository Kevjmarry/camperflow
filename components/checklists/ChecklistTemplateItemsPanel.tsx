'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import ChecklistItemsEditor from '@/components/checklists/ChecklistItemsEditor';
import type { ChecklistTemplateItem, ItemEditState } from '@/app/[locale]/staff/checklists/templates/[id]/_pageHelpers';

// ─── Constants ────────────────────────────────────────────────────────────────

const GENERAL_SENTINEL = '__general__';
const NEW_SECTION_SENTINEL = '__new__';

// ─── Style tokens ─────────────────────────────────────────────────────────────

const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

const ERROR_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--error) / 0.08)',
  border: '1px solid rgb(var(--error) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--error))',
  fontSize: '14px',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChecklistTemplateItemsPanelProps {
  // Items data
  items: ChecklistTemplateItem[];
  filteredItems: ChecklistTemplateItem[];
  groupedItems: { section: string; items: ChecklistTemplateItem[] }[];
  itemsLoading: boolean;
  itemsError: string | null;

  // Search/filter state
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  showOnlyRequired: boolean;
  setShowOnlyRequired: (v: boolean) => void;

  // Section collapse state
  collapsedSections: Set<string>;
  setCollapsedSections: Dispatch<SetStateAction<Set<string>>>;

  // Error state
  sectionMoveError: string | null;
  setSectionMoveError: (v: string | null) => void;
  addItemError: string | null;
  setAddItemError: (v: string | null) => void;

  // Add-item state
  addingItem: boolean;
  newItemSectionChoice: string;
  setNewItemSectionChoice: (v: string) => void;
  newItemNewSectionName: string;
  setNewItemNewSectionName: (v: string) => void;

  // Reorder state
  reordering: boolean;
  movingSection: boolean;

  // Edit state
  editingItemId: string | null;
  itemEditStates: Map<string, ItemEditState>;
  existingNamedSections: string[];
  isSystem: boolean;

  // Handlers
  handleAddItem: () => void | Promise<void>;
  handleAddItemToSection: (targetDbSection: string | null) => void | Promise<void>;
  handleDndReorder: (newItems: ChecklistTemplateItem[]) => void | Promise<void>;
  handleDndReorderSections: (newSectionOrder: string[]) => void | Promise<void>;
  toggleSection: (section: string) => void;
  startEditing: (item: ChecklistTemplateItem) => void;
  cancelEditing: () => void;
  updateEditField: <K extends keyof ItemEditState>(itemId: string, field: K, value: ItemEditState[K]) => void;
  handleSaveItem: (item: ChecklistTemplateItem) => void | Promise<void>;

  // i18n
  t: ReturnType<typeof useTranslations>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChecklistTemplateItemsPanel({
  items,
  filteredItems,
  groupedItems,
  itemsLoading,
  itemsError,
  searchQuery,
  setSearchQuery,
  showOnlyRequired,
  setShowOnlyRequired,
  collapsedSections,
  setCollapsedSections,
  sectionMoveError,
  setSectionMoveError,
  addItemError,
  setAddItemError,
  addingItem,
  newItemSectionChoice,
  setNewItemSectionChoice,
  newItemNewSectionName,
  setNewItemNewSectionName,
  reordering,
  movingSection,
  editingItemId,
  itemEditStates,
  existingNamedSections,
  isSystem,
  handleAddItem,
  handleAddItemToSection,
  handleDndReorder,
  handleDndReorderSections,
  toggleSection,
  startEditing,
  cancelEditing,
  updateEditField,
  handleSaveItem,
  t,
}: ChecklistTemplateItemsPanelProps) {
  return (
    <div style={{ border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', background: 'rgb(var(--background))', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Sticky header */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgb(var(--background))',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid rgb(var(--border))',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', minWidth: 0 }}>
          <h2 style={{ ...SECTION_HEADING, margin: 0 }}>{t('sectionItems')}</h2>
          {!itemsLoading && !itemsError && (
            <span style={{ fontSize: '13px', color: 'rgb(var(--muted))', flexShrink: 0 }}>{filteredItems.length}/{items.length}</span>
          )}
        </div>

        {/* Add section — available for all templates (system and company) */}
        {!itemsLoading && !itemsError && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {newItemSectionChoice !== NEW_SECTION_SENTINEL ? (
              <button
                className="btn"
                onClick={() => setNewItemSectionChoice(NEW_SECTION_SENTINEL)}
                disabled={addingItem}
                style={{ fontSize: '13px', padding: '5px 14px', height: '32px', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
              >
                + Add section
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="text"
                  placeholder={t('newSectionNamePlaceholder')}
                  value={newItemNewSectionName}
                  onChange={(e) => setNewItemNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newItemNewSectionName.trim()) handleAddItem();
                    if (e.key === 'Escape') { setNewItemSectionChoice(GENERAL_SENTINEL); setNewItemNewSectionName(''); }
                  }}
                  disabled={addingItem}
                  style={{ fontSize: '13px', flex: '1 1 160px', minWidth: 0 }}
                  autoFocus
                />
                <button
                  className="btn btn-primary"
                  onClick={handleAddItem}
                  disabled={addingItem || !newItemNewSectionName.trim()}
                  style={{ fontSize: '13px', padding: '5px 14px', height: '32px', flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {addingItem ? t('btnSaving') : 'Add section'}
                </button>
                <button
                  className="btn"
                  onClick={() => { setNewItemSectionChoice(GENERAL_SENTINEL); setNewItemNewSectionName(''); }}
                  disabled={addingItem}
                  style={{ fontSize: '13px', padding: '5px 14px', height: '32px', flexShrink: 0 }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <input
          className="input"
          type="search"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ fontSize: '14px' }}
          aria-label={t('searchAriaLabel')}
        />

        {/* Filter + collapse-all row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px', color: 'rgb(var(--muted))', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlyRequired}
              onChange={(e) => setShowOnlyRequired(e.target.checked)}
              style={{ width: '14px', height: '14px', cursor: 'pointer' }}
            />
            {t('filterShowRequired')}
          </label>
          {!itemsLoading && groupedItems.length > 1 && (
            <button
              style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', color: 'rgb(var(--brand))', cursor: 'pointer', marginLeft: 'auto' }}
              onClick={() => {
                const allSections = groupedItems.map((g) => g.section);
                const allCollapsed = allSections.every((s) => collapsedSections.has(s));
                setCollapsedSections(allCollapsed ? new Set() : new Set(allSections));
              }}
            >
              {groupedItems.every((g) => collapsedSections.has(g.section)) ? t('btnExpandAll') : t('btnCollapseAll')}
            </button>
          )}
        </div>

        {/* Error banners */}
        {sectionMoveError && (
          <div style={{ ...ERROR_BOX, marginTop: 0 }}>
            {sectionMoveError}
            <button onClick={() => setSectionMoveError(null)} style={{ marginLeft: 'var(--space-3)', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '12px', textDecoration: 'underline', padding: 0 }}>
              {t('dismissError')}
            </button>
          </div>
        )}
        {addItemError && (
          <div style={{ ...ERROR_BOX, marginTop: 0 }}>
            {addItemError}
            <button onClick={() => setAddItemError(null)} style={{ marginLeft: 'var(--space-3)', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '12px', textDecoration: 'underline', padding: 0 }}>
              {t('dismissError')}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 'var(--space-4) var(--space-5)', flex: 1, overflowY: 'auto' }}>
        {itemsLoading && (
          <div style={{ padding: 'var(--space-6) 0', textAlign: 'center', color: 'rgb(var(--muted))', fontSize: '14px' }}>{t('loadingItems')}</div>
        )}
        {!itemsLoading && itemsError && <div style={ERROR_BOX}>{itemsError}</div>}
        {!itemsLoading && !itemsError && items.length === 0 && (
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              color: 'rgb(var(--muted))',
              fontSize: '14px',
              border: '1px dashed rgb(var(--border))',
              borderRadius: 'var(--radius)',
            }}
          >
            {t('emptyItems')}
          </div>
        )}
        {!itemsLoading && !itemsError && items.length > 0 && filteredItems.length === 0 && (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'rgb(var(--muted))', fontSize: '14px', border: '1px dashed rgb(var(--border))', borderRadius: 'var(--radius)' }}>
            {t('emptyFiltered')}
          </div>
        )}

        {!itemsLoading && !itemsError && filteredItems.length > 0 && (
          <ChecklistItemsEditor
            allItems={items}
            visibleItems={filteredItems}
            onReorder={handleDndReorder}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
            editingItemId={editingItemId}
            itemEditStates={itemEditStates}
            isSystem={isSystem}
            existingNamedSections={existingNamedSections}
            reordering={reordering}
            movingSection={movingSection}
            onStartEdit={startEditing}
            onCancelEdit={cancelEditing}
            onUpdateEditField={updateEditField}
            onSaveItem={handleSaveItem}
            addingItem={addingItem}
            onAddItemToSection={handleAddItemToSection}
            onReorderSections={handleDndReorderSections}
          />
        )}
      </div>
    </div>
  );
}