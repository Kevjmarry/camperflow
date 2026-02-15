'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    if (typeof document !== 'undefined' && document.referrer.includes('/staff/checklists')) {
      router.back();
    } else {
      router.push(`/${locale}/staff/checklists?type=cleaning&range=today`);
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

  return (
    <PageContainer>
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={handleBackClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#4B5563',
            textDecoration: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <span>←</span>
          Back to Checklists
        </button>
      </div>

      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          padding: '24px',
        }}
      >
        <div
          style={{
            marginBottom: '24px',
            borderBottom: '1px solid #E5E7EB',
            paddingBottom: '16px',
          }}
        >
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            {instance.checklist_type === 'handover' ? 'Handover' : 'Return'} Checklist
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280' }}>
            {instance.bookings
              ? `${instance.bookings.booking_number} – ${instance.bookings.customer_name}`
              : 'No booking linked'}
          </p>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#6B7280' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor:
                  localStatus === 'completed'
                    ? '#D1FAE5'
                    : localStatus === 'in_progress'
                      ? '#DBEAFE'
                      : '#F3F4F6',
                color:
                  localStatus === 'completed'
                    ? '#065F46'
                    : localStatus === 'in_progress'
                      ? '#1E40AF'
                      : '#374151',
              }}
            >
              {localStatus}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sortedItems.map((item) => {
            return (
              <div
                key={item.id}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <label htmlFor={`check-${item.id}`} style={{ marginTop: '4px', cursor: 'pointer', flexShrink: 0, position: 'relative', display: 'block' }}>
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
                        border: item.checked ? '2px solid rgb(var(--brand))' : '2px solid #D1D5DB',
                        borderRadius: '4px',
                        backgroundColor: '#FFFFFF',
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <label htmlFor={`check-${item.id}`} style={{ fontWeight: 500, cursor: 'pointer' }}>
                          {item.template.label}
                        </label>
                        {item.checked && item.checked_by && userId && item.checked_by === userId && initials && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              backgroundColor: '#F3F4F6',
                              color: '#6B7280',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            {initials}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => toggleNotes(item.id)}
                          style={{
                            fontSize: '13px',
                            color: '#2563EB',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            textDecoration: 'underline',
                          }}
                        >
                          {item.notes ? 'Edit note' : 'Add note'}
                        </button>
                      </div>
                    </div>

                    {!openNotesById[item.id] && item.notes && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '13px',
                          color: '#6B7280',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
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
                        style={{
                          marginTop: '8px',
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          resize: 'vertical',
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