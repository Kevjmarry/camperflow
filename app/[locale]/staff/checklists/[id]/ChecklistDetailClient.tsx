'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import PageContainer from '@/components/PageContainer';

type ChecklistInstanceType = {
  id: string;
  booking_id: string | null;
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
  } | null;
  vehicles: any;
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
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  raw: string;
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
    // Back to pending — preserve existing started_* if already set, clear completed_*
    return {
      status: 'pending',
      started_at: snapshot.started_at,
      started_by: snapshot.started_by,
      completed_at: null,
      completed_by: null,
    };
  }

  // Some checked — in_progress
  return {
    status: 'in_progress',
    started_at: isPending ? now : (snapshot.started_at ?? now),
    started_by: isPending ? userId : (snapshot.started_by ?? userId),
    completed_at: null,
    completed_by: null,
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

  // Ref always holds the latest localInstance value — used in syncInstanceStatus
  // to avoid stale closures when the callback is called after async item writes.
  const localInstanceRef = useRef(localInstance);
  useEffect(() => {
    localInstanceRef.current = localInstance;
  }, [localInstance]);

  // Sync from server props after router.refresh()
  useEffect(() => setLocalItems(initialItems), [initialItems]);
  useEffect(() => setLocalInstance(instance), [instance]);

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

  /**
   * Returns true if the Supabase error represents the expected "locked"
   * case: booking completed + trying to edit handover/return checklist.
   * Handles both the legacy bulk-update message and the newer per-type messages.
   */
  function isLockError(error: any): boolean {
    if (
      !(error?.code === 'P0001' || (error as any)?.code === 'P0001') ||
      typeof error?.message !== 'string'
    ) {
      return false;
    }
    const msg: string = error.message;
    return (
      // Legacy message
      msg.includes('Cannot modify handover/return checklists after booking is completed.') ||
      // Newer per-type messages: "Cannot edit a handover checklist after..."
      //                          "Cannot edit a return checklist after..."
      (msg.includes('Cannot edit a') &&
        (msg.includes('handover') || msg.includes('return')) &&
        msg.includes('after'))
    );
  }

  /**
   * Returns true if the Supabase error is a P0001 lock error specifically for
   * the return-checklist-after-completion case.
   */
  function isReturnAfterCompletionLockError(error: any): boolean {
    return (
      (error?.code === 'P0001' || (error as any)?.code === 'P0001') &&
      typeof error?.message === 'string' &&
      error.message.includes('Cannot edit a return checklist after the booking has been completed.')
    );
  }

  type SyncResult = { ok: true } | { locked: true } | { error: SyncError };

  /**
   * Reads the latest instance snapshot via ref (never stale), computes the
   * required status update, applies it optimistically, then persists to DB.
   * Returns { ok } on success, { locked } for the expected lock case, or { error }.
   * Callers must NOT call router.refresh() on { locked }.
   */
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

      // Optimistic local update
      setLocalInstance((prev) => ({ ...prev, ...update }));
      setSyncError(null);
      setLockNotice(null);

      const { error } = await supabase
        .from('checklist_instances')
        .update(update)
        .eq('id', instance.id);

      if (error) {
        // P0001 lock error for return checklist after booking completed, AND the
        // instance was already marked completed locally — treat as a successful no-op.
        // The DB state is already consistent; no revert or notice is needed.
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
          // Expected lock case — revert optimistic UI, show inline notice, no error banner
          setLocalItems(prevItems);
          setLocalInstance(prevInstance);
          setLockNotice('This checklist is locked because the booking is completed.');
          // Do NOT call router.refresh(), do NOT console.error
          return { locked: true };
        } else {
          const syncErr: SyncError = {
            message: error.message,
            code: (error as any).code ?? null,
            details: (error as any).details ?? null,
            hint: (error as any).hint ?? null,
            raw: JSON.stringify(error, null, 2),
          };

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
    // Intentionally omit localInstance — localInstanceRef is used instead
  );

  const handleBackClick = () => {
    if (from === 'booking' && instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
    } else {
      router.push(`/${locale}/staff/checklists?scope=all&status=not_started`);
    }
  };

  const handleGoToBooking = () => {
    if (instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
    }
  };

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
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

    try {
      const { error: itemError } = await supabase
        .from('checklist_instance_items')
        .update({
          checked: newChecked,
          checked_at: newChecked ? now : null,
          checked_by: newChecked ? user.id : null,
        })
        .eq('id', itemId);

      if (itemError) throw itemError;

      const result = await syncInstanceStatus(nextItems, user.id, prevItems, prevInstance);

      if ('locked' in result) {
        // Revert the DB item change — restore exact previous row state from prevItems
        const prevItem = prevItems.find((it) => it.id === itemId);
        await supabase
          .from('checklist_instance_items')
          .update({
            checked: prevItem ? prevItem.checked : currentChecked,
            checked_at: prevItem ? prevItem.checked_at : null,
            checked_by: prevItem ? prevItem.checked_by : null,
          })
          .eq('id', itemId);
        // Do NOT router.refresh()
        return;
      }

      router.refresh();
    } catch (err) {
      console.error('Error updating checklist:', err);
      setLocalItems(initialItems);
      setLocalInstance(instance);
      router.refresh();
    }
  };

  const handleCompleteSection = async (
    sectionName: string,
    sectionItems: ChecklistItemType[]
  ) => {
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

    try {
      const { error: itemError } = await supabase
        .from('checklist_instance_items')
        .update({ checked: true, checked_at: now, checked_by: user.id })
        .in('id', uncheckedIds);

      if (itemError) throw itemError;

      const result = await syncInstanceStatus(nextItems, user.id, prevItems, prevInstance);

      if ('locked' in result) {
        // Revert the DB item changes — restore exact previous state for each item
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
        // Do NOT router.refresh()
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
    setLocalItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, notes } : it))
    );
  };

  const handleNotesBlur = async (itemId: string, notes: string) => {
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
      : t('backToChecklists');

  // Build the map from translation keys so values are locale-aware.
  // Add new checklist types here as the product grows.
  const CHECKLIST_TYPE_LABELS: Record<string, string> = {
    handover: t('type_handover'),
    return: t('type_return'),
    cleaning: t('type_cleaning'),
    mechanical: t('type_mechanical'),
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

  const renderItem = (item: ChecklistItemType) => {
    const checkerInitials =
      item.checked && item.checked_by
        ? initialsByUserId[item.checked_by] ?? null
        : null;

    return (
      <div
        key={item.id}
        style={{
          border: '1px solid rgb(var(--border))',
          borderRadius: '6px',
          padding: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <label
            htmlFor={`check-${item.id}`}
            style={{
              marginTop: '2px',
              cursor: 'pointer',
              flexShrink: 0,
              position: 'relative',
              display: 'block',
            }}
          >
            <input
              type="checkbox"
              id={`check-${item.id}`}
              checked={item.checked}
              onChange={() => handleToggle(item.id, item.checked)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
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
                <label
                  htmlFor={`check-${item.id}`}
                  className="label"
                  style={{ fontWeight: 500, cursor: 'pointer', margin: 0 }}
                >
                  {item.template.label}
                </label>
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
              </div>
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
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.notes ? t('editNote') : t('addNote')}
              </button>
            </div>

            {!openNotesById[item.id] && item.notes && (
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

            {openNotesById[item.id] && (
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
                : t('noBookingLinked')}
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
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
          </div>
        </div>
      </div>

      {/* Lock Notice (inline, non-red) */}
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
            Dismiss
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
            ⚠️ Status sync failed — checklist items were saved but the overall status could not be updated.
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
            Dismiss
          </button>
        </div>
      )}

      {/* Compact Success Notice */}
      {localInstance.status === 'completed' && (
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

                {!allDone && (
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