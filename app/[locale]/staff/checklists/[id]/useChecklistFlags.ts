'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItemType, IssueSeverity, SyncError, FlagDraft } from './types';
import { uiToDbSeverity, parseSyncError } from './helpers';

interface UseChecklistFlagsProps {
  supabase: SupabaseClient<any>;
  localItems: ChecklistItemType[];
  setLocalItems: Dispatch<SetStateAction<ChecklistItemType[]>>;
  isChecklistLocked: boolean;
  setSyncError: Dispatch<SetStateAction<SyncError | null>>;
  t: (key: string, ...args: any[]) => string;
}

export function useChecklistFlags({
  supabase,
  localItems,
  setLocalItems,
  isChecklistLocked,
  setSyncError,
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
    setFlagDraftById((prev) => ({ ...prev, [itemId]: prev[itemId] ?? emptyDraft() }));
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: true }));
  };

  const closeFlagPanel = (itemId: string) => {
    setOpenFlagPanelById((prev) => ({ ...prev, [itemId]: false }));
    setFlagDraftById((prev) => { const next = { ...prev }; delete next[itemId]; return next; });
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
      const merged = [...(draft.photos ?? []), ...Array.from(files)].slice(0, 3);
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

    setFlagDraftById((prev) => ({ ...prev, [itemId]: { ...draft, saving: true, error: null } }));

    const issueUpdate = {
      issue_flag: true,
      issue_title: item.template.label,
      issue_description: draft.note.trim(),
      issue_severity: uiToDbSeverity(draft.severity),
      issue_blocking: draft.severity === 'urgent',
      linked_vehicle_issue_id: null,
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
    closeFlagPanel(itemId);
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
