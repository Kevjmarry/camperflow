'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';
import { useTranslations } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateScope = 'booking' | 'vehicle';

// ─── Type options per scope ───────────────────────────────────────────────────

const BOOKING_TYPE_VALUES = ['pickup', 'return', 'cleaning', 'mechanical', 'guest_prereturn'];
const VEHICLE_TYPE_VALUES = ['pre_season', 'post_season'];

function typeOptionsForScope(scope: TemplateScope) {
  return scope === 'booking' ? BOOKING_TYPE_VALUES : VEHICLE_TYPE_VALUES;
}

// ─── Lifecycle stage mapping ──────────────────────────────────────────────────

const TYPE_LIFECYCLE_STAGE: Record<string, string | null> = {
  pickup: 'Pickup',
  return: 'Return',
  cleaning: 'Cleaning',
  mechanical: 'Cleaning',
  guest_prereturn: 'Return',
  pre_season: null,
  post_season: null,
};

const LIFECYCLE_STAGES = [
  'Booking Created',
  'Confirmed',
  'Pickup',
  'Return',
  'Cleaning',
  'Ready',
];

// ─── TypeExplanationPanel ─────────────────────────────────────────────────────

type ExpT = ReturnType<typeof useTranslations>;

function safeExpT(expT: ExpT, key: string): string {
  try {
    return expT(key as Parameters<ExpT>[0]);
  } catch {
    return '';
  }
}

function TypeExplanationPanel({
  selectedType,
  isMobile,
  expT,
}: {
  selectedType: string;
  isMobile: boolean;
  expT: ExpT;
}) {
  const lifecycleStage = TYPE_LIFECYCLE_STAGE[selectedType];
  const isVehicleOnly = lifecycleStage === null;

  // For mechanical, reuse cleaning keys
  const expKey = selectedType === 'mechanical' ? 'cleaning' : selectedType;

  // Only render for known types
  const knownTypes = ['pickup', 'return', 'cleaning', 'mechanical', 'guest_prereturn', 'pre_season', 'post_season'];
  if (!knownTypes.includes(selectedType)) return null;

  const createdWhen = [
    safeExpT(expT, `${expKey}.createdWhen.0`),
    safeExpT(expT, `${expKey}.createdWhen.1`),
  ].filter(Boolean);

  const visibleTo = [
    safeExpT(expT, `${expKey}.visibleTo.0`),
    safeExpT(expT, `${expKey}.visibleTo.1`),
  ].filter(Boolean);

  const usedFor = safeExpT(expT, `${expKey}.usedFor`);

  const sectionCreatedWhen = safeExpT(expT, 'sectionCreatedWhen');
  const sectionVisibleTo = safeExpT(expT, 'sectionVisibleTo');
  const sectionUsedFor = safeExpT(expT, 'sectionUsedFor');
  const vehicleMaintenanceBadge = safeExpT(expT, 'vehicleMaintenanceBadge');
  const vehicleMaintenanceNote = safeExpT(expT, 'vehicleMaintenanceNote');
  const swipeHint = safeExpT(expT, 'swipeHint');

  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Explanation card */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgb(var(--brand) / 0.04)',
          border: '1px solid rgb(var(--brand) / 0.15)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
      >
        {createdWhen.length > 0 && (
          <div>
            {sectionCreatedWhen && (
              <p
                style={{
                  margin: '0 0 var(--space-1) 0',
                  fontWeight: 600,
                  color: 'rgb(var(--text))',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {sectionCreatedWhen}
              </p>
            )}
            <ul
              style={{
                margin: 0,
                paddingLeft: 'var(--space-4)',
                color: 'rgb(var(--text))',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {createdWhen.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {visibleTo.length > 0 && (
          <div>
            {sectionVisibleTo && (
              <p
                style={{
                  margin: '0 0 var(--space-1) 0',
                  fontWeight: 600,
                  color: 'rgb(var(--text))',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {sectionVisibleTo}
              </p>
            )}
            <ul
              style={{
                margin: 0,
                paddingLeft: 'var(--space-4)',
                color: 'rgb(var(--text))',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {visibleTo.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {usedFor && (
          <div>
            {sectionUsedFor && (
              <p
                style={{
                  margin: '0 0 2px 0',
                  fontWeight: 600,
                  color: 'rgb(var(--text))',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {sectionUsedFor}
              </p>
            )}
            <p style={{ margin: 0, color: 'rgb(var(--text))' }}>{usedFor}</p>
          </div>
        )}
      </div>

      {/* Lifecycle visual */}
      {isVehicleOnly ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 'var(--radius)',
            fontSize: '12px',
            color: 'rgb(var(--muted))',
            flexWrap: 'wrap',
          }}
        >
          {vehicleMaintenanceBadge && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgb(var(--brand) / 0.12)',
                border: '1px solid rgb(var(--brand) / 0.35)',
                color: 'rgb(var(--brand))',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              {vehicleMaintenanceBadge}
            </span>
          )}
          {vehicleMaintenanceNote && <span>— {vehicleMaintenanceNote}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div
            style={{
              maxWidth: '100%',
              padding: 'var(--space-2) var(--space-3)',
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 'var(--radius)',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                minWidth: 'max-content',
              }}
            >
              {LIFECYCLE_STAGES.map((stage, idx) => {
                const isActive = stage === lifecycleStage;
                return (
                  <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {idx > 0 && (
                      <span
                        style={{
                          color: 'rgb(var(--muted))',
                          fontSize: '11px',
                          flexShrink: 0,
                          opacity: 0.5,
                        }}
                      >
                        →
                      </span>
                    )}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 9px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: isActive ? 700 : 400,
                        whiteSpace: 'nowrap',
                        background: isActive ? 'rgb(var(--brand))' : 'transparent',
                        color: isActive ? '#fff' : 'rgb(var(--muted))',
                        border: isActive
                          ? '1px solid rgb(var(--brand))'
                          : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Swipe hint: mobile only */}
          {isMobile && swipeHint && (
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                color: 'rgb(var(--muted))',
                fontStyle: 'italic',
              }}
            >
              {swipeHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const SECTION_HEADING: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'rgb(var(--text))',
  margin: '0 0 var(--space-3) 0',
};

const FIELD_LABEL: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--space-1)',
  fontSize: '13px',
};

const FIELD_WRAPPER: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const ERROR_BOX: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgb(var(--error) / 0.08)',
  border: '1px solid rgb(var(--error) / 0.3)',
  borderRadius: 'var(--radius)',
  color: 'rgb(var(--error))',
  fontSize: '14px',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewChecklistTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const t = useTranslations('newChecklistTemplate');
  const typeT = useTranslations('checklistTypeLabels');
  const expT = useTranslations('checklistTypeExplanations');

  // ── Responsive breakpoints ──
  const [isMobile, setIsMobile] = useState(true);
  const [isTabletOrAbove, setIsTabletOrAbove] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mqTablet = window.matchMedia('(min-width: 768px)');
    const mqDesktop = window.matchMedia('(min-width: 1024px)');

    const updateTablet = () => {
      setIsTabletOrAbove(mqTablet.matches);
      setIsMobile(!mqTablet.matches);
    };
    const updateDesktop = () => setIsDesktop(mqDesktop.matches);

    updateTablet();
    updateDesktop();

    mqTablet.addEventListener('change', updateTablet);
    mqDesktop.addEventListener('change', updateDesktop);
    return () => {
      mqTablet.removeEventListener('change', updateTablet);
      mqDesktop.removeEventListener('change', updateDesktop);
    };
  }, []);

  // ── Auth ──
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── Form fields ──
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TemplateScope>('booking');
  const [type, setType] = useState<string>('pickup');
  const [active, setActive] = useState(true);

  // ── Submission ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ─── Auth / profile check ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push(`/${locale}/staff/login`);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('company_id, can_manage, role')
        .eq('auth_user_id', user.id)
        .single();

      if (cancelled) return;

      if (profileError || !profile?.company_id) {
        setGlobalError(profileError?.message ?? 'No company associated with this account.');
        setLoading(false);
        return;
      }

      const userCanManage = profile.can_manage === true || profile.role === 'admin';
      if (!userCanManage) {
        router.push(`/${locale}/staff/checklists/templates`);
        return;
      }

      setCompanyId(profile.company_id);
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  // ─── Scope change: reset type to first option for new scope ───────────────

  function handleScopeChange(newScope: TemplateScope) {
    setScope(newScope);
    setType(typeOptionsForScope(newScope)[0]);
    setSaveError(null);
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!companyId) return;
    if (!name.trim()) {
      setSaveError(t('errorNameRequired'));
      return;
    }

    setSaving(true);
    setSaveError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('checklist_templates')
      .insert({
        company_id: companyId,
        name: name.trim(),
        scope,
        type,
        active,
      })
      .select('id')
      .single();

    if (error) {
      const msg = [error.message, error.details].filter(Boolean).join('; ');
      setSaveError(msg || t('errorCreateFailed'));
      setSaving(false);
      return;
    }

    router.push(`/${locale}/staff/checklists/templates/${data.id}`);
  }

  // ─── Early returns ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div
            style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}
          >
            {t('loading')}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (globalError) {
    return (
      <PageContainer maxWidth="1200px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <Link
            href={`/${locale}/staff/checklists/templates`}
            style={{
              display: 'inline-block',
              fontSize: '14px',
              color: 'rgb(var(--brand))',
              textDecoration: 'none',
              marginBottom: 'var(--space-4)',
            }}
          >
            ← {t('backToTemplates')}
          </Link>
          <div style={ERROR_BOX}>{globalError}</div>
        </div>
      </PageContainer>
    );
  }

  const currentTypeValues = typeOptionsForScope(scope);

  // ── Card sizing / alignment by breakpoint ──
  const cardStyle: CSSProperties = {
    padding: 'var(--space-5)',
    border: '1px solid rgb(var(--border))',
    borderRadius: 'var(--radius)',
    background: 'rgb(var(--background))',
    ...(isDesktop
      ? { maxWidth: '480px' }
      : isTabletOrAbove
        ? { maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }
        : {}),
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1200px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* ── Page header ── */}
          <div>
            <Link
              href={`/${locale}/staff/checklists/templates`}
              style={{
                display: 'inline-block',
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
              }}
            >
              ← {t('backToTemplates')}
            </Link>
            <h1 style={{ fontSize: '28px', fontWeight: 600, color: 'rgb(var(--text))', margin: 0 }}>
              {t('pageTitle')}
            </h1>
            <p style={{ margin: 'var(--space-2) 0 0 0', color: 'rgb(var(--muted))', fontSize: '14px' }}>
              {t('pageSubtitle')}
            </p>
          </div>

          {/* ── Form card ── */}
          <div style={cardStyle}>
            <h2 style={SECTION_HEADING}>{t('sectionTitle')}</h2>

            {saveError && (
              <div style={{ ...ERROR_BOX, marginBottom: 'var(--space-4)' }}>{saveError}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

              {/* Name */}
              <div style={FIELD_WRAPPER}>
                <label htmlFor="tmpl-name" className="label" style={FIELD_LABEL}>
                  {t('fieldName')} <span style={{ color: 'rgb(var(--error))' }}>*</span>
                </label>
                <input
                  id="tmpl-name"
                  className="input"
                  type="text"
                  placeholder={t('fieldNamePlaceholder')}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaveError(null);
                  }}
                />
              </div>

              {/* Applies to (Scope) */}
              <div style={FIELD_WRAPPER}>
                <label htmlFor="tmpl-scope" className="label" style={FIELD_LABEL}>
                  {t('fieldAppliesTo')}
                </label>
                <select
                  id="tmpl-scope"
                  className="input"
                  value={scope}
                  onChange={(e) => handleScopeChange(e.target.value as TemplateScope)}
                >
                  <option value="booking">{t('scopeBookingLabel')}</option>
                  <option value="vehicle">{t('scopeVehicleLabel')}</option>
                </select>
              </div>

              {/* When should this checklist be created? (Type) */}
              <div
                style={{
                  ...FIELD_WRAPPER,
                  paddingTop: 'var(--space-1)',
                  paddingBottom: 'var(--space-1)',
                }}
              >
                <label htmlFor="tmpl-type" className="label" style={FIELD_LABEL}>
                  {t('fieldWhenCreated')}
                </label>
                <select
                  id="tmpl-type"
                  className="input"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setSaveError(null);
                  }}
                >
                  {currentTypeValues.map((value) => (
                    <option key={value} value={value}>
                      {typeT(value)}
                    </option>
                  ))}
                </select>

                {/* Dynamic explanation panel + lifecycle visual */}
                <TypeExplanationPanel selectedType={type} isMobile={isMobile} expT={expT} />
              </div>

              {/* Active */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  paddingTop: 'var(--space-1)',
                }}
              >
                <input
                  id="tmpl-active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label
                  htmlFor="tmpl-active"
                  className="label"
                  style={{ fontSize: '13px', cursor: 'pointer', margin: 0 }}
                >
                  {t('fieldActive')}
                </label>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: 'var(--space-3)',
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid rgb(var(--border))',
                }}
              >
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={saving}
                  style={isMobile ? { width: '100%', boxSizing: 'border-box' } : undefined}
                >
                  {saving ? t('btnCreating') : t('btnCreate')}
                </button>
                <Link
                  href={`/${locale}/staff/checklists/templates`}
                  className="btn btn-secondary"
                  style={{
                    textDecoration: 'none',
                    textAlign: 'center',
                    ...(isMobile ? { width: '100%', boxSizing: 'border-box' } : {}),
                  }}
                >
                  {t('btnCancel')}
                </Link>
              </div>

            </div>
          </div>

        </div>
      </div>
    </PageContainer>
  );
}