'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';
import { useTranslations } from 'next-intl';
import ChecklistTemplateDetailsPanel from '@/components/checklists/ChecklistTemplateDetailsPanel';
import ChecklistTemplateItemsPanel from '@/components/checklists/ChecklistTemplateItemsPanel';
import {
  ALL_STANDARD_TYPE_VALUES,
  GENERAL_SENTINEL,
  NEW_SECTION_SENTINEL,
  ERROR_BOX,
  normaliseInputType,
  isSystemTemplate,
  sectionKey,
  groupItemsBySection,
  computeSortOrdersForSectionReorder,
  type ChecklistTemplate,
  type ChecklistTemplateItem,
  type ItemEditState,
} from './_pageHelpers';

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

  // ── Add-item state ──────────────────────────────────────────────────────────
  const [addingItem, setAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);
  const [newItemSectionChoice, setNewItemSectionChoice] = useState<string>(GENERAL_SENTINEL);
  const [newItemNewSectionName, setNewItemNewSectionName] = useState('');

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
        .select('id, template_id, label, section, sort_order, position, required, input_type')
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
    return () => { timers.forEach((timerId) => clearTimeout(timerId)); };
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

  // ─── Derived: existing named sections ─────────────────────────────────────

  const existingNamedSections: string[] = [];
  for (const item of items) {
    if (item.section && !existingNamedSections.includes(item.section)) {
      existingNamedSections.push(item.section);
    }
  }

  // ─── Utility: next position in a section (from local state) ───────────────

  function nextPositionInSection(dbSection: string | null): number {
    const sectionItems = items.filter((i) => i.section === dbSection);
    if (sectionItems.length === 0) return 0;
    return Math.max(...sectionItems.map((i) => i.position)) + 1;
  }

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

    if (!active && template.active === true) {
      const supabase = createClient();
      const { error: deactivateError } = await supabase
        .from('checklist_templates')
        .update({ active: false })
        .eq('id', template.id)
        .eq('company_id', companyId);
      if (deactivateError) {
        setDeleteError(deactivateError.message || t('errorSaveFailed'));
        setDeleting(false);
        return;
      }
      setTemplate((prev) => prev ? { ...prev, active: false } : prev);
    }

    const res = await fetch(`/api/staff/checklists/templates/${template.id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      let errorMessage = t('errorDeleteFailed');
      try {
        const body = await res.json();
        if (body?.error) errorMessage = body.error;
      } catch {
        // ignore JSON parse failures
      }
      setDeleteError(errorMessage);
      setDeleting(false);
      return;
    }

    router.push(`/${locale}/staff/checklists/templates`);
  }

  // ─── Add item ──────────────────────────────────────────────────────────────

  async function handleAddItem() {
    if (!template) return;

    let targetDbSection: string | null;
    if (newItemSectionChoice === GENERAL_SENTINEL) {
      targetDbSection = null;
    } else if (newItemSectionChoice === NEW_SECTION_SENTINEL) {
      const trimmed = newItemNewSectionName.trim();
      targetDbSection = (trimmed === '' || trimmed.toLowerCase() === 'general') ? null : trimmed;
    } else {
      targetDbSection = newItemSectionChoice;
    }

    setAddingItem(true);
    setAddItemError(null);

    const supabase = createClient();

    let nextPosition = nextPositionInSection(targetDbSection);
    {
      const baseQ = supabase
        .from('checklist_template_items')
        .select('position')
        .eq('template_id', template.id)
        .order('position', { ascending: false })
        .limit(1);

      const { data: maxPosData } = await (
        targetDbSection === null
          ? baseQ.is('section', null)
          : baseQ.eq('section', targetDbSection)
      ).maybeSingle();

      if (maxPosData?.position != null) {
        nextPosition = (maxPosData.position as number) + 1;
      }
    }

    const nextSortOrder =
      items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;

    const { data, error: insertError } = await supabase
      .from('checklist_template_items')
      .insert({
        template_id: template.id,
        label: t('defaultNewItemLabel'),
        section: targetDbSection,
        input_type: 'checkbox',
        required: false,
        sort_order: nextSortOrder,
        position: nextPosition,
      })
      .select('id, template_id, label, section, sort_order, position, required, input_type')
      .single();

    setAddingItem(false);

    if (insertError || !data) {
      setAddItemError(insertError?.message || t('errorAddFirstItemFailed'));
      return;
    }

    const newItem: ChecklistTemplateItem = {
      ...(data as ChecklistTemplateItem),
      input_type: normaliseInputType((data as ChecklistTemplateItem).input_type),
    };

    setItems((prev) => [...prev, newItem]);

    const newSectionK = sectionKey(newItem);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.delete(newSectionK);
      return next;
    });

    if (newItemSectionChoice === NEW_SECTION_SENTINEL) {
      setNewItemSectionChoice(GENERAL_SENTINEL);
      setNewItemNewSectionName('');
    }
  }

  // ─── Add item to a specific section (called from per-section button) ────────

  async function handleAddItemToSection(targetDbSection: string | null) {
    if (!template) return;
    setAddingItem(true);
    setAddItemError(null);
    const supabase = createClient();

    let nextPosition = nextPositionInSection(targetDbSection);
    {
      const baseQ = supabase
        .from('checklist_template_items')
        .select('position')
        .eq('template_id', template.id)
        .order('position', { ascending: false })
        .limit(1);
      const { data: maxPosData } = await (
        targetDbSection === null ? baseQ.is('section', null) : baseQ.eq('section', targetDbSection)
      ).maybeSingle();
      if (maxPosData?.position != null) nextPosition = (maxPosData.position as number) + 1;
    }

    const nextSortOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;

    const { data, error: insertError } = await supabase
      .from('checklist_template_items')
      .insert({
        template_id: template.id,
        label: t('defaultNewItemLabel'),
        section: targetDbSection,
        input_type: 'checkbox',
        required: false,
        sort_order: nextSortOrder,
        position: nextPosition,
      })
      .select('id, template_id, label, section, sort_order, position, required, input_type')
      .single();

    setAddingItem(false);

    if (insertError || !data) {
      setAddItemError(insertError?.message || t('errorAddFirstItemFailed'));
      return;
    }

    const newItem: ChecklistTemplateItem = {
      ...(data as ChecklistTemplateItem),
      input_type: normaliseInputType((data as ChecklistTemplateItem).input_type),
    };
    setItems((prev) => [...prev, newItem]);
    const newSectionK = sectionKey(newItem);
    setCollapsedSections((prev) => { const next = new Set(prev); next.delete(newSectionK); return next; });
    startEditing(newItem);
  }

  // ─── Section drag-and-drop reorder ────────────────────────────────────────

  async function handleDndReorderSections(newSectionOrder: string[]) {
    if (reordering || movingSection) return;
    setSectionMoveError(null);

    const updateMap = computeSortOrdersForSectionReorder(items, newSectionOrder);

    const changed = items.filter((i) => {
      const newOrder = updateMap.get(i.id);
      return newOrder !== undefined && newOrder !== i.sort_order;
    });

    if (changed.length === 0) return;

    const origMap = new Map(items.map((i) => [i.id, i.sort_order]));
    const templateId = items[0].template_id;

    setItems((prev) =>
      prev.map((i) => {
        const newOrder = updateMap.get(i.id);
        return newOrder !== undefined ? { ...i, sort_order: newOrder } : i;
      }),
    );

    setMovingSection(true);
    const supabase = createClient();
    const tempBase = 1_000_000_000;
    let phaseError: string | null = null;

    for (let k = 0; k < changed.length; k++) {
      const tempVal = tempBase + k * 1_000 + Math.floor(Math.random() * 999);
      const { error } = await supabase
        .from('checklist_template_items')
        .update({ sort_order: tempVal })
        .eq('id', changed[k].id)
        .eq('template_id', templateId);
      if (error) {
        phaseError = error.message || t('errorMoveSectionTemp', { step: k + 1 });
        break;
      }
    }

    if (!phaseError) {
      for (const item of changed) {
        const { error } = await supabase
          .from('checklist_template_items')
          .update({ sort_order: updateMap.get(item.id)! })
          .eq('id', item.id)
          .eq('template_id', templateId);
        if (error) {
          phaseError = error.message || t('errorMoveSectionAssign');
          break;
        }
      }
    }

    setMovingSection(false);

    if (phaseError) {
      setItems((prev) =>
        prev.map((i) => {
          const orig = origMap.get(i.id);
          return orig !== undefined ? { ...i, sort_order: orig } : i;
        }),
      );
      for (const item of changed) {
        await supabase
          .from('checklist_template_items')
          .update({ sort_order: origMap.get(item.id)! })
          .eq('id', item.id)
          .eq('template_id', templateId);
      }
      setSectionMoveError(phaseError);
    }
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
          section: item.section,
          newSectionName: '',
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

    let targetSection: string | null;
    if (draft.section === NEW_SECTION_SENTINEL) {
      const trimmed = draft.newSectionName.trim();
      targetSection = (trimmed === '' || trimmed.toLowerCase() === 'general') ? null : trimmed;
    } else {
      targetSection = draft.section;
    }

    const sectionChanged = targetSection !== item.section;

    setItemEditStates((states) => new Map(states).set(item.id, { ...draft, saving: true, error: null }));
    const supabase = createClient();

    let newPosition = item.position;

    if (sectionChanged) {
      const baseQ = supabase
        .from('checklist_template_items')
        .select('position')
        .eq('template_id', item.template_id)
        .order('position', { ascending: false })
        .limit(1);

      const { data: maxPosData } = await (
        targetSection === null
          ? baseQ.is('section', null)
          : baseQ.eq('section', targetSection)
      ).maybeSingle();

      if (maxPosData?.position != null) {
        newPosition = (maxPosData.position as number) + 1;
      } else {
        const localPeers = items.filter((i) => i.id !== item.id && i.section === targetSection);
        newPosition = localPeers.length > 0 ? Math.max(...localPeers.map((i) => i.position)) + 1 : 0;
      }
    }

    const updatePayload: Record<string, unknown> = {
      label: draft.label.trim(),
      required: draft.required,
      input_type: draft.input_type,
    };
    if (sectionChanged) {
      updatePayload.section = targetSection;
      updatePayload.position = newPosition;
    }

    const { error } = await supabase
      .from('checklist_template_items')
      .update(updatePayload)
      .eq('id', item.id)
      .eq('template_id', item.template_id);

    if (error) {
      setItemEditStates((states) => new Map(states).set(item.id, { ...draft, saving: false, error: error.message || t('errorItemSaveFailed') }));
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                label: draft.label.trim(),
                required: draft.required,
                input_type: draft.input_type,
                ...(sectionChanged ? { section: targetSection, position: newPosition } : {}),
              }
            : i,
        ),
      );
      if (sectionChanged) {
        const destKey = targetSection ?? GENERAL_SENTINEL;
        setCollapsedSections((prev) => {
          const next = new Set(prev);
          next.delete(destKey);
          return next;
        });
      }
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
    const secItems = items.filter((i) => sectionKey(i) === sec).sort((a, b) => a.position - b.position);
    const idx = secItems.findIndex((i) => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= secItems.length) return;

    const current = secItems[idx];
    const neighbor = secItems[swapIdx];
    const templateId = current.template_id;

    const origCurrentPos = current.position;
    const origNeighborPos = neighbor.position;
    const finalCurrentPos = origNeighborPos;
    const finalNeighborPos = origCurrentPos;
    const tempPos = 1_000_000_000 + Math.floor(Math.random() * 999_999_999);

    setItems((prev) => prev.map((i) => {
      if (i.id === current.id) return { ...i, position: finalCurrentPos };
      if (i.id === neighbor.id) return { ...i, position: finalNeighborPos };
      return i;
    }));

    setReordering(true);
    const supabase = createClient();
    let persistError: string | null = null;

    const r1 = await supabase
      .from('checklist_template_items')
      .update({ position: tempPos })
      .eq('id', current.id)
      .eq('template_id', templateId);
    if (r1.error) {
      persistError = r1.error.message || t('errorReorderStep1');
    } else {
      const r2 = await supabase
        .from('checklist_template_items')
        .update({ position: finalNeighborPos })
        .eq('id', neighbor.id)
        .eq('template_id', templateId);
      if (r2.error) {
        persistError = r2.error.message || t('errorReorderStep2');
        await supabase.from('checklist_template_items').update({ position: origCurrentPos }).eq('id', current.id).eq('template_id', templateId);
      } else {
        const r3 = await supabase
          .from('checklist_template_items')
          .update({ position: finalCurrentPos })
          .eq('id', current.id)
          .eq('template_id', templateId);
        if (r3.error) {
          persistError = r3.error.message || t('errorReorderStep3');
          await supabase.from('checklist_template_items').update({ position: origCurrentPos }).eq('id', current.id).eq('template_id', templateId);
          await supabase.from('checklist_template_items').update({ position: origNeighborPos }).eq('id', neighbor.id).eq('template_id', templateId);
        }
      }
    }

    setReordering(false);
    if (persistError) {
      setItems((prev) => prev.map((i) => {
        if (i.id === current.id) return { ...i, position: origCurrentPos };
        if (i.id === neighbor.id) return { ...i, position: origNeighborPos };
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

    const newSectionOrder = allGrouped.map((g) => g.section);
    [newSectionOrder[secIdx], newSectionOrder[neighborIdx]] = [newSectionOrder[neighborIdx], newSectionOrder[secIdx]];

    await handleDndReorderSections(newSectionOrder);
  }

  async function handleDndReorder(newItems: ChecklistTemplateItem[]) {
    if (reordering || movingSection) return;

    const oldById = new Map(items.map((i) => [i.id, i]));
    const changed = newItems.filter((i) => {
      const old = oldById.get(i.id);
      return old && old.position !== i.position;
    });

    if (changed.length === 0) return;

    setItems(newItems);

    const templateId = changed[0].template_id;
    const supabase = createClient();
    const tempBase = 1_000_000_000;
    let phaseError: string | null = null;

    const origPositions = new Map(changed.map((i) => [i.id, oldById.get(i.id)!.position]));
    const finalPositions = new Map(changed.map((i) => [i.id, i.position]));

    setReordering(true);

    for (let k = 0; k < changed.length; k++) {
      const tempVal = tempBase + k * 1_000 + Math.floor(Math.random() * 999);
      const { error } = await supabase
        .from('checklist_template_items')
        .update({ position: tempVal })
        .eq('id', changed[k].id)
        .eq('template_id', templateId);
      if (error) { phaseError = error.message || t('errorReorderStep1'); break; }
    }

    if (!phaseError) {
      for (const [itemId, finalPos] of finalPositions) {
        const { error } = await supabase
          .from('checklist_template_items')
          .update({ position: finalPos })
          .eq('id', itemId)
          .eq('template_id', templateId);
        if (error) { phaseError = error.message || t('errorReorderStep2'); break; }
      }
    }

    setReordering(false);

    if (phaseError) {
      setItems(items);
      for (const [itemId, origPos] of origPositions) {
        await supabase
          .from('checklist_template_items')
          .update({ position: origPos })
          .eq('id', itemId)
          .eq('template_id', templateId);
      }
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
      items: filteredItems.filter((i) => sectionKey(i) === section).sort((a, b) => a.position - b.position),
    }))
    .filter((g) => g.items.length > 0);

  // ─── Early returns ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>{t('loading')}</div>
        </div>
      </PageContainer>
    );
  }

  if (globalError || !template) {
    return (
      <PageContainer maxWidth="1400px">
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
      <PageContainer maxWidth="1400px">
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
              {/* ── Left: Template details panel ── */}
              <ChecklistTemplateDetailsPanel
                template={template}
                isSystem={isSystem}
                name={name}
                setName={setName}
                active={active}
                setActive={setActive}
                type={type}
                setType={setType}
                typeOptions={typeOptions}
                saving={saving}
                deleting={deleting}
                saveError={saveError}
                saveSuccess={saveSuccess}
                setSaveSuccess={setSaveSuccess}
                deleteError={deleteError}
                handleSave={handleSave}
                handleDelete={handleDelete}
                isDesktop={isDesktop}
                t={t}
              />

              {/* ── Right: Items panel ── */}
              <ChecklistTemplateItemsPanel
                items={items}
                filteredItems={filteredItems}
                groupedItems={groupedItems}
                itemsLoading={itemsLoading}
                itemsError={itemsError}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                showOnlyRequired={showOnlyRequired}
                setShowOnlyRequired={setShowOnlyRequired}
                collapsedSections={collapsedSections}
                setCollapsedSections={setCollapsedSections}
                sectionMoveError={sectionMoveError}
                setSectionMoveError={setSectionMoveError}
                addItemError={addItemError}
                setAddItemError={setAddItemError}
                addingItem={addingItem}
                newItemSectionChoice={newItemSectionChoice}
                setNewItemSectionChoice={setNewItemSectionChoice}
                newItemNewSectionName={newItemNewSectionName}
                setNewItemNewSectionName={setNewItemNewSectionName}
                reordering={reordering}
                movingSection={movingSection}
                editingItemId={editingItemId}
                itemEditStates={itemEditStates}
                existingNamedSections={existingNamedSections}
                isSystem={isSystem}
                handleAddItem={handleAddItem}
                handleAddItemToSection={handleAddItemToSection}
                handleDndReorder={handleDndReorder}
                handleDndReorderSections={handleDndReorderSections}
                toggleSection={toggleSection}
                startEditing={startEditing}
                cancelEditing={cancelEditing}
                updateEditField={updateEditField}
                handleSaveItem={handleSaveItem}
                t={t}
              />
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}