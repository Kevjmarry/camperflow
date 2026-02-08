"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "../../../../../components/PageContainer";
import { createClient } from "../../../../../lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration: string;
  status: 'available' | 'rented' | 'maintenance' | 'cleaning';
}

export default function EditVehiclePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    name: "",
    registration: "",
    status: "available" as "available" | "rented" | "maintenance" | "cleaning",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchVehicle();
  }, [params.id]);

  const fetchVehicle = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setNotFound(true);
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        setFormData({
          name: data.name,
          registration: data.registration,
          status: data.status,
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load vehicle");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    // Basic validation
    if (!formData.name.trim()) {
      setError("Vehicle name is required");
      setSaving(false);
      return;
    }

    if (!formData.registration.trim()) {
      setError("Registration is required");
      setSaving(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('vehicles')
        .update({
          name: formData.name.trim(),
          registration: formData.registration.trim().toUpperCase(),
          status: formData.status,
        })
        .eq('id', params.id);

      if (error) {
        // Handle unique constraint violation
        if (error.code === '23505') {
          setError("A vehicle with this registration already exists");
        } else {
          setError(error.message);
        }
        setSaving(false);
        return;
      }

      // Success - redirect to vehicles list
      router.push('/staff/vehicles');
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update vehicle");
      setSaving(false);
    }
  };

  // Not found state
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

  // Loading state
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

  return (
    <PageContainer maxWidth="640px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header */}
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

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-4)' 
          }}>
            {/* Name Field */}
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
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                The make and model of the vehicle
              </p>
            </div>

            {/* Registration Field */}
            <div>
              <label htmlFor="registration" className="label">
                Registration
              </label>
              <input
                id="registration"
                name="registration"
                type="text"
                className="input"
                placeholder="e.g. ABC-123"
                value={formData.registration}
                onChange={handleChange}
                required
                style={{ width: '100%' }}
              />
              <p className="helper-text">
                Vehicle registration number or license plate
              </p>
            </div>

            {/* Status Field */}
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
                style={{ width: '100%' }}
              >
                <option value="available">Available</option>
                <option value="rented">Rented</option>
                <option value="maintenance">Maintenance</option>
                <option value="cleaning">Cleaning</option>
              </select>
              <p className="helper-text">
                Current status of the vehicle
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div style={{ 
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--error) / 0.1)',
                border: '1px solid rgb(var(--error) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--error))',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div style={{ 
              display: 'flex',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-2)'
            }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving}
                style={{ 
                  flex: 1,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer'
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
        </div>
      </div>
    </PageContainer>
  );
}