// app/staff/vehicles/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '../../../../components/PageContainer';
import { createClient } from '../../../../lib/supabase/client';

export default function NewVehiclePage() {
  const router = useRouter();
  const supabase = createClient();
  
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
        
        if (userError) {
          console.error('Auth error:', userError.message, JSON.stringify(userError));
          setError(`Auth error: ${userError.message}`);
          setLoading(false);
          return;
        }

        if (!user) {
          console.error('Not authenticated');
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        const { data: staffData, error: staffError } = await supabase
          .from('staff_profiles')
          .select('company_id')
          .eq('id', user.id)
          .single();

        if (staffError) {
          console.error('Staff lookup error:', staffError.message, JSON.stringify(staffError));
          setError(`Staff lookup error: ${staffError.message}`);
          setLoading(false);
          return;
        }

        if (!staffData?.company_id) {
          console.error('No company_id found for staff user');
          setError('No company_id found for staff user');
          setLoading(false);
          return;
        }

        setCompanyId(staffData.company_id);
        setLoading(false);
      } catch (err) {
        console.error('Unexpected error:', err);
        setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    }

    loadStaffData();
  }, [supabase]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyId) {
      console.error('Cannot submit: company_id is missing');
      setError('Cannot submit: company_id is missing');
      return;
    }

    const yearNum = parseInt(formData.year, 10);
    if (isNaN(yearNum) || formData.year.length !== 4) {
      setError('Year must be a 4-digit number');
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
        console.error('Vehicle insert error:', insertError.message, JSON.stringify(insertError));
        setError(`Insert failed: ${insertError.message}`);
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

        if (uploadError) {
          console.error('Photo upload error:', uploadError.message, JSON.stringify(uploadError));
          console.warn('Vehicle created but photo upload failed');
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('vehicle-photos')
            .getPublicUrl(filePath);

          const { error: updateError } = await supabase
            .from('vehicles')
            .update({ photo_url: publicUrl })
            .eq('id', vehicleId);

          if (updateError) {
            console.error('Photo URL update error:', updateError.message, JSON.stringify(updateError));
            console.warn('Vehicle created and photo uploaded but failed to save photo URL');
          }
        }
      }

      router.push('/staff/vehicles');
    } catch (err) {
      console.error('Unexpected error during insert:', err);
      setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="900px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ 
            textAlign: 'center',
            padding: 'var(--space-8)',
            color: 'rgb(var(--muted))'
          }}>
            Loading...
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error && !companyId) {
    return (
      <PageContainer maxWidth="900px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div>
              <Link 
                href="/staff/vehicles"
                style={{
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                  display: 'inline-block'
                }}
              >
                ← Back to vehicles
              </Link>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                Add Vehicle
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
    <PageContainer maxWidth="900px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <Link 
              href="/staff/vehicles"
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
                display: 'inline-block'
              }}
            >
              ← Back to vehicles
            </Link>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
              Add Vehicle
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              Add a new vehicle to your fleet
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
                Vehicle Photo (optional)
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
                {selectedPhoto ? `Selected: ${selectedPhoto.name}` : 'Upload a photo of the vehicle'}
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
                Vehicle Name *
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
                Registration Plate *
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
                  Make *
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
                  Model *
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
                Year *
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
                VIN (optional)
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
                Status
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
                <option value="ready">Ready</option>
                <option value="preparing">Preparing</option>
                <option value="on_rent">On rent</option>
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
                Notes (optional)
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
                {submitting ? 'Creating...' : 'Create Vehicle'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/staff/vehicles')}
                disabled={submitting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}