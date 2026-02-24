'use client';

import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';
import { useTranslations } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateScope = 'booking' | 'vehicle';

interface ChecklistTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  type: string;
  active: boolean;
  created_at: string;
  is_system?: boolean;
}

interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  label: string;
  section: string | null;
  sort_order: number;
  required: boolean;
  input_type: string;
}

interface ItemEditState {
  label: string;
  required: boolean;
  input_type: string;
  saving: boolean;
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STANDARD_TYPE_VALUES = [
  'pickup',
  'return',
  'cleaning',
  'mechanical',
  'guest_prereturn',
  'vehicle_readiness',
  'pre_season',
  'post_season',
];

// Lifecycle stage keys (locale-neutral identifiers)
const LIFECYCLE_STAGE_KEYS = [
  'bookingCreated',
  'confirmed',
  'pickup',
  'return',
  'cleaning',
  'ready',
] as const;

// Maps checklist type → lifecycle stage key (null = vehicle-only, outside booking cycle)
const TYPE_LIFECYCLE_STAGE_KEY: Record<string, string | null> = {
  pickup: 'pickup',
  return: 'return',
  cleaning: 'cleaning',
  mechanical: 'cleaning',
  guest_prereturn: 'return',
  vehicle_readiness: 'ready',
  pre_season: null,
  post_season: null,
};

function normaliseInputType(raw: string): string {
  return raw === 'number' ? 'number' : 'checkbox';
}

// ─── TypeExplanationPanel ─────────────────────────────────────────────────────

function TypeExplanationPanel({ selectedType }: { selectedType: string }) {
  const expT = useTranslations('checklistTypeExplanations');

  // mechanical reuses cleaning's explanation text
  const expKey = selectedType === 'mechanical' ? 'cleaning' : selectedType;

  const knownTypes = Object.keys(TYPE_LIFECYCLE_STAGE_KEY);
  if (!knownTypes.includes(selectedType)) return null;

  function safeGet(key: string): string {
    try {
      return expT(key as Parameters<typeof expT>[0]);
    } catch {
      return '';
    }
  }

  const createdWhen = [
    safeGet(`${expKey}.createdWhen.0`),
    safeGet(`${expKey}.createdWhen.1`),
  ].filter(Boolean);

  const visibleTo = [
    safeGet(`${expKey}.visibleTo.0`),
    safeGet(`${expKey}.visibleTo.1`),
  ].filter(Boolean);

  const usedFor = safeGet(`${expKey}.usedFor`);

  const lifecycleStageKey = TYPE_LIFECYCLE_STAGE_KEY[selectedType];
  const isVehicleOnly = lifecycleStageKey === null;

  const sectionCreatedWhen = safeGet('sectionCreatedWhen');
  const sectionVisibleTo = safeGet('sectionVisibleTo');
  const sectionUsedFor = safeGet('sectionUsedFor');
  const vehicleMaintenanceBadge = safeGet('vehicleMaintenanceBadge');
  const vehicleMaintenanceNote = safeGet('vehicleMaintenanceNote');

  return (
    <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgb(var(--brand) / 0.04)',
          border: '1px solid rgb(var(--brand) / 0.15)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
      >
        {createdWhen.length > 0 && (
          <div>
            {sectionCreatedWhen && (
              <p style={{ margin: '0 0 var(--space-1) 0', fontWeight: 600, color: 'rgb(var(--text))', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {sectionCreatedWhen}
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'rgb(var(--text))', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {createdWhen.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
        {visibleTo.length > 0 && (
          <div>
            {sectionVisibleTo && (
              <p style={{ margin: '0 0 var(--space-1) 0', fontWeight: 600, color: 'rgb(var(--text))', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {sectionVisibleTo}
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'rgb(var(--text))', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {visibleTo.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
        {usedFor && (
          <div>
            {sectionUsedFor && (
              <p style={{ margin: '0 0 2px 0', fontWeight: 600, color: 'rgb(var(--text))', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {sectionUsedFor}
              </p>
            )}
            <p style={{ margin: 0, color: 'rgb(var(--text))' }}>{usedFor}</p>
          </div>
        )}
      </div>

      {isVehicleOnly ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius)',
            fontSize: '12px',
            color: 'rgb(var(--muted))',
          }}
        >
          {vehicleMaintenanceBadge && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgb(var(--brand) / 0.12)',
              border: '1px solid rgb(var(--brand) / 0.35)',
              color: 'rgb(var(--brand))',
              fontWeight: 600,
              fontSize: '12px',
            }}>
              {vehicleMaintenanceBadge}
            </span>
          )}
          {vehicleMaintenanceNote && <span>- {vehicleMaintenanceNote}</span>}
        </div>
      ) : (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 'max-content' }}>
            {LIFECYCLE_STAGE_KEYS.map((key, idx) => {
              const isActive = key === lifecycleStageKey;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {idx > 0 && (
                    <span style={{ color: 'rgb(var(--muted))', fontSize: '11px', flexShrink: 0, opacity: 0.5 }}>→</span>
                  )}
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 9px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: isActive ? 700 : 400,
                      whiteSpace: 'nowrap',
                      background: isActive ? 'rgb(var(--brand))' : 'transparent',
                      color: isActive ? '#fff' : 'rgb(var(--muted))',
                      border: isActive ? '1px solid rgb(var(--brand))' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {safeGet(`lifecycleStages.${key}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

const FIELD_LABEL: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--space-1)',
  fontSize: '13px',
};

const FIELD_WRAPPER: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const ERROR_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--error) / 0.08)',
  border: '1px solid rgb(var(--error) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--error))',
  fontSize: '14px',
};

const SUCCESS_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--success) / 0.08)',
  border: '1px solid rgb(var(--success) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--success))',
  fontSize: '14px',
};

const READ_ONLY_INPUT: CSSProperties = {
  background: 'rgb(var(--background))',
  opacity: 0.7,
  cursor: 'not-allowed',
};

// ─── System template detection ────────────────────────────────────────────────

function isSystemTemplate(template: ChecklistTemplate): boolean {
  return template.is_system === true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sectionKey(item: ChecklistTemplateItem): string {
  return item.section?.trim() || '__general__';
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
      items: [...sectionItems].sort((a, b) => a.sort_order - b.sort_order),
    }))
    .sort((a, b) => a.items[0].sort_order - b.items[0].sort_order);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChecklistTemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const id = params.id as string;

  const t = useTranslations('staffChecklistTemplateDetail');
  const typeT = useTranslations('checklistTypeLabels');

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [type, setType] = useState<string>('pickup');

  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyRequired, setShowOnlyRequired] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const accordionInitialised = useRef(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditStates, setItemEditStates] = useState<Map<string, ItemEditState>>(new Map());
  const [reorderErrors, setReorderErrors] = useState<Map<string, string>>(new Map());
  const [reordering, setReordering] = useState(false);

  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const reorderErrorTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [movingSection, setMovingSection] = useState(false);
  const [sectionMoveError, setSectionMoveError] = useState<string | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [addingFirstItem, setAddingFirstItem] = useState(false);
  const [addFirstItemError, setAddFirstItemError] = useState<string | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push(`/${locale}/staff/login`);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('company_id, can_manage, role')
        .eq('auth_user_id', user.id)
        .single();

      if (profileError || !profile?.company_id) {
        if (!cancelled) {
          setGlobalError(profileError?.message ?? t('errorNoCompany'));
          setLoading(false);
        }
        return;
      }

      const userCanManage = profile.can_manage === true || profile.role === 'admin';
      if (!userCanManage) {
        router.push(`/${locale}/staff/checklists/templates`);
        return;
      }

      let tmpl: ChecklistTemplate | null = null;
      let tmplError: { message: string } | null = null;

      const withSystem = await supabase
        .from('checklist_templates')
        .select('id, name, scope, type, active, created_at, is_system')
        .eq('id', id)
        .eq('company_id', profile.company_id)
        .single();

      if (withSystem.error) {
        const fallback = await supabase
          .from('checklist_templates')
          .select('id, name, scope, type, active, created_at')
          .eq('id', id)
          .eq('company_id', profile.company_id)
          .single();
        tmpl = (fallback.data as ChecklistTemplate) ?? null;
        tmplError = fallback.error;
      } else {
        tmpl = (withSystem.data as ChecklistTemplate) ?? null;
        tmplError = withSystem.error;
      }

      if (cancelled) return;

      if (tmplError || !tmpl) {
        setGlobalError(t('notFoundError'));
        setLoading(false);
        return;
      }

      setCompanyId(profile.company_id);
      setTemplate(tmpl);
      setName(tmpl.name);
      setActive(tmpl.active);
      setType(tmpl.type as string);
      setLoading(false);

      const { data: itemsData, error: itemsErr } = await supabase
        .from('checklist_template_items')
        .select('id, template_id, label, section, sort_order, required, input_type')
        .eq('template_id', tmpl.id)
        .order('sort_order', { ascending: true });

      if (cancelled) return;

      if (itemsErr) {
        setItemsError(itemsErr.message || t('errorLoadItemsFailed'));
      } else {
        const normalised = ((itemsData ?? []) as ChecklistTemplateItem[]).map((i) => ({
          ...i,
          input_type: normaliseInputType(i.input_type),
        }));
        setItems(normalised);
      }
      setItemsLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [id, locale, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (itemsLoading || accordionInitialised.current) return;
    accordionInitialised.current = true;
    setCollapsedSections(new Set(items.map(sectionKey)));
  }, [itemsLoading]);

  useEffect(() => {
    if (!editingItemId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelEditing(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editingItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editingItemId) { labelInputRef.current = null; return; }
    const raf = requestAnimationFrame(() => { labelInputRef.current?.focus(); });
    return () => cancelAnimationFrame(raf);
  }, [editingItemId]);

  useEffect(() => {
    const timers = reorderErrorTimers.current;
    return () => { timers.forEach((id) => clearTimeout(id)); };
  }, []);

  // ─── Derived: system flag ──────────────────────────────────────────────────

  const isSystem = template ? isSystemTemplate(template) : false;

  // ─── Type options (translated labels) ─────────────────────────────────────

  const isLegacyType = type && !ALL_STANDARD_TYPE_VALUES.includes(type);
  const typeOptions = isLegacyType
    ? [
        ...ALL_STANDARD_TYPE_VALUES.map((v) => ({ value: v, label: typeT(v as Parameters<typeof typeT>[0]) })),
        { value: type, label: t('legacyTypeLabel', { type }) },
      ]
    : ALL_STANDARD_TYPE_VALUES.map((v) => ({ value: v, label: typeT(v as Parameters<typeof typeT>[0]) }));

  // ─── Template save ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (!template || !companyId) return;
    if (!isSystem && !name.trim()) { setSaveError(t('errorNameRequired')); return; }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setDeleteError(null);
    const supabase = createClient();

    const updatePayload = isSystem
      ? { active }
      : { name: name.trim(), active, type };

    const { error } = await supabase
      .from('checklist_templates')
      .update(updatePayload)
      .eq('id', template.id)
      .eq('company_id', companyId);
    setSaving(false);
    if (error) {
      setSaveError(error.message || t('errorSaveFailed'));
    } else {
      setTemplate((prev) =>
        prev
          ? isSystem
            ? { ...prev, active }
            : { ...prev, name: name.trim(), active, type }
          : prev,
      );
      setSaveSuccess(true);
    }
  }

  // ─── Template delete ───────────────────────────────────────────────────────

  async function handleDelete() {
    if (!template || !companyId) return;
    if (isSystem) {
      setDeleteError(t('errorSystemCannotDelete'));
      return;
    }
    if (!window.confirm(t('deleteConfirm', { name: template.name }))) return;
    setDeleting(true);
    setDeleteError(null);
    setSaveError(null);
    setSaveSuccess(false);
    const supabase = createClient();
    const { error } = await supabase
      .from('checklist_templates')
      .delete()
      .eq('id', template.id)
      .eq('company_id', companyId);
    if (error) {
      const msg = error.message ?? '';
      const isSystemErr =
        msg.toLowerCase().includes('system checklist') ||
        msg.toLowerCase().includes('cannot be deleted') ||
        error.code === 'P0001';
      setDeleteError(isSystemErr ? t('errorSystemCannotDelete') : msg || t('errorDeleteFailed'));
      setDeleting(false);
      return;
    }
    router.push(`/${locale}/staff/checklists/templates`);
  }

  // ─── Add first item ────────────────────────────────────────────────────────

  async function handleAddFirstItem() {
    if (!template) return;
    setAddingFirstItem(true);
    setAddFirstItemError(null);

    const supabase = createClient();

    // Determine the next sort_order (0 when no items exist, max+1 otherwise)
    const nextSortOrder =
      items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;

    // Insert using only the columns that exist on checklist_template_items
    const { data, error: insertError } = await supabase
      .from('checklist_template_items')
      .insert({
        template_id: template.id,
        label: t('defaultNewItemLabel'),
        section: t('sectionDefault'),
        input_type: 'checkbox',
        required: false,
        sort_order: nextSortOrder,
      })
      .select('id, template_id, label, section, sort_order, required, input_type')
      .single();

    setAddingFirstItem(false);

    if (insertError || !data) {
      setAddFirstItemError(insertError?.message || t('errorAddFirstItemFailed'));
      return;
    }

    const newItem: ChecklistTemplateItem = {
      ...(data as ChecklistTemplateItem),
      input_type: normaliseInputType((data as ChecklistTemplateItem).input_type),
    };

    setItems((prev) => [...prev, newItem]);
  }

  // ─── Inline edit ───────────────────────────────────────────────────────────

  function startEditing(item: ChecklistTemplateItem) {
    setEditingItemId((prevId) => {
      if (prevId && prevId !== item.id) {
        setItemEditStates((states) => { const next = new Map(states); next.delete(prevId); return next; });
      }
      return item.id;
    });
    setItemEditStates((states) => {
      const next = new Map(states);
      if (!next.has(item.id)) {
        next.set(item.id, {
          label: item.label,
          required: item.required,
          input_type: normaliseInputType(item.input_type),
          saving: false,
          error: null,
        });
      }
      return next;
    });
  }

  const cancelEditing = useCallback(() => {
    setEditingItemId((prevId) => {
      if (prevId) {
        setItemEditStates((states) => { const next = new Map(states); next.delete(prevId); return next; });
      }
      return null;
    });
  }, []);

  function updateEditField<K extends keyof ItemEditState>(itemId: string, field: K, value: ItemEditState[K]) {
    setItemEditStates((states) => {
      const existing = states.get(itemId);
      if (!existing) return states;
      return new Map(states).set(itemId, { ...existing, [field]: value, error: null });
    });
  }

  async function handleSaveItem(item: ChecklistTemplateItem) {
    const draft = itemEditStates.get(item.id);
    if (!draft) return;
    if (!draft.label.trim()) {
      setItemEditStates((states) => new Map(states).set(item.id, { ...draft, error: t('errorItemLabelRequired') }));
      return;
    }
    setItemEditStates((states) => new Map(states).set(item.id, { ...draft, saving: true, error: null }));
    const supabase = createClient();
    const { error } = await supabase
      .from('checklist_template_items')
      .update({ label: draft.label.trim(), required: draft.required, input_type: draft.input_type })
      .eq('id', item.id)
      .eq('template_id', item.template_id);
    if (error) {
      setItemEditStates((states) => new Map(states).set(item.id, { ...draft, saving: false, error: error.message || t('errorItemSaveFailed') }));
    } else {
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, label: draft.label.trim(), required: draft.required, input_type: draft.input_type } : i),
      );
      setEditingItemId(null);
      setItemEditStates((states) => { const next = new Map(states); next.delete(item.id); return next; });
    }
  }

  // ─── Reorder helpers ───────────────────────────────────────────────────────

  function setReorderError(itemId: string, message: string) {
    const existing = reorderErrorTimers.current.get(itemId);
    if (existing !== undefined) clearTimeout(existing);
    setReorderErrors((prev) => new Map(prev).set(itemId, message));
    const timerId = setTimeout(() => {
      setReorderErrors((prev) => { const next = new Map(prev); next.delete(itemId); return next; });
      reorderErrorTimers.current.delete(itemId);
    }, 4000);
    reorderErrorTimers.current.set(itemId, timerId);
  }

  async function handleMoveItem(item: ChecklistTemplateItem, direction: 'up' | 'down') {
    if (reordering) return;
    const sec = sectionKey(item);
    const secItems = items.filter((i) => sectionKey(i) === sec).sort((a, b) => a.sort_order - b.sort_order);
    const idx = secItems.findIndex((i) => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= secItems.length) return;
    const current = secItems[idx];
    const neighbor = secItems[swapIdx];
    const templateId = current.template_id;
    const origCurrentOrder = current.sort_order;
    const origNeighborOrder = neighbor.sort_order;
    const finalCurrentOrder = origNeighborOrder;
    const finalNeighborOrder = origCurrentOrder;
    const tempOrder = 1_000_000_000 + Math.floor(Math.random() * 999_999_999);
    setItems((prev) => prev.map((i) => {
      if (i.id === current.id) return { ...i, sort_order: finalCurrentOrder };
      if (i.id === neighbor.id) return { ...i, sort_order: finalNeighborOrder };
      return i;
    }));
    setReordering(true);
    const supabase = createClient();
    let persistError: string | null = null;
    const r1 = await supabase.from('checklist_template_items').update({ sort_order: tempOrder }).eq('id', current.id).eq('template_id', templateId);
    if (r1.error) {
      persistError = r1.error.message || t('errorReorderStep1');
    } else {
      const r2 = await supabase.from('checklist_template_items').update({ sort_order: finalNeighborOrder }).eq('id', neighbor.id).eq('template_id', templateId);
      if (r2.error) {
        persistError = r2.error.message || t('errorReorderStep2');
        await supabase.from('checklist_template_items').update({ sort_order: origCurrentOrder }).eq('id', current.id).eq('template_id', templateId);
      } else {
        const r3 = await supabase.from('checklist_template_items').update({ sort_order: finalCurrentOrder }).eq('id', current.id).eq('template_id', templateId);
        if (r3.error) {
          persistError = r3.error.message || t('errorReorderStep3');
          await supabase.from('checklist_template_items').update({ sort_order: origCurrentOrder }).eq('id', current.id).eq('template_id', templateId);
          await supabase.from('checklist_template_items').update({ sort_order: origNeighborOrder }).eq('id', neighbor.id).eq('template_id', templateId);
        }
      }
    }
    setReordering(false);
    if (persistError) {
      setItems((prev) => prev.map((i) => {
        if (i.id === current.id) return { ...i, sort_order: origCurrentOrder };
        if (i.id === neighbor.id) return { ...i, sort_order: origNeighborOrder };
        return i;
      }));
      setReorderError(item.id, persistError);
    }
  }

  async function handleMoveSection(sectionName: string, direction: 'up' | 'down') {
    if (movingSection || reordering) return;
    setSectionMoveError(null);
    const allGrouped = groupItemsBySection(items);
    const secIdx = allGrouped.findIndex((g) => g.section === sectionName);
    const neighborIdx = direction === 'up' ? secIdx - 1 : secIdx + 1;
    if (neighborIdx < 0 || neighborIdx >= allGrouped.length) return;
    const secA = allGrouped[secIdx];
    const secB = allGrouped[neighborIdx];
    const templateId = secA.items[0].template_id;
    const poolOrders = [...secA.items, ...secB.items].map((i) => i.sort_order).sort((a, b) => a - b);
    const firstSection = direction === 'up' ? secA : secB;
    const secondSection = direction === 'up' ? secB : secA;
    const firstNewOrders = poolOrders.slice(0, firstSection.items.length);
    const secondNewOrders = poolOrders.slice(firstSection.items.length);
    const updateMap = new Map<string, number>();
    firstSection.items.forEach((item, i) => updateMap.set(item.id, firstNewOrders[i]));
    secondSection.items.forEach((item, i) => updateMap.set(item.id, secondNewOrders[i]));
    const origMap = new Map<string, number>();
    [...secA.items, ...secB.items].forEach((item) => origMap.set(item.id, item.sort_order));
    setItems((prev) => prev.map((item) => {
      const newOrder = updateMap.get(item.id);
      return newOrder !== undefined ? { ...item, sort_order: newOrder } : item;
    }));
    setMovingSection(true);
    const supabase = createClient();
    const affectedIds = [...firstSection.items, ...secondSection.items].map((i) => i.id);
    let phaseError: string | null = null;
    const tempBase = 1_000_000_000;
    for (let k = 0; k < affectedIds.length; k++) {
      const itemId = affectedIds[k];
      const tempVal = tempBase + k * 1_000 + Math.floor(Math.random() * 999);
      const { error } = await supabase.from('checklist_template_items').update({ sort_order: tempVal }).eq('id', itemId).eq('template_id', templateId);
      if (error) { phaseError = error.message || t('errorMoveSectionTemp', { step: k + 1 }); break; }
    }
    if (!phaseError) {
      for (const [itemId, newOrder] of updateMap) {
        const { error } = await supabase.from('checklist_template_items').update({ sort_order: newOrder }).eq('id', itemId).eq('template_id', templateId);
        if (error) { phaseError = error.message || t('errorMoveSectionAssign'); break; }
      }
    }
    setMovingSection(false);
    if (phaseError) {
      for (const [itemId, origOrder] of origMap) {
        await supabase.from('checklist_template_items').update({ sort_order: origOrder }).eq('id', itemId).eq('template_id', templateId);
      }
      setItems((prev) => prev.map((item) => {
        const orig = origMap.get(item.id);
        return orig !== undefined ? { ...item, sort_order: orig } : item;
      }));
      setSectionMoveError(phaseError);
    }
  }

  function toggleSection(section: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const allGrouped = groupItemsBySection(items);
  const sectionOrder = allGrouped.map((g) => g.section);

  const filteredItems = items.filter((item) => {
    if (showOnlyRequired && !item.required) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!item.label.toLowerCase().includes(q) && !(item.section ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const groupedItems = sectionOrder
    .map((section) => ({
      section,
      items: filteredItems.filter((i) => sectionKey(i) === section).sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((g) => g.items.length > 0);

  // Translate the internal '__general__' sentinel to a localised display label
  function displaySection(section: string): string {
    return section === '__general__' ? t('sectionDefault') : section;
  }

  // ─── Early returns ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>{t('loading')}</div>
        </div>
      </PageContainer>
    );
  }

  if (globalError || !template) {
    return (
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <Link href={`/${locale}/staff/checklists/templates`} style={{ display: 'inline-block', fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none', marginBottom: 'var(--space-4)' }}>
            ← {t('backToTemplates')}
          </Link>
          <div style={ERROR_BOX}>{globalError ?? t('globalErrorFallback')}</div>
        </div>
      </PageContainer>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .sec-move-btn {
          background: transparent; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          width: 36px; min-height: 36px; padding: 0; font-size: 13px;
          color: rgb(var(--muted)); transition: color 0.15s, background 0.15s;
          outline: none; border-radius: 0;
        }
        .sec-move-btn:hover:not(:disabled),
        .sec-move-btn:focus-visible:not(:disabled) { color: rgb(var(--brand)); background: rgb(var(--brand) / 0.08); }
        .sec-move-btn:focus-visible:not(:disabled) { box-shadow: inset 0 0 0 2px rgb(var(--brand) / 0.45); }
        .sec-move-btn:disabled { cursor: default; color: rgb(var(--muted) / 0.3); background: transparent; }
        @media (max-width: 767px) {
          .sec-move-btn { width: 44px; min-height: 44px; font-size: 15px; }
        }
      `}</style>
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* ── Page header ── */}
            <div>
              <Link href={`/${locale}/staff/checklists/templates`} style={{ display: 'inline-block', fontSize: '14px', color: 'rgb(var(--brand))', textDecoration: 'none', marginBottom: 'var(--space-2)' }}>
                ← {t('backToTemplates')}
              </Link>
              <h1 style={{ fontSize: '28px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>{t('pageTitle')}</h1>
              <p style={{ margin: 'var(--space-2) 0 0 0', color: 'rgb(var(--muted))', fontSize: '14px' }}>{t('pageSubtitle')}</p>
            </div>

            {/* ── Two-column (stacks on mobile) ── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop ? 'minmax(0, 460px) minmax(0, 1fr)' : '1fr',
                gap: 'var(--space-6)',
                alignItems: 'start',
              }}
            >
              {/* ── Left: Template form ── */}
              <div style={{ padding: 'var(--space-5)', border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', background: 'rgb(var(--background))' }}>
                <h2 style={SECTION_HEADING}>{t('sectionTemplateDetails')}</h2>

                {saveSuccess && <div style={{ ...SUCCESS_BOX, marginBottom: 'var(--space-4)' }}>{t('saveSuccess')}</div>}
                {saveError && <div style={{ ...ERROR_BOX, marginBottom: 'var(--space-4)' }}>{saveError}</div>}
                {deleteError && <div style={{ ...ERROR_BOX, marginBottom: 'var(--space-4)' }}>{deleteError}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

                  {/* Name */}
                  <div style={FIELD_WRAPPER}>
                    <label htmlFor="tmpl-name" className="label" style={FIELD_LABEL}>
                      {t('fieldName')} <span style={{ color: 'rgb(var(--error))' }}>*</span>
                    </label>
                    <input
                      id="tmpl-name"
                      className="input"
                      type="text"
                      value={name}
                      readOnly={isSystem}
                      tabIndex={isSystem ? -1 : undefined}
                      style={isSystem ? READ_ONLY_INPUT : undefined}
                      onChange={isSystem ? undefined : (e) => { setName(e.target.value); setSaveSuccess(false); }}
                    />
                    {isSystem && (
                      <span style={{ marginTop: 'var(--space-1)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
                        {t('systemNameHint')}
                      </span>
                    )}
                  </div>

                  {/* Applies to (Scope — always read-only) */}
                  <div style={FIELD_WRAPPER}>
                    <label htmlFor="tmpl-scope" className="label" style={FIELD_LABEL}>{t('fieldAppliesTo')}</label>
                    <input
                      id="tmpl-scope"
                      className="input"
                      type="text"
                      value={template.scope === 'booking' ? t('scopeBookingValue') : t('scopeVehicleValue')}
                      readOnly
                      style={READ_ONLY_INPUT}
                      tabIndex={-1}
                    />
                    <span style={{ marginTop: 'var(--space-1)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
                      {t('scopeReadOnlyHint')}
                    </span>
                  </div>

                  {/* When should this checklist be created? (Type) */}
                  <div style={FIELD_WRAPPER}>
                    <label htmlFor="tmpl-type" className="label" style={FIELD_LABEL}>
                      {t('fieldWhenCreated')}
                    </label>
                    {isSystem ? (
                      <input
                        id="tmpl-type"
                        className="input"
                        type="text"
                        value={typeOptions.find((o) => o.value === type)?.label ?? type}
                        readOnly
                        tabIndex={-1}
                        style={READ_ONLY_INPUT}
                      />
                    ) : (
                      <select
                        id="tmpl-type"
                        className="input"
                        value={type}
                        onChange={(e) => { setType(e.target.value); setSaveSuccess(false); }}
                      >
                        {typeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {isSystem && (
                      <span style={{ marginTop: 'var(--space-1)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
                        {t('systemTypeHint')}
                      </span>
                    )}
                    <TypeExplanationPanel selectedType={type} />
                  </div>

                  {/* Active */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', paddingTop: 'var(--space-1)' }}>
                    <input
                      id="tmpl-active"
                      type="checkbox"
                      checked={active}
                      onChange={(e) => { setActive(e.target.checked); setSaveSuccess(false); }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="tmpl-active" className="label" style={{ fontSize: '13px', cursor: 'pointer', margin: 0 }}>{t('fieldActive')}</label>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 'var(--space-2)',
                      borderTop: '1px solid rgb(var(--border))',
                      gap: 'var(--space-3)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || deleting}>
                      {saving ? t('btnSaving') : t('btnSaveChanges')}
                    </button>
                    {isSystem ? (
                      <span style={{ fontSize: '13px', color: 'rgb(var(--muted))', fontStyle: 'italic' }}>
                        {t('systemCannotDelete')}
                      </span>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        onClick={handleDelete}
                        disabled={saving || deleting}
                        style={{ color: 'rgb(var(--error))', borderColor: 'rgb(var(--error) / 0.4)' }}
                      >
                        {deleting ? t('btnDeleting') : t('btnDeleteTemplate')}
                      </button>
                    )}
                  </div>

                  {!isDesktop && (
                    <p style={{ margin: 0, fontSize: '12px', color: 'rgb(var(--muted))', fontStyle: 'italic' }}>
                      {t('desktopTip')}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Right: Items panel ── */}
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
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <h2 style={{ ...SECTION_HEADING, margin: 0 }}>{t('sectionItems')}</h2>
                    {!itemsLoading && !itemsError && (
                      <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{filteredItems.length}/{items.length}</span>
                    )}
                  </div>
                  <input
                    className="input"
                    type="search"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ fontSize: '14px' }}
                    aria-label={t('searchAriaLabel')}
                  />
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
                  {sectionMoveError && (
                    <div style={{ ...ERROR_BOX, marginTop: 0 }}>
                      {sectionMoveError}
                      <button onClick={() => setSectionMoveError(null)} style={{ marginLeft: 'var(--space-3)', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '12px', textDecoration: 'underline', padding: 0 }}>
                        {t('dismissError')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: 'var(--space-4) var(--space-5)', flex: 1, overflowY: 'auto' }}>
                  {itemsLoading && <div style={{ padding: 'var(--space-6) 0', textAlign: 'center', color: 'rgb(var(--muted))', fontSize: '14px' }}>{t('loadingItems')}</div>}
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
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-4)',
                        alignItems: 'center',
                      }}
                    >
                      <span>{t('emptyItems')}</span>
                      {addFirstItemError && (
                        <div style={{ ...ERROR_BOX, width: '100%', textAlign: 'left' }}>{addFirstItemError}</div>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={handleAddFirstItem}
                        disabled={addingFirstItem}
                      >
                        {addingFirstItem ? t('btnSaving') : t('btnAddFirstItem')}
                      </button>
                    </div>
                  )}
                  {!itemsLoading && !itemsError && items.length > 0 && filteredItems.length === 0 && (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'rgb(var(--muted))', fontSize: '14px', border: '1px dashed rgb(var(--border))', borderRadius: 'var(--radius)' }}>
                      {t('emptyFiltered')}
                    </div>
                  )}

                  {!itemsLoading && !itemsError && filteredItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {groupedItems.map(({ section, items: sectionItems }, groupIdx) => {
                        const isCollapsed = collapsedSections.has(section);
                        const isFirstSection = groupIdx === 0;
                        const isLastSection = groupIdx === groupedItems.length - 1;
                        const fullSectionItems = items.filter((i) => sectionKey(i) === section).sort((a, b) => a.sort_order - b.sort_order);
                        const sectionLabel = displaySection(section);

                        return (
                          <div key={section} style={{ border: '1px solid rgb(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                            {/* Accordion header */}
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgb(var(--surface))', borderBottom: isCollapsed ? 'none' : '1px solid rgb(var(--border))', minHeight: '40px' }}>
                              <button
                                onClick={() => toggleSection(section)}
                                aria-expanded={!isCollapsed}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
                              >
                                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgb(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sectionLabel}</span>
                                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: 'rgb(var(--brand) / 0.1)', color: 'rgb(var(--brand))', fontWeight: 600, flexShrink: 0 }}>{sectionItems.length}</span>
                                <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', flexShrink: 0, display: 'inline-block', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', marginLeft: 'auto' }}>▾</span>
                              </button>
                              {isDesktop && allGrouped.length > 1 && !searchQuery.trim() && !showOnlyRequired && (
                                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, borderLeft: '1px solid rgb(var(--border))' }}>
                                  <button
                                    className="sec-move-btn"
                                    onClick={() => handleMoveSection(section, 'up')}
                                    disabled={isFirstSection || movingSection || reordering}
                                    title={t('moveSectionUpTitle')}
                                    aria-label={t('moveSectionUpAria', { section: sectionLabel })}
                                    style={{ borderBottom: '1px solid rgb(var(--border))' }}
                                  >▴</button>
                                  <button
                                    className="sec-move-btn"
                                    onClick={() => handleMoveSection(section, 'down')}
                                    disabled={isLastSection || movingSection || reordering}
                                    title={t('moveSectionDownTitle')}
                                    aria-label={t('moveSectionDownAria', { section: sectionLabel })}
                                  >▾</button>
                                </div>
                              )}
                            </div>

                            {/* Accordion body */}
                            {!isCollapsed && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {sectionItems.map((item, idx) => {
                                  const isEditing = editingItemId === item.id;
                                  const editState = itemEditStates.get(item.id);
                                  const reorderError = reorderErrors.get(item.id);
                                  const posInSection = fullSectionItems.findIndex((i) => i.id === item.id);
                                  const isFirstInSection = posInSection === 0;
                                  const isLastInSection = posInSection === fullSectionItems.length - 1;

                                  return (
                                    <div
                                      key={item.id}
                                      style={{ borderTop: idx > 0 ? '1px solid rgb(var(--border))' : undefined, background: isEditing ? 'rgb(var(--brand) / 0.03)' : 'rgb(var(--background))', transition: 'background 0.15s' }}
                                    >
                                      {/* View row */}
                                      {!isEditing && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)' }}>
                                          <span style={{ flexShrink: 0, width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(var(--muted))', opacity: 0.5 }} aria-hidden="true" title={`sort_order: ${item.sort_order}`}>
                                            <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="1" y="1.5" width="10" height="1.5" rx="0.75"/>
                                              <rect x="1" y="6.25" width="10" height="1.5" rx="0.75"/>
                                              <rect x="1" y="11" width="10" height="1.5" rx="0.75"/>
                                            </svg>
                                          </span>
                                          <span style={{ flex: 1, fontSize: '14px', color: 'rgb(var(--text))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}>
                                            {item.input_type === 'number' && (
                                              <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: 'rgb(var(--brand) / 0.08)', color: 'rgb(var(--brand))', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                {t('inputTypeBadgeNumber')}
                                              </span>
                                            )}
                                            {item.required && (
                                              <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: 'rgb(var(--error) / 0.08)', color: 'rgb(var(--error))', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                {t('itemRequiredBadge')}
                                              </span>
                                            )}
                                          </div>
                                          <button className="btn btn-secondary" onClick={() => startEditing(item)} style={{ flexShrink: 0, fontSize: '12px', padding: '4px 10px', height: '28px' }}>{t('btnEdit')}</button>
                                        </div>
                                      )}

                                      {/* Inline edit row */}
                                      {isEditing && editState && (
                                        <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                          <div style={FIELD_WRAPPER}>
                                            <label htmlFor={`item-label-${item.id}`} className="label" style={{ ...FIELD_LABEL, fontSize: '12px' }}>
                                              {t('itemFieldLabel')} <span style={{ color: 'rgb(var(--error))' }}>*</span>
                                            </label>
                                            <input
                                              id={`item-label-${item.id}`}
                                              className="input"
                                              type="text"
                                              value={editState.label}
                                              ref={editingItemId === item.id ? labelInputRef : null}
                                              onChange={(e) => updateEditField(item.id, 'label', e.target.value)}
                                              disabled={editState.saving || reordering}
                                              style={{ fontSize: '14px' }}
                                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveItem(item); }}
                                            />
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                            <div style={{ ...FIELD_WRAPPER, flex: '1 1 120px', minWidth: 0 }}>
                                              <label htmlFor={`item-inputtype-${item.id}`} className="label" style={{ ...FIELD_LABEL, fontSize: '12px' }}>{t('itemFieldInputType')}</label>
                                              <select
                                                id={`item-inputtype-${item.id}`}
                                                className="input"
                                                value={editState.input_type}
                                                onChange={(e) => updateEditField(item.id, 'input_type', e.target.value)}
                                                disabled={editState.saving || reordering}
                                                style={{ fontSize: '14px' }}
                                              >
                                                <option value="checkbox">{t('inputTypeCheckbox')}</option>
                                                <option value="number">{t('inputTypeNumber')}</option>
                                              </select>
                                            </div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px', cursor: editState.saving ? 'not-allowed' : 'pointer', paddingTop: '18px', flexShrink: 0 }}>
                                              <input type="checkbox" checked={editState.required} onChange={(e) => updateEditField(item.id, 'required', e.target.checked)} disabled={editState.saving || reordering} style={{ width: '15px', height: '15px', cursor: editState.saving ? 'not-allowed' : 'pointer' }} />
                                              {t('itemFieldRequired')}
                                            </label>
                                          </div>
                                          {isDesktop && fullSectionItems.length > 1 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                              <span style={{ fontSize: '12px', color: 'rgb(var(--muted))', flexShrink: 0 }}>{t('reorderLabel')}</span>
                                              <button className="btn btn-secondary" onClick={() => handleMoveItem(item, 'up')} disabled={isFirstInSection || reordering || editState.saving} style={{ fontSize: '12px', padding: '3px 8px', height: '26px' }} aria-label={t('moveItemUpAria')}>↑</button>
                                              <button className="btn btn-secondary" onClick={() => handleMoveItem(item, 'down')} disabled={isLastInSection || reordering || editState.saving} style={{ fontSize: '12px', padding: '3px 8px', height: '26px' }} aria-label={t('moveItemDownAria')}>↓</button>
                                              {reordering && <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>{t('reorderSaving')}</span>}
                                            </div>
                                          )}
                                          {reorderError && <div style={{ ...ERROR_BOX, padding: 'var(--space-2) var(--space-3)', fontSize: '13px' }}>{reorderError}</div>}
                                          {editState.error && <div style={{ ...ERROR_BOX, padding: 'var(--space-2) var(--space-3)', fontSize: '13px' }}>{editState.error}</div>}
                                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                            <button className="btn btn-primary" onClick={() => handleSaveItem(item)} disabled={editState.saving || reordering} style={{ fontSize: '13px', padding: '5px 14px', height: '30px' }}>{editState.saving ? t('btnSavingItem') : t('btnSave')}</button>
                                            <button className="btn btn-secondary" onClick={cancelEditing} disabled={editState.saving} style={{ fontSize: '13px', padding: '5px 14px', height: '30px' }}>{t('btnCancel')}</button>
                                          </div>
                                        </div>
                                      )}

                                      {!isEditing && reorderError && (
                                        <div style={{ ...ERROR_BOX, margin: '0 var(--space-4) var(--space-2)', padding: 'var(--space-2) var(--space-3)', fontSize: '13px' }}>{reorderError}</div>
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
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}