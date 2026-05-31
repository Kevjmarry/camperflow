'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItemType, IssueSeverity, SyncError, FlagDraft, StoredEvidencePhoto, NewEvidencePhoto, EvidencePhoto } from './types';
import { uiToDbSeverity, parseSyncError } from './helpers';

const PREP_CHECKLIST_TYPES = new Set(['cleaning', 'mechanical', 'vehicle_readiness', 'pre_season', 'post_season']);

interface UseChecklistFlagsProps {
  supabase: SupabaseClient<any>;
  instanceId: string;
  vehicleId: string | null;
  checklistType: string;
  bookingId: string | null;
  localItems: ChecklistItemType[];
  setLocalItems: Dispatch<SetStateAction<ChecklistItemType[]>>;
  isChecklistLocked: boolean;
  setSyncError: Dispatch<SetStateAction<SyncError | null>>;
  uploadFlagPhoto: (file: File) => Promise<{ path: string; url: string }>;
  t: (key: string, ...args: any[]) => string;
}

export function useChecklistFlags({
  supabase,
  instanceId,
  vehicleId,
  checklistType,
  bookingId,
  localItems,
  setLocalItems,
  isChecklistLocked,
  setSyncError,
  uploadFlagPhoto,
  t,
}: UseChecklistFlagsProps) {
  const router = useRouter();
  const [openFlagPanelById, setOpenFlagPanelById] = useState<Record<string, boolean>>({});
  const [flagDraftById, setFlagDraftById] = useState<Record<string, FlagDraft>>({});
  const [resolvingFlagById, setResolvingFlagById] = useState<Record<string, boolean>>({});

  const emptyDraft = (): FlagDraft => ({
    severity: 'attention' as IssueSeverity,
    note: '',
    saving: false,
    error: null,
    photos: [],
  });

  const openFlagPanel = (itemId: string) => {
    if (isChecklistLocked) return;
    setFlagDraftById((prev) => {
      if (prev[itemId]) return { ...prev, [itemId]: { ...prev[itemId], saving: false, error: null } };
      const item = localItems.find((it) => it.id === itemId);
      const note = item?.issue_description?.trim() || item?.notes?.trim() || '';
      const photos: StoredEvidencePhoto[] = (item?.issue_photo_paths ?? []).map((p) => {
        const { data } = supabase.storage.from('checklist-evidence').getPublicUrl(p);
        return { kind: 'stored', path: p, url: data.publicUrl, rotation: 0 };
      });
      return { ...prev, [itemId]: { ...emptyDraft(), note, photos } };
    });
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: true }));
  };

  const closeFlagPanel = (itemId: string) => {
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: false }));
    // Draft is intentionally preserved so reopening the panel restores typed content.
  };

  const handleFlagDraftChange = (itemId: string, field: 'severity' | 'note', value: string) => {
    setFlagDraftById((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? emptyDraft()), [field]: value },
    }));
  };

  const handleFlagAddPhotos = (itemId: string, files: FileList | null) => {
    if (!files) return;
    setFlagDraftById((prev) => {
      const draft = prev[itemId];
      if (!draft) return prev;
      const incoming: NewEvidencePhoto[] = Array.from(files).map((f) => ({ kind: 'new', file: f }));
      const merged: EvidencePhoto[] = [...draft.photos, ...incoming].slice(0, 3);
      return { ...prev, [itemId]: { ...draft, photos: merged } };
    });
  };

  const handleFlagRemovePhoto = (itemId: string, index: number) => {
    setFlagDraftById((prev) => {
      const draft = prev[itemId];
      if (!draft) return prev;
      return { ...prev, [itemId]: { ...draft, photos: draft.photos.filter((_, i) => i !== index) } };
    });
  };

  const handleSaveFlag = async (itemId: string) => {
    if (isChecklistLocked) return;
    const draft = flagDraftById[itemId];
    if (!draft) return;

    if (!draft.note.trim()) {
      setFlagDraftById((prev) => ({ ...prev, [itemId]: { ...draft, error: t('issueNoteRequired') } }));
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const item = localItems.find((it) => it.id === itemId);
    if (!item) return;

    setFlagDraftById((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? draft), saving: true, error: null },
    }));

    // Create a vehicle_issues row so the issue is permanently traceable to its source.
    // Only possible when the checklist is linked to a vehicle.
    let vehicleIssueId: string | null = null;
    if (vehicleId) {
      // For prep-type checklists linked to a booking, find the most recent prior booking
      // for the same vehicle (return_at before this booking's pickup_at) to attribute the issue.
      let sourceBookingId: string | null = null;
      if (bookingId && PREP_CHECKLIST_TYPES.has(checklistType)) {
        const { data: currentBooking } = await supabase
          .from('bookings')
          .select('pickup_at')
          .eq('id', bookingId)
          .single();
        if (currentBooking?.pickup_at) {
          const { data: priorBooking } = await supabase
            .from('bookings')
            .select('id')
            .eq('vehicle_id', vehicleId)
            .lt('return_at', currentBooking.pickup_at)
            .order('return_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (priorBooking) sourceBookingId = priorBooking.id;
        }
      }

      const { data: newIssue } = await supabase
        .from('vehicle_issues')
        .insert({
          vehicle_id: vehicleId,
          resolved: false,
          source_checklist_instance_id: instanceId,
          source_checklist_item_id: itemId,
          ...(sourceBookingId ? { source_booking_id: sourceBookingId } : {}),
        })
        .select('id')
        .single();
      if (newIssue) vehicleIssueId = newIssue.id;
    }

    // Upload any newly-selected photos; keep paths from stored photos already in DB.
    const storedPaths = draft.photos
      .filter((p): p is StoredEvidencePhoto => p.kind === 'stored')
      .map((p) => p.path);
    const newFiles = draft.photos
      .filter((p): p is NewEvidencePhoto => p.kind === 'new')
      .map((p) => p.file);
    const uploadedPaths: string[] = [];
    if (newFiles.length > 0) {
      const results = await Promise.allSettled(newFiles.map((f) => uploadFlagPhoto(f)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') uploadedPaths.push(r.value.path);
      });
    }
    const allPhotoPaths = [...storedPaths, ...uploadedPaths];

    const issueUpdate = {
      issue_flag: true,
      issue_title: item.template.label,
      issue_description: draft.note.trim(),
      issue_severity: uiToDbSeverity(draft.severity),
      issue_blocking: uiToDbSeverity(draft.severity) === 'high',
      issue_photo_paths: allPhotoPaths.length > 0 ? allPhotoPaths : null,
      linked_vehicle_issue_id: vehicleIssueId,
    };

    const { error } = await supabase
      .from('checklist_instance_items')
      .update(issueUpdate)
      .eq('id', itemId);

    if (error) {
      setFlagDraftById((prev) => ({
        ...prev,
        [itemId]: { ...draft, saving: false, error: error.message ?? t('flagSaveFailed') },
      }));
      return;
    }

    setLocalItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...issueUpdate } : it)));
    setFlagDraftById((prev) => { const next = { ...prev }; delete next[itemId]; return next; });
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: false }));
    router.refresh();
  };

  const handleResolveFlag = async (itemId: string) => {
    if (isChecklistLocked) return;
    const item = localItems.find((it) => it.id === itemId);
    if (!item?.issue_flag) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setResolvingFlagById((prev) => ({ ...prev, [itemId]: true }));
    const { error } = await supabase
      .from('checklist_instance_items')
      .update({ issue_flag: false })
      .eq('id', itemId);

    if (error) {
      setResolvingFlagById((prev) => ({ ...prev, [itemId]: false }));
      setSyncError(parseSyncError(error, 'status_sync_failed'));
      return;
    }

    setLocalItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, issue_flag: false } : it)));
    setResolvingFlagById((prev) => { const next = { ...prev }; delete next[itemId]; return next; });
    router.refresh();
  };

  return {
    openFlagPanelById,
    flagDraftById,
    resolvingFlagById,
    openFlagPanel,
    closeFlagPanel,
    handleFlagDraftChange,
    handleFlagAddPhotos,
    handleFlagRemovePhoto,
    handleSaveFlag,
    handleResolveFlag,
  };
}
