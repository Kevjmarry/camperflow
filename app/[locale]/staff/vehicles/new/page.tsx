// app/[locale]/staff/vehicles/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/PageContainer';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';

function withLocale(locale: string, path: string) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `/${locale}/${cleanPath}`;
}

function withArrow(label: string): string {
  const trimmed = label.trimStart();
  if (trimmed.startsWith('←') || trimmed.startsWith('&larr;') || trimmed.startsWith('\u2190')) {
    return label;
  }
  return `← ${label}`;
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
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    registration_plate: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    notes: '',
    status: 'ready' as 'ready' | 'preparing' | 'on_rent',
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
    if (file) {
      setSelectedPhoto(file);
    }
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

    try {
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
          notes: formData.notes || null,
          status: formData.status,
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
        const timestamp = Date.now();
        const filename = selectedPhoto.name;
        const filePath = `${vehicleId}/${timestamp}-${filename}`;

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

      router.push(withLocale(locale, '/staff/vehicles'));
    } catch (err) {
      setError(`${t('error.unexpectedPrefix')}${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{
            textAlign: 'center',
            padding: 'var(--space-8)',
            color: 'rgb(var(--muted))'
          }}>
            {t('loading')}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error && !companyId) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div>
              <Link
                href={withLocale(locale, '/staff/vehicles')}
                style={{
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                  display: 'inline-block'
                }}
              >
                {withArrow(t('back'))}
              </Link>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                {t('title')}
              </h1>
            </div>
            <div style={{
              padding: 'var(--space-4)',
              background: 'rgb(var(--error) / 0.1)',
              border: '1px solid rgb(var(--error) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--error))',
              fontSize: '14px'
            }}>
              {error}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <Link
              href={withLocale(locale, '/staff/vehicles')}
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
                display: 'inline-block'
              }}
            >
              {withArrow(t('back'))}
            </Link>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
              {t('title')}
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              {t('subtitle')}
            </p>
          </div>

          {error && (
            <div style={{
              padding: 'var(--space-4)',
              background: 'rgb(var(--error) / 0.1)',
              border: '1px solid rgb(var(--error) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--error))',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label
                htmlFor="photo"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {t('photo.label')}
              </label>
              <input
                type="file"
                id="photo"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))'
                }}
              />
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginTop: 'var(--space-2)' }}>
                {selectedPhoto
                  ? `${t('photo.selectedPrefix')}${selectedPhoto.name}`
                  : t('photo.hint')}
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {withRequired(t('field.name'))}
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="registration_plate"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {withRequired(t('field.registrationPlate'))}
              </label>
              <input
                type="text"
                id="registration_plate"
                value={formData.registration_plate}
                onChange={(e) => setFormData({ ...formData, registration_plate: e.target.value })}
                required
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label
                  htmlFor="make"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgb(var(--text))',
                    marginBottom: 'var(--space-2)'
                  }}
                >
                  {withRequired(t('field.make'))}
                </label>
                <input
                  type="text"
                  id="make"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  required
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: 'var(--space-3)',
                    fontSize: '14px',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 'var(--radius)',
                    background: 'rgb(var(--background))',
                    color: 'rgb(var(--text))'
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="model"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgb(var(--text))',
                    marginBottom: 'var(--space-2)'
                  }}
                >
                  {withRequired(t('field.model'))}
                </label>
                <input
                  type="text"
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  required
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: 'var(--space-3)',
                    fontSize: '14px',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 'var(--radius)',
                    background: 'rgb(var(--background))',
                    color: 'rgb(var(--text))'
                  }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="year"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {withRequired(t('field.year'))}
              </label>
              <input
                type="number"
                id="year"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                required
                min="1900"
                max="2100"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="vin"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {t('field.vin')}
              </label>
              <input
                type="text"
                id="vin"
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="status"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {t('field.status')}
              </label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as typeof formData.status })}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))'
                }}
              >
                <option value="ready">{t('status.ready')}</option>
                <option value="preparing">{t('status.preparing')}</option>
                <option value="on_rent">{t('status.onRent')}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="notes"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgb(var(--text))',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {t('field.notes')}
              </label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={submitting}
                rows={4}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  fontSize: '14px',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'rgb(var(--background))',
                  color: 'rgb(var(--text))',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-4)'
            }}>
              <button
                type="submit"
                disabled={submitting || !companyId}
                className="btn btn-primary"
              >
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
    </PageContainer>
  );
}