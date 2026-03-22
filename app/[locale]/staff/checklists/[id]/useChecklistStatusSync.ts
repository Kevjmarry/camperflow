'use client';

import { useState, useCallback } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItemType, ChecklistInstanceType, SyncError } from './types';
import { computeInstanceUpdate, parseSyncError, isLockError, isReturnAfterCompletionLockError } from './helpers';
import type { InstanceStatusSnapshot } from './helpers';

type SyncResult = { ok: true } | { locked: true } | { error: SyncError };

interface UseChecklistStatusSyncProps {
  supabase: SupabaseClient<any>;
  instanceId: string;
  localInstanceRef: MutableRefObject<ChecklistInstanceType>;
  setLocalItems: Dispatch<SetStateAction<ChecklistItemType[]>>;
  setLocalInstance: Dispatch<SetStateAction<ChecklistInstanceType>>;
  t: (key: string, ...args: any[]) => string;
}

export function useChecklistStatusSync({
  supabase,
  instanceId,
  localInstanceRef,
  setLocalItems,
  setLocalInstance,
  t,
}: UseChecklistStatusSyncProps) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

  function lockMessageFromError(error: any): string {
    return typeof error?.message === 'string' && error.message.trim()
      ? error.message
      : t('lockFallback');
  }

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
      setLocalInstance((prev) => ({ ...prev, ...update }));
      setSyncError(null);
      setLockNotice(null);

      const { error } = await supabase.from('checklist_instances').update(update).eq('id', instanceId);

      if (error) {
        if (isReturnAfterCompletionLockError(error) && localInstanceRef.current.status === 'completed') {
          return { ok: true };
        }
        if (isLockError(error)) {
          setLocalItems(prevItems);
          setLocalInstance(prevInstance);
          setLockNotice(
            typeof error?.message === 'string' && error.message.trim() ? error.message : t('lockFallback')
          );
          return { locked: true };
        }
        const syncErr = parseSyncError(error, 'status_sync_failed');
        setSyncError(syncErr);
        return { error: syncErr };
      }
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, instanceId]
  );

  return {
    syncError,
    setSyncError,
    lockNotice,
    setLockNotice,
    syncInstanceStatus,
    lockMessageFromError,
  };
}
