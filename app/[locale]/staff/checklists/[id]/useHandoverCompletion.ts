'use client';

import { useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistInstanceType, ChecklistItemType, SyncError } from './types';
import { parseSyncError, isLockError, getPickupAuditDisplayLabel } from './helpers';

interface UseHandoverCompletionProps {
  supabase: SupabaseClient<any>;
  instance: ChecklistInstanceType;
  localInstance: ChecklistInstanceType;
  setLocalInstance: Dispatch<SetStateAction<ChecklistInstanceType>>;
  localItems: ChecklistItemType[];
  isChecklistLocked: boolean;
  setSyncError: Dispatch<SetStateAction<SyncError | null>>;
  setLockNotice: Dispatch<SetStateAction<string | null>>;
  lockMessageFromError: (error: any) => string;
  setPickupDataWarningModal: Dispatch<SetStateAction<{ missing: string[]; onConfirm: () => Promise<void> } | null>>;
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
  getMissingPickupData: () => string[];
  navigateAfterCompletion: () => void;
  pickupExtrasCheckedRef: MutableRefObject<Record<string, boolean>>;
  staffMetaRef: MutableRefObject<Record<string, unknown>>;
  t: (key: string, ...args: any[]) => string;
}

export function useHandoverCompletion({
  supabase,
  instance,
  localInstance,
  setLocalInstance,
  localItems,
  isChecklistLocked,
  setSyncError,
  setLockNotice,
  lockMessageFromError,
  setPickupDataWarningModal,
  showHandoverSafetyModal,
  setHandoverSafetyModal,
  getMissingPickupData,
  navigateAfterCompletion,
  pickupExtrasCheckedRef,
  staffMetaRef,
  t,
}: UseHandoverCompletionProps) {
  const [handoverCompleting, setHandoverCompleting] = useState(false);
  const [handoverBlockedError, setHandoverBlockedError] = useState<string | null>(null);

  /**
   * Writes status: 'completed' directly to the DB.
   * Does NOT touch item rows — items must already be in the correct state.
   */
  const doHandoverButtonComplete = async (uid: string) => {
    setHandoverCompleting(true);
    setHandoverBlockedError(null);

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
      setHandoverCompleting(false);
      if (isLockError(error)) {
        setLockNotice(lockMessageFromError(error));
      } else {
        setSyncError(parseSyncError(error, 'status_sync_failed'));
      }
      return;
    }

    // Transition booking to on_rent and persist handed_over_extras as two separate
    // writes. Once this handover is completed, migration 080's append-only trigger
    // guards bookings.staff_metadata for this booking — if a concurrent session added
    // an evidence photo since our last sync, staffMetaRef.current is stale and the
    // metadata write can be rejected. Keeping status a separate statement means that
    // rejection can never block the on_rent transition itself.
    // The DB trigger on bookings (migration 011) will recompute vehicle readiness.
    // Guarded by .eq('status', 'confirmed') so we never downgrade an already-on-rent booking.
    if (instance.checklist_type === 'handover' && instance.booking_id) {
      const handedOverIds = Object.entries(pickupExtrasCheckedRef.current)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const { error: statusSyncError } = await supabase
        .from('bookings')
        .update({ status: 'on_rent' })
        .eq('id', instance.booking_id)
        .eq('status', 'confirmed');

      if (statusSyncError) {
        // Checklist is already saved — do not block navigation. Surface a visible
        // warning on the booking detail page so staff can correct the status manually.
        console.error(
          '[CamperFlow] Handover status sync failed for booking',
          instance.booking_id,
          '—',
          statusSyncError.message,
          statusSyncError.code,
        );
        try {
          sessionStorage.setItem(
            `cf_status_sync_failed_${instance.booking_id}`,
            JSON.stringify({ at: new Date().toISOString(), error: statusSyncError.message }),
          );
        } catch {
          // sessionStorage unavailable (e.g. private mode) — failure already logged above.
        }
      }

      const { error: metaSyncError } = await supabase
        .from('bookings')
        .update({ staff_metadata: { ...staffMetaRef.current, handed_over_extras: handedOverIds } })
        .eq('id', instance.booking_id);

      if (metaSyncError) {
        // Non-fatal: the booking status transition above already succeeded independently.
        // Worst case, handed_over_extras isn't recorded this time — log for follow-up.
        console.error(
          '[CamperFlow] Handover extras sync failed for booking',
          instance.booking_id,
          '—',
          metaSyncError.message,
          metaSyncError.code,
        );
      }
    }

    navigateAfterCompletion();
  };

  /**
   * Validates all required fields then writes status: 'completed' directly.
   * Does NOT auto-check unchecked items. Completion is only possible when
   * all visible audit items are already checked.
   */
  const handleHandoverCompleteButton = async () => {
    if (isChecklistLocked || handoverCompleting) return;

    // 1. All visible audit items must be checked (blocking)
    const hasUncheckedAudit = localItems.some(
      (it) =>
        it.template.ui_section === 'checklist_actions' &&
        !it.checked &&
        getPickupAuditDisplayLabel(it.template.label) !== null
    );
    if (hasUncheckedAudit) {
      setHandoverBlockedError(t('handoverErrorAuditIncomplete'));
      return;
    }

    // 2. Office confirmations (contract, ID, deposit) must be complete (blocking)
    if (
      !localInstance.office_contract_signed ||
      !localInstance.office_id_verified ||
      !localInstance.office_deposit_collected
    ) {
      setHandoverBlockedError(t('handoverErrorOfficeIncomplete'));
      return;
    }

    // 3. Handover docs and keys must be confirmed (blocking)
    if (!localInstance.handover_documents_given || !localInstance.handover_keys_given) {
      setHandoverBlockedError(t('handoverErrorHandoverIncomplete'));
      return;
    }

    // 4. Blocking flagged items prevent completion (urgent modal — dismiss only)
    // Requires issue_flag=true so stale issue_blocking rows with no real issue data are ignored.

    const blockingFlagged = localItems.filter(
      (it) => it.issue_flag === true && it.issue_blocking === true
    );
    if (blockingFlagged.length > 0) {
      setHandoverBlockedError(t('handoverErrorBlockingFlags'));
      setHandoverSafetyModal({
        flaggedItems: blockingFlagged,
        triggerCheckedIds: [],
        triggerCheckedAt: '',
        triggerCheckedBy: '',
      });
      return;
    }

    setHandoverBlockedError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const proceedComplete = async () => { await doHandoverButtonComplete(user.id); };

    // 5. Non-blocking vehicle data / photo warning (confirmation modal)
    const missing = getMissingPickupData();
    if (missing.length > 0) {
      const nonBlockingFlagged = localItems.filter(
        (it) => !!it.issue_flag && it.issue_blocking !== true
      );
      setPickupDataWarningModal({
        missing,
        onConfirm: async () => {
          if (nonBlockingFlagged.length > 0) {
            showHandoverSafetyModal(nonBlockingFlagged, proceedComplete, [], '', '');
          } else {
            await proceedComplete();
          }
        },
      });
      return;
    }

    // 6. Non-blocking flagged items: safety confirmation modal
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
    handoverCompleting,
    handoverBlockedError,
    setHandoverBlockedError,
    handleHandoverCompleteButton,
  };
}
