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

/** DB severity values stored in checklist_instance_items.issue_severity */
type DbIssueSeverity = 'low' | 'medium' | 'high' | 'critical';

type ChecklistItemType = {
  id: string;
  template_item_id: string;
  checked: boolean;
  notes: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  // Issue lifecycle fields (stored directly on the item row)
  issue_flag: boolean | null;
  issue_title: string | null;
  issue_description: string | null;
  issue_severity: DbIssueSeverity | null;
  issue_blocking: boolean | null;
  linked_vehicle_issue_id: string | null;
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

type ReopenHistoryEntry = {
  id: string;
  reopened_at: string;
  reason: string | null;
  snapshot: {
    instance: {
      status: string;
      started_at: string | null;
      started_by: string | null;
      completed_at: string | null;
      completed_by: string | null;
    };
    items: Array<{
      id: string;
      template_item_id: string;
      checked: boolean;
      notes: string | null;
      checked_at: string | null;
      checked_by: string | null;
      issue_flag: boolean | null;
      issue_title: string | null;
      issue_description: string | null;
      issue_severity: DbIssueSeverity | null;
      issue_blocking: boolean | null;
      linked_vehicle_issue_id: string | null;
    }>;
  };
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

/** UI severity values used in the flag panel draft and badge rendering */
type IssueSeverity = 'attention' | 'urgent';

type FlagDraft = {
  severity: IssueSeverity;
  note: string;
  saving: boolean;
  error: string | null;
  photos: File[];
};

/** Map UI severity → DB severity for persistence */
function uiToDbSeverity(ui: IssueSeverity): DbIssueSeverity {
  switch (ui) {
    case 'attention': return 'medium';
    case 'urgent': return 'high';
  }
}

/** Map DB severity → UI severity for badge rendering */
function dbToUiSeverity(db: DbIssueSeverity | null | undefined): IssueSeverity {
  switch (db) {
    case 'high':
    case 'critical':
      return 'urgent';
    default:
      return 'attention';
  }
}

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

  // Office confirmations (Phase 3) — local state only, no backend wiring yet
  const [officeConfirmations, setOfficeConfirmations] = useState({
    contractSigned: false,
    idVerified: false,
    securityDepositCollected: false,
    vehicleDocsHandedOver: false,
    keysHandedOver: false,
  });

  // Optional ID photos (Phase 3) — local state only, no upload yet
  const [officeIdPhotos, setOfficeIdPhotos] = useState<File[]>([]);

  // Vehicle data capture (Phase 2 Block 1) — local state only, no backend wiring yet
  const [vehicleData, setVehicleData] = useState({ km: '', fuel: '', adblue: '' });

  // Evidence photos (Phase 2 Block 2) — local state only, no upload yet
  const [evidencePhotos, setEvidencePhotos] = useState<{ general: File[]; damage: File[] }>({ general: [], damage: [] });

  // Missing pickup data warning modal (UI only — does not block completion)
  const [pickupDataWarningModal, setPickupDataWarningModal] = useState<{
    missing: string[];
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Handover safety confirmation modal
  const [handoverSafetyModal, setHandoverSafetyModal] = useState<{
    flaggedItems: ChecklistItemType[];
    triggerCheckedIds: string[];
    triggerCheckedAt: string;
    triggerCheckedBy: string;
  } | null>(null);
  const pendingCompletionRef = useRef<(() => Promise<void>) | null>(null);

  // Reopen checklist modal
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Reopen/revert history (handover checklists only)
  const [reopenHistory, setReopenHistory] = useState<ReopenHistoryEntry[]>([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});

  // Issue flagging UI state
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

  // Only pickup and handover types require the safety confirmation gate.
  const isPickupOrHandover =
    instance.checklist_type === 'pickup' || instance.checklist_type === 'handover';

  // --- Handover safety confirmation helpers ---

  const showHandoverSafetyModal = (
    flaggedItems: ChecklistItemType[],
    onConfirm: () => Promise<void>,
    triggerCheckedIds: string[],
    triggerCheckedAt: string,
    triggerCheckedBy: string
  ) => {
    pendingCompletionRef.current = onConfirm;
    setHandoverSafetyModal({ flaggedItems, triggerCheckedIds, triggerCheckedAt, triggerCheckedBy });
  };

  const handleSafetyConfirm = async () => {
    const flaggedItems = handoverSafetyModal?.flaggedItems ?? [];
    setHandoverSafetyModal(null);

    // Downgrade all blocking flagged items to non-blocking before completing.
    // issue_flag stays true and the issue stays open; only the blocking flag is cleared.
    const blockingIds = flaggedItems
      .filter((it) => it.issue_blocking === true)
      .map((it) => it.id);

    if (blockingIds.length > 0) {
      // Optimistic local update
      setLocalItems((prev) =>
        prev.map((it) =>
          blockingIds.includes(it.id) ? { ...it, issue_blocking: false } : it
        )
      );

      const { error } = await supabase
        .from('checklist_instance_items')
        .update({ issue_blocking: false })
        .in('id', blockingIds);

      if (error) {
        console.error('[handleSafetyConfirm] failed to downgrade blocking issues:', error);
        // Roll back optimistic update and surface the error — do not complete.
        setLocalItems((prev) =>
          prev.map((it) =>
            blockingIds.includes(it.id) ? { ...it, issue_blocking: true } : it
          )
        );
        setSyncError(parseSyncError(error, 'item_update_failed'));
        return;
      }
    }

    const fn = pendingCompletionRef.current;
    pendingCompletionRef.current = null;
    if (fn) await fn();
  };

  const handleSafetyCancel = () => {
    setHandoverSafetyModal(null);
    pendingCompletionRef.current = null;
  };

  const handleSafetyMarkUrgent = async () => {
    const modal = handoverSafetyModal;
    const attentionItems = (modal?.flaggedItems ?? []).filter(
      (it) => it.issue_blocking !== true
    );
    const attentionIds = attentionItems.map((it) => it.id);
    const triggerCheckedIds = modal?.triggerCheckedIds ?? [];
    const triggerCheckedAt = modal?.triggerCheckedAt ?? '';
    const triggerCheckedBy = modal?.triggerCheckedBy ?? '';

    setHandoverSafetyModal(null);
    pendingCompletionRef.current = null;

    if (attentionIds.length === 0) return;

    // Optimistic local update: upgrade attention items to urgent + uncheck them,
    // and mark trigger items as checked (they weren't written yet).
    setLocalItems((prev) =>
      prev.map((it) => {
        if (attentionIds.includes(it.id)) {
          return {
            ...it,
            issue_severity: 'high' as DbIssueSeverity,
            issue_blocking: true,
            checked: false,
            checked_at: null,
            checked_by: null,
          };
        }
        if (triggerCheckedIds.includes(it.id)) {
          return { ...it, checked: true, checked_at: triggerCheckedAt, checked_by: triggerCheckedBy };
        }
        return it;
      })
    );

    // Persist: upgrade severity and uncheck attention items in one write.
    const { error: urgentError } = await supabase
      .from('checklist_instance_items')
      .update({ issue_severity: 'high', issue_blocking: true, checked: false, checked_at: null, checked_by: null })
      .in('id', attentionIds);

    if (urgentError) {
      console.error('[handleSafetyMarkUrgent] failed to upgrade attention issues:', urgentError);
      // Roll back using original values captured before the update
      setLocalItems((prev) =>
        prev.map((it) => {
          const original = attentionItems.find((orig) => orig.id === it.id);
          return original
            ? {
                ...it,
                issue_severity: original.issue_severity,
                issue_blocking: original.issue_blocking,
                checked: original.checked,
                checked_at: original.checked_at,
                checked_by: original.checked_by,
              }
            : it;
        })
      );
      setSyncError(parseSyncError(urgentError, 'item_update_failed'));
      return;
    }

    // Persist: write trigger items as checked (excluding any that became urgent).
    const finalTriggerIds = triggerCheckedIds.filter((id) => !attentionIds.includes(id));
    if (finalTriggerIds.length > 0 && triggerCheckedBy) {
      const { error: triggerError } = await supabase
        .from('checklist_instance_items')
        .update({ checked: true, checked_at: triggerCheckedAt, checked_by: triggerCheckedBy })
        .in('id', finalTriggerIds);

      if (triggerError) {
        console.error('[handleSafetyMarkUrgent] failed to persist trigger items as checked:', triggerError);
        setSyncError(parseSyncError(triggerError, 'item_update_failed'));
      }
    }
  };

  const fetchReopenHistory = useCallback(async () => {
    if (instance.checklist_type !== 'handover') return;
    const { data } = await supabase
      .from('checklist_reopen_history')
      .select('id, reopened_at, reason, snapshot')
      .eq('checklist_instance_id', instance.id)
      .order('reopened_at', { ascending: false });
    if (data) setReopenHistory(data as ReopenHistoryEntry[]);
  }, [supabase, instance.id, instance.checklist_type]);

  const handleReopenConfirm = async () => {
    if (!userId) return;
    setReopening(true);

    // Build snapshot of current state before resetting
    const snapshot = {
      instance: {
        status: localInstance.status,
        started_at: localInstance.started_at,
        started_by: localInstance.started_by,
        completed_at: localInstance.completed_at,
        completed_by: localInstance.completed_by,
      },
      items: localItems.map((it) => ({
        id: it.id,
        template_item_id: it.template_item_id,
        checked: it.checked,
        notes: it.notes,
        checked_at: it.checked_at,
        checked_by: it.checked_by,
        issue_flag: it.issue_flag,
        issue_title: it.issue_title,
        issue_description: it.issue_description,
        issue_severity: it.issue_severity,
        issue_blocking: it.issue_blocking,
        linked_vehicle_issue_id: it.linked_vehicle_issue_id,
      })),
    };

    // 1. Insert history snapshot
    const { error: historyError } = await supabase
      .from('checklist_reopen_history')
      .insert({
        checklist_instance_id: instance.id,
        snapshot,
        reopened_by: userId,
        reason: reopenReason.trim() || null,
      });

    if (historyError) {
      console.error('[handleReopenConfirm] history insert failed:', historyError);
      setSyncError(parseSyncError(historyError, 'status_sync_failed'));
      setReopening(false);
      return;
    }

    // 2. Reset instance status first so the DB lock on completed checklists is lifted
    //    before we attempt to write to checklist_instance_items.
    const { error: instanceError } = await supabase
      .from('checklist_instances')
      .update({ status: 'in_progress', completed_at: null, completed_by: null })
      .eq('id', instance.id);

    if (instanceError) {
      console.error('[handleReopenConfirm] instance reset failed:', instanceError);
      setSyncError(parseSyncError(instanceError, 'status_sync_failed'));
      setReopening(false);
      return;
    }

    // 3. Now reset all item fields — the instance is no longer completed so the DB allows it.
    //    Filter by instance_id (the real FK column) rather than collecting item IDs from local state.
    const { error: itemsError } = await supabase
      .from('checklist_instance_items')
      .update({
        checked: false,
        checked_at: null,
        checked_by: null,
        issue_flag: false,
        issue_title: null,
        issue_description: null,
        issue_severity: null,
        issue_blocking: null,
        linked_vehicle_issue_id: null,
      })
      .eq('instance_id', instance.id);

    if (itemsError) {
      // Extract every observable field so the error is never silently swallowed as {}.
      const extracted = {
        message:  (itemsError as any).message  ?? undefined,
        code:     (itemsError as any).code     ?? undefined,
        details:  (itemsError as any).details  ?? undefined,
        hint:     (itemsError as any).hint     ?? undefined,
        name:     (itemsError as any).name     ?? undefined,
        stack:    (itemsError as any).stack    ?? undefined,
        keys:     Object.keys(itemsError as any),
        json:     (() => { try { return JSON.stringify(itemsError); } catch { return '(unstringifiable)'; } })(),
      };
      console.error('[handleReopenConfirm] items reset failed — raw object:', itemsError);
      console.error('[handleReopenConfirm] items reset failed — extracted:', extracted);

      // Rollback: restore instance to completed so we don't leave a half-reopened state.
      await supabase
        .from('checklist_instances')
        .update({
          status: snapshot.instance.status,
          completed_at: snapshot.instance.completed_at,
          completed_by: snapshot.instance.completed_by,
        })
        .eq('id', instance.id);

      // Build a synthetic error that parseSyncError can surface in the banner.
      const syntheticForBanner = {
        message: extracted.message ?? extracted.json ?? 'Unknown error resetting checklist items',
        code:    extracted.code    ?? null,
        details: extracted.details ?? (extracted.keys.length ? `keys: ${extracted.keys.join(', ')}` : null),
        hint:    extracted.hint    ?? extracted.stack ?? null,
      };
      setSyncError(parseSyncError(syntheticForBanner, 'item_update_failed'));
      setReopening(false);
      return;
    }

    // 4. Apply optimistic local updates in the same order (instance first, then items).
    setLocalInstance((prev) => ({
      ...prev,
      status: 'in_progress',
      completed_at: null,
      completed_by: null,
    }));
    setLocalItems((prev) =>
      prev.map((it) => ({
        ...it,
        checked: false,
        checked_at: null,
        checked_by: null,
        issue_flag: false,
        issue_title: null,
        issue_description: null,
        issue_severity: null,
        issue_blocking: null,
        linked_vehicle_issue_id: null,
      }))
    );

    setReopenModal(false);
    setReopenReason('');
    setReopening(false);
    fetchReopenHistory();
  };

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

  // Resolve initials for checked_by IDs saved in history snapshots.
  useEffect(() => {
    const historicalIds = reopenHistory.flatMap((entry) =>
      entry.snapshot.items
        .filter((it) => it.checked && it.checked_by)
        .map((it) => it.checked_by as string)
    );
    const unique = [...new Set(historicalIds)];
    const missing = unique.filter((id) => !(id in initialsByUserId));
    if (missing.length > 0) {
      fetchInitialsForUsers(missing);
    }
  }, [reopenHistory, initialsByUserId, fetchInitialsForUsers]);

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

  useEffect(() => {
    fetchReopenHistory();
  }, [fetchReopenHistory]);

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

  const getMissingPickupData = (): string[] => {
    const missing: string[] = [];
    if (!vehicleData.km) missing.push('km');
    if (!vehicleData.fuel) missing.push('fuel');
    if (!vehicleData.adblue) missing.push('adblue');
    const totalPhotos = evidencePhotos.general.length + evidencePhotos.damage.length;
    if (totalPhotos === 0) missing.push('photos');
    return missing;
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

    // Inner helper: runs existing flag safety gate then completes.
    const proceedQuickComplete = async () => {
      // Safety gate: for pickup/handover checklists, require confirmation if flagged issues exist.
      if (isPickupOrHandover) {
        // Urgent-blocking: if any items are issue_blocking, uncheck them and show modal —
        // no completion or status sync occurs.
        const urgentItems = localItems.filter((it) => it.issue_blocking === true);
        if (urgentItems.length > 0) {
          const urgentIds = urgentItems.map((it) => it.id);
          const now = new Date().toISOString();
          const uncheckedIds = uncheckedItems.map((it) => it.id);
          const toCheckIds = uncheckedIds.filter((id) => !urgentIds.includes(id));
          const nextWithUrgentsUnchecked = localItems.map((it) => {
            if (urgentIds.includes(it.id)) {
              return { ...it, checked: false, checked_at: null, checked_by: null };
            }
            if (uncheckedIds.includes(it.id)) {
              return { ...it, checked: true, checked_at: now, checked_by: user.id };
            }
            return it;
          });
          setLocalItems(nextWithUrgentsUnchecked);
          const writes: PromiseLike<unknown>[] = [
            supabase
              .from('checklist_instance_items')
              .update({ checked: false, checked_at: null, checked_by: null })
              .in('id', urgentIds),
          ];
          if (toCheckIds.length > 0) {
            writes.push(
              supabase
                .from('checklist_instance_items')
                .update({ checked: true, checked_at: now, checked_by: user.id })
                .in('id', toCheckIds)
            );
          }
          await Promise.all(writes);
          setHandoverSafetyModal({ flaggedItems: urgentItems, triggerCheckedIds: [], triggerCheckedAt: '', triggerCheckedBy: '' });
          return;
        }

        const flagged = localItems.filter((it) => !!it.issue_flag);
        if (flagged.length > 0) {
          const triggerNow = new Date().toISOString();
          showHandoverSafetyModal(flagged, async () => {
            await doQuickCompleteAll(user.id, uncheckedItems);
          }, uncheckedItems.map((it) => it.id), triggerNow, user.id);
          return;
        }
      }

      await doQuickCompleteAll(user.id, uncheckedItems);
    };

    // Missing pickup data check — fires before flag safety gate.
    if (isPickupOrHandover) {
      const missing = getMissingPickupData();
      if (missing.length > 0) {
        setPickupDataWarningModal({ missing, onConfirm: proceedQuickComplete });
        return;
      }
    }

    await proceedQuickComplete();
  };

  const doQuickCompleteAll = async (userId: string, uncheckedItems: ChecklistItemType[]) => {
    setQuickCompleting(true);

    const now = new Date().toISOString();
    const uncheckedIds = uncheckedItems.map((it) => it.id);

    const prevItems = localItems;
    const prevInstance = localInstance;

    const nextItems = localItems.map((it) =>
      uncheckedIds.includes(it.id)
        ? { ...it, checked: true, checked_at: now, checked_by: userId }
        : it
    );

    setLocalItems(nextItems);

    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({ checked: true, checked_at: now, checked_by: userId })
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
      const result = await syncInstanceStatus(nextItems, userId, prevItems, prevInstance);

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

    // Safety gate: if this toggle would complete a pickup/handover checklist and
    // unresolved flagged issues exist, pause and ask before writing anything.
    const wouldComplete = isPickupOrHandover && nextItems.every((it) => it.checked);
    if (wouldComplete) {
      // Inner helper: runs flag safety check then writes.
      const proceedToggle = async () => {
        // Urgent-blocking: if any items are issue_blocking, uncheck them and show modal —
        // the trigger item stays checked in UI; NO completion or status sync occurs.
        const urgentItems = localItems.filter((it) => it.issue_blocking === true);
        if (urgentItems.length > 0) {
          const urgentIds = urgentItems.map((it) => it.id);
          const nextWithUrgentsUnchecked = nextItems.map((it) =>
            urgentIds.includes(it.id)
              ? { ...it, checked: false, checked_at: null, checked_by: null }
              : it
          );
          setLocalItems(nextWithUrgentsUnchecked);
          await Promise.all([
            supabase
              .from('checklist_instance_items')
              .update({ checked: true, checked_at: now, checked_by: user.id })
              .eq('id', itemId),
            supabase
              .from('checklist_instance_items')
              .update({ checked: false, checked_at: null, checked_by: null })
              .in('id', urgentIds),
          ]);
          setHandoverSafetyModal({ flaggedItems: urgentItems, triggerCheckedIds: [], triggerCheckedAt: '', triggerCheckedBy: '' });
          return;
        }

        const flagged = localItems.filter((it) => !!it.issue_flag);
        if (flagged.length > 0) {
          showHandoverSafetyModal(flagged, async () => {
            await doToggleWrites(
              itemId, newChecked, now, user.id, nextItems, prevItems, prevInstance, currentChecked
            );
          }, [itemId], now, user.id);
          return;
        }

        await doToggleWrites(
          itemId, newChecked, now, user.id, nextItems, prevItems, prevInstance, currentChecked
        );
      };

      // Missing pickup data check — fires before flag safety gate.
      const missing = getMissingPickupData();
      if (missing.length > 0) {
        setPickupDataWarningModal({ missing, onConfirm: proceedToggle });
        return;
      }

      await proceedToggle();
      return;
    }

    await doToggleWrites(
      itemId, newChecked, now, user.id, nextItems, prevItems, prevInstance, currentChecked
    );
  };

  const doToggleWrites = async (
    itemId: string,
    newChecked: boolean,
    now: string,
    userId: string,
    nextItems: ChecklistItemType[],
    prevItems: ChecklistItemType[],
    prevInstance: ChecklistInstanceType,
    currentChecked: boolean
  ) => {
    setLocalItems(nextItems);

    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({
        checked: newChecked,
        checked_at: newChecked ? now : null,
        checked_by: newChecked ? userId : null,
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
      const result = await syncInstanceStatus(nextItems, userId, prevItems, prevInstance);

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

    // Safety gate: if completing this section would finish a pickup/handover checklist
    // and unresolved flagged issues exist, pause and ask before writing anything.
    const wouldComplete = isPickupOrHandover && nextItems.every((it) => it.checked);
    if (wouldComplete) {
      // Inner helper: runs flag safety check then writes.
      const proceedCompleteSection = async () => {
        // Urgent-blocking: if any items are issue_blocking, uncheck them and show modal —
        // no completion or status sync occurs.
        const urgentItems = localItems.filter((it) => it.issue_blocking === true);
        if (urgentItems.length > 0) {
          const urgentIds = urgentItems.map((it) => it.id);
          const toCheckIds = uncheckedIds.filter((id) => !urgentIds.includes(id));
          const nextWithUrgentsUnchecked = nextItems.map((it) =>
            urgentIds.includes(it.id)
              ? { ...it, checked: false, checked_at: null, checked_by: null }
              : it
          );
          setLocalItems(nextWithUrgentsUnchecked);
          const writes: PromiseLike<unknown>[] = [
            supabase
              .from('checklist_instance_items')
              .update({ checked: false, checked_at: null, checked_by: null })
              .in('id', urgentIds),
          ];
          if (toCheckIds.length > 0) {
            writes.push(
              supabase
                .from('checklist_instance_items')
                .update({ checked: true, checked_at: now, checked_by: user.id })
                .in('id', toCheckIds)
            );
          }
          await Promise.all(writes);
          setHandoverSafetyModal({ flaggedItems: urgentItems, triggerCheckedIds: [], triggerCheckedAt: '', triggerCheckedBy: '' });
          return;
        }

        const flagged = localItems.filter((it) => !!it.issue_flag);
        if (flagged.length > 0) {
          showHandoverSafetyModal(flagged, async () => {
            await doCompleteSectionWrites(user.id, now, uncheckedIds, nextItems, prevItems, prevInstance);
          }, uncheckedIds, now, user.id);
          return;
        }

        await doCompleteSectionWrites(user.id, now, uncheckedIds, nextItems, prevItems, prevInstance);
      };

      // Missing pickup data check — fires before flag safety gate.
      const missing = getMissingPickupData();
      if (missing.length > 0) {
        setPickupDataWarningModal({ missing, onConfirm: proceedCompleteSection });
        return;
      }

      await proceedCompleteSection();
      return;
    }

    await doCompleteSectionWrites(user.id, now, uncheckedIds, nextItems, prevItems, prevInstance);
  };

  const doCompleteSectionWrites = async (
    userId: string,
    now: string,
    uncheckedIds: string[],
    nextItems: ChecklistItemType[],
    prevItems: ChecklistItemType[],
    prevInstance: ChecklistInstanceType
  ) => {
    setLocalItems(nextItems);

    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({ checked: true, checked_at: now, checked_by: userId })
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
      const result = await syncInstanceStatus(nextItems, userId, prevItems, prevInstance);

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
      [itemId]: prev[itemId] ?? { severity: 'attention' as IssueSeverity, note: '', saving: false, error: null, photos: [] },
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
      [itemId]: { ...(prev[itemId] ?? { severity: 'attention' as IssueSeverity, note: '', saving: false, error: null, photos: [] }), [field]: value },
    }));
  };

  const handleFlagAddPhotos = (itemId: string, files: FileList | null) => {
    if (!files) return;
    setFlagDraftById((prev) => {
      const draft = prev[itemId];
      if (!draft) return prev;
      const current = draft.photos ?? [];
      const added = Array.from(files);
      const merged = [...current, ...added].slice(0, 3);
      return { ...prev, [itemId]: { ...draft, photos: merged } };
    });
  };

  const handleFlagRemovePhoto = (itemId: string, index: number) => {
    setFlagDraftById((prev) => {
      const draft = prev[itemId];
      if (!draft) return prev;
      const photos = draft.photos.filter((_, i) => i !== index);
      return { ...prev, [itemId]: { ...draft, photos } };
    });
  };

  /**
   * Save an issue flag by updating the checklist_instance_items row directly.
   * The DB trigger creates/updates the linked vehicle_issues row automatically.
   */
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const item = localItems.find((it) => it.id === itemId);
    if (!item) return;

    setFlagDraftById((prev) => ({
      ...prev,
      [itemId]: { ...draft, saving: true, error: null },
    }));

    const issueUpdate = {
      issue_flag: true,
      issue_title: item.template.label,
      issue_description: draft.note.trim(),
      issue_severity: uiToDbSeverity(draft.severity),
      issue_blocking: draft.severity === 'urgent',
      // Clear any stale link from a previously-resolved issue so the trigger
      // always follows the "create new vehicle issue" path rather than trying
      // to reopen an already-resolved issue (which fails silently and rolls
      // back the issue_flag=true write).
      linked_vehicle_issue_id: null,
    };

    const { error } = await supabase
      .from('checklist_instance_items')
      .update(issueUpdate)
      .eq('id', itemId);

    if (error) {
      console.error('[handleSaveFlag] update failed:', error);
      setFlagDraftById((prev) => ({
        ...prev,
        [itemId]: { ...draft, saving: false, error: error.message ?? t('flagSaveFailed') },
      }));
      return;
    }

    // Optimistically update local item state
    setLocalItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, ...issueUpdate } : it
      )
    );

    closeFlagPanel(itemId);
    router.refresh();
  };

  /**
   * Resolve an issue by clearing the issue_flag on the checklist item row.
   * The DB trigger automatically resolves the linked vehicle_issues row.
   */
  const handleResolveFlag = async (itemId: string) => {
    if (isChecklistLocked) return;

    const item = localItems.find((it) => it.id === itemId);
    if (!item?.issue_flag) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setResolvingFlagById((prev) => ({ ...prev, [itemId]: true }));

    const { error } = await supabase
      .from('checklist_instance_items')
      .update({ issue_flag: false })
      .eq('id', itemId);

    if (error) {
      console.error('[handleResolveFlag] update failed:', error);
      setResolvingFlagById((prev) => ({ ...prev, [itemId]: false }));
      const syncErr = parseSyncError(error, 'status_sync_failed');
      setSyncError(syncErr);
      return;
    }

    // Optimistically update local item state
    setLocalItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, issue_flag: false } : it
      )
    );

    setResolvingFlagById((prev) => {
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

  // --- Pickup / handover Audit label remapping ---
  //
  // Design intent: van-side audit actions live in Phase 2 (Audit); legal/admin
  // actions live in Phase 3 (Office). Items that belong to Office are hidden
  // from the interactive Audit checklist rather than deleted from the DB.
  //
  // Future behaviour notes (not yet implemented):
  //   - "Standard kit present" is currently a static line item.
  //   - "Special add-ons loaded" should eventually be dynamic per booking:
  //     e.g. if a booking includes Paddleboard + Pump, the pickup checklist
  //     should surface "Paddleboard present / loaded" as a named item, and
  //     the return checklist should require "Paddleboard returned / recovered".
  //     Do NOT implement dynamic add-on injection here — this note is a
  //     placeholder for that future work.

  /**
   * UI-only label map for pickup/handover Phase 2 Audit items.
   * Returns null  → hide the row from the interactive Audit checklist.
   * Returns string → display this label instead of the DB template label.
   * Matching is case-insensitive keyword-based; DB labels may vary.
   */
  function getPickupAuditDisplayLabel(label: string): string | null {
    const l = label.toLowerCase();

    // ── Hide: items covered by Phase 3 Office ──────────────────────────────
    if (l.includes('fuel') || l.includes('fluid')) return null;
    if (l.includes('document') && l.includes('contact')) return null;
    if (
      l.includes('handover completed') ||
      l.includes('ready to depart') ||
      l.includes('customer ready')
    ) return null;

    // ── Relabel: remaining Audit items to agreed wording ──────────────────
    if (l.includes('exterior')) return 'Exterior condition checked';
    if (l.includes('interior') && l.includes('condition')) return 'Interior condition checked';
    if (
      (l.includes('standard') && (l.includes('kit') || l.includes('equipment'))) ||
      (l.includes('kit') && !l.includes('first aid') && !l.includes('tool'))
    ) return 'Standard kit present';
    if (
      l.includes('add-on') || l.includes('addon') || l.includes('add on') ||
      l.includes('extra') || l.includes('optional')
    ) return 'Special add-ons loaded';
    if (
      l.includes('key system') || l.includes('controls explained') ||
      (l.includes('explain') && !l.includes('contract')) ||
      l.includes('features')
    ) return 'Key systems explained';
    if (
      l.includes('interior readiness') || l.includes('interior ready') ||
      (l.includes('ready') && l.includes('interior'))
    ) return 'Interior readiness confirmed';

    // No matching pattern — keep original label
    return label;
  }

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

  const toggleHistoryEntry = (id: string) => {
    setExpandedHistoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const templateItemIdToLabel = new Map(initialItems.map((it) => [it.template_item_id, it.template.label]));
  const templateItemIdToSortOrder = new Map(initialItems.map((it) => [it.template_item_id, it.template.sort_order]));

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

  const renderItem = (item: ChecklistItemType, displayLabel?: string) => {
    const checkerInitials =
      item.checked && item.checked_by
        ? initialsByUserId[item.checked_by] ?? null
        : null;

    const isFlagged = !!item.issue_flag;
    const itemUiSeverity = isFlagged ? dbToUiSeverity(item.issue_severity) : null;
    const isFlagPanelOpen = !quickMode && !isChecklistLocked && !!openFlagPanelById[item.id];
    const draft = flagDraftById[item.id] ?? null;
    const isResolvingFlag = !!resolvingFlagById[item.id];

    const badgeStyle = isFlagged && itemUiSeverity ? severityBadgeStyles[itemUiSeverity] : null;

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
                  {displayLabel ?? item.template.label}
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
                {isFlagged && badgeStyle && itemUiSeverity && (
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
                    ⚑ {severityLabel(itemUiSeverity)}
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

                {/* Photos */}
                {(() => {
                  const photoInputId = `flag-photos-${item.id}`;
                  return (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                        Photos (optional)
                      </div>
                      {draft.photos.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          {draft.photos.map((file, idx) => (
                            <div
                              key={idx}
                              style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={URL.createObjectURL(file)}
                                alt=""
                                style={{
                                  width: '64px',
                                  height: '64px',
                                  objectFit: 'cover',
                                  borderRadius: '4px',
                                  border: '1px solid #fbbf24',
                                  display: 'block',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleFlagRemovePhoto(item.id, idx)}
                                style={{
                                  position: 'absolute',
                                  top: '-6px',
                                  right: '-6px',
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '50%',
                                  border: '1px solid #fbbf24',
                                  backgroundColor: '#fff',
                                  color: '#92400e',
                                  fontSize: '10px',
                                  lineHeight: '14px',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontWeight: 700,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {draft.photos.length < 3 && (
                        <>
                          <input
                            id={photoInputId}
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => handleFlagAddPhotos(item.id, e.target.files)}
                          />
                          <label
                            htmlFor={photoInputId}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              fontWeight: 500,
                              padding: '3px 10px',
                              borderRadius: '4px',
                              border: '1px solid #fbbf24',
                              backgroundColor: '#fff',
                              color: '#92400e',
                              cursor: 'pointer',
                            }}
                          >
                            + Add photo
                          </label>
                        </>
                      )}
                    </div>
                  );
                })()}

                {draft.error && (
                  <div style={{ fontSize: '12px', color: '#ef4444' }}>{draft.error}</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleSaveFlag(item.id)}
                    disabled={draft.saving || !userId}
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: '1px solid #f59e0b',
                      backgroundColor: (draft.saving || !userId) ? '#fef3c7' : '#f59e0b',
                      color: (draft.saving || !userId) ? '#92400e' : '#fff',
                      cursor: (draft.saving || !userId) ? 'not-allowed' : 'pointer',
                      opacity: (draft.saving || !userId) ? 0.7 : 1,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {instance.checklist_type === 'handover' && instance.bookings?.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => setReopenModal(true)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    border: '1px solid rgb(var(--border))',
                    backgroundColor: 'rgb(var(--surface))',
                    color: 'rgb(var(--text))',
                    cursor: 'pointer',
                  }}
                >
                  {t('reopenButton')}
                </button>
              )}
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
        </div>
      )}

      {/* Sectioned Checklist Items */}
      {isPickupOrHandover ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Phase summary strip */}
          <div
            className="surface"
            style={{
              borderRadius: '8px',
              padding: '14px 16px',
              borderLeft: '3px solid rgb(var(--brand))',
            }}
          >
            <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: '0 0 10px' }}>
              {t('pickupModeIntro')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { n: '1', label: t('phase1Label') },
                { n: '2', label: t('phase2Label') },
                { n: '3', label: t('phase3Label') },
              ].map(({ n, label }, idx, arr) => (
                <span key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: 'rgb(var(--brand))',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {n}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {label}
                    </span>
                  </span>
                  {idx < arr.length - 1 && (
                    <span style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>→</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Phase 1: Hospitality Tour */}
          <div
            className="surface"
            style={{ borderRadius: '8px', overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                backgroundColor: 'rgba(var(--brand), 0.04)',
                borderBottom: '1px solid rgb(var(--border))',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'rgb(var(--brand))',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                1
              </span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'rgb(var(--text))' }}>
                {t('phase1Label')}
              </span>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.6' }}>
                {t('phase1Desc')}
              </p>
            </div>
          </div>

          {/* Phase 2: Audit */}
          <div
            className="surface"
            style={{ borderRadius: '8px', overflow: 'hidden' }}
          >
            {/* Phase 2 header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                backgroundColor: 'rgba(var(--brand), 0.04)',
                borderBottom: '1px solid rgb(var(--border))',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'rgb(var(--brand))',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                2
              </span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'rgb(var(--text))' }}>
                {t('phase2Label')}
              </span>
            </div>
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid rgb(var(--border))',
              }}
            >
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.6' }}>
                {t('phase2Desc')}
              </p>
            </div>

            {/* Phase 2 sub-blocks */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Block 1: Vehicle Data */}
              <div
                style={{
                  border: '1px solid rgb(var(--border))',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid rgb(var(--border))',
                    backgroundColor: 'rgba(var(--brand), 0.02)',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {t('auditVehicleDataTitle')}
                  </span>
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* KM */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px', minWidth: '100px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
                        KM
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={vehicleData.km}
                        onChange={(e) => setVehicleData((prev) => ({ ...prev, km: e.target.value }))}
                        placeholder="e.g. 45200"
                        className="input"
                        style={{ fontSize: '13px', padding: '6px 8px' }}
                      />
                    </div>

                    {/* Fuel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px', minWidth: '100px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
                        Fuel
                      </label>
                      <select
                        value={vehicleData.fuel}
                        onChange={(e) => setVehicleData((prev) => ({ ...prev, fuel: e.target.value }))}
                        className="input"
                        style={{ fontSize: '13px', padding: '6px 8px' }}
                      >
                        <option value="">— Select —</option>
                        <option value="full">Full</option>
                        <option value="3/4">3/4</option>
                        <option value="1/2">1/2</option>
                        <option value="1/4">1/4</option>
                        <option value="empty">Empty</option>
                      </select>
                    </div>

                    {/* AdBlue */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px', minWidth: '100px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
                        AdBlue
                      </label>
                      <select
                        value={vehicleData.adblue}
                        onChange={(e) => setVehicleData((prev) => ({ ...prev, adblue: e.target.value }))}
                        className="input"
                        style={{ fontSize: '13px', padding: '6px 8px' }}
                      >
                        <option value="">— Select —</option>
                        <option value="full">Full</option>
                        <option value="3/4">3/4</option>
                        <option value="1/2">1/2</option>
                        <option value="1/4">1/4</option>
                        <option value="empty">Empty</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Block 2: Evidence */}
              {(() => {
                const totalEvidencePhotos = evidencePhotos.general.length + evidencePhotos.damage.length;
                const evidenceEmpty = totalEvidencePhotos === 0;
                return (
              <div
                style={{
                  border: evidenceEmpty ? '1px solid #fbbf24' : '1px solid rgb(var(--border))',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s ease',
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid rgb(var(--border))',
                    backgroundColor: evidenceEmpty ? '#fffbeb' : 'rgba(var(--brand), 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {t('auditEvidenceTitle')}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fbbf24',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {t('evidenceRequiredBadge')}
                  </span>
                </div>
                {/* Desc + hint + progress */}
                <div
                  style={{
                    padding: '8px 14px 10px',
                    borderBottom: '1px solid rgb(var(--border))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.5' }}>
                    {t('auditEvidenceDesc')}
                  </p>
                  <p style={{ fontSize: '12px', color: '#b45309', margin: 0, fontWeight: 500 }}>
                    {t('evidenceRequiredHint')}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '12px', color: evidenceEmpty ? '#b45309' : '#166534', fontWeight: 600 }}>
                      {t('evidencePhotosCount', { count: totalEvidencePhotos })}
                    </span>
                    {evidenceEmpty && (
                      <span style={{ fontSize: '12px', color: '#b45309' }}>
                        — {t('evidenceNoPhotos')}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {(['general', 'damage'] as const).map((group) => (
                    <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))' }}>
                        {group === 'general' ? 'General photos' : 'Damage photos'}
                      </span>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Thumbnails */}
                        {evidencePhotos[group].map((file, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: 'relative',
                              width: '64px',
                              height: '64px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1px solid rgb(var(--border))',
                              flexShrink: 0,
                            }}
                          >
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`${group} ${idx + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEvidencePhotos((prev) => ({
                                  ...prev,
                                  [group]: prev[group].filter((_, i) => i !== idx),
                                }))
                              }
                              style={{
                                position: 'absolute',
                                top: '3px',
                                right: '3px',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(0,0,0,0.55)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '10px',
                                lineHeight: '16px',
                                textAlign: 'center',
                                padding: 0,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {/* Add tile */}
                        <label
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            width: '64px',
                            height: '64px',
                            borderRadius: '6px',
                            border: '1.5px dashed rgb(var(--border))',
                            backgroundColor: 'rgb(var(--surface))',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (files.length > 0)
                                setEvidencePhotos((prev) => ({ ...prev, [group]: [...prev[group], ...files] }));
                            }}
                          />
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 5v14M5 12h14" stroke="rgb(var(--muted))" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          <span style={{ fontSize: '9px', color: 'rgb(var(--muted))', textAlign: 'center', lineHeight: '1.2' }}>Add</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
                );
              })()}

              {/* Block 3: Checklist Actions */}
              <div
                style={{
                  border: '1px solid rgb(var(--border))',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid rgb(var(--border))',
                    backgroundColor: 'rgba(var(--brand), 0.02)',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'rgb(var(--text))' }}>
                    {t('auditChecklistTitle')}
                  </span>
                </div>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--border))' }}>
                  <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.6' }}>
                    {t('auditChecklistDesc')}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {sections.map(({ name, items: sectionItems }, sectionIdx) => {
                    const completedCount = sectionItems.filter((it) => it.checked).length;
                    const totalCount = sectionItems.length;
                    const allDone = completedCount === totalCount;
                    const isCollapsed = !!collapsedSections[name];

                    return (
                      <div
                        key={name}
                        className="surface"
                        style={{
                          borderRadius: 0,
                          overflow: 'hidden',
                          borderTop: sectionIdx > 0 ? '1px solid rgb(var(--border))' : 'none',
                        }}
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
                            <span style={{ fontWeight: 600, fontSize: '14px', color: 'rgb(var(--text))' }}>
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

                        {!isCollapsed && (
                          <div
                            style={{
                              padding: '12px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            {sectionItems.map((item) => {
                              const auditLabel = getPickupAuditDisplayLabel(item.template.label);
                              if (auditLabel === null) return null;
                              return renderItem(item, auditLabel);
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* Phase 3: Office */}
          <div
            className="surface"
            style={{ borderRadius: '8px', overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                backgroundColor: 'rgba(var(--brand), 0.04)',
                borderBottom: '1px solid rgb(var(--border))',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'rgb(var(--brand))',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                3
              </span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'rgb(var(--text))' }}>
                {t('phase3Label')}
              </span>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Office confirmations */}
              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
                  {t('officeConfirmationsTitle')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(
                    [
                      { key: 'contractSigned', label: t('officeContractSigned') },
                      { key: 'idVerified', label: t('officeIdVerified') },
                      { key: 'securityDepositCollected', label: t('officeDepositCollected') },
                      { key: 'vehicleDocsHandedOver', label: t('officeVehicleDocsHandedOver') },
                      { key: 'keysHandedOver', label: t('officeKeysHandedOver') },
                    ] as { key: keyof typeof officeConfirmations; label: string }[]
                  ).map(({ key, label }) => (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: officeConfirmations[key]
                          ? 'rgba(var(--brand), 0.06)'
                          : 'rgba(var(--border), 0.3)',
                        border: `1px solid ${officeConfirmations[key] ? 'rgba(var(--brand), 0.25)' : 'rgb(var(--border))'}`,
                        transition: 'background-color 0.15s, border-color 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={officeConfirmations[key]}
                        onChange={() =>
                          setOfficeConfirmations((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        style={{ width: '16px', height: '16px', accentColor: 'rgb(var(--brand))', flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '13px', color: officeConfirmations[key] ? 'rgb(var(--text))' : 'rgb(var(--muted))', fontWeight: officeConfirmations[key] ? 500 : 400 }}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Optional ID photos */}
              <div style={{ borderTop: '1px solid rgb(var(--border))', paddingTop: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'rgb(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>
                  {t('officeIdPhotosTitle')}
                </p>
                <p style={{ fontSize: '12px', color: 'rgb(var(--muted))', margin: '0 0 10px 0', lineHeight: '1.5' }}>
                  {t('officeIdPhotosDesc')}
                </p>

                {/* Thumbnails */}
                {officeIdPhotos.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {officeIdPhotos.map((file, idx) => (
                      <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgb(var(--border))' }}
                        />
                        <button
                          type="button"
                          onClick={() => setOfficeIdPhotos((prev) => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: 'rgb(var(--destructive, 220 38 38))',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '11px',
                            lineHeight: '18px',
                            textAlign: 'center',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-label="Remove photo"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add photo button */}
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px dashed rgb(var(--border))',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'rgb(var(--muted))',
                    backgroundColor: 'rgba(var(--border), 0.2)',
                  }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
                  {t('officeAddIdPhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) setOfficeIdPhotos((prev) => [...prev, ...files]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

            </div>
          </div>

        </div>
      ) : (
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
      )}

      {/* Reopen/Revert History — handover checklists only */}
      {instance.checklist_type === 'handover' && (
        <div style={{ marginTop: '32px' }}>
          {/* Divider + section header */}
          <div style={{ borderTop: '1px solid rgb(var(--border))', paddingTop: '20px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--muted))', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('historyTitle')}
            </h2>
          </div>

          {/* Empty state */}
          {reopenHistory.length === 0 && (
            <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0 }}>
              {t('historyEmpty')}
            </p>
          )}

          {/* History entries */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reopenHistory.map((entry) => {
              const isExpanded = !!expandedHistoryIds[entry.id];
              const sortedSnapshotItems = [...entry.snapshot.items].sort((a, b) => {
                const aOrder = templateItemIdToSortOrder.get(a.template_item_id) ?? 0;
                const bOrder = templateItemIdToSortOrder.get(b.template_item_id) ?? 0;
                return aOrder - bOrder;
              });
              const snapshotStatusLabel = (() => {
                switch (entry.snapshot.instance.status) {
                  case 'pending':
                  case 'not_started':
                    return t('statusNotStarted');
                  case 'in_progress':
                    return t('statusInProgress');
                  case 'completed':
                    return t('statusCompleted');
                  default:
                    return entry.snapshot.instance.status;
                }
              })();
              return (
                <div
                  key={entry.id}
                  className="surface"
                  style={{
                    borderRadius: '8px',
                    border: '1px solid rgb(var(--border))',
                    padding: '12px 14px',
                  }}
                >
                  {/* Entry header row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    {/* Left: date + subtext + reason */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {new Date(entry.reopened_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: '2px' }}>
                        {t('historyReopenedAt')}
                      </div>
                      {entry.reason && (
                        <div style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: '6px', fontStyle: 'italic' }}>
                          "{entry.reason}"
                        </div>
                      )}
                    </div>

                    {/* Right: toggle button */}
                    <button
                      type="button"
                      onClick={() => toggleHistoryEntry(entry.id)}
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'rgb(var(--text))',
                        background: 'rgb(var(--surface))',
                        border: '1px solid rgb(var(--border))',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        padding: '4px 10px',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isExpanded ? t('historyCollapse') : t('historyExpand')}
                    </button>
                  </div>

                  {/* Expanded snapshot view */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgb(var(--border))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      {/* Snapshot meta row */}
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'rgb(var(--muted))' }}>
                        <span>
                          {t('historySnapshotStatus')}:{' '}
                          <strong style={{ color: 'rgb(var(--text))' }}>{snapshotStatusLabel}</strong>
                        </span>
                        {entry.snapshot.instance.completed_at && (
                          <span>
                            {t('historySnapshotCompletedAt')}:{' '}
                            <strong style={{ color: 'rgb(var(--text))' }}>
                              {new Date(entry.snapshot.instance.completed_at).toLocaleString()}
                            </strong>
                          </span>
                        )}
                      </div>

                      {/* Snapshot items — compact read-only rows */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {sortedSnapshotItems.map((snapItem) => {
                          const label = templateItemIdToLabel.get(snapItem.template_item_id) ?? snapItem.template_item_id;
                          const isFlagged = !!snapItem.issue_flag;
                          const uiSev = isFlagged ? dbToUiSeverity(snapItem.issue_severity) : null;
                          const badgeStyle = uiSev ? severityBadgeStyles[uiSev] : null;
                          return (
                            <div
                              key={snapItem.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '5px 8px',
                                borderRadius: '4px',
                                border: isFlagged ? '1px solid #f59e0b' : '1px solid rgb(var(--border))',
                                backgroundColor: snapItem.checked ? 'rgba(var(--brand), 0.04)' : 'transparent',
                              }}
                            >
                              {/* Read-only checkbox */}
                              <div
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  border: snapItem.checked
                                    ? '2px solid rgb(var(--brand))'
                                    : '2px solid rgb(var(--border))',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgb(var(--surface))',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {snapItem.checked && (
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                    <path
                                      d="M13.3332 4L5.99984 11.3333L2.6665 8"
                                      stroke="rgb(var(--brand))"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </div>

                              {/* Label + initials group (flex: 1 so flagged badge stays at end) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: '13px',
                                    color: snapItem.checked ? 'rgb(var(--text))' : 'rgb(var(--muted))',
                                    fontWeight: snapItem.checked ? 500 : 400,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {label}
                                </span>
                                {snapItem.checked && snapItem.checked_by && initialsByUserId[snapItem.checked_by] && (
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
                                    {initialsByUserId[snapItem.checked_by]}
                                  </span>
                                )}
                              </div>

                              {/* Flagged badge */}
                              {isFlagged && badgeStyle && uiSev && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    backgroundColor: badgeStyle.bg,
                                    color: badgeStyle.color,
                                    border: `1px solid ${badgeStyle.border}`,
                                    flexShrink: 0,
                                  }}
                                >
                                  ⚑ {severityLabel(uiSev)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reopen checklist modal */}
      {reopenModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="surface"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '24px',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'rgb(var(--text))', margin: '0 0 6px' }}>
                {t('reopenModalTitle')}
              </h2>
              <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
                {t('reopenModalBody')}
              </p>
            </div>

            <textarea
              placeholder={t('reopenReasonPlaceholder')}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
              className="input"
              style={{
                width: '100%',
                resize: 'vertical',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={handleReopenConfirm}
                disabled={reopening}
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600, opacity: reopening ? 0.6 : 1 }}
              >
                {reopening ? t('reopening') : t('reopenConfirm')}
              </button>
              <button
                type="button"
                onClick={() => { setReopenModal(false); setReopenReason(''); }}
                disabled={reopening}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  border: '1px solid rgb(var(--border))',
                  backgroundColor: 'rgb(var(--surface))',
                  color: 'rgb(var(--text))',
                  cursor: reopening ? 'not-allowed' : 'pointer',
                }}
              >
                {t('reopenCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover safety confirmation modal */}
      {handoverSafetyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="surface"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '24px',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {(() => {
              const hasUrgent = handoverSafetyModal.flaggedItems.some(
                (it) => it.issue_blocking === true
              );
              return (
                <>
                  <div>
                    <h2
                      style={{
                        fontSize: '17px',
                        fontWeight: 700,
                        color: hasUrgent ? '#991b1b' : 'rgb(var(--text))',
                        margin: '0 0 6px',
                      }}
                    >
                      {hasUrgent ? t('urgentModalTitle') : t('safetyModalTitle')}
                    </h2>
                    <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
                      {hasUrgent ? t('urgentModalBody') : t('safetyModalBody')}
                    </p>
                  </div>

                  {/* Flagged item list */}
                  <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {handoverSafetyModal.flaggedItems.slice(0, 3).map((it) => (
                      <li key={it.id} style={{ fontSize: '14px', color: 'rgb(var(--text))', fontWeight: 500 }}>
                        {it.issue_title ?? it.template.label}
                      </li>
                    ))}
                    {handoverSafetyModal.flaggedItems.length > 3 && (
                      <li style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                        {t('safetyModalMoreIssues', { count: handoverSafetyModal.flaggedItems.length - 3 })}
                      </li>
                    )}
                  </ul>

                  {!hasUrgent && (
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
                      {t('safetyModalQuestion')}
                    </p>
                  )}

                  {hasUrgent ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleSafetyCancel}
                        style={{
                          width: '100%',
                          padding: '10px',
                          fontSize: '14px',
                          fontWeight: 500,
                          borderRadius: '6px',
                          border: '1px solid rgb(var(--border))',
                          backgroundColor: 'rgb(var(--surface))',
                          color: 'rgb(var(--text))',
                          cursor: 'pointer',
                        }}
                      >
                        {t('urgentModalDismiss')}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleSafetyConfirm}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600 }}
                      >
                        {t('safetyModalConfirm')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSafetyMarkUrgent}
                        style={{
                          width: '100%',
                          padding: '10px',
                          fontSize: '14px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid #f59e0b',
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          cursor: 'pointer',
                        }}
                      >
                        {t('safetyModalMarkUrgent')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSafetyCancel}
                        style={{
                          width: '100%',
                          padding: '10px',
                          fontSize: '14px',
                          fontWeight: 500,
                          borderRadius: '6px',
                          border: '1px solid rgb(var(--border))',
                          backgroundColor: 'rgb(var(--surface))',
                          color: 'rgb(var(--text))',
                          cursor: 'pointer',
                        }}
                      >
                        {t('safetyModalCancel')}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Missing pickup data warning modal */}
      {pickupDataWarningModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="surface"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '24px',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'rgb(var(--text))', margin: '0 0 6px' }}>
                Missing pickup information
              </h2>
              <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
                You have not entered the following:
              </p>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {pickupDataWarningModal.missing.map((key) => {
                const labels: Record<string, string> = { km: 'KM', fuel: 'Fuel', adblue: 'AdBlue', photos: 'Photos' };
                return (
                  <li key={key} style={{ fontSize: '14px', color: 'rgb(var(--text))', fontWeight: 500 }}>
                    {labels[key] ?? key}
                  </li>
                );
              })}
            </ul>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={async () => {
                  const fn = pickupDataWarningModal.onConfirm;
                  setPickupDataWarningModal(null);
                  await fn();
                }}
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600 }}
              >
                Continue anyway
              </button>
              <button
                type="button"
                onClick={() => setPickupDataWarningModal(null)}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  border: '1px solid rgb(var(--border))',
                  backgroundColor: 'rgb(var(--surface))',
                  color: 'rgb(var(--text))',
                  cursor: 'pointer',
                }}
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
