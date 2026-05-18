'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistInstanceType, ChecklistItemType, ReopenHistoryEntry, SyncError } from './types';
import { parseSyncError } from './helpers';

interface UseChecklistReopenProps {
  supabase: SupabaseClient<any>;
  instance: ChecklistInstanceType;
  localInstance: ChecklistInstanceType;
  localItems: ChecklistItemType[];
  userId: string | null;
  setSyncError: Dispatch<SetStateAction<SyncError | null>>;
  setLocalInstance: Dispatch<SetStateAction<ChecklistInstanceType>>;
  setLocalItems: Dispatch<SetStateAction<ChecklistItemType[]>>;
  fetchInitialsForUsers: (userIds: string[]) => Promise<void>;
  initialsByUserId: Record<string, string>;
}

export function useChecklistReopen({
  supabase,
  instance,
  localInstance,
  localItems,
  userId,
  setSyncError,
  setLocalInstance,
  setLocalItems,
  fetchInitialsForUsers,
  initialsByUserId,
}: UseChecklistReopenProps) {
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [reopenHistory, setReopenHistory] = useState<ReopenHistoryEntry[]>([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});

  const fetchReopenHistory = useCallback(async () => {
    if (instance.checklist_type !== 'handover') return;
    const { data } = await supabase
      .from('checklist_reopen_history')
      .select('id, reopened_at, reason, snapshot')
      .eq('checklist_instance_id', instance.id)
      .order('reopened_at', { ascending: false });
    if (data) setReopenHistory(data as ReopenHistoryEntry[]);
  }, [supabase, instance.id, instance.checklist_type]);

  useEffect(() => { fetchReopenHistory(); }, [fetchReopenHistory]);

  // Load initials for historical snapshot items
  useEffect(() => {
    const historicalIds = reopenHistory.flatMap((entry) =>
      entry.snapshot.items
        .filter((it) => it.checked && it.checked_by)
        .map((it) => it.checked_by as string)
    );
    const missing = [...new Set(historicalIds)].filter((id) => !(id in initialsByUserId));
    if (missing.length > 0) fetchInitialsForUsers(missing);
  }, [reopenHistory, initialsByUserId, fetchInitialsForUsers]);

  const handleReopenConfirm = async () => {
    if (!userId) return;
    setReopening(true);

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

    // Step 1: Record history before making any changes.
    const { error: historyError } = await supabase
      .from('checklist_reopen_history')
      .insert({
        checklist_instance_id: instance.id,
        snapshot,
        reopened_by: userId,
        reason: reopenReason.trim() || null,
      });

    if (historyError) {
      setSyncError(parseSyncError(historyError, 'status_sync_failed'));
      setReopening(false);
      return;
    }

    // Step 2: Update the instance FIRST, while it still has status='completed'.
    // The RLS USING clause requires status='completed' to authorise the reopen write.
    // If we reset items first, the items-change trigger changes status to 'in_progress',
    // which then silently fails the RLS check for the instance update (0 rows, no error).
    // By updating the instance here the booleans and started fields are cleared before
    // the items trigger fires, so when items are reset in step 3 the trigger recomputes
    // status from 0 items + all booleans false → correctly lands on 'pending'.
    const instancePayload = {
      status: 'pending',
      started_at: null,
      started_by: null,
      completed_at: null,
      completed_by: null,
      office_deposit_collected: false,
      office_id_verified: false,
      office_contract_signed: false,
      handover_keys_given: false,
      handover_documents_given: false,
    };
    const { data: instanceData, error: instanceError } = await supabase
      .from('checklist_instances')
      .update(instancePayload)
      .eq('id', instance.id)
      .select('*');

    if (instanceError) {
      setSyncError(parseSyncError(instanceError, 'status_sync_failed'));
      setReopening(false);
      return;
    }

    if (!instanceData || instanceData.length === 0) {
      console.error('[REOPEN] Step 2: 0 rows updated — RLS or wrong id. Aborting.');
      setReopening(false);
      throw new Error('Checklist instance update affected 0 rows — may be an RLS policy issue.');
    }

    // Step 3: Reset items. With booleans already false in the DB, the items-change
    // trigger now fires and sees 0 checked items + all booleans false → 'pending'.
    const itemsPayload = {
      checked: false,
      checked_at: null,
      checked_by: null,
      issue_flag: false,
      issue_title: null,
      issue_description: null,
      issue_severity: null,
      issue_blocking: null,
      linked_vehicle_issue_id: null,
    };
    const { error: itemsError } = await supabase
      .from('checklist_instance_items')
      .update(itemsPayload)
      .eq('instance_id', instance.id);

    if (itemsError) {
      // Instance is already reset. Best-effort rollback: restore the instance to
      // the snapshot state so the checklist isn't stuck with booleans cleared but
      // items still showing as checked.
      const checkedSnapshots = snapshot.items.filter((it) => it.checked);
      if (checkedSnapshots.length > 0) {
        const checkedIds = checkedSnapshots.map((it) => it.id);
        await supabase
          .from('checklist_instance_items')
          .update({ checked: true })
          .in('id', checkedIds);
      }
      setSyncError(parseSyncError(itemsError, 'item_update_failed'));
      setReopening(false);
      return;
    }

    // Step 3c: For return checklists, clear return_vehicle_data from bookings.staff_metadata.
    // The vehicle data (km/fuel/adblue) is stored there, not in checklist_instances, so the
    // checklist reset above does not touch it. We preserve all other staff_metadata keys.
    if (instance.checklist_type === 'return' && instance.booking_id) {
      const currentMeta = (instance.bookings as any)?.staff_metadata ?? {};
      const newMeta = { ...currentMeta, return_vehicle_data: null };
      await supabase
        .from('bookings')
        .update({ staff_metadata: newMeta })
        .eq('id', instance.booking_id)
    }

    setLocalInstance((prev) => ({
      ...prev,
      status: 'pending',
      started_at: null,
      started_by: null,
      completed_at: null,
      completed_by: null,
      office_deposit_collected: false,
      office_id_verified: false,
      office_contract_signed: false,
      handover_keys_given: false,
      handover_documents_given: false,
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

  const toggleHistoryEntry = (id: string) => {
    setExpandedHistoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return {
    reopenModal,
    setReopenModal,
    reopenReason,
    setReopenReason,
    reopening,
    reopenHistory,
    expandedHistoryIds,
    handleReopenConfirm,
    toggleHistoryEntry,
  };
}
