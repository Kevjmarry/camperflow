'use client';

import { useState, useOptimistic } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';

interface ChecklistItem {
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
}

interface ChecklistInstance {
  id: string;
  booking_id: string | null;
  checklist_type: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  bookings: {
    id: string;
    booking_number: string;
    customer_name: string;
  } | null;
  vehicles?: {
    id: string;
    license_plate: string;
    model: string;
  } | null;
}

interface ChecklistDetailClientProps {
  instance: ChecklistInstance;
  items: ChecklistItem[];
  locale: string;
}

export default function ChecklistDetailClient({
  instance,
  items,
  locale,
}: ChecklistDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  const [optimisticItems, setOptimisticItems] = useOptimistic(
    items,
    (state, { itemId, checked }: { itemId: string; checked: boolean }) => {
      return state.map((item) =>
        item.id === itemId ? { ...item, checked } : item
      );
    }
  );

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
    setError(null);
    const newChecked = !currentChecked;

    // Optimistic update
    setOptimisticItems({ itemId, checked: newChecked });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update the checklist item
      const { error: updateError } = await supabase
        .from('checklist_instance_items')
        .update({
          checked: newChecked,
          checked_at: newChecked ? new Date().toISOString() : null,
          checked_by: newChecked ? user.id : null,
        })
        .eq('id', itemId);

      if (updateError) throw updateError;

      // Compute new status from optimistic items
      const updatedItems = optimisticItems.map((item) =>
        item.id === itemId ? { ...item, checked: newChecked } : item
      );
      const totalItems = updatedItems.length;
      const checkedCount = updatedItems.filter((item) => item.checked).length;

      let newStatus: string;
      if (checkedCount === 0) newStatus = 'not_started';
      else if (checkedCount === totalItems) newStatus = 'completed';
      else newStatus = 'in_progress';

      // Update instance status
      const { error: statusError } = await supabase
        .from('checklist_instances')
        .update({
          status: newStatus,
          completed_at:
            newStatus === 'completed' ? new Date().toISOString() : null,
          completed_by: newStatus === 'completed' ? user.id : null,
        })
        .eq('id', instance.id);

      if (statusError) throw statusError;

      router.refresh();
    } catch (err) {
      console.error('Error toggling checklist item:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to update checklist item'
      );
      router.refresh();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'rgb(var(--success))';
      case 'in_progress':
        return 'rgb(var(--warning))';
      case 'not_started':
        return 'rgb(var(--muted))';
      default:
        return 'rgb(var(--muted))';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'not_started':
        return 'Not Started';
      default:
        return status;
    }
  };

  return (
    <PageContainer maxWidth="800px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {instance.booking_id && instance.bookings && (
            <Link
              href={`/${locale}/staff/bookings/${instance.booking_id}`}
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              ← Back to booking {instance.bookings.booking_number}
            </Link>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))', margin: 0 }}>
                {instance.checklist_type.replace(/_/g, ' ').toUpperCase()} Checklist
              </h1>

              <span
                style={{
                  display: 'inline-block',
                  padding: 'var(--space-1) var(--space-3)',
                  borderRadius: 'var(--radius)',
                  background: `${getStatusColor(instance.status)}15`,
                  color: getStatusColor(instance.status),
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {getStatusLabel(instance.status)}
              </span>
            </div>

            {instance.bookings && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: '14px', color: 'rgb(var(--muted))' }}>
                Booking: {instance.bookings.booking_number} • {instance.bookings.customer_name}
              </div>
            )}

            {instance.vehicles && (
              <div style={{ marginTop: 'var(--space-1)', fontSize: '14px', color: 'rgb(var(--muted))' }}>
                Vehicle: {instance.vehicles.license_plate} • {instance.vehicles.model}
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: 'var(--space-4)',
                background: 'rgb(var(--error) / 0.1)',
                border: '1px solid rgb(var(--error) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--error))',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          <div>
            <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
              Checklist Items
            </h2>

            {optimisticItems.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: 'rgb(var(--border) / 0.3)',
                  borderRadius: 'var(--radius)',
                  color: 'rgb(var(--muted))',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              >
                No items in this checklist
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {optimisticItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleToggle(item.id, item.checked)}
                    style={{
                      padding: 'var(--space-4)',
                      background: 'rgb(var(--border) / 0.3)',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-3)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        border: `2px solid ${
                          item.checked ? 'rgb(var(--success))' : 'rgb(var(--border))'
                        }`,
                        background: item.checked ? 'rgb(var(--success))' : 'transparent',
                        flexShrink: 0,
                        marginTop: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.checked && (
                        <span style={{ color: 'white', fontSize: '14px', fontWeight: 'bold' }}>✓</span>
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 500,
                          color: 'rgb(var(--text))',
                          textDecoration: item.checked ? 'line-through' : 'none',
                          opacity: item.checked ? 0.6 : 1,
                        }}
                      >
                        {item.template.label}
                      </div>

                      {item.notes && (
                        <div
                          style={{
                            fontSize: '14px',
                            color: 'rgb(var(--muted))',
                            marginTop: 'var(--space-2)',
                            fontStyle: 'italic',
                          }}
                        >
                          Note: {item.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 'var(--space-6)', fontSize: '14px', color: 'rgb(var(--muted))' }}>
              {optimisticItems.filter((i) => i.checked).length} of {optimisticItems.length} items completed
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}