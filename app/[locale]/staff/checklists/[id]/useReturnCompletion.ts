'use client';

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistInstanceType, ChecklistItemType, SyncError } from './types';
import { parseSyncError, isLockError, getReturnAuditDisplayLabel } from './helpers';

interface UseReturnCompletionProps {
  supabase: SupabaseClient<any>;
  instance: ChecklistInstanceType;
  localInstance: ChecklistInstanceType;
  setLocalInstance: Dispatch<SetStateAction<ChecklistInstanceType>>;
  localItems: ChecklistItemType[];
  isChecklistLocked: boolean;
  setSyncError: Dispatch<SetStateAction<SyncError | null>>;
  setLockNotice: Dispatch<SetStateAction<string | null>>;
  lockMessageFromError: (error: any) => string;
  showHandoverSafetyModal: (
    flaggedItems: ChecklistItemType[],
    onConfirm: () => Promise<void>,
    triggerCheckedIds: string[],
    triggerCheckedAt: string,
    triggerCheckedBy: string
  ) => void;
  setHandoverSafetyModal: Dispatch<SetStateAction<{
    flaggedItems: ChecklistItemType[];
    triggerCheckedIds: string[];
    triggerCheckedAt: string;
    triggerCheckedBy: string;
  } | null>>;
  navigateAfterCompletion: () => void;
  t: (key: string, ...args: any[]) => string;
}

export function useReturnCompletion({
  supabase,
  instance,
  localInstance,
  setLocalInstance,
  localItems,
  isChecklistLocked,
  setSyncError,
  setLockNotice,
  lockMessageFromError,
  showHandoverSafetyModal,
  setHandoverSafetyModal,
  navigateAfterCompletion,
  t,
}: UseReturnCompletionProps) {
  const [returnCompleting, setReturnCompleting] = useState(false);
  const [returnBlockedError, setReturnBlockedError] = useState<string | null>(null);

  /**
   * Writes status: 'completed' directly to the DB.
   * Does NOT touch item rows — items must already be in the correct state.
   */
  const doReturnButtonComplete = async (uid: string) => {
    setReturnCompleting(true);
    setReturnBlockedError(null);

    const now = new Date().toISOString();
    const completionUpdate = {
      status: 'completed',
      started_at: localInstance.started_at ?? now,
      started_by: localInstance.started_by ?? uid,
      completed_at: now,
      completed_by: uid,
    };

    setLocalInstance((prev) => ({ ...prev, ...completionUpdate }));
    setSyncError(null);
    setLockNotice(null);

    const { error } = await supabase
      .from('checklist_instances')
      .update(completionUpdate)
      .eq('id', instance.id);

    if (error) {
      setLocalInstance(localInstance);
      setReturnCompleting(false);
      if (isLockError(error)) {
        setLockNotice(lockMessageFromError(error));
      } else {
        setSyncError(parseSyncError(error, 'status_sync_failed'));
      }
      return;
    }

    navigateAfterCompletion();
  };

  /**
   * Validates all return-specific required fields then writes status: 'completed'.
   * Does NOT auto-check unchecked items. Completion is only possible when
   * all visible return audit items are already checked.
   */
  const handleReturnCompleteButton = async () => {
    if (isChecklistLocked || returnCompleting) return;

    // 1. All visible return audit items must be checked (blocking)
    const hasUncheckedAudit = localItems.some(
      (it) => !it.checked && getReturnAuditDisplayLabel(it.template.label) !== null
    );
    if (hasUncheckedAudit) {
      setReturnBlockedError(t('returnErrorAuditIncomplete'));
      return;
    }

    // 2. Return close-out confirmations must be complete (blocking)
    if (
      !localInstance.return_keys_received ||
      !localInstance.return_documents_received ||
      !localInstance.return_contract_closed
    ) {
      setReturnBlockedError(t('returnErrorCloseIncomplete'));
      return;
    }

    // 3. Deposit status must be set (blocking)
    if (!localInstance.return_deposit_status) {
      setReturnBlockedError(t('returnErrorDepositRequired'));
      return;
    }

    // 4. Blocking flagged items prevent completion (urgent modal — dismiss only)
    const blockingFlagged = localItems.filter((it) => it.issue_blocking === true);
    if (blockingFlagged.length > 0) {
      setReturnBlockedError(t('handoverErrorBlockingFlags'));
      setHandoverSafetyModal({
        flaggedItems: blockingFlagged,
        triggerCheckedIds: [],
        triggerCheckedAt: '',
        triggerCheckedBy: '',
      });
      return;
    }

    setReturnBlockedError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const proceedComplete = async () => { await doReturnButtonComplete(user.id); };

    // 5. Non-blocking flagged items: safety confirmation modal
    const nonBlockingFlagged = localItems.filter(
      (it) => !!it.issue_flag && it.issue_blocking !== true
    );
    if (nonBlockingFlagged.length > 0) {
      showHandoverSafetyModal(nonBlockingFlagged, proceedComplete, [], '', '');
      return;
    }

    await proceedComplete();
  };

  return {
    returnCompleting,
    returnBlockedError,
    setReturnBlockedError,
    handleReturnCompleteButton,
  };
}
