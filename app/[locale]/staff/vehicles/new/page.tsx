// app/[locale]/staff/vehicles/new/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';
import BackLink from '@/components/staff/BackLink';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';

function withLocale(locale: string, path: string) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `/${locale}/${cleanPath}`;
}

function withRequired(label: string): string {
  if (label.includes('*')) return label;
  return `${label} *`;
}

export default function NewVehiclePage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations('staff.vehicles.new');

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    registration_plate: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    length_m: '',
    width_m: '',
    height_m: '',
    notes: '',
    operational_hold: false,
    hold_reason: '',
  });

  useEffect(() => {
    async function loadStaffData() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace(withLocale(locale, '/staff/login'));
          return;
        }

        const { data: staffData, error: staffError } = await supabase
          .from('staff_profiles')
          .select('company_id, role, can_manage')
          .eq('auth_user_id', user.id)
          .single();

        if (staffError || !staffData?.company_id) {
          setError(t('error.unableLoadStaff'));
          setLoading(false);
          return;
        }

        if (!(staffData.role === 'admin' || staffData.can_manage)) {
          router.replace(withLocale(locale, '/staff'));
          return;
        }

        setCompanyId(staffData.company_id);
        setLoading(false);
      } catch (err) {
        setError(`${t('error.unexpectedPrefix')}${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    }

    loadStaffData();
  }, [supabase, router, locale, t]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedPhoto(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId) {
      setError(t('error.cannotSubmitMissingCompanyId'));
      return;
    }

    const yearNum = parseInt(formData.year, 10);
    if (isNaN(yearNum) || formData.year.length !== 4) {
      setError(t('error.yearInvalid'));
      return;
    }

    setSubmitting(true);
    setError(null);
    setLimitReached(false);

    try {
      const { data: limitData } = await supabase
        .from('companies')
        .select('included_vehicles, purchased_extra_vehicles')
        .eq('id', companyId)
        .single();

      if (limitData) {
        const { count: vehicleCount } = await supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId);

        const vehicleLimit = (limitData.included_vehicles ?? 0) + (limitData.purchased_extra_vehicles ?? 0);
        if (vehicleLimit > 0 && (vehicleCount ?? 0) >= vehicleLimit) {
          setError(t('error.vehicleLimitReached'));
          setLimitReached(true);
          setSubmitting(false);
          return;
        }
      }

      const { data: vehicleData, error: insertError } = await supabase
        .from('vehicles')
        .insert({
          company_id: companyId,
          name: formData.name,
          registration_plate: formData.registration_plate,
          make: formData.make,
          model: formData.model,
          year: yearNum,
          vin: formData.vin || null,
          length_m: formData.length_m ? parseFloat(formData.length_m) : null,
          width_m: formData.width_m ? parseFloat(formData.width_m) : null,
          height_m: formData.height_m ? parseFloat(formData.height_m) : null,
          notes: formData.notes || null,
          operational_hold: formData.operational_hold,
          hold_reason: formData.operational_hold && formData.hold_reason.trim()
            ? formData.hold_reason.trim()
            : null,
        })
        .select()
        .single();

      if (insertError) {
        setError(`${t('error.insertFailedPrefix')}${insertError.message}`);
        setSubmitting(false);
        return;
      }

      if (selectedPhoto && vehicleData) {
        const vehicleId = vehicleData.id;
        const filePath = `${vehicleId}/${Date.now()}-${selectedPhoto.name}`;

        const { error: uploadError } = await supabase.storage
          .from('vehicle-photos')
          .upload(filePath, selectedPhoto, { upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('vehicle-photos')
            .getPublicUrl(filePath);

          await supabase
            .from('vehicles')
            .update({ photo_url: publicUrl })
            .eq('id', vehicleId);
        }
      }

      router.push(`/${locale}/staff/vehicles/${vehicleData.id}/edit?created=1`);
    } catch (err) {
      setError(`${t('error.unexpectedPrefix')}${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 'var(--space-3)',
    fontSize: '14px',
    border: '1px solid rgb(var(--border))',
    borderRadius: 'var(--radius)',
    background: 'rgb(var(--background))',
    color: 'rgb(var(--text))',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgb(var(--text))',
    marginBottom: 'var(--space-2)',
  };

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface">
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'rgb(var(--muted))' }}>
            {t('loading')}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error && !companyId) {
    return (
      <PageContainer maxWidth="1400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <BackLink href={withLocale(locale, '/staff/vehicles')}>{t('back')}</BackLink>
          </div>
          <div className="surface page-surface">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>{t('title')}</h1>
              <div style={{ padding: 'var(--space-4)', background: 'rgb(var(--error) / 0.1)', border: '1px solid rgb(var(--error) / 0.3)', borderRadius: 'var(--radius)', color: 'rgb(var(--error))', fontSize: '14px' }}>
                {error}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="1400px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={withLocale(locale, '/staff/vehicles')}>{t('back')}</BackLink>
        </div>
      <div className="surface page-surface">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>{t('title')}</h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>{t('subtitle')}</p>
          </div>

          {error && (
            <div style={{ padding: 'var(--space-4)', background: 'rgb(var(--error) / 0.1)', border: '1px solid rgb(var(--error) / 0.3)', borderRadius: 'var(--radius)', color: 'rgb(var(--error))', fontSize: '14px' }}>
              {error}
              {limitReached && (
                <> <Link href={`/${locale}/staff/settings/billing`} style={{ color: 'inherit', textDecoration: 'underline' }}>{t('error.upgradePlan')}</Link></>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            {/* Photo */}
            <div>
              <label htmlFor="photo" style={labelStyle}>{t('photo.label')}</label>
              <input
                ref={photoInputRef}
                type="file" id="photo" accept="image/*"
                onChange={handlePhotoChange} disabled={submitting}
                style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={submitting}
                className="btn btn-secondary"
                style={{ fontSize: '14px', cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {t('photo.chooseFile')}
              </button>
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginTop: 'var(--space-2)' }}>
                {selectedPhoto ? `${t('photo.selectedPrefix')}${selectedPhoto.name}` : t('photo.hint')}
              </p>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" style={labelStyle}>{withRequired(t('field.name'))}</label>
              <input
                type="text" id="name" value={formData.name} required disabled={submitting}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={inputStyle}
              />
            </div>

            {/* Registration plate */}
            <div>
              <label htmlFor="registration_plate" style={labelStyle}>{withRequired(t('field.registrationPlate'))}</label>
              <input
                type="text" id="registration_plate" value={formData.registration_plate} required disabled={submitting}
                onChange={(e) => setFormData({ ...formData, registration_plate: e.target.value })}
                style={inputStyle}
              />
            </div>

            {/* Make / Model */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="make" style={labelStyle}>{withRequired(t('field.make'))}</label>
                <input
                  type="text" id="make" value={formData.make} required disabled={submitting}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="model" style={labelStyle}>{withRequired(t('field.model'))}</label>
                <input
                  type="text" id="model" value={formData.model} required disabled={submitting}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Year */}
            <div>
              <label htmlFor="year" style={labelStyle}>{withRequired(t('field.year'))}</label>
              <input
                type="number" id="year" value={formData.year} required min="1900" max="2100" disabled={submitting}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                style={inputStyle}
              />
            </div>

            {/* VIN */}
            <div>
              <label htmlFor="vin" style={labelStyle}>{t('field.vin')}</label>
              <input
                type="text" id="vin" value={formData.vin} disabled={submitting}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                style={inputStyle}
              />
            </div>

            {/* Dimensions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="length_m" style={labelStyle}>{t('field.lengthM')}</label>
                <input
                  type="number" id="length_m" value={formData.length_m} step="0.01" min="0" disabled={submitting}
                  onChange={(e) => setFormData({ ...formData, length_m: e.target.value })}
                  placeholder="e.g. 5.99" style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="width_m" style={labelStyle}>{t('field.widthM')}</label>
                <input
                  type="number" id="width_m" value={formData.width_m} step="0.01" min="0" disabled={submitting}
                  onChange={(e) => setFormData({ ...formData, width_m: e.target.value })}
                  placeholder="e.g. 2.10" style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="height_m" style={labelStyle}>{t('field.heightM')}</label>
                <input
                  type="number" id="height_m" value={formData.height_m} step="0.01" min="0" disabled={submitting}
                  onChange={(e) => setFormData({ ...formData, height_m: e.target.value })}
                  placeholder="e.g. 2.85" style={inputStyle}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="notes" style={labelStyle}>{t('field.notes')}</label>
              <textarea
                id="notes" value={formData.notes} disabled={submitting} rows={4}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            {/* ── Operational hold ───────────────────────────────────────── */}
            <div
              style={{
                borderTop: '1px solid rgb(var(--border))',
                paddingTop: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  id="operational_hold"
                  checked={formData.operational_hold}
                  onChange={(e) => setFormData({ ...formData, operational_hold: e.target.checked })}
                  disabled={submitting}
                  style={{ width: 16, height: 16, cursor: submitting ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                  {t('field.operationalHold')}
                </span>
              </label>

              {formData.operational_hold && (
                <div>
                  <label htmlFor="hold_reason" style={{ ...labelStyle, marginBottom: 'var(--space-1)' }}>
                    {t('field.holdReason')}
                  </label>
                  <input
                    type="text"
                    id="hold_reason"
                    value={formData.hold_reason}
                    onChange={(e) => setFormData({ ...formData, hold_reason: e.target.value })}
                    disabled={submitting}
                    placeholder={t('field.holdReasonPlaceholder')}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
            {/* ── End operational hold ────────────────────────────────────── */}

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button type="submit" disabled={submitting || !companyId} className="btn btn-primary">
                {submitting ? t('action.creating') : t('action.create')}
              </button>
              <button
                type="button"
                onClick={() => router.push(withLocale(locale, '/staff/vehicles'))}
                disabled={submitting}
                className="btn btn-secondary"
              >
                {t('action.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
      </div>
    </PageContainer>
  );
}