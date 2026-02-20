'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

const CHECKLIST_TYPE_LABELS: Record<string, string> = {
  pickup: 'Pickup checklist',
  return: 'Return checklist',
  cleaning: 'Cleaning checklist',
  guest_prereturn: 'Guest pre-return checklist',
  vehicle_readiness: 'Vehicle readiness checklist',
};

export default function ChecklistDetailClient({
  instance,
  items: initialItems,
  locale,
}: {
  instance: ChecklistInstanceType;
  items: ChecklistItemType[];
  locale: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const supabase = createClient();
  const [localItems, setLocalItems] = useState(initialItems);
  const [localStatus, setLocalStatus] = useState(instance.status);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [openNotesById, setOpenNotesById] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // Map of auth_user_id -> initials string
  const [initialsByUserId, setInitialsByUserId] = useState<Record<string, string>>({});

  // Fetch initials for a set of user ids not yet in the map
  const fetchInitialsForUsers = useCallback(
    async (userIds: string[]) => {
      if (userIds.length === 0) return;

      const query = supabase
        .from('staff_profiles')
        .select('auth_user_id,first_name,last_name')
        .in('auth_user_id', userIds);

      // Scope to company if we have it
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

  // Whenever localItems change, look for checked_by ids we haven't fetched yet
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

  const computeStatus = (items: ChecklistItemType[]) => {
    const anyChecked = items.some((it) => it.checked);
    const allChecked = items.every((it) => it.checked);
    if (allChecked) return 'completed';
    if (anyChecked) return 'in_progress';
    return 'not_started';
  };

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const newChecked = !currentChecked;

    const nextItems = localItems.map((it) =>
      it.id === itemId
        ? {
            ...it,
            checked: newChecked,
            checked_at: newChecked ? new Date().toISOString() : null,
            checked_by: newChecked ? user.id : null,
          }
        : it
    );

    const newStatus = computeStatus(nextItems);
    const oldStatus = localStatus;

    setLocalItems(nextItems);
    setLocalStatus(newStatus);

    try {
      const { error: itemError } = await supabase
        .from('checklist_instance_items')
        .update({
          checked: newChecked,
          checked_at: newChecked ? new Date().toISOString() : null,
          checked_by: newChecked ? user.id : null,
        })
        .eq('id', itemId);

      if (itemError) throw itemError;

      const updatePayload: any = { status: newStatus };

      if (newStatus === 'in_progress' && oldStatus === 'not_started') {
        updatePayload.started_at = new Date().toISOString();
        updatePayload.started_by = user.id;
      }

      if (newStatus === 'completed' && oldStatus !== 'completed') {
        updatePayload.completed_at = new Date().toISOString();
        updatePayload.completed_by = user.id;
      }

      if (oldStatus === 'completed' && newStatus !== 'completed') {
        updatePayload.completed_at = null;
        updatePayload.completed_by = null;
      }

      const { error: instanceError } = await supabase
        .from('checklist_instances')
        .update(updatePayload)
        .eq('id', instance.id);

      if (instanceError) throw instanceError;
    } catch (err) {
      console.error('Error updating checklist:', err);
      setLocalItems(initialItems);
      setLocalStatus(instance.status);
      router.refresh();
    }
  };

  const handleCompleteSection = async (sectionName: string, sectionItems: ChecklistItemType[]) => {
    const uncheckedItems = sectionItems.filter((it) => !it.checked);
    if (uncheckedItems.length === 0) return;

    const confirmed = confirm(`Mark all items in "${sectionName}" as complete?`);
    if (!confirmed) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date().toISOString();
    const uncheckedIds = uncheckedItems.map((it) => it.id);

    const nextItems = localItems.map((it) =>
      uncheckedIds.includes(it.id)
        ? { ...it, checked: true, checked_at: now, checked_by: user.id }
        : it
    );

    const newStatus = computeStatus(nextItems);
    const oldStatus = localStatus;

    setLocalItems(nextItems);
    setLocalStatus(newStatus);

    try {
      const { error: itemError } = await supabase
        .from('checklist_instance_items')
        .update({ checked: true, checked_at: now, checked_by: user.id })
        .in('id', uncheckedIds);

      if (itemError) throw itemError;

      const updatePayload: any = { status: newStatus };

      if (newStatus === 'in_progress' && oldStatus === 'not_started') {
        updatePayload.started_at = now;
        updatePayload.started_by = user.id;
      }

      if (newStatus === 'completed' && oldStatus !== 'completed') {
        updatePayload.completed_at = now;
        updatePayload.completed_by = user.id;
      }

      const { error: instanceError } = await supabase
        .from('checklist_instances')
        .update(updatePayload)
        .eq('id', instance.id);

      if (instanceError) throw instanceError;
    } catch (err) {
      console.error('Error completing section:', err);
      setLocalItems(initialItems);
      setLocalStatus(instance.status);
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
    setOpenNotesById((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  const sortedItems = [...localItems].sort(
    (a, b) => a.template.sort_order - b.template.sort_order
  );

  // Group items by section
  const sections: { name: string; items: ChecklistItemType[] }[] = [];
  const sectionMap = new Map<string, ChecklistItemType[]>();

  for (const item of sortedItems) {
    const sectionName = item.template.section ?? 'Other';
    if (!sectionMap.has(sectionName)) {
      sectionMap.set(sectionName, []);
    }
    sectionMap.get(sectionName)!.push(item);
  }

  sectionMap.forEach((items, name) => {
    sections.push({ name, items });
  });

  const backButtonLabel = from === 'booking' && instance.booking_id ? 'Back to booking' : 'Back to checklists';
  const checklistTitle = CHECKLIST_TYPE_LABELS[instance.checklist_type] || 'Checklist';

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
          <label htmlFor={`check-${item.id}`} style={{ marginTop: '2px', cursor: 'pointer', flexShrink: 0, position: 'relative', display: 'block' }}>
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
                border: item.checked ? '2px solid rgb(var(--brand))' : '2px solid rgb(var(--border))',
                borderRadius: '4px',
                backgroundColor: 'rgb(var(--surface))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.checked && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="rgb(var(--brand))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                <label htmlFor={`check-${item.id}`} className="label" style={{ fontWeight: 500, cursor: 'pointer', margin: 0 }}>
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
                {item.notes ? 'Edit note' : 'Add note'}
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
                placeholder="Notes..."
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
    <PageContainer>
      {/* Header Card */}
      <div className="surface" style={{ borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
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
            <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px', color: 'rgb(var(--text))' }}>
              {checklistTitle}
            </h1>
            <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>
              {instance.bookings
                ? `${instance.bookings.booking_number} – ${instance.bookings.customer_name}`
                : 'No booking linked'}
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
              {localStatus === 'not_started' ? 'Not started' : localStatus === 'in_progress' ? 'In progress' : 'Completed'}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Success Notice */}
      {localStatus === 'completed' && (
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
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="rgb(var(--brand))" />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                Checklist completed
              </span>
            </div>
            {instance.booking_id && (
              <button
                onClick={handleGoToBooking}
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: '14px', fontWeight: 500 }}
              >
                Go to booking
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
            <div key={name} className="surface" style={{ borderRadius: '8px', overflow: 'hidden' }}>
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
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'rgb(var(--text))' }}>
                    {name}
                  </span>
                  <span style={{ fontSize: '13px', color: allDone ? 'rgb(var(--brand))' : 'rgb(var(--muted))', flexShrink: 0 }}>
                    {completedCount}/{totalCount} completed
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
                    Complete section
                  </button>
                )}
              </div>

              {/* Section Items */}
              {!isCollapsed && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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