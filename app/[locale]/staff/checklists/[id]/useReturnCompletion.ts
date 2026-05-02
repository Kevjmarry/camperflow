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
  showReturnModal: (urgentItems: ChecklistItemType[], onConfirm: () => Promise<void>) => void;
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
  showReturnModal,
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

    const vehicleId = instance.vehicle_id ?? localInstance.vehicle_id;
    if (vehicleId) {
      await supabase.from('vehicles').update({ status: 'preparing' }).eq('id', vehicleId);
    }

    if (instance.checklist_type === 'return' && instance.booking_id) {
      await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', instance.booking_id)
        .eq('status', 'on_rent');
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

    // 1. All visible Phase 2 Checklist Actions items must be checked (blocking)
    const hasUncheckedAudit = localItems.some(
      (it) =>
        it.template.ui_section === 'checklist_actions' &&
        !it.checked &&
        getReturnAuditDisplayLabel(it.template.label) !== null
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

    setReturnBlockedError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Urgent/blocking flags: show notification modal (both buttons still complete).
    // Attention-only flags: complete immediately with no modal.
    const urgentItems = localItems.filter((it) => it.issue_flag === true && it.issue_blocking === true);
    if (urgentItems.length > 0) {
      showReturnModal(urgentItems, async () => doReturnButtonComplete(user.id));
      return;
    }

    await doReturnButtonComplete(user.id);
  };

  return {
    returnCompleting,
    returnBlockedError,
    setReturnBlockedError,
    handleReturnCompleteButton,
  };
}
