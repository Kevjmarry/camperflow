'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';
import { useTranslations } from 'next-intl';

type TemplateScope = 'booking' | 'vehicle';

interface ChecklistTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  type: string;
  active: boolean;
  created_at: string;
  is_system?: boolean;
}

function isSystemTemplate(template: ChecklistTemplate): boolean {
  return template.is_system === true;
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

const SYSTEM_BADGE: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  background: 'rgb(var(--brand) / 0.12)',
  color: 'rgb(var(--brand))',
  marginLeft: '8px',
  letterSpacing: '0.02em',
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function ChecklistTemplatesPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations('staffChecklistsTemplates');
  const typeT = useTranslations('checklistTypeLabels');

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function getTypeLabel(type: string): string {
    try {
      return typeT(type as Parameters<typeof typeT>[0]);
    } catch {
      return type;
    }
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  async function loadTemplates(cid: string) {
    const supabase = createClient();

    let data: ChecklistTemplate[] | null = null;
    let error: { message: string } | null = null;

    const withSystem = await supabase
      .from('checklist_templates')
      .select('id, name, scope, type, active, created_at, is_system')
      .eq('company_id', cid)
      .order('scope', { ascending: true })
      .order('type', { ascending: true })
      .order('created_at', { ascending: false });

    if (withSystem.error) {
      const fallback = await supabase
        .from('checklist_templates')
        .select('id, name, scope, type, active, created_at')
        .eq('company_id', cid)
        .order('scope', { ascending: true })
        .order('type', { ascending: true })
        .order('created_at', { ascending: false });

      data = (fallback.data as ChecklistTemplate[]) || [];
      error = fallback.error;
    } else {
      data = (withSystem.data as ChecklistTemplate[]) || [];
      error = withSystem.error;
    }

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

      await loadTemplates(profile.company_id);

      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [locale, router]);

  // ─── Derived lists ─────────────────────────────────────────────────────────

  const bookingTemplates = templates.filter((t) => t.scope === 'booking');
  const vehicleTemplates = templates.filter(
    (t) => t.scope === 'vehicle' && (t.type === 'pre_season' || t.type === 'post_season'),
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>
            {t('loading')}
          </div>
        </div>
      </PageContainer>
    );
  }

  // ─── Template table row ────────────────────────────────────────────────────

  function TemplateRow({ template, isLast }: { template: ChecklistTemplate; isLast: boolean }) {
    const isSystem = isSystemTemplate(template);
    const displayName = isSystem
      ? getTypeLabel(template.type)
      : template.name;

    return (
      <tr
        className="cf-template-row"
        style={isSystem ? { background: 'rgb(var(--brand) / 0.03)' } : undefined}
      >
        <td
          className="cf-td cf-td-name"
          data-label={t('colName')}
          style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom }}
        >
          <span className="cf-td-value" style={{ fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>
            {displayName}
            {isSystem && (
              <span style={{ ...SYSTEM_BADGE, verticalAlign: 'middle' }}>{t('badgeSystem')}</span>
            )}
          </span>
        </td>
        <td
          className="cf-td"
          data-label={t('colType')}
          style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom }}
        >
          <span className="cf-td-value">{getTypeLabel(template.type)}</span>
        </td>
        <td
          className="cf-td"
          data-label={t('colStatus')}
          style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom }}
        >
          <span className="cf-td-value">
            <span style={template.active ? ACTIVE_BADGE : INACTIVE_BADGE}>
              {template.active ? t('badgeActive') : t('badgeInactive')}
            </span>
          </span>
        </td>
        <td
          className="cf-td cf-td-actions"
          data-label={t('colActions')}
          style={{ ...TD, borderBottom: isLast ? 'none' : TD.borderBottom, textAlign: 'right' }}
        >
          <Link
            href={`/${locale}/staff/checklists/templates/${template.id}`}
            className="btn btn-secondary cf-action-btn"
            style={{ fontSize: '13px', padding: 'var(--space-1) var(--space-3)' }}
          >
            {t('actionViewEdit')}
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
            {t('noTemplates')}
          </div>
        ) : (
          <div className="cf-table-wrapper">
            <table className="cf-table" style={TABLE_STYLE}>
              <colgroup className="cf-colgroup">
                <col style={{ width: '45%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead className="cf-thead">
                <tr>
                  <th style={TH}>{t('colName')}</th>
                  <th style={TH}>{t('colType')}</th>
                  <th style={TH}>{t('colStatus')}</th>
                  <th style={{ ...TH, textAlign: 'right' }}>{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tmpl, idx) => (
                  <TemplateRow key={tmpl.id} template={tmpl} isLast={idx === items.length - 1} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile stacked-table styles */}
      <style>{`
        @media (max-width: 767px) {
          .cf-colgroup { display: none; }
          .cf-thead { display: none; }

          .cf-template-row {
            display: block !important;
            border: 1px solid rgb(var(--border));
            border-radius: var(--radius);
            margin-bottom: var(--space-3);
            overflow: hidden;
            background: inherit;
          }

          .cf-template-row .cf-td:last-child {
            border-bottom: none !important;
          }

          .cf-td {
            display: flex !important;
            justify-content: space-between;
            align-items: flex-start;
            gap: var(--space-3);
            padding: var(--space-2) var(--space-3) !important;
            border-bottom: 1px solid rgb(var(--border)) !important;
            min-width: 0;
          }

          .cf-td::before {
            content: attr(data-label);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: rgb(var(--muted));
            flex-shrink: 0;
            padding-top: 2px;
            min-width: 60px;
          }

          .cf-td-value {
            min-width: 0;
            overflow-wrap: anywhere;
            word-break: break-word;
            text-align: right;
          }

          .cf-td-name {
            display: block !important;
            padding: var(--space-3) var(--space-3) var(--space-2) !important;
            border-bottom: 1px solid rgb(var(--border)) !important;
            background: rgb(var(--surface));
          }

          .cf-td-name::before {
            display: none;
          }

          .cf-td-name .cf-td-value {
            display: block;
            text-align: left;
            font-size: 16px;
            font-weight: 600;
            color: rgb(var(--text));
            overflow-wrap: anywhere;
            word-break: break-word;
          }

          .cf-td-actions {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            text-align: left !important;
            border-bottom: none !important;
          }

          .cf-td-actions::before {
            display: none;
          }

          .cf-action-btn {
            width: 100% !important;
            text-align: center !important;
            box-sizing: border-box;
          }

          .cf-table {
            border: none !important;
          }

          .cf-table-wrapper {
            border: none;
          }
        }
      `}</style>

      <PageContainer maxWidth="1400px">
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
                  {t('backToChecklists')}
                </Link>
                <h1 style={{ fontSize: '28px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
                  {t('pageTitle')}
                </h1>
                <p style={{ margin: 'var(--space-2) 0 0 0', color: 'rgb(var(--muted))', fontSize: '14px' }}>
                  {t('pageSubtitle')}
                </p>
              </div>

              <Link
                href={`/${locale}/staff/checklists/templates/new`}
                className="btn btn-primary"
              >
                {t('createTemplate')}
              </Link>
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

            {/* ── Booking templates ── */}
            <TemplateSection title={t('sectionBooking')} items={bookingTemplates} />

            {/* ── Vehicle templates ── */}
            <TemplateSection title={t('sectionVehicle')} items={vehicleTemplates} />

          </div>
        </div>
      </PageContainer>
    </>
  );
}