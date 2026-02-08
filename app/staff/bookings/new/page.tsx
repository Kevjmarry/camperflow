// app/staff/bookings/new/page.tsx
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: string;
}

export default function NewBookingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isAdmin, setIsAdmin] = useState(false);
  const [permissionCheckComplete, setPermissionCheckComplete] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [formData, setFormData] = useState({
    pickup_at: "",
    return_at: "",
    vehicle_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    notes: "",
    status: "confirmed",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conflictWarning, setConflictWarning] = useState("");

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (permissionCheckComplete && isAdmin) {
      fetchVehicles();
    }
  }, [permissionCheckComplete, isAdmin]);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/staff');
        return;
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('company_id, role, can_manage')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const hasAdminAccess = profile?.role === 'admin' || profile?.can_manage === true;
      
      if (!hasAdminAccess) {
        router.push('/staff');
        return;
      }

      setIsAdmin(true);
      setCompanyId(profile.company_id);
      setPermissionCheckComplete(true);
    } catch (err) {
      console.error('Permission check error:', err);
      router.push('/staff');
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setVehicles(data || []);
    } catch (err: any) {
      console.error('Failed to fetch vehicles:', err);
    }
  };

  const generateBookingNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BK-${year}${month}${day}-${randomPart}`;
  };

  const checkVehicleAvailability = async () => {
    if (!formData.vehicle_id || !formData.pickup_at || !formData.return_at) {
      setConflictWarning("");
      return true;
    }

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, pickup_at, return_at')
        .eq('vehicle_id', formData.vehicle_id)
        .in('status', ['draft', 'confirmed', 'blocked', 'on_rent']);

      if (error) throw error;

      const newPickup = new Date(formData.pickup_at);
      const newReturn = new Date(formData.return_at);

      const hasConflict = data?.some(booking => {
        const existingPickup = new Date(booking.pickup_at);
        const existingReturn = new Date(booking.return_at);
        
        return newPickup < existingReturn && newReturn > existingPickup;
      });

      if (hasConflict && data && data.length > 0) {
        const conflictBooking = data.find(booking => {
          const existingPickup = new Date(booking.pickup_at);
          const existingReturn = new Date(booking.return_at);
          return newPickup < existingReturn && newReturn > existingPickup;
        });
        
        setConflictWarning(
          `Warning: Vehicle is already booked during this period (Booking ${conflictBooking?.booking_number}). Please choose a different vehicle or dates.`
        );
        return false;
      }

      setConflictWarning("");
      return true;
    } catch (err: any) {
      console.error('Error checking availability:', err);
      return true;
    }
  };

  useEffect(() => {
    if (formData.vehicle_id && formData.pickup_at && formData.return_at) {
      checkVehicleAvailability();
    }
  }, [formData.vehicle_id, formData.pickup_at, formData.return_at]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isAdmin) {
      setError("Access denied: Only administrators can create bookings");
      return;
    }

    if (!companyId) {
      setError("Company information not loaded");
      return;
    }

    const isBlocked = formData.status === 'blocked';

    if (!isBlocked && !formData.customer_name.trim()) {
      setError("Customer name is required");
      return;
    }

    if (!isBlocked && !formData.customer_phone.trim()) {
      setError("Customer phone is required");
      return;
    }

    if (!formData.pickup_at || !formData.return_at) {
      setError("Pickup and return dates are required");
      return;
    }

    if (new Date(formData.return_at) <= new Date(formData.pickup_at)) {
      setError("Return date must be after pickup date");
      return;
    }

    if (formData.vehicle_id) {
      const isAvailable = await checkVehicleAvailability();
      if (!isAvailable) {
        setError("Cannot create booking: Vehicle is not available for the selected dates");
        return;
      }
    }

    setLoading(true);

    try {
      const bookingNumber = generateBookingNumber();

      const { data, error: insertError } = await supabase
        .from('bookings')
        .insert([
          {
            company_id: companyId,
            booking_number: bookingNumber,
            status: formData.status,
            pickup_at: formData.pickup_at,
            return_at: formData.return_at,
            vehicle_id: formData.vehicle_id || null,
            customer_name: formData.customer_name.trim() || null,
            customer_phone: formData.customer_phone.trim() || null,
            customer_email: formData.customer_email.trim() || null,
            notes: formData.notes.trim() || null,
          }
        ])
        .select('id')
        .maybeSingle();

      if (insertError) {
        const e: any = insertError;
        const msg =
          e?.message ||
          e?.error ||
          e?.code ||
          e?.details ||
          e?.hint ||
          (e && typeof e === 'object' ? JSON.stringify(e) : String(e)) ||
          'Failed to create booking';
        console.error('Create booking error:', e, 'stringified:', JSON.stringify(e));
        setError(msg);
        setLoading(false);
        return;
      }

      router.push('/staff/bookings');
      router.refresh();
    } catch (err: any) {
      const e: any = err;
      const msg =
        e?.message ||
        e?.error_description ||
        e?.error ||
        e?.code ||
        e?.details ||
        e?.hint ||
        (e && typeof e === 'object' ? JSON.stringify(e) : String(e)) ||
        'Failed to create booking';
      console.error('Create booking error:', e, 'stringified:', JSON.stringify(e));
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!permissionCheckComplete) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ color: 'rgb(var(--muted))' }}>Checking permissions...</p>
        </div>
      </PageContainer>
    );
  }

  const isBlocked = formData.status === 'blocked';

  return (
    <PageContainer maxWidth="800px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <Link 
              href="/staff/bookings"
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
                display: 'inline-block'
              }}
            >
              ← Back to bookings
            </Link>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
              New booking
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              Create a new customer reservation
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-6)' 
          }}>
            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                Booking Details
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="pickup_at" className="label">
                    Pickup date & time
                  </label>
                  <input
                    id="pickup_at"
                    name="pickup_at"
                    type="datetime-local"
                    className="input"
                    value={formData.pickup_at}
                    onChange={handleChange}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label htmlFor="return_at" className="label">
                    Return date & time
                  </label>
                  <input
                    id="return_at"
                    name="return_at"
                    type="datetime-local"
                    className="input"
                    value={formData.return_at}
                    onChange={handleChange}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label htmlFor="vehicle_id" className="label">
                    Vehicle (optional)
                  </label>
                  <select
                    id="vehicle_id"
                    name="vehicle_id"
                    className="input"
                    value={formData.vehicle_id}
                    onChange={handleChange}
                    style={{ width: '100%' }}
                  >
                    <option value="">Unassigned</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.name} ({vehicle.registration_plate})
                      </option>
                    ))}
                  </select>
                  <p className="helper-text">
                    Can be assigned later
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
                    style={{ width: '100%' }}
                  >
                    <option value="draft">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <p className="helper-text">
                    Choose initial booking status
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                Customer Details
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="customer_name" className="label">
                    Customer name {!isBlocked && <span style={{ color: 'rgb(var(--error))' }}>*</span>}
                  </label>
                  <input
                    id="customer_name"
                    name="customer_name"
                    type="text"
                    className="input"
                    placeholder="Full name"
                    value={formData.customer_name}
                    onChange={handleChange}
                    required={!isBlocked}
                    style={{ width: '100%' }}
                  />
                  {isBlocked && (
                    <p className="helper-text">
                      Optional for blocked bookings
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="customer_phone" className="label">
                    Phone number {!isBlocked && <span style={{ color: 'rgb(var(--error))' }}>*</span>}
                  </label>
                  <input
                    id="customer_phone"
                    name="customer_phone"
                    type="tel"
                    className="input"
                    placeholder="+1 234 567 8900"
                    value={formData.customer_phone}
                    onChange={handleChange}
                    required={!isBlocked}
                    style={{ width: '100%' }}
                  />
                  {isBlocked && (
                    <p className="helper-text">
                      Optional for blocked bookings
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="customer_email" className="label">
                    Email (optional)
                  </label>
                  <input
                    id="customer_email"
                    name="customer_email"
                    type="email"
                    className="input"
                    placeholder="email@example.com"
                    value={formData.customer_email}
                    onChange={handleChange}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="label">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                className="input"
                placeholder="Add any additional information..."
                value={formData.notes}
                onChange={handleChange}
                rows={4}
                style={{ 
                  width: '100%',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {conflictWarning && (
              <div style={{ 
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--warning) / 0.1)',
                border: '1px solid rgb(var(--warning) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--warning))',
                fontSize: '14px'
              }}>
                {conflictWarning}
              </div>
            )}

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

            <div style={{ 
              display: 'flex',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-2)'
            }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading || !!conflictWarning}
                style={{ 
                  flex: 1,
                  opacity: (loading || conflictWarning) ? 0.6 : 1,
                  cursor: (loading || conflictWarning) ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Creating...' : 'Create booking'}
              </button>
              <Link 
                href="/staff/bookings"
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