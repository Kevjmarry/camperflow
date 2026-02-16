'use client';

import { useState, useEffect } from 'react';
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
  const [initials, setInitials] = useState<string>('');
  const [openNotesById, setOpenNotesById] = useState<Record<string, boolean>>({});

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
        const firstInitial = profile.first_name?.charAt(0)?.toUpperCase() || '';
        const lastInitial = profile.last_name?.charAt(0)?.toUpperCase() || '';
        setInitials(firstInitial + lastInitial);
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

    const anyChecked = nextItems.some((it) => it.checked);
    const allChecked = nextItems.every((it) => it.checked);

    let newStatus = 'not_started';
    if (allChecked) {
      newStatus = 'completed';
    } else if (anyChecked) {
      newStatus = 'in_progress';
    }

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

  const sortedItems = [...localItems].sort(
    (a, b) => a.template.sort_order - b.template.sort_order
  );

  const backButtonLabel = from === 'booking' && instance.booking_id ? 'Back to booking' : 'Back to checklists';
  const checklistTitle = CHECKLIST_TYPE_LABELS[instance.checklist_type] || 'Checklist';

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
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z"
                  fill="rgb(var(--brand))"
                />
              </svg>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                Checklist completed
              </span>
            </div>
            {instance.booking_id && (
              <button
                onClick={handleGoToBooking}
                className="btn btn-primary"
                style={{
                  padding: '6px 14px',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Go to booking
              </button>
            )}
          </div>
        </div>
      )}

      {/* Checklist Items */}
      <div className="surface" style={{ borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sortedItems.map((item) => {
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
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <label htmlFor={`check-${item.id}`} className="label" style={{ fontWeight: 500, cursor: 'pointer', margin: 0 }}>
                          {item.template.label}
                        </label>
                        {item.checked && item.checked_by && userId && item.checked_by === userId && initials && (
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
                            {initials}
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
          })}
        </div>
      </div>
    </PageContainer>
  );
}