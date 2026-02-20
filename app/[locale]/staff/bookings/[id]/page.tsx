"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

type BookingStatus = 'draft' | 'confirmed' | 'blocked' | 'on_rent' | 'completed' | 'cancelled';

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
}

interface Booking {
  id: string;
  booking_number: string;
  status: BookingStatus;
  pickup_at: string;
  return_at: string;
  vehicle_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  company_id: string;
}

interface RedactedBooking {
  id: string;
  company_id: string;
  status: BookingStatus;
  pickup_at: string;
  return_at: string;
  vehicle_id: string | null;
  notes: string | null;
}

interface ChecklistInstance {
  id: string;
  checklist_type: 'cleaning' | 'mechanical' | 'pickup' | 'return';
  status: 'not_started' | 'in_progress' | 'completed';
}

const ACTIVE_BOOKING_STATUSES = ['draft', 'confirmed', 'blocked', 'on_rent'] as const;

const isActiveStatus = (status: BookingStatus): status is typeof ACTIVE_BOOKING_STATUSES[number] => {
  return (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);
};

export default function BookingDetailPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const router = useRouter();
  const t = useTranslations("bookingDetail");
  const supabase = createClient();

  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [redactedBooking, setRedactedBooking] = useState<RedactedBooking | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleInfo, setVehicleInfo] = useState<Vehicle | null>(null);
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstance[]>([]);
  const [formData, setFormData] = useState({
    pickup_at: "",
    return_at: "",
    vehicle_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [conflictWarning, setConflictWarning] = useState("");

  useEffect(() => {
    checkUserCapabilities();
  }, []);

  useEffect(() => {
    if (canManage !== null) {
      if (canManage) {
        fetchBooking();
        fetchVehicles();
      } else {
        fetchRedactedBooking();
      }
    }
  }, [id, canManage]);

  const checkUserCapabilities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(t("error.notAuthenticated"));
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('can_manage')
        .eq('auth_user_id', user.id)
        .single();

      setCanManage(profile?.can_manage ?? false);
    } catch (err: any) {
      setError(err.message || t("error.permissionsFailed"));
      setLoading(false);
    }
  };

  const toDatetimeLocal = (isoString: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const toISOString = (datetimeLocal: string) => {
    if (!datetimeLocal) return "";
    return new Date(datetimeLocal).toISOString();
  };

  const fetchBooking = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
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
        setBooking(data);
        setFormData({
          pickup_at: toDatetimeLocal(data.pickup_at),
          return_at: toDatetimeLocal(data.return_at),
          vehicle_id: data.vehicle_id || "",
          customer_name: data.customer_name || "",
          customer_phone: data.customer_phone || "",
          customer_email: data.customer_email || "",
          notes: data.notes || "",
        });
        fetchChecklistInstances();
      }
    } catch (err: any) {
      console.error('Fetch booking error:', err);
      setError(err.message || t("error.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const fetchRedactedBooking = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase.rpc('get_staff_booking_redacted', { p_booking_id: id });

      if (error) throw error;

      if (!data || data.length === 0) {
        setNotFound(true);
        return;
      }

      const bookingData = data[0];
      setRedactedBooking(bookingData);

      if (bookingData.vehicle_id) {
        const { data: vehicleData } = await supabase
          .from('vehicles')
          .select('id, name, registration_plate')
          .eq('id', bookingData.vehicle_id)
          .single();
        
        if (vehicleData) {
          setVehicleInfo(vehicleData);
        }
      }

      fetchChecklistInstances();
    } catch (err: any) {
      console.error('Fetch redacted booking error:', err);
      setError(err.message || t("error.loadFailed"));
    } finally {
      setLoading(false);
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

  const fetchChecklistInstances = async (): Promise<ChecklistInstance[]> => {
    try {
      const { data, error } = await supabase
        .from('checklist_instances')
        .select('id, checklist_type, status')
        .eq('booking_id', id)
        .order('checklist_type');

      if (error) throw error;
      const instances = data || [];
      setChecklistInstances(instances);
      return instances;
    } catch (err: any) {
      console.error('Failed to fetch checklist instances:', err);
      return checklistInstances;
    }
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
        .in('status', ACTIVE_BOOKING_STATUSES)
        .neq('id', id);

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
          t("warning.vehicleConflict", { bookingNumber: conflictBooking?.booking_number })
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
    if (canManage && formData.vehicle_id && formData.pickup_at && formData.return_at && !loading) {
      checkVehicleAvailability();
    }
  }, [formData.vehicle_id, formData.pickup_at, formData.return_at]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const isBlocked = booking?.status === 'blocked';

    if (!isBlocked && !formData.customer_name.trim()) {
      setError(t("error.customerNameRequired"));
      setSaving(false);
      return;
    }

    if (new Date(formData.return_at) <= new Date(formData.pickup_at)) {
      setError(t("error.returnAfterPickup"));
      setSaving(false);
      return;
    }

    if (formData.vehicle_id && booking && isActiveStatus(booking.status)) {
      const isAvailable = await checkVehicleAvailability();
      if (!isAvailable) {
        setError(t("error.vehicleUnavailable"));
        setSaving(false);
        return;
      }
    }

    try {
      const { data: updateData, error: updateError } = await supabase
        .from('bookings')
        .update({
          pickup_at: toISOString(formData.pickup_at),
          return_at: toISOString(formData.return_at),
          vehicle_id: formData.vehicle_id || null,
          customer_name: formData.customer_name.trim() || null,
          customer_phone: formData.customer_phone.trim() || null,
          customer_email: formData.customer_email.trim() || null,
          notes: formData.notes.trim() || null,
        })
        .eq('id', id)
        .select('id');

      if (updateError) {
        console.error('Update booking error:', updateError);
        setError(updateError.message || t("error.updateFailed"));
        setSaving(false);
        return;
      }

      if (!updateData || updateData.length === 0) {
        setError(t("error.updatePermissionDenied"));
        setSaving(false);
        return;
      }

      await fetchBooking();
      
      alert(t("success.bookingUpdated"));
    } catch (err: any) {
      console.error('Update booking error:', err);
      setError(err.message || t("error.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteBooking"))) return;

    try {
      setSaving(true);
      const { data: deleteData, error: deleteError } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id)
        .select('id');

      if (deleteError) {
        console.error('Delete booking error:', deleteError);
        setError(deleteError.message || t("error.deleteFailed"));
        setSaving(false);
        return;
      }

      if (!deleteData || deleteData.length === 0) {
        setError(t("error.deletePermissionDenied"));
        setSaving(false);
        return;
      }

      router.push(`/${locale}/staff/bookings`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || t("error.deleteFailed"));
      setSaving(false);
    }
  };

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'draft': return 'rgb(var(--muted))';
      case 'confirmed': return 'rgb(var(--brand))';
      case 'blocked': return 'rgb(var(--error))';
      case 'on_rent': return 'rgb(var(--success))';
      case 'completed': return 'rgb(var(--accent))';
      case 'cancelled': return 'rgb(var(--error))';
    }
  };

  const getStatusLabel = (status: BookingStatus) => {
    switch (status) {
      case 'draft': return t("status.pending");
      case 'confirmed': return t("status.confirmed");
      case 'blocked': return t("status.blocked");
      case 'on_rent': return t("status.onRent");
      case 'completed': return t("status.completed");
      case 'cancelled': return t("status.cancelled");
    }
  };

  const getChecklistStatusLabel = (status: 'not_started' | 'in_progress' | 'completed') => {
    switch (status) {
      case 'not_started': return t("checklists.status.notStarted");
      case 'in_progress': return t("checklists.status.inProgress");
      case 'completed': return t("checklists.status.completed");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getVehicleName = () => {
    if (canManage) {
      if (!formData.vehicle_id) return t("vehicle.unassigned");
      const vehicle = vehicles.find(v => v.id === formData.vehicle_id);
      return vehicle ? `${vehicle.name} (${vehicle.registration_plate})` : t("vehicle.unassigned");
    } else {
      if (!vehicleInfo) return t("vehicle.unassigned");
      return `${vehicleInfo.name} (${vehicleInfo.registration_plate})`;
    }
  };

  if (notFound) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
            {t("notFound.title")}
          </h1>
          <p style={{ color: 'rgb(var(--muted))', marginBottom: 'var(--space-6)' }}>
            {t("notFound.message")}
          </p>
          <Link href={`/${locale}/staff/bookings`} className="btn btn-primary">
            {t("action.backToBookings")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ color: 'rgb(var(--muted))' }}>{t("loading")}</p>
        </div>
      </PageContainer>
    );
  }

  if (error && !booking && !redactedBooking) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ 
            padding: 'var(--space-4)',
            background: 'rgb(var(--error) / 0.1)',
            border: '1px solid rgb(var(--error) / 0.3)',
            borderRadius: 'var(--radius)',
            color: 'rgb(var(--error))',
            fontSize: '14px',
            marginBottom: 'var(--space-4)'
          }}>
            {error}
          </div>
          <Link href={`/${locale}/staff/bookings`} className="btn btn-secondary">
            {t("action.backToBookings")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (!canManage && redactedBooking) {
    return (
      <PageContainer maxWidth="900px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div>
              <Link 
                href={`/${locale}/staff/bookings`}
                style={{
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                  display: 'inline-block'
                }}
              >
                {t("action.backToBookingsArrow")}
              </Link>
            </div>

            <div className="surface" style={{ 
              padding: 'var(--space-6)',
              background: 'rgb(var(--border) / 0.2)'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: 'var(--space-4)',
                flexWrap: 'wrap',
                gap: 'var(--space-3)'
              }}>
                <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))', margin: 0 }}>
                  {t("title")}
                </h1>
                <div style={{
                  display: 'inline-block',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius)',
                  background: `${getStatusColor(redactedBooking.status)}15`,
                  color: getStatusColor(redactedBooking.status),
                  fontSize: '14px',
                  fontWeight: 600
                }}>
                  {getStatusLabel(redactedBooking.status)}
                </div>
              </div>

              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--space-4)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid rgb(var(--border) / 0.5)'
              }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                    {t("field.vehicle")}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500, color: vehicleInfo ? 'rgb(var(--text))' : 'rgb(var(--muted))' }}>
                    {vehicleInfo ? `${vehicleInfo.name} (${vehicleInfo.registration_plate})` : t("vehicle.unassigned")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                    {t("field.pickup")}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {formatDate(redactedBooking.pickup_at)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-1)' }}>
                    {t("field.return")}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgb(var(--text))' }}>
                    {formatDate(redactedBooking.return_at)}
                  </div>
                </div>
              </div>
            </div>

            {redactedBooking.notes && (
              <div className="surface" style={{ 
                padding: 'var(--space-5)',
                background: 'rgb(var(--border) / 0.15)'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-3)' }}>
                  {t("field.notes")}
                </h3>
                <div style={{ 
                  fontSize: '15px', 
                  color: 'rgb(var(--text))', 
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {redactedBooking.notes}
                </div>
              </div>
            )}

            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("checklists.title")}
              </h2>
              {checklistInstances.length === 0 ? (
                <div style={{ 
                  padding: 'var(--space-4)',
                  background: 'rgb(var(--border) / 0.3)',
                  borderRadius: 'var(--radius)',
                  color: 'rgb(var(--muted))',
                  fontSize: '14px',
                  textAlign: 'center'
                }}>
                  {t("checklists.empty")}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {checklistInstances.map((instance) => (
                    <div 
                      key={instance.id}
                      style={{
                        padding: 'var(--space-4)',
                        background: 'rgb(var(--border) / 0.3)',
                        borderRadius: 'var(--radius)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '14px', 
                          fontWeight: 500, 
                          color: 'rgb(var(--text))',
                          marginBottom: 'var(--space-1)',
                          textTransform: 'capitalize'
                        }}>
                          {instance.checklist_type} {t("checklists.checklistSuffix")}
                        </div>
                        <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                          {getChecklistStatusLabel(instance.status)}
                        </div>
                      </div>
                      <Link
                        href={`/${locale}/staff/checklists/${instance.id}?from=booking`}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '14px',
                          padding: 'var(--space-2) var(--space-4)',
                          minHeight: '36px'
                        }}
                      >
                        {instance.status === 'completed' ? t("checklists.viewChecklist") : t("checklists.openChecklist")}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!booking) return null;

  return (
    <PageContainer maxWidth="800px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <Link 
              href={`/${locale}/staff/bookings`}
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
                display: 'inline-block'
              }}
            >
              {t("action.backToBookingsArrow")}
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                {booking.booking_number}
              </h1>
              <div style={{
                display: 'inline-block',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius)',
                background: `${getStatusColor(booking.status)}15`,
                color: getStatusColor(booking.status),
                fontSize: '14px',
                fontWeight: 500
              }}>
                {getStatusLabel(booking.status)}
              </div>
            </div>
            <div style={{ 
              marginTop: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              color: 'rgb(var(--muted))',
              fontSize: '14px'
            }}>
              <div>{t("summary.customer")}: <span style={{ color: 'rgb(var(--text))' }}>{booking.customer_name || "-"}</span></div>
              <div>{t("summary.vehicle")}: <span style={{ color: 'rgb(var(--text))' }}>{getVehicleName()}</span></div>
              <div>{t("summary.pickup")}: <span style={{ color: 'rgb(var(--text))' }}>{formatDate(booking.pickup_at)}</span></div>
              <div>{t("summary.return")}: <span style={{ color: 'rgb(var(--text))' }}>{formatDate(booking.return_at)}</span></div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-6)' 
          }}>
            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("section.bookingDetails")}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="pickup_at" className="label">
                    {t("field.pickupDateTime")}
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
                    {t("field.returnDateTime")}
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
                    {t("field.vehicle")}
                  </label>
                  <select
                    id="vehicle_id"
                    name="vehicle_id"
                    className="input"
                    value={formData.vehicle_id}
                    onChange={handleChange}
                    style={{ width: '100%' }}
                  >
                    <option value="">{t("vehicle.unassigned")}</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.name} ({vehicle.registration_plate})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("section.customerDetails")}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="customer_name" className="label">
                    {t("field.customerName")} {booking.status !== 'blocked' && <span style={{ color: 'rgb(var(--error))' }}>*</span>}
                  </label>
                  <input
                    id="customer_name"
                    name="customer_name"
                    type="text"
                    className="input"
                    value={formData.customer_name}
                    onChange={handleChange}
                    required={booking.status !== 'blocked'}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label htmlFor="customer_phone" className="label">
                    {t("field.phoneNumber")} {booking.status !== 'blocked' && <span style={{ color: 'rgb(var(--error))' }}>*</span>}
                  </label>
                  <input
                    id="customer_phone"
                    name="customer_phone"
                    type="tel"
                    className="input"
                    value={formData.customer_phone}
                    onChange={handleChange}
                    required={booking.status !== 'blocked'}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label htmlFor="customer_email" className="label">
                    {t("field.emailOptional")}
                  </label>
                  <input
                    id="customer_email"
                    name="customer_email"
                    type="email"
                    className="input"
                    value={formData.customer_email}
                    onChange={handleChange}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="label">
                {t("field.notes")}
              </label>
              <textarea
                id="notes"
                name="notes"
                className="input"
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
              paddingTop: 'var(--space-2)',
              flexWrap: 'wrap'
            }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving || !!conflictWarning}
                style={{ 
                  flex: 1,
                  minWidth: '120px',
                  opacity: (saving || conflictWarning) ? 0.6 : 1,
                  cursor: (saving || conflictWarning) ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? t("action.saving") : t("action.saveChanges")}
              </button>
              
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-secondary"
                disabled={saving}
                style={{ 
                  minWidth: '120px',
                  color: 'rgb(var(--error))',
                  borderColor: 'rgb(var(--error))'
                }}
              >
                {t("action.delete")}
              </button>
            </div>
          </form>

          <div>
            <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
              {t("checklists.title")}
            </h2>
            {checklistInstances.length === 0 ? (
              <div style={{ 
                padding: 'var(--space-4)',
                background: 'rgb(var(--border) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--muted))',
                fontSize: '14px',
                textAlign: 'center'
              }}>
                {t("checklists.empty")}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {checklistInstances.map((instance) => (
                  <div 
                    key={instance.id}
                    style={{
                      padding: 'var(--space-4)',
                      background: 'rgb(var(--border) / 0.3)',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-3)',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: 500, 
                        color: 'rgb(var(--text))',
                        marginBottom: 'var(--space-1)',
                        textTransform: 'capitalize'
                      }}>
                        {instance.checklist_type} {t("checklists.checklistSuffix")}
                      </div>
                      <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>
                        {getChecklistStatusLabel(instance.status)}
                      </div>
                    </div>
                    <Link
                      href={`/${locale}/staff/checklists/${instance.id}?from=booking`}
                      className="btn btn-secondary"
                      style={{
                        fontSize: '14px',
                        padding: 'var(--space-2) var(--space-4)',
                        minHeight: '36px'
                      }}
                    >
                      {instance.status === 'completed' ? t("checklists.viewChecklist") : t("checklists.openChecklist")}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}