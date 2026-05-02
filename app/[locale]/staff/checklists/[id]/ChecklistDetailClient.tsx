'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ComponentProps } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import PageContainer from '@/components/PageContainer';
import BackLink from '@/components/staff/BackLink';

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
  EvidencePhoto,
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
  const focusItemId = searchParams.get('focusItem') ?? searchParams.get('itemId') ?? null;

  const supabase = createClient();

  // ── Core state ───────────────────────────────────────────────────────────────
  const [localItems, setLocalItems] = useState(initialItems);
  const [localInstance, setLocalInstance] = useState(instance);
  const [openNotesById, setOpenNotesById] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // ── Vehicle / evidence state ─────────────────────────────────────────────────
  const [vehicleData, setVehicleData] = useState(() => {
    if (instance.checklist_type === 'return') {
      const rvd = (instance.bookings as any)?.staff_metadata?.return_vehicle_data;
      return { km: rvd?.km ?? '', fuel: rvd?.fuel ?? '', adblue: rvd?.adblue ?? '' };
    }
    if (instance.checklist_type === 'handover') {
      const hvd = (instance.bookings as any)?.staff_metadata?.handover_vehicle_data;
      return { km: hvd?.km ?? '', fuel: hvd?.fuel ?? '', adblue: hvd?.adblue ?? '' };
    }
    return { km: '', fuel: '', adblue: '' };
  });
  const [extrasChecked, setExtrasChecked] = useState<Record<string, boolean>>(() => {
    if (instance.checklist_type !== 'return') return {};
    const bk = instance.bookings as (typeof instance.bookings & { staff_metadata?: { extras_returned?: string[] } }) | null;
    const returnedIds: string[] = bk?.staff_metadata?.extras_returned ?? [];
    return Object.fromEntries(returnedIds.map((id) => [id, true]));
  });
  const [evidencePhotos, setEvidencePhotos] = useState<{ general: EvidencePhoto[]; damage: EvidencePhoto[]; id: EvidencePhoto[] }>({
    general: [],
    damage: [],
    id: [],
  });
  // Always-current ref used by the online-event retry handler (avoids stale closure)
  const evidencePhotosRef = useRef(evidencePhotos);
  evidencePhotosRef.current = evidencePhotos;

  // ── Return km validation ──────────────────────────────────────────────────────
  const [returnKmError, setReturnKmError] = useState<string | null>(null);
  const lastSavedReturnKmRef = useRef<string>(
    instance.checklist_type === 'return'
      ? ((instance.bookings as any)?.staff_metadata?.return_vehicle_data?.km ?? '')
      : ''
  );

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

  const hasFocusedRef = useRef(false);
  const localInstanceRef = useRef(localInstance);
  // Tracks the latest known staff_metadata for the booking (return checklists only).
  // Used as the merge base when writing return_vehicle_data or extras_returned so
  // neither writer clobbers the other's changes.
  const staffMetaRef = useRef<Record<string, unknown>>(
    (instance.checklist_type === 'return' || instance.checklist_type === 'handover')
      ? ((instance.bookings as any)?.staff_metadata ?? {})
      : {}
  );

  useEffect(() => { localInstanceRef.current = localInstance; }, [localInstance]);
  useEffect(() => { setLocalItems(initialItems); }, [initialItems]);
  useEffect(() => { setLocalInstance(instance); }, [instance]);

  // ── Focus a specific item from the focusItem / itemId query param ────────────
  useEffect(() => {
    if (!focusItemId || hasFocusedRef.current || localItems.length === 0) return;
    hasFocusedRef.current = true;

    const item = localItems.find((it) => it.id === focusItemId);
    if (!item) return;

    // Ensure the section containing this item is expanded
    const sectionName = item.template.section?.trim() || t('sectionOther');
    setCollapsedSections((prev) => (prev[sectionName] ? { ...prev, [sectionName]: false } : prev));

    // Open notes so the issue description is immediately visible
    setOpenNotesById((prev) => ({ ...prev, [focusItemId]: true }));

    // If the item has a flag, open the flag detail panel too
    if (item.issue_flag) openFlagPanel(focusItemId);

    // Scroll into view after a short delay to let the section expand first
    setTimeout(() => {
      const el =
        document.getElementById(`check-${focusItemId}`) ??
        document.querySelector<HTMLElement>(`label[for="check-${focusItemId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  // openFlagPanel identity is stable; t and setters are stable — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId, localItems]);
  useEffect(() => {
    if (instance.checklist_type !== 'return' && instance.checklist_type !== 'handover') return;
    staffMetaRef.current = (instance.bookings as any)?.staff_metadata ?? {};

    // Accept both legacy plain-string paths and new { path, rotation } objects.
    type EvidenceEntry = string | { path: string; rotation?: number };
    const pathToStored = (entry: EvidenceEntry): EvidencePhoto => {
      const p = typeof entry === 'string' ? entry : entry.path;
      const rotation = typeof entry === 'string' ? 0 : (entry.rotation ?? 0);
      const { data } = supabase.storage.from('checklist-evidence').getPublicUrl(p);
      return { kind: 'stored', path: p, url: data.publicUrl, rotation };
    };

    if (instance.checklist_type === 'return') {
      const rvd = (instance.bookings as any)?.staff_metadata?.return_vehicle_data;
      setVehicleData({ km: rvd?.km ?? '', fuel: rvd?.fuel ?? '', adblue: rvd?.adblue ?? '' });
      lastSavedReturnKmRef.current = rvd?.km ?? '';
      const returnedIds: string[] = (instance.bookings as any)?.staff_metadata?.extras_returned ?? [];
      setExtrasChecked(Object.fromEntries(returnedIds.map((id: string) => [id, true])));
      const rep = (instance.bookings as any)?.staff_metadata?.return_evidence_photos as { general?: EvidenceEntry[]; damage?: EvidenceEntry[] } | undefined;
      setEvidencePhotos({
        general: (rep?.general ?? []).map(pathToStored),
        damage: (rep?.damage ?? []).map(pathToStored),
        id: [],
      });
    }

    if (instance.checklist_type === 'handover') {
      const hvd = (instance.bookings as any)?.staff_metadata?.handover_vehicle_data;
      setVehicleData({ km: hvd?.km ?? '', fuel: hvd?.fuel ?? '', adblue: hvd?.adblue ?? '' });
      const hep = (instance.bookings as any)?.staff_metadata?.handover_evidence_photos as { general?: EvidenceEntry[]; damage?: EvidenceEntry[]; id?: EvidenceEntry[] } | undefined;
      setEvidencePhotos({
        general: (hep?.general ?? []).map(pathToStored),
        damage: (hep?.damage ?? []).map(pathToStored),
        id: (hep?.id ?? []).map(pathToStored),
      });
    }
  }, [instance]);

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
    const totalPhotos = evidencePhotos.general.length + evidencePhotos.damage.length + evidencePhotos.id.length;
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
      (it) =>
        it.template.ui_section === 'checklist_actions' &&
        !it.checked &&
        getPickupAuditDisplayLabel(it.template.label) !== null
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
    instanceId: instance.id,
    vehicleId: instance.vehicle_id,
    checklistType: instance.checklist_type,
    bookingId: instance.booking_id,
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
    showReturnModal: (urgentItems, onConfirm) =>
      showHandoverSafetyModal(urgentItems, onConfirm, [], '', ''),
    navigateAfterCompletion,
    t,
  });

  // ── Page-load safety: sync instance status if items are already all-checked but status isn't completed (or vice versa) ──
  useEffect(() => {
    if (isChecklistLocked) return;
    if (initialItems.length === 0) return;
    const allChecked = initialItems.every((it) => it.checked);
    const alreadyComplete = instance.status === 'completed';
    if (allChecked === alreadyComplete) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      syncInstanceStatus(initialItems, user.id, initialItems, instance);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Safety modal handlers ─────────────────────────────────────────────────────

  const handleSafetyConfirm = async () => {
    const flaggedItems = handoverSafetyModal?.flaggedItems ?? [];
    setHandoverSafetyModal(null);

    // Clear the blocking gate for all checklist types. For return checklists this is required
    // because the DB rejects status:'completed' while issue_blocking=true rows exist.
    // Only issue_blocking is cleared — issue notes, severity, title, and description are preserved.
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

  // ── Return: promote to in_progress ───────────────────────────────────────────
  // Promotes the checklist status from pending/not_started → in_progress when
  // any meaningful return data is entered (vehicle intake, evidence, extras,
  // flags). Called explicitly from the return-only handlers below.

  const promoteReturnToInProgress = async () => {
    if (instance.checklist_type !== 'return') return;
    if (isChecklistLocked) return;
    const isPending = localInstance.status === 'pending' || localInstance.status === 'not_started';
    if (!isPending) return;
    const now = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();
    const statusUpdate = {
      status: 'in_progress',
      started_at: localInstance.started_at ?? now,
      started_by: localInstance.started_by ?? (user?.id ?? null),
    };
    setLocalInstance((prev) => ({ ...prev, ...statusUpdate }));
    await supabase.from('checklist_instances').update(statusUpdate).eq('id', instance.id);
  };

  // ── Return: save vehicle intake field into bookings.staff_metadata.return_vehicle_data ──
  const saveReturnVehicleField = async (field: 'km' | 'fuel' | 'adblue', value: string) => {
    if (instance.checklist_type !== 'return') return;
    if (!instance.booking_id) return;
    const currentRvd = (staffMetaRef.current as any)?.return_vehicle_data ?? {};
    const newRvd = { ...currentRvd, [field]: value || null };
    const newMeta = { ...staffMetaRef.current, return_vehicle_data: newRvd };
    staffMetaRef.current = newMeta;
    await supabase.from('bookings').update({ staff_metadata: newMeta }).eq('id', instance.booking_id);
    if (field === 'km' && value && instance.vehicle_id) {
      const kmNum = parseInt(value, 10);
      if (!isNaN(kmNum)) {
        await supabase.from('vehicles').update({ latest_odometer: kmNum }).eq('id', instance.vehicle_id);
      }
    }
  };

  type EvidencePhotoEntry = { path: string; rotation: number };
  const toEntry = (e: unknown): EvidencePhotoEntry =>
    typeof e === 'string'
      ? { path: e, rotation: 0 }
      : { path: (e as any).path, rotation: (e as any).rotation ?? 0 };
  const normalizeHep = (raw: any) => ({
    general: ((raw?.general ?? []) as unknown[]).map(toEntry),
    damage:  ((raw?.damage  ?? []) as unknown[]).map(toEntry),
    id:      ((raw?.id      ?? []) as unknown[]).map(toEntry),
  });
  const normalizeRep = (raw: any) => ({
    general: ((raw?.general ?? []) as unknown[]).map(toEntry),
    damage:  ((raw?.damage  ?? []) as unknown[]).map(toEntry),
  });

  // ── Return: save evidence photos into bookings.staff_metadata.return_evidence_photos ──
  const saveReturnEvidencePhotos = async (rep: { general: EvidencePhotoEntry[]; damage: EvidencePhotoEntry[] }) => {
    if (!instance.booking_id) return;
    const newMeta = { ...staffMetaRef.current, return_evidence_photos: rep };
    staffMetaRef.current = newMeta;
    await supabase.from('bookings').update({ staff_metadata: newMeta }).eq('id', instance.booking_id);
  };

  // ── Handover: save vehicle data into bookings.staff_metadata.handover_vehicle_data ──
  const saveHandoverVehicleField = async (field: 'km' | 'fuel' | 'adblue', value: string) => {
    if (instance.checklist_type !== 'handover') return;
    if (!instance.booking_id) return;
    const currentHvd = (staffMetaRef.current as any)?.handover_vehicle_data ?? {};
    const newHvd = { ...currentHvd, [field]: value || null };
    const newMeta = { ...staffMetaRef.current, handover_vehicle_data: newHvd };
    staffMetaRef.current = newMeta;
    await supabase.from('bookings').update({ staff_metadata: newMeta }).eq('id', instance.booking_id);
    if (field === 'km' && value && instance.vehicle_id) {
      const kmNum = parseInt(value, 10);
      if (!isNaN(kmNum)) {
        await supabase.from('vehicles').update({ latest_odometer: kmNum }).eq('id', instance.vehicle_id);
      }
    }
  };

  // ── Handover: save evidence photos into bookings.staff_metadata.handover_evidence_photos ──
  const saveHandoverEvidencePhotos = async (rep: { general: EvidencePhotoEntry[]; damage: EvidencePhotoEntry[]; id: EvidencePhotoEntry[] }) => {
    if (!instance.booking_id) return;
    const newMeta = { ...staffMetaRef.current, handover_evidence_photos: rep };
    staffMetaRef.current = newMeta;
    await supabase.from('bookings').update({ staff_metadata: newMeta }).eq('id', instance.booking_id);
  };

  // ── Compress an image file before upload (canvas-based, JPEG, max 1800px) ──────
  const compressImage = (file: File): Promise<File> =>
    new Promise((resolve) => {
      const MAX_DIM = 1800;
      const QUALITY = 0.82;
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width <= MAX_DIM && height <= MAX_DIM) {
          resolve(file);
          return;
        }
        if (width > height) {
          height = Math.round((height / width) * MAX_DIM);
          width = MAX_DIM;
        } else {
          width = Math.round((width / height) * MAX_DIM);
          height = MAX_DIM;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          QUALITY,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });

  // ── Upload a single evidence photo to Supabase Storage ────────────────────────
  // Path shape: {company_id}/{booking_number}_{customer_surname}/{checklist_type}/{group}/{timestamp}_{random}.jpg
  const uploadEvidencePhoto = async (
    file: File,
    group: 'general' | 'damage' | 'id',
  ): Promise<{ path: string; url: string }> => {
    const compressed = await compressImage(file).catch(() => file);
    const companyId = (instance.bookings as any)?.company_id;
    const bookingId = instance.booking_id;
    if (!companyId) throw new Error('uploadEvidencePhoto: company_id is missing from booking');
    if (!bookingId) throw new Error('uploadEvidencePhoto: booking_id is missing from checklist instance');
    const bookingCode = instance.bookings?.booking_number ?? '';
    const customerSurname = instance.bookings?.customer_name
      ? (instance.bookings.customer_name.trim().split(/\s+/).pop() ?? '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
      : '';
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const path = `${companyId}/${bookingCode}_${customerSurname}/${instance.checklist_type}/${group}/${unique}.jpg`;
    const { error } = await supabase.storage
      .from('checklist-evidence')
      .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      console.error('uploadEvidencePhoto: storage upload failed', { path, group, error });
      setSyncError(parseSyncError(error, 'item_update_failed'));
      throw error;
    }
    const { data } = supabase.storage.from('checklist-evidence').getPublicUrl(path);
    return { path, url: data.publicUrl };
  };

  // ── Retry a single failed evidence photo upload ───────────────────────────────
  const retryEvidencePhoto = async (group: 'general' | 'damage' | 'id', file: File) => {
    setEvidencePhotos((prev) => ({
      ...prev,
      [group]: prev[group].map((p) =>
        p.kind === 'failed' && p.file === file ? { kind: 'new' as const, file } : p
      ),
    }));
    try {
      const result = await uploadEvidencePhoto(file, group);
      setEvidencePhotos((prev) => ({
        ...prev,
        [group]: prev[group].map((p) =>
          p.kind === 'new' && p.file === file
            ? { kind: 'stored' as const, path: result.path, url: result.url, rotation: 0 }
            : p
        ),
      }));
      if (instance.checklist_type === 'handover') {
        const norm = normalizeHep((staffMetaRef.current as any)?.handover_evidence_photos);
        const newRep = { ...norm, [group]: [...norm[group as keyof typeof norm], { path: result.path, rotation: 0 }] };
        await saveHandoverEvidencePhotos(newRep);
      } else if (instance.checklist_type === 'return') {
        const norm = normalizeRep((staffMetaRef.current as any)?.return_evidence_photos);
        const newRep = { ...norm, [group]: [...norm[group as keyof typeof norm], { path: result.path, rotation: 0 }] };
        await saveReturnEvidencePhotos(newRep);
      }
    } catch {
      setEvidencePhotos((prev) => ({
        ...prev,
        [group]: prev[group].map((p) =>
          p.kind === 'new' && p.file === file ? { kind: 'failed' as const, file } : p
        ),
      }));
    }
  };

  // Auto-retry all failed evidence photos when the browser comes back online
  useEffect(() => {
    const handleOnline = () => {
      const current = evidencePhotosRef.current;
      for (const group of ['general', 'damage', 'id'] as const) {
        current[group].forEach((p) => {
          if (p.kind === 'failed') retryEvidencePhoto(group, p.file);
        });
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Return extras ─────────────────────────────────────────────────────────────
  const returnExtras = (() => {
    if (instance.checklist_type !== 'return') return [];
    const bookings = instance.bookings as (typeof instance.bookings & {
      staff_metadata?: { extras?: string[] };
      company_settings?: { extras_catalog?: { id: string; name: string; name_i18n?: { en: string; de: string; sk: string } }[] };
    }) | null;
    const rawExtras = bookings?.staff_metadata?.extras;
    const selectedIds: string[] = Array.isArray(rawExtras) ? rawExtras : [];
    const catalog: { id: string; name: string; name_i18n?: { en: string; de: string; sk: string } }[] = bookings?.company_settings?.extras_catalog ?? [];
    return selectedIds
      .map((id) => catalog.find((e) => e.id === id))
      .filter((e): e is { id: string; name: string; name_i18n?: { en: string; de: string; sk: string } } => e !== undefined);
  })();

  const sortedItems = [...localItems].sort((a, b) => a.template.sort_order - b.template.sort_order);
  const sectionMap = new Map<string, ChecklistItemType[]>();
  for (const item of sortedItems) {
    const sectionName = item.template.section?.trim() || t('sectionOther');
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
    sectionMap.get(sectionName)!.push(item);
  }
  const sections: { name: string; items: ChecklistItemType[] }[] = [];
  sectionMap.forEach((items, name) => sections.push({ name, items }));

  const checklistActionsSections: { name: string; items: ChecklistItemType[] }[] = (() => {
    const filtered = sortedItems.filter((item) => item.template.ui_section === 'checklist_actions');
    const map = new Map<string, ChecklistItemType[]>();
    for (const item of filtered) {
      const name = item.template.section?.trim() || t('sectionOther');
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(item);
    }
    const result: { name: string; items: ChecklistItemType[] }[] = [];
    map.forEach((items, name) => result.push({ name, items }));
    return result;
  })();

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

  const backHref =
    from === 'booking' && instance.booking_id
      ? `/${locale}/staff/bookings/${instance.booking_id}`
      : from === 'vehicle' && instance.vehicle_id
      ? `/${locale}/staff/vehicles/${instance.vehicle_id}`
      : `/${locale}/staff/checklists?scope=${listScope}&status=${listStatus}`;

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
    onSaveFlag: () => { handleSaveFlag(item.id); promoteReturnToInProgress(); },
    onNotesChange: (value: string) => handleNotesChange(item.id, value),
    onNotesBlur: (value: string) => handleNotesBlur(item.id, value),
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
      {/* Transient highlight for deep-linked item — fades out after ~2.5 s */}
      {focusItemId && (
        <style>{`
          @keyframes _cf_focus_pulse {
            0%   { box-shadow: 0 0 0 3px rgb(var(--brand) / 0.5); }
            60%  { box-shadow: 0 0 0 4px rgb(var(--brand) / 0.18); }
            100% { box-shadow: none; }
          }
          div:has(> div > label[for="check-${focusItemId}"]) {
            animation: _cf_focus_pulse 2.5s ease-out 0.3s both;
            border-color: rgb(var(--brand) / 0.5) !important;
            transition: border-color 0.2s;
          }
        `}</style>
      )}
      <BackLink href={backHref}>{backButtonLabel}</BackLink>
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
                onChange={(field, value) => {
                  setVehicleData((prev) => ({ ...prev, [field]: value }));
                  saveHandoverVehicleField(field as 'km' | 'fuel' | 'adblue', value);
                }}
                isLocked={isChecklistLocked}
                highlight={validationHighlights.missingVehicleData}
                fuelOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'Fuel level')?.template.options ?? undefined}
                adblueOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'AdBlue level')?.template.options ?? undefined}
              />
              <EvidenceBlock
                evidencePhotos={evidencePhotos}
                onAdd={async (group, files) => {
                  // Optimistically show new photos while uploading
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: [...prev[group], ...files.map((f) => ({ kind: 'new' as const, file: f }))],
                  }));
                  const results = await Promise.allSettled(files.map((f) => uploadEvidencePhoto(f, group)));
                  const succeeded: Array<{ file: File; path: string; url: string }> = [];
                  const failedFiles: File[] = [];
                  results.forEach((r, i) => {
                    if (r.status === 'fulfilled') succeeded.push({ file: files[i], ...r.value });
                    else failedFiles.push(files[i]);
                  });
                  // Swap 'new' → 'stored' on success, 'new' → 'failed' on failure (keep preview)
                  setEvidencePhotos((prev) => {
                    const next = prev[group].map((p) => {
                      if (p.kind !== 'new') return p;
                      const s = succeeded.find((r) => r.file === p.file);
                      if (s) return { kind: 'stored' as const, path: s.path, url: s.url, rotation: 0 };
                      if (failedFiles.includes(p.file)) return { kind: 'failed' as const, file: p.file };
                      return p;
                    });
                    return { ...prev, [group]: next };
                  });
                  if (succeeded.length > 0) {
                    const norm = normalizeHep((staffMetaRef.current as any)?.handover_evidence_photos);
                    const newRep = { ...norm, [group]: [...norm[group as keyof typeof norm], ...succeeded.map((s) => ({ path: s.path, rotation: 0 }))] };
                    await saveHandoverEvidencePhotos(newRep);
                  }
                }}
                onRetry={(group, idx) => {
                  const photo = evidencePhotos[group][idx];
                  if (photo?.kind === 'failed') retryEvidencePhoto(group, photo.file);
                }}
                onRemove={async (group, index) => {
                  const photo = evidencePhotos[group][index];
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: prev[group].filter((_, i) => i !== index),
                  }));
                  if (photo?.kind === 'stored') {
                    const norm = normalizeHep((staffMetaRef.current as any)?.handover_evidence_photos);
                    const newRep = { ...norm, [group]: norm[group as keyof typeof norm].filter((e) => e.path !== photo.path) };
                    await saveHandoverEvidencePhotos(newRep);
                    supabase.storage.from('checklist-evidence').remove([photo.path]).catch(() => {});
                  }
                }}
                onRotate={async (group, index, rotation) => {
                  const photo = evidencePhotos[group][index];
                  if (photo?.kind !== 'stored') return;
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: prev[group].map((p, i) =>
                      i === index && p.kind === 'stored' ? { ...p, rotation } : p
                    ),
                  }));
                  const norm = normalizeHep((staffMetaRef.current as any)?.handover_evidence_photos);
                  const newRep = { ...norm, [group]: norm[group as keyof typeof norm].map((e) => e.path === photo.path ? { ...e, rotation } : e) };
                  await saveHandoverEvidencePhotos(newRep);
                }}
                isLocked={isChecklistLocked}
                highlight={validationHighlights.missingPhotos}
              />
              <AuditChecklistBlock
                sections={checklistActionsSections}
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
          <PhaseSummaryStrip
            introText="This return follows three phases: inspection, condition & evidence, and final close-out."
            phaseLabels={['Inspection', 'Condition & Evidence', 'Close-out']}
          />

          {/* Phase 1: Inspection */}
          <PhaseCard phase={1} label="Inspection / Vehicle intake">
            <div style={{ padding: '16px' }}>
              <VehicleDataBlock
                vehicleData={vehicleData}
                onChange={(field, value) => {
                  setVehicleData((prev) => ({ ...prev, [field]: value }));
                  if (field === 'km') {
                    const retKm = value !== '' ? parseFloat(value) : NaN;
                    const hvdKmStr: string = (instance.bookings as any)?.staff_metadata?.handover_vehicle_data?.km ?? '';
                    const hvdKm = hvdKmStr !== '' ? parseFloat(hvdKmStr) : NaN;
                    if (!isNaN(retKm) && !isNaN(hvdKm) && retKm < hvdKm) {
                      setReturnKmError(t('returnKmBelowHandover', { handoverKm: hvdKm }));
                      return;
                    }
                    setReturnKmError(null);
                    if (!isNaN(retKm) && !isNaN(hvdKm) && (retKm - hvdKm) > 10000) {
                      return; // defer save to onKmBlur confirm
                    }
                    saveReturnVehicleField('km', value);
                    lastSavedReturnKmRef.current = value;
                    promoteReturnToInProgress();
                    return;
                  }
                  saveReturnVehicleField(field as 'km' | 'fuel' | 'adblue', value);
                  promoteReturnToInProgress();
                }}
                onKmBlur={() => {
                  const retKm = vehicleData.km !== '' ? parseFloat(vehicleData.km) : NaN;
                  const hvdKmStr: string = (instance.bookings as any)?.staff_metadata?.handover_vehicle_data?.km ?? '';
                  const hvdKm = hvdKmStr !== '' ? parseFloat(hvdKmStr) : NaN;
                  if (!isNaN(retKm) && !isNaN(hvdKm) && retKm < hvdKm) {
                    setVehicleData((prev) => ({ ...prev, km: lastSavedReturnKmRef.current }));
                    return;
                  }
                  setReturnKmError(null);
                  if (!isNaN(retKm) && !isNaN(hvdKm) && retKm >= hvdKm && (retKm - hvdKm) > 10000) {
                    const confirmed = window.confirm(
                      t('returnKmHighJumpConfirm', { returnKm: retKm, handoverKm: hvdKm, diff: Math.round(retKm - hvdKm) })
                    );
                    if (!confirmed) {
                      setVehicleData((prev) => ({ ...prev, km: lastSavedReturnKmRef.current }));
                      return;
                    }
                    saveReturnVehicleField('km', vehicleData.km);
                    lastSavedReturnKmRef.current = vehicleData.km;
                    promoteReturnToInProgress();
                  }
                }}
                kmError={returnKmError ?? undefined}
                isLocked={isChecklistLocked}
                highlight={false}
                fuelOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'Fuel level')?.template.options ?? undefined}
                adblueOptions={localItems.find((i) => i.template.ui_section === 'vehicle_data' && i.template.label === 'AdBlue level')?.template.options ?? undefined}
                handoverKm={(instance.bookings as any)?.staff_metadata?.handover_vehicle_data?.km ?? ''}
              />
            </div>
          </PhaseCard>

          {/* Phase 2: Condition & Evidence */}
          <PhaseCard phase={2} label="Condition & Evidence">
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <EvidenceBlock
                evidencePhotos={evidencePhotos}
                onAdd={async (group, files) => {
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: [...prev[group], ...files.map((f) => ({ kind: 'new' as const, file: f }))],
                  }));
                  promoteReturnToInProgress();
                  const results = await Promise.allSettled(files.map((f) => uploadEvidencePhoto(f, group)));
                  const succeeded: Array<{ file: File; path: string; url: string }> = [];
                  const failedFiles: File[] = [];
                  results.forEach((r, i) => {
                    if (r.status === 'fulfilled') succeeded.push({ file: files[i], ...r.value });
                    else failedFiles.push(files[i]);
                  });
                  // Swap 'new' → 'stored' on success, 'new' → 'failed' on failure (keep preview)
                  setEvidencePhotos((prev) => {
                    const next = prev[group].map((p) => {
                      if (p.kind !== 'new') return p;
                      const s = succeeded.find((r) => r.file === p.file);
                      if (s) return { kind: 'stored' as const, path: s.path, url: s.url, rotation: 0 };
                      if (failedFiles.includes(p.file)) return { kind: 'failed' as const, file: p.file };
                      return p;
                    });
                    return { ...prev, [group]: next };
                  });
                  if (succeeded.length > 0) {
                    const norm = normalizeRep((staffMetaRef.current as any)?.return_evidence_photos);
                    const newRep = { ...norm, [group]: [...norm[group as keyof typeof norm], ...succeeded.map((s) => ({ path: s.path, rotation: 0 }))] };
                    await saveReturnEvidencePhotos(newRep);
                  }
                }}
                onRetry={(group, idx) => {
                  const photo = evidencePhotos[group][idx];
                  if (photo?.kind === 'failed') retryEvidencePhoto(group, photo.file);
                }}
                onRemove={async (group, index) => {
                  const photo = evidencePhotos[group][index];
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: prev[group].filter((_, i) => i !== index),
                  }));
                  promoteReturnToInProgress();
                  if (photo?.kind === 'stored') {
                    const norm = normalizeRep((staffMetaRef.current as any)?.return_evidence_photos);
                    const newRep = { ...norm, [group]: norm[group as keyof typeof norm].filter((e) => e.path !== photo.path) };
                    await saveReturnEvidencePhotos(newRep);
                    supabase.storage.from('checklist-evidence').remove([photo.path]).catch(() => {});
                  }
                }}
                onRotate={async (group, index, rotation) => {
                  const photo = evidencePhotos[group][index];
                  if (photo?.kind !== 'stored') return;
                  setEvidencePhotos((prev) => ({
                    ...prev,
                    [group]: prev[group].map((p, i) =>
                      i === index && p.kind === 'stored' ? { ...p, rotation } : p
                    ),
                  }));
                  const norm = normalizeRep((staffMetaRef.current as any)?.return_evidence_photos);
                  const newRep = { ...norm, [group]: norm[group as keyof typeof norm].map((e) => e.path === photo.path ? { ...e, rotation } : e) };
                  await saveReturnEvidencePhotos(newRep);
                }}
                isLocked={isChecklistLocked}
                highlight={false}
                variant="return"
              />
              <AuditChecklistBlock
                sections={checklistActionsSections}
                isChecklistLocked={isChecklistLocked}
                collapsedSections={collapsedSections}
                onToggleSection={toggleSection}
                onCompleteSection={handleCompleteSection}
                renderItemProps={renderItemProps}
                getDisplayLabel={getReturnAuditDisplayLabel}
                highlight={false}
                footerContent={returnExtras.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'rgb(var(--text))' }}>
                      Extras returned
                    </span>
                    {returnExtras.map((extra) => (
                      <div
                        key={extra.id}
                        style={{
                          border: '1px solid rgb(var(--border))',
                          borderRadius: '6px',
                          padding: '12px',
                          opacity: isChecklistLocked ? 0.75 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <label
                            htmlFor={isChecklistLocked ? undefined : `extras-check-${extra.id}`}
                            style={{
                              marginTop: '2px',
                              cursor: isChecklistLocked ? 'default' : 'pointer',
                              flexShrink: 0,
                              position: 'relative',
                              display: 'block',
                            }}
                          >
                            {!isChecklistLocked && (
                              <input
                                type="checkbox"
                                id={`extras-check-${extra.id}`}
                                checked={!!extrasChecked[extra.id]}
                                onChange={() => {
                                  const next = { ...extrasChecked, [extra.id]: !extrasChecked[extra.id] };
                                  setExtrasChecked(next);
                                  promoteReturnToInProgress();
                                  if (instance.booking_id) {
                                    const returnedIds = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
                                    const newMeta = { ...staffMetaRef.current, extras_returned: returnedIds };
                                    staffMetaRef.current = newMeta;
                                    supabase.from('bookings').update({ staff_metadata: newMeta }).eq('id', instance.booking_id);
                                  }
                                }}
                                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                              />
                            )}
                            <div
                              style={{
                                width: '20px',
                                height: '20px',
                                border: extrasChecked[extra.id]
                                  ? '2px solid rgb(var(--brand))'
                                  : '2px solid rgb(var(--border))',
                                borderRadius: '4px',
                                backgroundColor: 'rgb(var(--surface))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {extrasChecked[extra.id] && (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                          <span style={{ fontWeight: 500, marginTop: '2px' }}>
                            {(extra.name_i18n as Record<string, string> | undefined)?.[locale] || extra.name_i18n?.sk || extra.name} returned
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : undefined}
              />
            </div>
          </PhaseCard>

          {/* Phase 3: Close-out */}
          <PhaseCard phase={3} label="Close-out">
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
        isReturn={instance.checklist_type === 'return'}
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
