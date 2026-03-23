'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ComponentProps } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import PageContainer from '@/components/PageContainer';

import ReopenModal from './ReopenModal';
import PickupDataWarningModal from './PickupDataWarningModal';
import HandoverSafetyModal from './HandoverSafetyModal';
import ChecklistItem from './ChecklistItem';
import ChecklistHeader from './ChecklistHeader';
import ChecklistBanners from './ChecklistBanners';
import PhaseCard from './PhaseCard';
import PhaseSummaryStrip from './PhaseSummaryStrip';
import VehicleDataBlock from './VehicleDataBlock';
import EvidenceBlock from './EvidenceBlock';
import AuditChecklistBlock from './AuditChecklistBlock';
import OfficeSectionCard from './OfficeSectionCard';
import HandoverFooter from './HandoverFooter';
import StandardChecklistSections from './StandardChecklistSections';
import ReopenHistorySection from './ReopenHistorySection';
import ReturnOfficeSectionCard from './ReturnOfficeSectionCard';

import { useChecklistUser } from './useChecklistUser';
import { useChecklistStatusSync } from './useChecklistStatusSync';
import { useChecklistFlags } from './useChecklistFlags';
import { useChecklistReopen } from './useChecklistReopen';
import { useHandoverCompletion } from './useHandoverCompletion';
import { useReturnCompletion } from './useReturnCompletion';
import { isLockError, parseSyncError, getPickupAuditDisplayLabel, getReturnAuditDisplayLabel } from './helpers';

import type {
  ChecklistInstanceType,
  ChecklistItemType,
  DbIssueSeverity,
  HandoverField,
} from './types';

// ─── Main component ───────────────────────────────────────────────────────────

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

  // ── Core state ───────────────────────────────────────────────────────────────
  const [localItems, setLocalItems] = useState(initialItems);
  const [localInstance, setLocalInstance] = useState(instance);
  const [openNotesById, setOpenNotesById] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // ── Vehicle / evidence state ─────────────────────────────────────────────────
  const [vehicleData, setVehicleData] = useState({ km: '', fuel: '', adblue: '' });
  const [evidencePhotos, setEvidencePhotos] = useState<{ general: File[]; damage: File[] }>({
    general: [],
    damage: [],
  });

  // ── Handover validation UI state ─────────────────────────────────────────────
  const [handoverValidating, setHandoverValidating] = useState(false);
  const [validationHighlights, setValidationHighlights] = useState({
    missingAudit: false,
    missingVehicleData: false,
    missingPhotos: false,
    missingOffice: false,
    missingHandover: false,
  });

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [pickupDataWarningModal, setPickupDataWarningModal] = useState<{
    missing: string[];
    onConfirm: () => Promise<void>;
  } | null>(null);

  const [handoverSafetyModal, setHandoverSafetyModal] = useState<{
    flaggedItems: ChecklistItemType[];
    triggerCheckedIds: string[];
    triggerCheckedAt: string;
    triggerCheckedBy: string;
  } | null>(null);
  const pendingCompletionRef = useRef<(() => Promise<void>) | null>(null);

  const localInstanceRef = useRef(localInstance);
  useEffect(() => { localInstanceRef.current = localInstance; }, [localInstance]);
  useEffect(() => { setLocalItems(initialItems); }, [initialItems]);
  useEffect(() => { setLocalInstance(instance); }, [instance]);

  // ── Derived flags ────────────────────────────────────────────────────────────
  const isChecklistLocked =
    !!instance.booking_id &&
    (instance.checklist_type === 'handover' || instance.checklist_type === 'return') &&
    instance.bookings?.status === 'completed';

  const isPickupOrHandover =
    instance.checklist_type === 'pickup' || instance.checklist_type === 'handover';

  // ── Navigation ───────────────────────────────────────────────────────────────

  const navigateBack = useCallback(() => {
    if (from === 'booking' && instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
    } else if (from === 'vehicle' && instance.vehicle_id) {
      router.push(`/${locale}/staff/vehicles/${instance.vehicle_id}`);
    } else {
      router.push(`/${locale}/staff/checklists?scope=${listScope}&status=${listStatus}`);
    }
  }, [from, instance.booking_id, instance.vehicle_id, locale, listScope, listStatus, router]);

  const navigateAfterCompletion = useCallback(() => {
    if (from === 'booking' && instance.booking_id) {
      router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
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

  const handleBackClick = () => navigateBack();

  const handleGoToBooking = () => {
    if (instance.booking_id) router.push(`/${locale}/staff/bookings/${instance.booking_id}`);
  };

  // ── Missing pickup data check ─────────────────────────────────────────────────
  // Used by handleToggle, handleCompleteSection, and useHandoverCompletion.

  const getMissingPickupData = (): string[] => {
    const missing: string[] = [];
    if (!vehicleData.km) missing.push('km');
    if (!vehicleData.fuel) missing.push('fuel');
    if (!vehicleData.adblue) missing.push('adblue');
    const totalPhotos = evidencePhotos.general.length + evidencePhotos.damage.length;
    if (totalPhotos === 0) missing.push('photos');
    return missing;
  };

  // ── Handover complete — combined required-fields validation ──────────────────
  // Checks all 5 required sections at once. Vehicle data and photos are
  // blocking here, not a dismissible warning. If anything is missing, one
  // combined error is shown and we return early. Only after everything is
  // complete does the hook handle blocking-flag modals and the DB write.

  const handleHandoverCompleteValidated = async () => {
    setHandoverValidating(true);
    setHandoverBlockedError(null);

    const missingPickupFields = getMissingPickupData();
    const missingAudit = localItems.some(
      (it) => !it.checked && getPickupAuditDisplayLabel(it.template.label) !== null
    );
    const missingVehicleData = missingPickupFields.some((f) => f !== 'photos');
    const missingPhotos = missingPickupFields.includes('photos');
    const missingOffice =
      !localInstance.office_contract_signed ||
      !localInstance.office_id_verified ||
      !localInstance.office_deposit_collected;
    const missingHandover =
      !localInstance.handover_documents_given || !localInstance.handover_keys_given;

    if (missingAudit || missingVehicleData || missingPhotos || missingOffice || missingHandover) {
      setValidationHighlights({ missingAudit, missingVehicleData, missingPhotos, missingOffice, missingHandover });
      setTimeout(() => setHandoverValidating(false), 400);
      setHandoverBlockedError(t('handoverErrorAllRequired'));
      return;
    }

    setValidationHighlights({ missingAudit: false, missingVehicleData: false, missingPhotos: false, missingOffice: false, missingHandover: false });
    setHandoverValidating(false);
    await handleHandoverCompleteButton();
  };

  // ── Safety modal helpers ──────────────────────────────────────────────────────

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

  // ── Hooks ────────────────────────────────────────────────────────────────────

  const { userId, initialsByUserId, fetchInitialsForUsers } = useChecklistUser({
    supabase,
    localItems,
  });

  const {
    syncError,
    setSyncError,
    lockNotice,
    setLockNotice,
    syncInstanceStatus,
    lockMessageFromError,
  } = useChecklistStatusSync({
    supabase,
    instanceId: instance.id,
    localInstanceRef,
    setLocalItems,
    setLocalInstance,
    t,
  });

  const {
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
  } = useChecklistFlags({
    supabase,
    localItems,
    setLocalItems,
    isChecklistLocked,
    setSyncError,
    t,
  });

  const {
    reopenModal,
    setReopenModal,
    reopenReason,
    setReopenReason,
    reopening,
    reopenHistory,
    expandedHistoryIds,
    handleReopenConfirm,
    toggleHistoryEntry,
  } = useChecklistReopen({
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
  });

  const {
    handoverCompleting,
    handoverBlockedError,
    setHandoverBlockedError,
    handleHandoverCompleteButton,
  } = useHandoverCompletion({
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
    t,
  });

  const {
    returnCompleting,
    returnBlockedError,
    setReturnBlockedError,
    handleReturnCompleteButton,
  } = useReturnCompletion({
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
  });

  // ── Safety modal handlers ─────────────────────────────────────────────────────

  const handleSafetyConfirm = async () => {
    const flaggedItems = handoverSafetyModal?.flaggedItems ?? [];
    setHandoverSafetyModal(null);

    const blockingIds = flaggedItems
      .filter((it) => it.issue_blocking === true)
      .map((it) => it.id);

    if (blockingIds.length > 0) {
      setLocalItems((prev) =>
        prev.map((it) => blockingIds.includes(it.id) ? { ...it, issue_blocking: false } : it)
      );
      const { error } = await supabase
        .from('checklist_instance_items')
        .update({ issue_blocking: false })
        .in('id', blockingIds);

      if (error) {
        setLocalItems((prev) =>
          prev.map((it) => blockingIds.includes(it.id) ? { ...it, issue_blocking: true } : it)
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
    const attentionItems = (modal?.flaggedItems ?? []).filter((it) => it.issue_blocking !== true);
    const attentionIds = attentionItems.map((it) => it.id);
    const triggerCheckedIds = modal?.triggerCheckedIds ?? [];
    const triggerCheckedAt = modal?.triggerCheckedAt ?? '';
    const triggerCheckedBy = modal?.triggerCheckedBy ?? '';

    setHandoverSafetyModal(null);
    pendingCompletionRef.current = null;

    if (attentionIds.length === 0) return;

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

    const { error: urgentError } = await supabase
      .from('checklist_instance_items')
      .update({ issue_severity: 'high', issue_blocking: true, checked: false, checked_at: null, checked_by: null })
      .in('id', attentionIds);

    if (urgentError) {
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

    const finalTriggerIds = triggerCheckedIds.filter((id) => !attentionIds.includes(id));
    if (finalTriggerIds.length > 0 && triggerCheckedBy) {
      const { error: triggerError } = await supabase
        .from('checklist_instance_items')
        .update({ checked: true, checked_at: triggerCheckedAt, checked_by: triggerCheckedBy })
        .in('id', finalTriggerIds);

      if (triggerError) {
        setSyncError(parseSyncError(triggerError, 'item_update_failed'));
      }
    }
  };

  // ── Office field toggle ───────────────────────────────────────────────────────

  const handleOfficeFieldToggle = async (field: HandoverField) => {
    if (isChecklistLocked) return;
    const current = !!(localInstance as any)[field];
    const newValue = !current;
    setLocalInstance((prev) => ({ ...prev, [field]: newValue }));
    const { error } = await supabase
      .from('checklist_instances')
      .update({ [field]: newValue })
      .eq('id', instance.id);
    if (error) {
      setLocalInstance((prev) => ({ ...prev, [field]: current }));
      setSyncError(parseSyncError(error, 'status_sync_failed'));
      return;
    }
    // If checking a field while status is still pending, promote to in_progress
    const isPending = localInstance.status === 'pending' || localInstance.status === 'not_started';
    if (newValue && isPending) {
      const now = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const statusUpdate = {
        status: 'in_progress',
        started_at: localInstance.started_at ?? now,
        started_by: localInstance.started_by ?? (user?.id ?? null),
      };
      setLocalInstance((prev) => ({ ...prev, ...statusUpdate }));
      await supabase.from('checklist_instances').update(statusUpdate).eq('id', instance.id);
    }
  };

  // ── Return field toggle / deposit status ─────────────────────────────────────

  type ReturnBooleanField = 'return_keys_received' | 'return_documents_received' | 'return_contract_closed';

  const handleReturnFieldToggle = async (field: ReturnBooleanField) => {
    if (isChecklistLocked) return;
    const current = !!(localInstance as any)[field];
    const newValue = !current;
    setLocalInstance((prev) => ({ ...prev, [field]: newValue }));
    const { error } = await supabase
      .from('checklist_instances')
      .update({ [field]: newValue })
      .eq('id', instance.id);
    if (error) {
      setLocalInstance((prev) => ({ ...prev, [field]: current }));
      setSyncError(parseSyncError(error, 'status_sync_failed'));
      return;
    }
    const isPending = localInstance.status === 'pending' || localInstance.status === 'not_started';
    if (newValue && isPending) {
      const now = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const statusUpdate = {
        status: 'in_progress',
        started_at: localInstance.started_at ?? now,
        started_by: localInstance.started_by ?? (user?.id ?? null),
      };
      setLocalInstance((prev) => ({ ...prev, ...statusUpdate }));
      await supabase.from('checklist_instances').update(statusUpdate).eq('id', instance.id);
    }
  };

  const handleReturnDepositStatus = async (value: string) => {
    if (isChecklistLocked) return;
    const prev = localInstance.return_deposit_status;
    setLocalInstance((prev) => ({ ...prev, return_deposit_status: value }));
    const { error } = await supabase
      .from('checklist_instances')
      .update({ return_deposit_status: value })
      .eq('id', instance.id);
    if (error) {
      setLocalInstance((p) => ({ ...p, return_deposit_status: prev }));
      setSyncError(parseSyncError(error, 'status_sync_failed'));
      return;
    }
    const isPending = localInstance.status === 'pending' || localInstance.status === 'not_started';
    if (isPending) {
      const now = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const statusUpdate = {
        status: 'in_progress',
        started_at: localInstance.started_at ?? now,
        started_by: localInstance.started_by ?? (user?.id ?? null),
      };
      setLocalInstance((p) => ({ ...p, ...statusUpdate }));
      await supabase.from('checklist_instances').update(statusUpdate).eq('id', instance.id);
    }
  };

  // ── Item toggle ───────────────────────────────────────────────────────────────

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
    if (isChecklistLocked) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newChecked = !currentChecked;
    const now = new Date().toISOString();
    const prevItems = localItems;
    const prevInstance = localInstance;

    const nextItems = localItems.map((it) =>
      it.id === itemId
        ? { ...it, checked: newChecked, checked_at: newChecked ? now : null, checked_by: newChecked ? user.id : null }
        : it
    );

    // Auto-complete only for pickup type — handover uses the explicit button
    const wouldComplete = instance.checklist_type === 'pickup' && nextItems.every((it) => it.checked);
    if (wouldComplete) {
      const proceedToggle = async () => {
        const urgentItems = localItems.filter((it) => it.issue_blocking === true);
        if (urgentItems.length > 0) {
          const urgentIds = urgentItems.map((it) => it.id);
          const nextWithUrgentsUnchecked = nextItems.map((it) =>
            urgentIds.includes(it.id) ? { ...it, checked: false, checked_at: null, checked_by: null } : it
          );
          setLocalItems(nextWithUrgentsUnchecked);
          await Promise.all([
            supabase.from('checklist_instance_items')
              .update({ checked: true, checked_at: now, checked_by: user.id }).eq('id', itemId),
            supabase.from('checklist_instance_items')
              .update({ checked: false, checked_at: null, checked_by: null }).in('id', urgentIds),
          ]);
          setHandoverSafetyModal({ flaggedItems: urgentItems, triggerCheckedIds: [], triggerCheckedAt: '', triggerCheckedBy: '' });
          return;
        }
        const flagged = localItems.filter((it) => !!it.issue_flag);
        if (flagged.length > 0) {
          showHandoverSafetyModal(flagged, async () => {
            await doToggleWrites(itemId, newChecked, now, user.id, nextItems, prevItems, prevInstance, currentChecked);
          }, [itemId], now, user.id);
          return;
        }
        await doToggleWrites(itemId, newChecked, now, user.id, nextItems, prevItems, prevInstance, currentChecked);
      };

      const missing = getMissingPickupData();
      if (missing.length > 0) {
        setPickupDataWarningModal({ missing, onConfirm: proceedToggle });
        return;
      }
      await proceedToggle();
      return;
    }

    await doToggleWrites(itemId, newChecked, now, user.id, nextItems, prevItems, prevInstance, currentChecked);
  };

  const doToggleWrites = async (
    itemId: string,
    newChecked: boolean,
    now: string,
    uid: string,
    nextItems: ChecklistItemType[],
    prevItems: ChecklistItemType[],
    prevInstance: ChecklistInstanceType,
    currentChecked: boolean
  ) => {
    setLocalItems(nextItems);
    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({ checked: newChecked, checked_at: newChecked ? now : null, checked_by: newChecked ? uid : null })
      .eq('id', itemId);

    if (itemError) {
      setLocalItems(prevItems);
      setLocalInstance(prevInstance);
      if (isLockError(itemError)) {
        setSyncError(null);
        setLockNotice(lockMessageFromError(itemError));
      } else {
        setLockNotice(null);
        setSyncError(parseSyncError(itemError, 'item_update_failed'));
      }
      return;
    }

    try {
      const result = await syncInstanceStatus(nextItems, uid, prevItems, prevInstance);
      if ('locked' in result) {
        const prevItem = prevItems.find((it) => it.id === itemId);
        await supabase.from('checklist_instance_items')
          .update({
            checked: prevItem ? prevItem.checked : currentChecked,
            checked_at: prevItem ? prevItem.checked_at : null,
            checked_by: prevItem ? prevItem.checked_by : null,
          })
          .eq('id', itemId);
        return;
      }
      router.refresh();
    } catch {
      setLocalItems(initialItems);
      setLocalInstance(instance);
      router.refresh();
    }
  };

  // ── Section complete ──────────────────────────────────────────────────────────

  const handleCompleteSection = async (sectionName: string, sectionItems: ChecklistItemType[]) => {
    if (isChecklistLocked) return;
    const uncheckedItems = sectionItems.filter((it) => !it.checked);
    if (uncheckedItems.length === 0) return;

    const confirmed = confirm(t('completeSectionConfirm', { section: sectionName }));
    if (!confirmed) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date().toISOString();
    const uncheckedIds = uncheckedItems.map((it) => it.id);
    const prevItems = localItems;
    const prevInstance = localInstance;
    const nextItems = localItems.map((it) =>
      uncheckedIds.includes(it.id) ? { ...it, checked: true, checked_at: now, checked_by: user.id } : it
    );

    // Auto-complete only for pickup type — handover uses the explicit button
    const wouldComplete = instance.checklist_type === 'pickup' && nextItems.every((it) => it.checked);
    if (wouldComplete) {
      const proceedCompleteSection = async () => {
        const urgentItems = localItems.filter((it) => it.issue_blocking === true);
        if (urgentItems.length > 0) {
          const urgentIds = urgentItems.map((it) => it.id);
          const toCheckIds = uncheckedIds.filter((id) => !urgentIds.includes(id));
          const nextWithUrgentsUnchecked = nextItems.map((it) =>
            urgentIds.includes(it.id) ? { ...it, checked: false, checked_at: null, checked_by: null } : it
          );
          setLocalItems(nextWithUrgentsUnchecked);
          const writes: PromiseLike<unknown>[] = [
            supabase.from('checklist_instance_items')
              .update({ checked: false, checked_at: null, checked_by: null }).in('id', urgentIds),
          ];
          if (toCheckIds.length > 0) {
            writes.push(
              supabase.from('checklist_instance_items')
                .update({ checked: true, checked_at: now, checked_by: user.id }).in('id', toCheckIds)
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
    uid: string,
    now: string,
    uncheckedIds: string[],
    nextItems: ChecklistItemType[],
    prevItems: ChecklistItemType[],
    prevInstance: ChecklistInstanceType
  ) => {
    setLocalItems(nextItems);
    const { error: itemError } = await supabase
      .from('checklist_instance_items')
      .update({ checked: true, checked_at: now, checked_by: uid })
      .in('id', uncheckedIds);

    if (itemError) {
      setLocalItems(prevItems);
      setLocalInstance(prevInstance);
      if (isLockError(itemError)) {
        setSyncError(null);
        setLockNotice(lockMessageFromError(itemError));
      } else {
        setLockNotice(null);
        setSyncError(parseSyncError(itemError, 'item_update_failed'));
      }
      return;
    }

    try {
      const result = await syncInstanceStatus(nextItems, uid, prevItems, prevInstance);
      if ('locked' in result) {
        await Promise.all(
          uncheckedIds.map((id) => {
            const prevItem = prevItems.find((it) => it.id === id);
            return supabase.from('checklist_instance_items').update({
              checked: prevItem ? prevItem.checked : false,
              checked_at: prevItem ? prevItem.checked_at : null,
              checked_by: prevItem ? prevItem.checked_by : null,
            }).eq('id', id);
          })
        );
        return;
      }
      router.refresh();
    } catch {
      setLocalItems(initialItems);
      setLocalInstance(instance);
      router.refresh();
    }
  };

  // ── Notes / section collapse ──────────────────────────────────────────────────

  const handleNotesChange = (itemId: string, notes: string) => {
    if (isChecklistLocked) return;
    setLocalItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, notes } : it)));
  };

  const handleNotesBlur = async (itemId: string, notes: string) => {
    if (isChecklistLocked) return;
    try {
      await supabase.from('checklist_instance_items').update({ notes }).eq('id', itemId);
    } catch {
      router.refresh();
    }
  };

  const toggleNotes = (itemId: string) => {
    setOpenNotesById((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const sortedItems = [...localItems].sort((a, b) => a.template.sort_order - b.template.sort_order);
  const sectionMap = new Map<string, ChecklistItemType[]>();
  for (const item of sortedItems) {
    const sectionName = item.template.section?.trim() || t('sectionOther');
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
    sectionMap.get(sectionName)!.push(item);
  }
  const sections: { name: string; items: ChecklistItemType[] }[] = [];
  sectionMap.forEach((items, name) => sections.push({ name, items }));

  const CHECKLIST_TYPE_LABELS: Record<string, string> = {
    handover: t('type_handover'),
    pickup: t('type_pickup'),
    return: t('type_return'),
    cleaning: t('type_cleaning'),
    mechanical: t('type_mechanical'),
    guest_prereturn: t('type_guest_prereturn'),
    vehicle_readiness: t('type_vehicle_readiness'),
    pre_season: t('type_pre_season'),
    post_season: t('type_post_season'),
  };

  const checklistTitle = CHECKLIST_TYPE_LABELS[instance.checklist_type] ?? t('typeUnknown');

  const statusLabel = (() => {
    switch (localInstance.status) {
      case 'pending':
      case 'not_started': return t('statusNotStarted');
      case 'in_progress': return t('statusInProgress');
      case 'completed': return t('statusCompleted');
      default: return localInstance.status;
    }
  })();

  const backButtonLabel =
    from === 'booking' && instance.booking_id
      ? t('backToBooking')
      : from === 'vehicle' && instance.vehicle_id
      ? t('backToVehicle')
      : t('backToChecklists');

  const contextLine = instance.bookings
    ? `${instance.bookings.booking_number} – ${instance.bookings.customer_name}`
    : instance.vehicles
    ? instance.vehicles.name
    : t('noBookingLinked');

  const templateItemIdToLabel = new Map(initialItems.map((it) => [it.template_item_id, it.template.label]));
  const templateItemIdToSortOrder = new Map(initialItems.map((it) => [it.template_item_id, it.template.sort_order]));

  /** Builds all props needed by a ChecklistItem row. */
  const renderItemProps = (item: ChecklistItemType): ComponentProps<typeof ChecklistItem> => ({
    item,
    isChecklistLocked,
    isNotesOpen: !!openNotesById[item.id],
    isFlagPanelOpen: !isChecklistLocked && !!openFlagPanelById[item.id],
    flagDraft: flagDraftById[item.id] ?? null,
    isResolvingFlag: !!resolvingFlagById[item.id],
    initialsByUserId,
    userId,
    onToggle: () => handleToggle(item.id, item.checked),
    onToggleNotes: () => toggleNotes(item.id),
    onOpenFlagPanel: () => openFlagPanel(item.id),
    onCloseFlagPanel: () => closeFlagPanel(item.id),
    onResolveFlag: () => handleResolveFlag(item.id),
    onFlagDraftChange: (field: 'severity' | 'note', value: string) =>
      handleFlagDraftChange(item.id, field, value),
    onFlagAddPhotos: (files: FileList | null) => handleFlagAddPhotos(item.id, files),
    onFlagRemovePhoto: (idx: number) => handleFlagRemovePhoto(item.id, idx),
    onSaveFlag: () => handleSaveFlag(item.id),
    onNotesChange: (value: string) => handleNotesChange(item.id, value),
    onNotesBlur: (value: string) => handleNotesBlur(item.id, value),
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
      <ChecklistHeader
        title={checklistTitle}
        backLabel={backButtonLabel}
        onBack={handleBackClick}
        statusLabel={statusLabel}
        contextLine={contextLine}
      />

      <ChecklistBanners
        isChecklistLocked={isChecklistLocked}
        lockNotice={lockNotice}
        onDismissLockNotice={() => setLockNotice(null)}
        syncError={syncError}
        onDismissSyncError={() => setSyncError(null)}
        isCompleted={localInstance.status === 'completed'}
        canReopen={
          instance.checklist_type === 'handover' &&
          instance.bookings?.status === 'confirmed' &&
          !isChecklistLocked
        }
        hasBooking={!!instance.booking_id}
        onReopen={() => setReopenModal(true)}
        onGoToBooking={handleGoToBooking}
      />

      {isPickupOrHandover ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <PhaseSummaryStrip />

          {/* Phase 1: Hospitality Tour */}
          <PhaseCard phase={1} label={t('phase1Label')}>
            <div style={{ padding: '14px 16px' }}>
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.6' }}>
                {t('phase1Desc')}
              </p>
            </div>
          </PhaseCard>

          {/* Phase 2: Audit */}
          <PhaseCard phase={2} label={t('phase2Label')}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgb(var(--border))' }}>
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', margin: 0, lineHeight: '1.6' }}>
                {t('phase2Desc')}
              </p>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <VehicleDataBlock
                vehicleData={vehicleData}
                onChange={(field, value) => setVehicleData((prev) => ({ ...prev, [field]: value }))}
                isLocked={isChecklistLocked}
                highlight={validationHighlights.missingVehicleData}
                fuelOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'Fuel level')?.template.options ?? undefined}
                adblueOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'AdBlue level')?.template.options ?? undefined}
              />
              <EvidenceBlock
                evidencePhotos={evidencePhotos}
                onAdd={(group, files) =>
                  setEvidencePhotos((prev) => ({ ...prev, [group]: [...prev[group], ...files] }))
                }
                onRemove={(group, index) =>
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: prev[group].filter((_, i) => i !== index),
                  }))
                }
                isLocked={isChecklistLocked}
                highlight={validationHighlights.missingPhotos}
              />
              <AuditChecklistBlock
                sections={sections}
                isChecklistLocked={isChecklistLocked}
                collapsedSections={collapsedSections}
                onToggleSection={toggleSection}
                onCompleteSection={handleCompleteSection}
                renderItemProps={renderItemProps}
                getDisplayLabel={getPickupAuditDisplayLabel}
                highlight={validationHighlights.missingAudit}
              />
            </div>
          </PhaseCard>

          {/* Phase 3: Office */}
          <PhaseCard phase={3} label={t('phase3Label')}>
            <OfficeSectionCard
              localInstance={localInstance}
              isChecklistLocked={isChecklistLocked}
              onToggleField={handleOfficeFieldToggle}
              highlight={validationHighlights.missingOffice || validationHighlights.missingHandover}
            />
          </PhaseCard>

          {/* Handover complete button — handover type only */}
          {instance.checklist_type === 'handover' &&
            !isChecklistLocked &&
            localInstance.status !== 'completed' && (
              <HandoverFooter
                completing={handoverCompleting || handoverValidating}
                blockedError={handoverBlockedError}
                onComplete={handleHandoverCompleteValidated}
              />
            )}
        </div>
      ) : instance.checklist_type === 'return' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <PhaseSummaryStrip />

          {/* Phase 1: Vehicle Intake */}
          <PhaseCard phase={1} label={t('phase1Label')}>
            <div style={{ padding: '16px' }}>
              <VehicleDataBlock
                vehicleData={vehicleData}
                onChange={(field, value) => setVehicleData((prev) => ({ ...prev, [field]: value }))}
                isLocked={isChecklistLocked}
                highlight={false}
                fuelOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'Fuel level')?.template.options ?? undefined}
                adblueOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'AdBlue level')?.template.options ?? undefined}
              />
            </div>
          </PhaseCard>

          {/* Phase 2: Condition & Inspection */}
          <PhaseCard phase={2} label={t('phase2Label')}>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <EvidenceBlock
                evidencePhotos={evidencePhotos}
                onAdd={(group, files) =>
                  setEvidencePhotos((prev) => ({ ...prev, [group]: [...prev[group], ...files] }))
                }
                onRemove={(group, index) =>
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: prev[group].filter((_, i) => i !== index),
                  }))
                }
                isLocked={isChecklistLocked}
                highlight={false}
              />
              <AuditChecklistBlock
                sections={sections}
                isChecklistLocked={isChecklistLocked}
                collapsedSections={collapsedSections}
                onToggleSection={toggleSection}
                onCompleteSection={handleCompleteSection}
                renderItemProps={renderItemProps}
                getDisplayLabel={getReturnAuditDisplayLabel}
                highlight={false}
              />
            </div>
          </PhaseCard>

          {/* Phase 3: Office / Return Close */}
          <PhaseCard phase={3} label={t('phase3Label')}>
            <ReturnOfficeSectionCard
              localInstance={localInstance}
              isChecklistLocked={isChecklistLocked}
              onToggleField={handleReturnFieldToggle}
              onSetDepositStatus={handleReturnDepositStatus}
            />
          </PhaseCard>

          {/* Phase 4: Complete button */}
          {!isChecklistLocked && localInstance.status !== 'completed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {returnBlockedError && (
                <p style={{ color: 'rgb(239,68,68)', fontSize: '13px', margin: 0, textAlign: 'center' }}>
                  {returnBlockedError}
                </p>
              )}
              <button
                type="button"
                onClick={() => { setReturnBlockedError(null); handleReturnCompleteButton(); }}
                disabled={returnCompleting}
                style={{
                  padding: '14px 24px',
                  backgroundColor: 'rgb(var(--brand))',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  cursor: returnCompleting ? 'not-allowed' : 'pointer',
                  opacity: returnCompleting ? 0.7 : 1,
                  width: '100%',
                }}
              >
                {returnCompleting ? t('completing') : t('completeChecklist')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <StandardChecklistSections
          sections={sections}
          isChecklistLocked={isChecklistLocked}
          collapsedSections={collapsedSections}
          onToggleSection={toggleSection}
          onCompleteSection={handleCompleteSection}
          renderItemProps={renderItemProps}
        />
      )}

      {/* Reopen/revert history — handover only */}
      {instance.checklist_type === 'handover' && (
        <ReopenHistorySection
          reopenHistory={reopenHistory}
          expandedHistoryIds={expandedHistoryIds}
          onToggleEntry={toggleHistoryEntry}
          templateItemIdToLabel={templateItemIdToLabel}
          templateItemIdToSortOrder={templateItemIdToSortOrder}
          initialsByUserId={initialsByUserId}
        />
      )}

      <ReopenModal
        isOpen={reopenModal}
        reopenReason={reopenReason}
        setReopenReason={setReopenReason}
        reopening={reopening}
        onConfirm={handleReopenConfirm}
        onCancel={() => { setReopenModal(false); setReopenReason(''); }}
      />

      <HandoverSafetyModal
        isOpen={handoverSafetyModal !== null}
        flaggedItems={handoverSafetyModal?.flaggedItems ?? []}
        onConfirm={handleSafetyConfirm}
        onMarkUrgent={handleSafetyMarkUrgent}
        onCancel={handleSafetyCancel}
      />

      <PickupDataWarningModal
        isOpen={pickupDataWarningModal !== null}
        missing={pickupDataWarningModal?.missing ?? []}
        onConfirm={async () => {
          const fn = pickupDataWarningModal!.onConfirm;
          setPickupDataWarningModal(null);
          await fn();
        }}
        onCancel={() => setPickupDataWarningModal(null)}
      />
    </PageContainer>
  );
}
