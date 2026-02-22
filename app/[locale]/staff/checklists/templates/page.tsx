'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';

type TemplateScope = 'booking' | 'vehicle';
type BookingType = 'pickup' | 'return' | 'cleaning' | 'mechanical';
type VehicleType = 'pre_season' | 'post_season';
type TemplateType = BookingType | VehicleType;

interface ChecklistTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  type: string;
  active: boolean;
  created_at: string;
}

const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  pickup: 'Pickup',
  return: 'Return',
  cleaning: 'Cleaning',
  mechanical: 'Mechanical',
};

const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  pre_season: 'Pre-Season',
  post_season: 'Post-Season',
};

function getTypeLabel(type: string): string {
  return (
    (BOOKING_TYPE_LABELS as Record<string, string>)[type] ||
    (VEHICLE_TYPE_LABELS as Record<string, string>)[type] ||
    type
  );
}

// ─── Shared style tokens ─────────────────────────────────────────────────────

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid rgb(var(--border))',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const TH: CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'rgb(var(--muted))',
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: '1px solid rgb(var(--border))',
  whiteSpace: 'nowrap',
  background: 'rgb(var(--background))',
};

const TD: CSSProperties = {
  padding: 'var(--space-3)',
  fontSize: '14px',
  color: 'rgb(var(--text))',
  verticalAlign: 'middle',
  borderBottom: '1px solid rgb(var(--border))',
};

const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

const ACTIVE_BADGE: CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: 'rgb(var(--success-bg, var(--success)) / 0.15)',
  color: 'rgb(var(--success))',
};

const INACTIVE_BADGE: CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: 'rgb(var(--muted) / 0.12)',
  color: 'rgb(var(--muted))',
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function ChecklistTemplatesPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New template form state
  const [showForm, setShowForm] = useState(false);
  const [formScope, setFormScope] = useState<TemplateScope>('booking');
  const [formType, setFormType] = useState<TemplateType>('pickup');
  const [formName, setFormName] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Data loading ──────────────────────────────────────────────────────────

  async function loadTemplates(cid: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('id, name, scope, type, active, created_at')
      .eq('company_id', cid)
      .order('scope', { ascending: true })
      .order('type', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setTemplates(data || []);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push(`/${locale}/staff/login`);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('company_id, can_manage, role')
        .eq('auth_user_id', user.id)
        .single();

      if (profileError) {
        if (!cancelled) {
          setErrorMsg(`Failed to load profile: ${profileError.message}`);
          setLoading(false);
        }
        return;
      }

      if (!profile?.company_id) {
        if (!cancelled) {
          setErrorMsg('No company associated with this account.');
          setLoading(false);
        }
        return;
      }

      const userCanManage = profile.can_manage === true || profile.role === 'admin';
      if (!userCanManage) {
        router.push(`/${locale}/staff/checklists`);
        return;
      }

      if (cancelled) return;

      setCompanyId(profile.company_id);
      await loadTemplates(profile.company_id);

      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [locale, router]);

  // ─── Form helpers ──────────────────────────────────────────────────────────

  // When scope changes, reset type to a sensible default
  function handleScopeChange(newScope: TemplateScope) {
    setFormScope(newScope);
    setFormType(newScope === 'booking' ? 'pickup' : 'pre_season');
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!companyId) return;

    setFormSubmitting(true);
    setFormError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('checklist_templates')
      .insert({
        company_id: companyId,
        name: formName.trim(),
        scope: formScope,
        type: formType,
        active: formActive,
        requires_signature: false,
        visibility: 'staff',
        applies_to: formScope,
        audience: 'staff',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      const msg = [error.message, error.details].filter(Boolean).join('; ');
      setFormError(msg);
      setFormSubmitting(false);
      return;
    }

    // Refresh list then navigate to edit page
    await loadTemplates(companyId);
    setShowForm(false);
    setFormName('');
    setFormScope('booking');
    setFormType('pickup');
    setFormActive(true);
    setFormSubmitting(false);

    if (data?.id) {
      router.push(`/${locale}/staff/checklists/templates/${data.id}`);
    }
  }

  // ─── Derived lists ─────────────────────────────────────────────────────────

  const bookingTemplates = templates.filter((t) => t.scope === 'booking');
  const vehicleTemplates = templates.filter((t) => t.scope === 'vehicle');

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>
            Loading…
          </div>
        </div>
      </PageContainer>
    );
  }

  // ─── Template table row ────────────────────────────────────────────────────

  function TemplateRow({ template, isLast }: { template: ChecklistTemplate; isLast: boolean }) {
    return (
      <tr>
        <td style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom }}>
          <span style={{ fontWeight: 500 }}>{template.name}</span>
        </td>
        <td style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom }}>
          {getTypeLabel(template.type)}
        </td>
        <td style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom }}>
          <span style={template.active ? ACTIVE_BADGE : INACTIVE_BADGE}>
            {template.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom, textAlign: 'right' }}>
          <Link
            href={`/${locale}/staff/checklists/templates/${template.id}`}
            className="btn btn-secondary"
            style={{ fontSize: '13px', padding: 'var(--space-1) var(--space-3)' }}
          >
            Edit
          </Link>
        </td>
      </tr>
    );
  }

  function TemplateSection({ title, items }: { title: string; items: ChecklistTemplate[] }) {
    return (
      <div>
        <h2 style={SECTION_HEADING}>{title} ({items.length})</h2>
        {items.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              color: 'rgb(var(--muted))',
              fontSize: '14px',
              border: '1px solid rgb(var(--border))',
              borderRadius: 'var(--radius)',
            }}
          >
            No templates yet.
          </div>
        ) : (
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={TH}>Name</th>
                <th style={TH}>Type</th>
                <th style={TH}>Status</th>
                <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t, idx) => (
                <TemplateRow key={t.id} template={t} isLast={idx === items.length - 1} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1200px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* ── Page header ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Link
                href={`/${locale}/staff/checklists`}
                style={{
                  display: 'inline-block',
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                }}
              >
                ← Back to Checklists
              </Link>
              <h1 style={{ fontSize: '28px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
                Manage Default Checklists
              </h1>
              <p style={{ margin: 'var(--space-2) 0 0 0', color: 'rgb(var(--muted))', fontSize: '14px' }}>
                Define checklist templates used when bookings are created or vehicles are prepared.
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                setShowForm((prev) => !prev);
                setFormError(null);
              }}
            >
              {showForm ? 'Cancel' : 'New Template'}
            </button>
          </div>

          {/* ── Global error ── */}
          {errorMsg && (
            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--error) / 0.08)',
                border: '1px solid rgb(var(--error) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--error))',
                fontSize: '14px',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* ── Inline new template form ── */}
          {showForm && (
            <div
              style={{
                padding: 'var(--space-5)',
                border: '1px solid rgb(var(--border))',
                borderRadius: 'var(--radius)',
                background: 'rgb(var(--background))',
              }}
            >
              <h2 style={{ ...SECTION_HEADING, marginBottom: 'var(--space-4)' }}>New Template</h2>

              {formError && (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    marginBottom: 'var(--space-4)',
                    background: 'rgb(var(--error) / 0.08)',
                    border: '1px solid rgb(var(--error) / 0.3)',
                    borderRadius: 'var(--radius)',
                    color: 'rgb(var(--error))',
                    fontSize: '14px',
                  }}
                >
                  {formError}
                </div>
              )}

              <form onSubmit={handleFormSubmit}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--space-4)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  {/* Scope */}
                  <div>
                    <label
                      htmlFor="form-scope"
                      className="label"
                      style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '13px' }}
                    >
                      Scope
                    </label>
                    <select
                      id="form-scope"
                      className="input"
                      value={formScope}
                      onChange={(e) => handleScopeChange(e.target.value as TemplateScope)}
                    >
                      <option value="booking">Booking</option>
                      <option value="vehicle">Vehicle</option>
                    </select>
                  </div>

                  {/* Type */}
                  <div>
                    <label
                      htmlFor="form-type"
                      className="label"
                      style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '13px' }}
                    >
                      Type
                    </label>
                    <select
                      id="form-type"
                      className="input"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as TemplateType)}
                    >
                      {formScope === 'booking' ? (
                        <>
                          <option value="pickup">Pickup</option>
                          <option value="return">Return</option>
                          <option value="cleaning">Cleaning</option>
                          <option value="mechanical">Mechanical</option>
                        </>
                      ) : (
                        <>
                          <option value="pre_season">Pre-Season</option>
                          <option value="post_season">Post-Season</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Name */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      htmlFor="form-name"
                      className="label"
                      style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '13px' }}
                    >
                      Name <span style={{ color: 'rgb(var(--error))' }}>*</span>
                    </label>
                    <input
                      id="form-name"
                      className="input"
                      type="text"
                      placeholder="e.g. Standard Pickup Checklist"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                    />
                  </div>

                  {/* Active toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', paddingTop: 'var(--space-5)' }}>
                    <input
                      id="form-active"
                      type="checkbox"
                      checked={formActive}
                      onChange={(e) => setFormActive(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label
                      htmlFor="form-active"
                      className="label"
                      style={{ fontSize: '13px', cursor: 'pointer', margin: 0 }}
                    >
                      Active
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? 'Creating…' : 'Create Template'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowForm(false);
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Booking templates ── */}
          <TemplateSection title="Booking Templates" items={bookingTemplates} />

          {/* ── Vehicle templates ── */}
          <TemplateSection title="Vehicle Templates" items={vehicleTemplates} />

        </div>
      </div>
    </PageContainer>
  );
}