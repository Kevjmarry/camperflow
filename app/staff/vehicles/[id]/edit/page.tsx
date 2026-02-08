// app/staff/vehicles/[id]/edit/page.tsx
"use client";

import { use, useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "../../../../../components/PageContainer";
import { createClient } from "../../../../../lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  notes: string | null;
  photo_url: string | null;
  status: 'ready' | 'preparing' | 'on_rent';
}

export default function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  const router = useRouter();
  const supabase = createClient();

  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    registration_plate: "",
    make: "",
    model: "",
    year: "",
    vin: "",
    notes: "",
    status: "ready" as "ready" | "preparing" | "on_rent",
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

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
        .select('company_id, can_manage')
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
      setCanManage(staffData.can_manage ?? false);
      console.log('CAN_MANAGE FROM DB:', staffData.can_manage);


      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', id)
        .single();

      if (vehicleError) {
        console.error('Fetch vehicle error:', vehicleError.message, JSON.stringify(vehicleError));
        if (vehicleError.message?.includes('PGRST116') || vehicleError.message?.includes('not found')) {
          setNotFound(true);
        } else {
          setError(`Failed to load vehicle: ${vehicleError.message}`);
        }
        setLoading(false);
        return;
      }

      if (vehicleData) {
        setVehicle(vehicleData);
        setFormData({
          name: vehicleData.name || "",
          registration_plate: vehicleData.registration_plate || "",
          make: vehicleData.make || "",
          model: vehicleData.model || "",
          year: vehicleData.year ? vehicleData.year.toString() : "",
          vin: vehicleData.vin || "",
          notes: vehicleData.notes || "",
          status: vehicleData.status || "ready",
        });
        setPhotoUrl(vehicleData.photo_url || null);
      }
      
      setLoading(false);
    } catch (err: any) {
      console.error('Unexpected error:', err);
      setError(`Unexpected error: ${err.message || 'Failed to load data'}`);
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const timestamp = Date.now();
      const filename = file.name;
      const filePath = `${id}/${timestamp}-${filename}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('vehicle-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Photo upload error:', uploadError.message, JSON.stringify(uploadError));
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-photos')
        .getPublicUrl(filePath);

      const { data: updateData, error: updateError } = await supabase
        .from('vehicles')
        .update({ photo_url: publicUrl })
        .eq('id', id)
        .select('id');

      if (updateError) {
        console.error('Photo URL update error:', updateError.message, JSON.stringify(updateError));
        setError(`Failed to save photo URL: ${updateError.message}`);
        setUploading(false);
        return;
      }

      if (!updateData || updateData.length === 0) {
        setError('Permission denied: You do not have access to update this vehicle');
        setUploading(false);
        return;
      }

      setPhotoUrl(publicUrl);
      setUploading(false);
    } catch (err: any) {
      console.error('Unexpected photo upload error:', err);
      setError(`Unexpected error: ${err.message || 'Failed to upload photo'}`);
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!formData.name.trim()) {
      setError("Vehicle name is required");
      setSaving(false);
      return;
    }

    if (!formData.registration_plate.trim()) {
      setError("Registration plate is required");
      setSaving(false);
      return;
    }

    if (!formData.make.trim()) {
      setError("Make is required");
      setSaving(false);
      return;
    }

    if (!formData.model.trim()) {
      setError("Model is required");
      setSaving(false);
      return;
    }

    const yearNum = parseInt(formData.year, 10);
    if (isNaN(yearNum) || formData.year.length !== 4) {
      setError('Year must be a 4-digit number');
      setSaving(false);
      return;
    }

    try {
      const { data: updateData, error: updateError } = await supabase
        .from('vehicles')
        .update({
          name: formData.name.trim(),
          registration_plate: formData.registration_plate.trim().toUpperCase(),
          make: formData.make.trim(),
          model: formData.model.trim(),
          year: yearNum,
          vin: formData.vin.trim() || null,
          notes: formData.notes.trim() || null,
          status: formData.status,
        })
        .eq('id', id)
        .select('id');

      if (updateError) {
        console.error('Vehicle update error:', updateError.message, JSON.stringify(updateError));
        
        if (updateError.message?.includes('23505') || updateError.message?.includes('duplicate')) {
          setError("A vehicle with this registration already exists");
        } else if (updateError.message?.includes('23503') || updateError.message?.includes('foreign key')) {
          setError("Company configuration error. Please contact support.");
        } else {
          setError(`Update failed: ${updateError.message}`);
        }
        setSaving(false);
        return;
      }

      if (!updateData || updateData.length === 0) {
        setError('Permission denied: You do not have access to update this vehicle');
        setSaving(false);
        return;
      }

      router.push('/staff/vehicles');
      router.refresh();
    } catch (err: any) {
      console.error('Unexpected update error:', err);
      setError(`Unexpected error: ${err.message || 'Failed to update vehicle'}`);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this vehicle? This action cannot be undone.')) {
      return;
    }

    setError("");
    setDeleting(true);

    try {
      const { data: deleteData, error: deleteError } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id)
        .select('id');

      if (deleteError) {
        console.error('Vehicle delete error:', deleteError.message, JSON.stringify(deleteError));
        setError(`Delete failed: ${deleteError.message}`);
        setDeleting(false);
        return;
      }

      if (!deleteData || deleteData.length === 0) {
        setError('Permission denied: You do not have access to delete this vehicle');
        setDeleting(false);
        return;
      }

      router.push('/staff/vehicles');
      router.refresh();
    } catch (err: any) {
      console.error('Unexpected delete error:', err);
      setError(`Unexpected error: ${err.message || 'Failed to delete vehicle'}`);
      setDeleting(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'preparing': return 'Preparing';
      case 'on_rent': return 'On Rent';
      default: return status;
    }
  };

  if (notFound) {
    return (
      <PageContainer maxWidth="640px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
              Vehicle not found
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              The vehicle you're looking for doesn't exist or has been deleted.
            </p>
            <Link 
              href="/staff/vehicles"
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-6)' }}
            >
              Back to vehicles
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer maxWidth="640px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', color: 'rgb(var(--muted))' }}>
            Loading vehicle...
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error && !companyId) {
    return (
      <PageContainer maxWidth="640px">
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
                Edit vehicle
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

  if (!canManage && vehicle) {
    return (
      <PageContainer maxWidth="640px">
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
                Vehicle details
              </h1>
              <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
                Read-only access
              </p>
            </div>

            {vehicle.photo_url && (
              <div>
                <img
                  src={vehicle.photo_url}
                  alt="Vehicle"
                  style={{
                    width: '100%',
                    maxWidth: '300px',
                    height: 'auto',
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgb(var(--border))'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="label">Vehicle name</label>
                <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                  {vehicle.name}
                </div>
              </div>

              <div>
                <label className="label">Registration plate</label>
                <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                  {vehicle.registration_plate}
                </div>
              </div>

              <div>
                <label className="label">Make</label>
                <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                  {vehicle.make}
                </div>
              </div>

              <div>
                <label className="label">Model</label>
                <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                  {vehicle.model}
                </div>
              </div>

              <div>
                <label className="label">Year</label>
                <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                  {vehicle.year}
                </div>
              </div>

              {vehicle.vin && (
                <div>
                  <label className="label">VIN</label>
                  <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                    {vehicle.vin}
                  </div>
                </div>
              )}

              <div>
                <label className="label">Status</label>
                <div style={{ fontSize: '16px', color: 'rgb(var(--text))', marginTop: 'var(--space-2)' }}>
                  {getStatusLabel(vehicle.status)}
                </div>
              </div>

              {vehicle.notes && (
                <div>
                  <label className="label">Notes</label>
                  <div style={{ 
                    fontSize: '16px', 
                    color: 'rgb(var(--text))', 
                    marginTop: 'var(--space-2)',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {vehicle.notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="640px">
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
              Edit vehicle
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              Update vehicle information
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

          <form onSubmit={handleSubmit} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-4)' 
          }}>
            <div>
              <label htmlFor="photo" className="label">
                Vehicle photo
              </label>
              {photoUrl && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <img
                    src={photoUrl}
                    alt="Vehicle"
                    style={{
                      width: '60px',
                      height: '60px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius)',
                      border: '1px solid rgb(var(--border))'
                    }}
                  />
                </div>
              )}
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploading || saving || deleting}
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
              <p className="helper-text">
                {uploading ? 'Uploading photo...' : 'Upload a photo of the vehicle'}
              </p>
            </div>

            <div>
              <label htmlFor="name" className="label">
                Vehicle name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                className="input"
                placeholder="e.g. VW California Ocean"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={saving || deleting}
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                The make and model of the vehicle
              </p>
            </div>

            <div>
              <label htmlFor="registration_plate" className="label">
                Registration plate
              </label>
              <input
                id="registration_plate"
                name="registration_plate"
                type="text"
                className="input"
                placeholder="e.g. ABC-123"
                value={formData.registration_plate}
                onChange={handleChange}
                required
                disabled={saving || deleting}
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                Vehicle registration number or license plate
              </p>
            </div>

            <div>
              <label htmlFor="make" className="label">
                Make
              </label>
              <input
                id="make"
                name="make"
                type="text"
                className="input"
                placeholder="e.g. Volkswagen"
                value={formData.make}
                onChange={handleChange}
                required
                disabled={saving || deleting}
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                Vehicle manufacturer
              </p>
            </div>

            <div>
              <label htmlFor="model" className="label">
                Model
              </label>
              <input
                id="model"
                name="model"
                type="text"
                className="input"
                placeholder="e.g. California Ocean"
                value={formData.model}
                onChange={handleChange}
                required
                disabled={saving || deleting}
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                Vehicle model name
              </p>
            </div>

            <div>
              <label htmlFor="year" className="label">
                Year
              </label>
              <input
                id="year"
                name="year"
                type="number"
                className="input"
                placeholder="e.g. 2023"
                value={formData.year}
                onChange={handleChange}
                required
                min="1900"
                max="2100"
                disabled={saving || deleting}
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                Manufacturing year (4 digits)
              </p>
            </div>

            <div>
              <label htmlFor="vin" className="label">
                VIN (optional)
              </label>
              <input
                id="vin"
                name="vin"
                type="text"
                className="input"
                placeholder="e.g. 1HGBH41JXMN109186"
                value={formData.vin}
                onChange={handleChange}
                disabled={saving || deleting}
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                Vehicle Identification Number
              </p>
            </div>

            <div>
              <label htmlFor="status" className="label">
                Status
              </label>
              <select
                id="status"
                name="status"
                className="input"
                value={formData.status}
                onChange={handleChange}
                disabled={saving || deleting}
                style={{ width: '100%' }}
              >
                <option value="ready">Ready</option>
                <option value="preparing">Preparing</option>
                <option value="on_rent">On rent</option>
              </select>
              <p className="helper-text">
                Current status of the vehicle
              </p>
            </div>

            <div>
              <label htmlFor="notes" className="label">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                className="input"
                placeholder="Additional notes about this vehicle"
                value={formData.notes}
                onChange={handleChange}
                disabled={saving || deleting}
                rows={4}
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
              />
              <p className="helper-text">
                Internal notes or comments
              </p>
            </div>

            <div style={{ 
              display: 'flex',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-2)'
            }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving || deleting || uploading}
                style={{ 
                  flex: 1,
                  opacity: (saving || deleting || uploading) ? 0.6 : 1,
                  cursor: (saving || deleting || uploading) ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <Link 
                href="/staff/vehicles"
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </Link>
            </div>
          </form>

          <div style={{
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid rgb(var(--border))'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'rgb(var(--text))',
              marginBottom: 'var(--space-2)'
            }}>
              Danger zone
            </h3>
            <p style={{
              fontSize: '14px',
              color: 'rgb(var(--muted))',
              marginBottom: 'var(--space-3)'
            }}>
              Deleting this vehicle will permanently remove it from your fleet.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting || uploading}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'rgb(var(--error))',
                background: 'rgb(var(--error) / 0.1)',
                border: '1px solid rgb(var(--error) / 0.3)',
                borderRadius: 'var(--radius)',
                cursor: (saving || deleting || uploading) ? 'not-allowed' : 'pointer',
                opacity: (saving || deleting || uploading) ? 0.6 : 1
              }}
            >
              {deleting ? 'Deleting...' : 'Delete vehicle'}
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}