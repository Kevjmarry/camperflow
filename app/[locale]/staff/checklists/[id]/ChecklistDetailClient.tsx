'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import PageContainer from '@/components/PageContainer';

type ChecklistInstanceType = {
  id: string;
  booking_id: string | null;
  vehicle_id: string | null;
  checklist_type: string;
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  bookings: {
    id: string;
    booking_number: string;
    customer_name: string;
    status: string;
  } | null;
  vehicles: {
    id: string;
    name: string;
  } | null;
};

type ChecklistItemType = {
  id: string;
  template_item_id: string;
  checked: boolean;
  notes: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  template: {
    label: string;
    sort_order: number;
    section: string | null;
  };
};

type InstanceStatusSnapshot = {
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

type InstanceUpdate = {
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

type SyncError = {
  kind: 'item_update_failed' | 'status_sync_failed';
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  raw: string;
};

type IssueSeverity = 'attention' | 'urgent';

type IssueFlag = {
  id: string;
  checklist_instance_item_id: string;
  severity: IssueSeverity;
  note: string;
  status: string;
};

type FlagDraft = {
  severity: IssueSeverity;
  note: string;
  saving: boolean;
  error: string | null;
};

/**
 * Pure function — takes an explicit snapshot rather than closing over state,
 * so it's safe to call from any async context without stale-closure risk.
 */
function computeInstanceUpdate(
  items: ChecklistItemType[],
  snapshot: InstanceStatusSnapshot,
  userId: string,
  now: string
): InstanceUpdate {
  const checkedCount = items.filter((it) => it.checked).length;
  const totalCount = items.length;
  const allChecked = checkedCount === totalCount;
  const noneChecked = checkedCount === 0;

  const isPending =
    snapshot.status === 'pending' || snapshot.status === 'not_started';

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

/** Normalise any Supabase/PostgREST error object into a SyncError. */
function parseSyncError(error: any, kind: SyncError['kind']): SyncError {
  return {
    kind,
    message: typeof error?.message === 'string' && error.message.trim()
      ? error.message
      : JSON.stringify(error),
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    raw: JSON.stringify(error, null, 2),
  };
}

export default function ChecklistDetailClient({
  instance,
  items: initialItems,
  locale,
}: {
  instance: ChecklistInstanceType;
  items: ChecklistItemType[];
  locale: string;
}) {
  const t = useTranslations('checklistDetail');
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');

  const listScope = searchParams.get('listScope') ?? 'all';
  const listStatus = searchParams.get('listStatus') ?? 'all';

  const supabase = createClient();

  const [localItems, setLocalItems] = useState(initialItems);
  const [localInstance, setLocalInstance] = useState(instance);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [openNotesById, setOpenNotesById] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [initialsByUserId, setInitialsByUserId] = useState<Record<string, string>>({});
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [quickCompleting, setQuickCompleting] = useState(false);

  // Issue flagging state
  const [flagsByItemId, setFlagsByItemId] = useState<Record<string, IssueFlag>>({});
  const [openFlagPanelById, setOpenFlagPanelById] = useState<Record<string, boolean>>({});
  const [flagDraftById, setFlagDraftById] = useState<Record<string, FlagDraft>>({});
  const [resolvingFlagById, setResolvingFlagById] = useState<Record<string, boolean>>({});

  const localInstanceRef = useRef(localInstance);
  useEffect(() => {
    localInstanceRef.current = localInstance;
  }, [localInstance]);

  useEffect(() => setLocalItems(initialItems), [initialItems]);
  useEffect(() => setLocalInstance(instance), [instance]);

  // Derive UI lock: handover/return checklists linked to a completed booking are read-only.
  const isChecklistLocked =
    !!instance.booking_id &&
    (instance.checklist_type === 'handover' || instance.checklist_type === 'return') &&
    instance.bookings?.status === 'completed';

  // Load existing open flags for this checklist instance
  useEffect(() => {
    const fetchFlags = async () => {
      const { data } = await supabase
        .from('issue_flags')
        .select('id,checklist_instance_item_id,severity,note,status')
        .eq('checklist_instance_id', instance.id)
        .eq('status', 'open');

      if (!data) return;
      const map: Record<string, IssueFlag> = {};
      for (const flag of data) {
        map[flag.checklist_instance_item_id] = flag as IssueFlag;
      }
      setFlagsByItemId(map);
    };
    fetchFlags();
  }, [instance.id]);

  const fetchInitialsForUsers = useCallback(
    async (userIds: string[]) => {
      if (userIds.length === 0) return;

      const query = supabase
        .from('staff_profiles')
        .select('auth_user_id,first_name,last_name')
        .in('auth_user_id', userIds);

      if (companyId) {
        query.eq('company_id', companyId);
      }

      const { data } = await query;
      if (!data) return;

      const newEntries: Record<string, string> = {};
      for (const profile of data) {
        const first = profile.first_name?.charAt(0)?.toUpperCase() || '';
        const last = profile.last_name?.charAt(0)?.toUpperCase() || '';
        newEntries[profile.auth_user_id] = first || last ? first + last : '?';
      }

      setInitialsByUserId((prev) => ({ ...prev, ...newEntries }));
    },
    [supabase, companyId]
  );

  useEffect(() => {
    const checkedByIds = localItems
      .filter((it) => it.checked && it.checked_by)
      .map((it) => it.checked_by as string);

    const unique = [...new Set(checkedByIds)];
    const missing = unique.filter((id) => !(id in initialsByUserId));

    if (missing.length > 0) {
      fetchInitialsForUsers(missing);
    }
  }, [localItems, initialsByUserId, fetchInitialsForUsers]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('first_name,last_name,company_id')
        .eq('auth_user_id', user.id)
        .single();

      if (profile) {
        setCompanyId(profile.company_id ?? null);
        const firstInitial = profile.first_name?.charAt(0)?.toUpperCase() || '';
        const lastInitial = profile.last_name?.charAt(0)?.toUpperCase() || '';
        const initials = firstInitial || lastInitial ? firstInitial + lastInitial : '?';
        setInitialsByUserId((prev) => ({ ...prev, [user.id]: initials }));
      }
    };

    fetchUserProfile();
  }, []);

  function isLockError(error: any): boolean {
    if (
      !(error?.code === 'P0001' || (error as any)?.code === 'P0001') ||
      typeof error?.message !== 'string'
    ) {
      return false;
    }
    const msg: string = error.message;
    return (
      msg.includes('Cannot modify handover/return checklists after booking is completed.') ||
      (msg.includes('Cannot edit a') &&
        (msg.includes('handover') || msg.includes('return')) &&
        msg.includes('after')) ||
      (msg.includes('Cannot edit') &&
        msg.includes('checklist item') &&
        msg.includes('must be completed first')) ||
      (msg.includes('Cannot') &&
        (msg.includes('before pickup') || msg.includes('before handover')))
    );
  }

  function isReturnAfterCompletionLockError(error: any): boolean {
    return (
      (error?.code === 'P0001' || (error as any)?.code === 'P0001') &&
      typeof error?.message === 'string' &&
      error.message.includes('Cannot edit a return checklist after the booking has been completed.')
    );
  }

  function lockMessageFromError(error: any): string {
    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message;
    }
    return t('lockFallback');
  }

  type SyncResult = { ok: true } | { locked: true } | { error: SyncError };

  const syncInstanceStatus = useCallback(
    async (
      nextItems: ChecklistItemType[],
      uid: string,
      prevItems: ChecklistItemType[],
      prevInstance: ChecklistInstanceType
    ): Promise<SyncResult> => {
      const now = new Date().toISOString();
      const snapshot: InstanceStatusSnapshot = {
        status: localInstanceRef.current.status,
        started_at: localInstanceRef.current.started_at,
        started_by: localInstanceRef.current.started_by,
        completed_at: localInstanceRef.current.completed_at,
        completed_by: localInstanceRef.current.completed_by,
      };

      const update = computeInstanceUpdate(nextItems, snapshot, uid, now);

      console.log('[syncInstanceStatus] snapshot:', snapshot);
      console.log('[syncInstanceStatus] computed update:', update);
      console.log('[syncInstanceStatus] instance.id:', instance.id);

      setLocalInstance((prev) => ({ ...prev, ...update }));
      setSyncError(null);
      setLockNotice(null);

      const { error } = await supabase
        .from('checklist_instances')
        .update(update)
        .eq('id', instance.id);

      if (error) {
        if (
          isReturnAfterCompletionLockError(error) &&
          localInstanceRef.current.status === 'completed'
        ) {
          console.log(
            '[syncInstanceStatus] return-after-completion lock on already-completed instance — treating as no-op'
          );
          setSyncError(null);
          setLockNotice(null);
          return { ok: true };
        }

        if (isLockError(error)) {
          setLocalItems(prevItems);
          setLocalInstance(prevInstance);
          setLockNotice(lockMessageFromError(error));
          return { locked: true };
        } else {
          const syncErr = parseSyncError(error, 'status_sync_failed');

          console.error('[syncInstanceStatus] Supabase error updating checklist_instances:');
          console.error('  message:', syncErr.message);
          console.error('  code:', syncErr.code);
          console.error('  details:', syncErr.details);
          console.error('  hint:', syncErr.hint);
          console.error('  raw:', syncErr.raw);

          setSyncError(syncErr);
          return { error: syncErr };
        }
      } else {
        console.log('[syncInstanceStatus] update succeeded, new status:', update.status);
        return { ok: true };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, instance.id]
  );

  /**
   * Navigate back to the page the user came from (used by the back button,
   * not by post-completion redirects).
   */
  const navigateBack = useCallback(() => {
    if (from === 'booking' && instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
    } else if (from === 'vehicle' && instance.vehicle_id) {
      router.push(`/${locale}/staff/vehicles/${instance.vehicle_id}`);
    } else {
      router.push(
        `/${locale}/staff/checklists?scope=${listScope}&status=${listStatus}`
      );
    }
  }, [from, instance.booking_id, instance.vehicle_id, locale, listScope, listStatus, router]);

  /**
   * Navigate after checklist completion using entry-context awareness.
   */
  const navigateAfterCompletion = useCallback(() => {
    if (from === 'booking') {
      router.push(`/${locale}/staff/bookings`);
    } else if (from === 'vehicle' && instance.vehicle_id) {
      router.push(`/${locale}/staff/vehicles/${instance.vehicle_id}`);
    } else if (searchParams.has('listScope') || searchParams.has('listStatus')) {
      router.push(`/${locale}/staff/checklists`);
    } else if (instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
    } else {
      router.push(`/${locale}/staff/bookings`);
    }
  }, [from, locale, instance.booking_id, instance.vehicle_id, router, searchParams]);

  const handleBackClick = () => {
    navigateBack();
  };

  const handleGoToBooking = () => {
    if (instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
    }
  };

  /** Quick Mode: complete ALL remaining unchecked items across all sections. */
  const handleQuickCompleteAll = async () => {
    if (isChecklistLocked) return;

    const uncheckedItems = localItems.filter((it) => !it.checked);
    if (uncheckedItems.length === 0) {
      navigateAfterCompletion();
      return;
    }

    const confirmed = confirm(t('quickCompleteConfirm', { count: uncheckedItems.length }));
    if (!confirmed) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setQuickCompleting(true);

    const now = new Date().toISOString();
    const uncheckedIds = uncheckedItems.map((it) => it.id);

    const prevItems = localItems;
    const prevInstance = localInstance;

    const nextItems = localItems.map((it) =>
      uncheckedIds.includes(it.id)
        ? { ...it, checked: true, checked_at: now, checked_by: user.id }
        : it
    );

    setLocalItems(nextItems);

    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({ checked: true, checked_at: now, checked_by: user.id })
      .in('id', uncheckedIds);

    if (itemError) {
      setLocalItems(prevItems);
      setLocalInstance(prevInstance);
      setQuickCompleting(false);

      if (isLockError(itemError)) {
        setSyncError(null);
        setLockNotice(lockMessageFromError(itemError));
      } else {
        const syncErr = parseSyncError(itemError, 'item_update_failed');
        console.error('[handleQuickCompleteAll] item update failed:', syncErr);
        setLockNotice(null);
        setSyncError(syncErr);
      }
      return;
    }

    try {
      const result = await syncInstanceStatus(nextItems, user.id, prevItems, prevInstance);

      if ('locked' in result) {
        await supabase
          .from('checklist_instance_items')
          .update({ checked: false, checked_at: null, checked_by: null })
          .in('id', uncheckedIds);
        setQuickCompleting(false);
        return;
      }

      if ('error' in result) {
        setQuickCompleting(false);
        return;
      }

      navigateAfterCompletion();
    } catch (err) {
      console.error('Error in handleQuickCompleteAll:', err);
      setLocalItems(initialItems);
      setLocalInstance(instance);
      setQuickCompleting(false);
      router.refresh();
    }
  };

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
    if (isChecklistLocked) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const newChecked = !currentChecked;
    const now = new Date().toISOString();

    const prevItems = localItems;
    const prevInstance = localInstance;

    const nextItems = localItems.map((it) =>
      it.id === itemId
        ? {
            ...it,
            checked: newChecked,
            checked_at: newChecked ? now : null,
            checked_by: newChecked ? user.id : null,
          }
        : it
    );

    setLocalItems(nextItems);

    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({
        checked: newChecked,
        checked_at: newChecked ? now : null,
        checked_by: newChecked ? user.id : null,
      })
      .eq('id', itemId);

    if (itemError) {
      setLocalItems(prevItems);
      setLocalInstance(prevInstance);

      if (isLockError(itemError)) {
        setSyncError(null);
        setLockNotice(lockMessageFromError(itemError));
      } else {
        const syncErr = parseSyncError(itemError, 'item_update_failed');
        console.error('[handleToggle] Supabase error updating checklist_instance_items:');
        console.error('  message:', syncErr.message);
        console.error('  code:', syncErr.code);
        console.error('  details:', syncErr.details);
        console.error('  hint:', syncErr.hint);
        setLockNotice(null);
        setSyncError(syncErr);
      }
      return;
    }

    try {
      const result = await syncInstanceStatus(nextItems, user.id, prevItems, prevInstance);

      if ('locked' in result) {
        const prevItem = prevItems.find((it) => it.id === itemId);
        await supabase
          .from('checklist_instance_items')
          .update({
            checked: prevItem ? prevItem.checked : currentChecked,
            checked_at: prevItem ? prevItem.checked_at : null,
            checked_by: prevItem ? prevItem.checked_by : null,
          })
          .eq('id', itemId);
        return;
      }

      router.refresh();
    } catch (err) {
      console.error('Error syncing checklist instance status:', err);
      setLocalItems(initialItems);
      setLocalInstance(instance);
      router.refresh();
    }
  };

  const handleCompleteSection = async (
    sectionName: string,
    sectionItems: ChecklistItemType[]
  ) => {
    if (isChecklistLocked) return;

    const uncheckedItems = sectionItems.filter((it) => !it.checked);
    if (uncheckedItems.length === 0) return;

    const confirmed = confirm(t('completeSectionConfirm', { section: sectionName }));
    if (!confirmed) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date().toISOString();
    const uncheckedIds = uncheckedItems.map((it) => it.id);
    if (uncheckedIds.length === 0) return;

    const prevItems = localItems;
    const prevInstance = localInstance;

    const nextItems = localItems.map((it) =>
      uncheckedIds.includes(it.id)
        ? { ...it, checked: true, checked_at: now, checked_by: user.id }
        : it
    );

    setLocalItems(nextItems);

    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({ checked: true, checked_at: now, checked_by: user.id })
      .in('id', uncheckedIds);

    if (itemError) {
      setLocalItems(prevItems);
      setLocalInstance(prevInstance);

      if (isLockError(itemError)) {
        setSyncError(null);
        setLockNotice(lockMessageFromError(itemError));
      } else {
        const syncErr = parseSyncError(itemError, 'item_update_failed');
        console.error('[handleCompleteSection] Supabase error updating checklist_instance_items:');
        console.error('  message:', syncErr.message);
        console.error('  code:', syncErr.code);
        console.error('  details:', syncErr.details);
        console.error('  hint:', syncErr.hint);
        setLockNotice(null);
        setSyncError(syncErr);
      }
      return;
    }

    try {
      const result = await syncInstanceStatus(nextItems, user.id, prevItems, prevInstance);

      if ('locked' in result) {
        await Promise.all(
          uncheckedIds.map((id) => {
            const prevItem = prevItems.find((it) => it.id === id);
            return supabase
              .from('checklist_instance_items')
              .update({
                checked: prevItem ? prevItem.checked : false,
                checked_at: prevItem ? prevItem.checked_at : null,
                checked_by: prevItem ? prevItem.checked_by : null,
              })
              .eq('id', id);
          })
        );
        return;
      }

      router.refresh();
    } catch (err) {
      console.error('Error completing section:', err);
      setLocalItems(initialItems);
      setLocalInstance(instance);
      router.refresh();
    }
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    if (isChecklistLocked) return;
    setLocalItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, notes } : it))
    );
  };

  const handleNotesBlur = async (itemId: string, notes: string) => {
    if (isChecklistLocked) return;
    try {
      await supabase
        .from('checklist_instance_items')
        .update({ notes })
        .eq('id', itemId);
    } catch (err) {
      console.error('Error updating notes:', err);
      router.refresh();
    }
  };

  const toggleNotes = (itemId: string) => {
    setOpenNotesById((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  // --- Flag panel helpers ---

  const openFlagPanel = (itemId: string) => {
    if (isChecklistLocked) return;
    setFlagDraftById((prev) => ({
      ...prev,
      [itemId]: prev[itemId] ?? { severity: 'attention' as IssueSeverity, note: '', saving: false, error: null },
    }));
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: true }));
  };

  const closeFlagPanel = (itemId: string) => {
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: false }));
    setFlagDraftById((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleFlagDraftChange = (
    itemId: string,
    field: 'severity' | 'note',
    value: string
  ) => {
    setFlagDraftById((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { severity: 'attention' as IssueSeverity, note: '', saving: false, error: null }), [field]: value },
    }));
  };

  const handleSaveFlag = async (itemId: string) => {
    if (isChecklistLocked) return;

    const draft = flagDraftById[itemId];
    if (!draft) return;

    if (!draft.note.trim()) {
      setFlagDraftById((prev) => ({
        ...prev,
        [itemId]: { ...draft, error: t('issueNoteRequired') },
      }));
      return;
    }

    if (!companyId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setFlagDraftById((prev) => ({
      ...prev,
      [itemId]: { ...draft, saving: true, error: null },
    }));

    const { data, error } = await supabase
      .from('issue_flags')
      .insert({
        company_id: companyId,
        checklist_instance_id: localInstance.id,
        checklist_instance_item_id: itemId,
        severity: draft.severity,
        status: 'open',
        note: draft.note.trim(),
        created_by: user.id,
      })
      .select('id,checklist_instance_item_id,severity,note,status')
      .single();

    if (error) {
      console.error('[handleSaveFlag] insert failed:', error);
      setFlagDraftById((prev) => ({
        ...prev,
        [itemId]: { ...draft, saving: false, error: error.message ?? t('flagSaveFailed') },
      }));
      return;
    }

    if (data) {
      setFlagsByItemId((prev) => ({ ...prev, [itemId]: data as IssueFlag }));
    }

    closeFlagPanel(itemId);
    router.refresh();
  };

  const handleResolveFlag = async (itemId: string) => {
    if (isChecklistLocked) return;

    const existingFlag = flagsByItemId[itemId];
    if (!existingFlag) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setResolvingFlagById((prev) => ({ ...prev, [itemId]: true }));

    const { error } = await supabase.rpc('fn_resolve_issue_flag', {
      p_flag_id: existingFlag.id,
      p_user_id: user.id,
    });

    if (error) {
      console.error('[handleResolveFlag] rpc failed:', error);
      setResolvingFlagById((prev) => ({ ...prev, [itemId]: false }));
      const syncErr = parseSyncError(error, 'status_sync_failed');
      setSyncError(syncErr);
      return;
    }

    setResolvingFlagById((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setFlagsByItemId((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    router.refresh();
  };

  // --- Severity badge helpers ---

  const severityBadgeStyles: Record<IssueSeverity, { bg: string; color: string; border: string }> = {
    attention: { bg: '#fefce8', color: '#a16207', border: '#fbbf24' },
    urgent: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  };

  const severityLabel = (severity: IssueSeverity): string => {
    switch (severity) {
      case 'attention': return t('severityAttention');
      case 'urgent': return t('severityUrgent');
    }
  };

  // --- Render ---

  const sortedItems = [...localItems].sort(
    (a, b) => a.template.sort_order - b.template.sort_order
  );

  const sections: { name: string; items: ChecklistItemType[] }[] = [];
  const sectionMap = new Map<string, ChecklistItemType[]>();

  for (const item of sortedItems) {
    const sectionName = item.template.section ?? t('sectionOther');
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
    sectionMap.get(sectionName)!.push(item);
  }

  sectionMap.forEach((items, name) => sections.push({ name, items }));

  const backButtonLabel =
    from === 'booking' && instance.booking_id
      ? t('backToBooking')
      : from === 'vehicle' && instance.vehicle_id
      ? t('backToVehicle')
      : t('backToChecklists');

  const CHECKLIST_TYPE_LABELS: Record<string, string> = {
    handover:          t('type_handover'),
    pickup:            t('type_pickup'),
    return:            t('type_return'),
    cleaning:          t('type_cleaning'),
    mechanical:        t('type_mechanical'),
    guest_prereturn:   t('type_guest_prereturn'),
    vehicle_readiness: t('type_vehicle_readiness'),
    pre_season:        t('type_pre_season'),
    post_season:       t('type_post_season'),
  };

  const checklistTitle = CHECKLIST_TYPE_LABELS[instance.checklist_type] ?? t('typeUnknown');

  const statusLabel = (() => {
    switch (localInstance.status) {
      case 'pending':
      case 'not_started':
        return t('statusNotStarted');
      case 'in_progress':
        return t('statusInProgress');
      case 'completed':
        return t('statusCompleted');
      default:
        return localInstance.status;
    }
  })();

  const totalItems = localItems.length;
  const checkedItems = localItems.filter((it) => it.checked).length;
  const remainingCount = totalItems - checkedItems;
  const allDoneAlready = remainingCount === 0;

  const renderItem = (item: ChecklistItemType) => {
    const checkerInitials =
      item.checked && item.checked_by
        ? initialsByUserId[item.checked_by] ?? null
        : null;

    const existingFlag = flagsByItemId[item.id] ?? null;
    const isFlagged = !!existingFlag;
    const isFlagPanelOpen = !quickMode && !isChecklistLocked && !!openFlagPanelById[item.id];
    const draft = flagDraftById[item.id] ?? null;
    const isResolvingFlag = !!resolvingFlagById[item.id];

    const badgeStyle = isFlagged ? severityBadgeStyles[existingFlag.severity] : null;

    return (
      <div
        key={item.id}
        style={{
          border: isFlagged
            ? '1px solid #f59e0b'
            : '1px solid rgb(var(--border))',
          borderRadius: '6px',
          padding: '12px',
          opacity: quickMode || isChecklistLocked ? 0.75 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <label
            htmlFor={quickMode || isChecklistLocked ? undefined : `check-${item.id}`}
            style={{
              marginTop: '2px',
              cursor: quickMode || isChecklistLocked ? 'default' : 'pointer',
              flexShrink: 0,
              position: 'relative',
              display: 'block',
            }}
          >
            {!quickMode && !isChecklistLocked && (
              <input
                type="checkbox"
                id={`check-${item.id}`}
                checked={item.checked}
                onChange={() => handleToggle(item.id, item.checked)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
            )}
            <div
              style={{
                width: '20px',
                height: '20px',
                border: item.checked
                  ? '2px solid rgb(var(--brand))'
                  : '2px solid rgb(var(--border))',
                borderRadius: '4px',
                backgroundColor: 'rgb(var(--surface))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.checked && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M13.3332 4L5.99984 11.3333L2.6665 8"
                    stroke="rgb(var(--brand))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </label>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '4px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  className="label"
                  style={{ fontWeight: 500, margin: 0 }}
                >
                  {item.template.label}
                </span>
                {checkerInitials && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: '1px solid rgb(var(--border))',
                      backgroundColor: 'rgb(var(--surface))',
                      color: 'rgb(var(--muted))',
                      fontSize: '10px',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {checkerInitials}
                  </span>
                )}
                {/* Flagged badge */}
                {isFlagged && badgeStyle && (
                  <span
                    title={t('flagAlreadyOpen')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: badgeStyle.bg,
                      color: badgeStyle.color,
                      border: `1px solid ${badgeStyle.border}`,
                      flexShrink: 0,
                      cursor: 'default',
                    }}
                  >
                    ⚑ {severityLabel(existingFlag.severity)}
                  </span>
                )}
              </div>

              {/* Action buttons: notes + flag (normal mode, unlocked only) */}
              {!quickMode && !isChecklistLocked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => toggleNotes(item.id)}
                    style={{
                      fontSize: '12px',
                      color: 'rgb(var(--brand))',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      textDecoration: 'underline',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.notes ? t('editNote') : t('addNote')}
                  </button>

                  {/* Flag button — hidden if already flagged */}
                  {!isFlagged && (
                    <button
                      type="button"
                      onClick={() =>
                        isFlagPanelOpen ? closeFlagPanel(item.id) : openFlagPanel(item.id)
                      }
                      style={{
                        fontSize: '12px',
                        color: isFlagPanelOpen ? '#92400e' : 'rgb(var(--muted))',
                        background: isFlagPanelOpen ? '#fef3c7' : 'none',
                        border: isFlagPanelOpen ? '1px solid #fbbf24' : '1px solid rgb(var(--border))',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        padding: '2px 8px',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                      }}
                    >
                      ⚑ {t('flag')}
                    </button>
                  )}

                  {/* Resolve button — shown only when item is flagged */}
                  {isFlagged && (
                    <button
                      type="button"
                      onClick={() => handleResolveFlag(item.id)}
                      disabled={isResolvingFlag}
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: isResolvingFlag ? 'rgb(var(--muted))' : '#166534',
                        background: 'none',
                        border: `1px solid ${isResolvingFlag ? 'rgb(var(--border))' : '#86efac'}`,
                        borderRadius: '4px',
                        cursor: isResolvingFlag ? 'not-allowed' : 'pointer',
                        padding: '2px 8px',
                        whiteSpace: 'nowrap',
                        opacity: isResolvingFlag ? 0.6 : 1,
                      }}
                    >
                      {isResolvingFlag ? t('resolving') : t('resolveFlag')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Notes: read-only preview when locked */}
            {(!quickMode && !isChecklistLocked && !openNotesById[item.id] && item.notes) && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'rgb(var(--muted))',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: '1.4',
                }}
              >
                {item.notes}
              </div>
            )}

            {(!quickMode && !isChecklistLocked && openNotesById[item.id]) && (
              <textarea
                placeholder={t('notesPlaceholder')}
                value={item.notes ?? ''}
                onChange={(e) => handleNotesChange(item.id, e.target.value)}
                onBlur={(e) => handleNotesBlur(item.id, e.target.value)}
                rows={2}
                className="input"
                style={{
                  marginTop: '6px',
                  width: '100%',
                  resize: 'vertical',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                }}
              />
            )}

            {/* Locked: show note as read-only text */}
            {isChecklistLocked && item.notes && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'rgb(var(--muted))',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: '1.4',
                }}
              >
                {item.notes}
              </div>
            )}

            {/* In Quick Mode (unlocked), show note text inline (read-only) */}
            {quickMode && !isChecklistLocked && item.notes && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'rgb(var(--muted))',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: '1.4',
                }}
              >
                {item.notes}
              </div>
            )}

            {/* Inline flag panel */}
            {isFlagPanelOpen && draft && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #fbbf24',
                  backgroundColor: '#fffbeb',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Severity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label
                    style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', flexShrink: 0 }}
                  >
                    {t('severity')}
                  </label>
                  <select
                    value={draft.severity}
                    onChange={(e) =>
                      handleFlagDraftChange(item.id, 'severity', e.target.value)
                    }
                    style={{
                      fontSize: '12px',
                      padding: '3px 6px',
                      borderRadius: '4px',
                      border: '1px solid #fbbf24',
                      backgroundColor: '#fff',
                      color: '#92400e',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="attention">{t('severityAttention')}</option>
                    <option value="urgent">{t('severityUrgent')}</option>
                  </select>
                </div>

                {/* Note */}
                <textarea
                  placeholder={t('issueNotePlaceholder')}
                  value={draft.note}
                  onChange={(e) =>
                    handleFlagDraftChange(item.id, 'note', e.target.value)
                  }
                  rows={2}
                  style={{
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: draft.error ? '1px solid #ef4444' : '1px solid #fbbf24',
                    backgroundColor: '#fff',
                    resize: 'vertical',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />

                {draft.error && (
                  <div style={{ fontSize: '12px', color: '#ef4444' }}>{draft.error}</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleSaveFlag(item.id)}
                    disabled={draft.saving || !userId || !companyId}
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: '1px solid #f59e0b',
                      backgroundColor: (draft.saving || !userId || !companyId) ? '#fef3c7' : '#f59e0b',
                      color: (draft.saving || !userId || !companyId) ? '#92400e' : '#fff',
                      cursor: (draft.saving || !userId || !companyId) ? 'not-allowed' : 'pointer',
                      opacity: (draft.saving || !userId || !companyId) ? 0.7 : 1,
                    }}
                  >
                    {draft.saving ? t('saving') : t('saveFlag')}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeFlagPanel(item.id)}
                    disabled={draft.saving}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid rgb(var(--border))',
                      backgroundColor: 'rgb(var(--surface))',
                      color: 'rgb(var(--muted))',
                      cursor: draft.saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageContainer maxWidth="1400px">
      {/* Header Card */}
      <div
        className="surface"
        style={{ borderRadius: '8px', padding: '16px', marginBottom: '16px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={handleBackClick}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                color: 'rgb(var(--muted))',
                textDecoration: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                marginBottom: '8px',
              }}
            >
              <span>←</span>
              {backButtonLabel}
            </button>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '4px',
                color: 'rgb(var(--text))',
              }}
            >
              {checklistTitle}
            </h1>
            <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
              {instance.bookings
                ? `${instance.bookings.booking_number} – ${instance.bookings.customer_name}`
                : instance.vehicles
                ? instance.vehicles.name
                : t('noBookingLinked')}
            </p>
          </div>

          {/* Status badge + Quick Mode toggle */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '10px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--surface))',
                color: 'rgb(var(--text))',
              }}
            >
              {statusLabel}
            </span>

            {/* Quick Mode toggle — disabled when locked */}
            <button
              type="button"
              onClick={() => { if (!isChecklistLocked) setQuickMode((v) => !v); }}
              disabled={isChecklistLocked}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isChecklistLocked ? 'not-allowed' : 'pointer',
                border: quickMode
                  ? '2px solid rgb(var(--brand))'
                  : '1px solid rgb(var(--border))',
                backgroundColor: quickMode ? 'rgb(var(--brand))' : 'rgb(var(--surface))',
                color: quickMode ? '#fff' : 'rgb(var(--text))',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                whiteSpace: 'nowrap',
                opacity: isChecklistLocked ? 0.45 : 1,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path
                  d="M9 1L2 9.5H7.5L7 15L14 6.5H8.5L9 1Z"
                  fill={quickMode ? '#fff' : 'rgb(var(--brand))'}
                  stroke={quickMode ? '#fff' : 'rgb(var(--brand))'}
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </svg>
              {t('quickMode')}
            </button>
          </div>
        </div>
      </div>

      {/* Booking-completed lock banner */}
      {isChecklistLocked && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid rgb(var(--border))',
            backgroundColor: 'rgb(var(--surface))',
            color: 'rgb(var(--muted))',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <span style={{ flexShrink: 0 }}>🔒</span>
          <span>
            {t('lockedBookingCompleted', {
              defaultValue:
                'This checklist is locked because the linked booking has been completed.',
            })}
          </span>
        </div>
      )}

      {/* Quick Mode: single primary action banner */}
      {quickMode && !isChecklistLocked && (
        <div
          style={{
            marginBottom: '16px',
            padding: '14px 16px',
            borderRadius: '8px',
            border: '2px solid rgb(var(--brand))',
            backgroundColor: 'rgb(var(--surface))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'rgb(var(--text))',
                marginBottom: '2px',
              }}
            >
              {allDoneAlready
                ? t('allItemsChecked', { total: totalItems })
                : t('itemsCheckedOf', { checked: checkedItems, total: totalItems })}
            </div>
            <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
              {allDoneAlready
                ? t('checklistIsComplete')
                : t('itemsRemaining', { count: remainingCount })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleQuickCompleteAll}
            disabled={quickCompleting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: quickCompleting ? 'not-allowed' : 'pointer',
              border: '2px solid rgb(var(--brand))',
              backgroundColor: quickCompleting ? 'rgb(var(--surface))' : 'rgb(var(--brand))',
              color: quickCompleting ? 'rgb(var(--muted))' : '#fff',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'opacity 0.15s ease',
              opacity: quickCompleting ? 0.6 : 1,
            }}
          >
            {quickCompleting ? (
              t('completing')
            ) : allDoneAlready ? (
              <>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 8.5L6 12.5L14 4.5" stroke="rgb(var(--brand))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('doneGoBack')}
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 1L2 9.5H7.5L7 15L14 6.5H8.5L9 1Z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round" />
                </svg>
                {t('completeChecklist')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Lock Notice (DB-triggered, fallback) */}
      {lockNotice && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid rgb(var(--border))',
            backgroundColor: 'rgb(var(--surface))',
            color: 'rgb(var(--muted))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '13px',
          }}
        >
          <span>🔒 {lockNotice}</span>
          <button
            type="button"
            onClick={() => setLockNotice(null)}
            style={{
              fontSize: '11px',
              color: 'rgb(var(--muted))',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Status Sync Error Banner */}
      {syncError && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '6px',
            border: '1px solid #f87171',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
            {syncError.kind === 'item_update_failed'
              ? `⚠️ ${t('errorItemUpdateFailed')}`
              : `⚠️ ${t('errorStatusSyncFailed')}`}
          </div>
          <div style={{ fontSize: '12px', lineHeight: '1.6', fontFamily: 'monospace' }}>
            <div><strong>message:</strong> {syncError.message}</div>
            {syncError.code && <div><strong>code:</strong> {syncError.code}</div>}
            {syncError.details && <div><strong>details:</strong> {syncError.details}</div>}
            {syncError.hint && <div><strong>hint:</strong> {syncError.hint}</div>}
            <details style={{ marginTop: '6px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '11px' }}>Raw error JSON</summary>
              <pre
                style={{
                  marginTop: '4px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontSize: '11px',
                }}
              >
                {syncError.raw}
              </pre>
            </details>
          </div>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: '#991b1b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Compact Success Notice (normal mode, unlocked only) */}
      {!quickMode && !isChecklistLocked && localInstance.status === 'completed' && (
        <div style={{ marginBottom: '16px' }}>
          <div
            className="surface"
            style={{
              padding: '10px 14px',
              border: '1px solid rgb(var(--border))',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z"
                  fill="rgb(var(--brand))"
                />
              </svg>
              <span
                style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}
              >
                {t('checklistCompleted')}
              </span>
            </div>
            {instance.booking_id && (
              <button
                onClick={handleGoToBooking}
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: '14px', fontWeight: 500 }}
              >
                {t('goToBooking')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sectioned Checklist Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sections.map(({ name, items: sectionItems }) => {
          const completedCount = sectionItems.filter((it) => it.checked).length;
          const totalCount = sectionItems.length;
          const allDone = completedCount === totalCount;
          const isCollapsed = !!collapsedSections[name];

          return (
            <div
              key={name}
              className="surface"
              style={{ borderRadius: '8px', overflow: 'hidden' }}
            >
              {/* Section Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: isCollapsed ? 'none' : '1px solid rgb(var(--border))',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      flexShrink: 0,
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                      color: 'rgb(var(--muted))',
                    }}
                  >
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{ fontWeight: 600, fontSize: '14px', color: 'rgb(var(--text))' }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: allDone ? 'rgb(var(--brand))' : 'rgb(var(--muted))',
                      flexShrink: 0,
                    }}
                  >
                    {t('sectionProgress', { completed: completedCount, total: totalCount })}
                  </span>
                </button>

                {/* Per-section complete button — normal mode, unlocked only */}
                {!quickMode && !isChecklistLocked && !allDone && (
                  <button
                    type="button"
                    onClick={() => handleCompleteSection(name, sectionItems)}
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'rgb(var(--brand))',
                      background: 'none',
                      border: '1px solid rgb(var(--brand))',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      padding: '4px 10px',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('completeSection')}
                  </button>
                )}
              </div>

              {/* Section Items */}
              {!isCollapsed && (
                <div
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {sectionItems.map((item) => renderItem(item))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}