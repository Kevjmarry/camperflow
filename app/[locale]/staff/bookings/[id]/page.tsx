"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getStatusChipStyle } from "@/lib/statusChip";
import { BookingChecklistsSection, ChecklistInstance } from "@/components/bookings/BookingChecklistsSection";
import { BookingSummaryCard } from "@/components/bookings/BookingSummaryCard";
import { BookingEditForm, BookingFormData } from "@/components/bookings/BookingEditForm";

type BookingStatus = 'draft' | 'confirmed' | 'blocked' | 'on_rent' | 'completed' | 'cancelled';
type VehicleStatus = 'ready' | 'preparing' | 'on_rent';

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: VehicleStatus | null;
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

const ACTIVE_BOOKING_STATUSES = ['draft', 'confirmed', 'blocked', 'on_rent'] as const;

const isActiveStatus = (status: BookingStatus): status is typeof ACTIVE_BOOKING_STATUSES[number] =>
  (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);

/** Mirrors the normalization used on the new-booking page. */
const normalizeStatus = (raw: string): BookingStatus => {
  const trimmed = raw?.trim() || "confirmed";
  return (trimmed === "pending" ? "draft" : trimmed) as BookingStatus;
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
  const [formData, setFormData] = useState<BookingFormData>({
    status: "confirmed",
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

  const selectedStatus = normalizeStatus(formData.status);
  const isNoCustomerRequired = selectedStatus === 'blocked' || selectedStatus === 'cancelled';

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

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getStatusLabel = (status: BookingStatus) => {
    switch (status) {
      case 'draft':      return t("status.pending");
      case 'confirmed':  return t("status.confirmed");
      case 'blocked':    return t("status.blocked");
      case 'on_rent':    return t("status.onRent");
      case 'completed':  return t("status.completed");
      case 'cancelled':  return t("status.cancelled");
    }
  };

  const getVehicleStatusLabel = (status: VehicleStatus): string => {
    switch (status) {
      case 'ready':     return t("vehicle.status.ready");
      case 'preparing': return t("vehicle.status.preparing");
      case 'on_rent':   return t("vehicle.status.onRent");
    }
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
        if (error.code === 'PGRST116') setNotFound(true);
        else throw error;
        return;
      }

      if (data) {
        setBooking(data);
        setFormData({
          status: data.status,
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
      if (!data || data.length === 0) { setNotFound(true); return; }

      const bookingData = data[0];
      setRedactedBooking(bookingData);

      if (bookingData.vehicle_id) {
        const { data: vehicleData } = await supabase
          .from('vehicles')
          .select('id, name, registration_plate, status')
          .eq('id', bookingData.vehicle_id)
          .single();
        if (vehicleData) setVehicleInfo(vehicleData as Vehicle);
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
        .select('id, name, registration_plate, status')
        .order('name', { ascending: true });
      if (error) throw error;
      setVehicles((data || []) as Vehicle[]);
    } catch (err: any) {
      console.error('Failed to fetch vehicles:', err);
    }
  };

  const fetchChecklistInstances = async (): Promise<ChecklistInstance[]> => {
    try {
      const { data, error } = await supabase
        .from('checklist_instances')
        .select(`
          id,
          checklist_type,
          status,
          template_id,
          template:checklist_templates!checklist_instances_template_id_fkey (
            id,
            name,
            title,
            type,
            scope,
            is_system
          )
        `)
        .eq('booking_id', id)
        .order('checklist_type');

      if (error) throw error;
      const instances = (data || []) as unknown as ChecklistInstance[];
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

      const conflictBooking = data?.find(b => {
        const ep = new Date(b.pickup_at);
        const er = new Date(b.return_at);
        return newPickup < er && newReturn > ep;
      });

      if (conflictBooking) {
        setConflictWarning(
          t("warning.vehicleConflict", { bookingNumber: conflictBooking.booking_number })
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
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const normalizedStatus = normalizeStatus(formData.status);
    const noCustomer = normalizedStatus === 'blocked' || normalizedStatus === 'cancelled';

    if (!noCustomer && !formData.customer_name.trim()) {
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
          status: normalizedStatus,
          pickup_at: toISOString(formData.pickup_at),
          return_at: toISOString(formData.return_at),
          vehicle_id: formData.vehicle_id || null,
          customer_name: formData.customer_name.trim() || null,
          customer_phone: formData.customer_phone.trim() || null,
          customer_email: formData.customer_email.trim() || null,
          notes: formData.notes.trim() || null,
        })
        .eq('id', id)
        .select('id')
        .single();

      if (updateError) {
        console.error('Update booking error:', 'message:', updateError.message, 'code:', updateError.code, 'details:', updateError.details, 'hint:', updateError.hint, 'JSON:', JSON.stringify(updateError));
        const detail = [
          updateError.code && `code: ${updateError.code}`,
          updateError.message,
          updateError.details,
          updateError.hint && `hint: ${updateError.hint}`,
        ].filter(Boolean).join('; ');
        setError(detail || t("error.updateFailed"));
        setSaving(false);
        return;
      }

      if (!updateData?.id) {
        setError(t("error.updatePermissionDenied"));
        setSaving(false);
        return;
      }

      await fetchBooking();
      alert(t("success.bookingUpdated"));
    } catch (err: any) {
      console.error('Update booking error (catch):', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      setError(err?.message || err?.toString() || t("error.updateFailed"));
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

  const getSelectedVehicle = (): Vehicle | null => {
    if (canManage) {
      if (!formData.vehicle_id) return null;
      return vehicles.find(v => v.id === formData.vehicle_id) ?? null;
    }
    return vehicleInfo;
  };

  // ── Early returns ────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <PageContainer maxWidth="1400px">
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
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ color: 'rgb(var(--muted))' }}>{t("loading")}</p>
        </div>
      </PageContainer>
    );
  }

  if (error && !booking && !redactedBooking) {
    return (
      <PageContainer maxWidth="1400px">
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

  // ── Non-manager (redacted) view ──────────────────────────────────────────────

  if (!canManage && redactedBooking) {
    return (
      <PageContainer maxWidth="1400px">
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

            <div className="surface" style={{ padding: 'var(--space-6)', background: 'rgb(var(--border) / 0.2)' }}>
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
                <span style={getStatusChipStyle(redactedBooking.status)}>
                  {getStatusLabel(redactedBooking.status)}
                </span>
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
                  <div style={{ fontSize: '15px', fontWeight: 500 }}>
                    {vehicleInfo ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                        <span style={{ color: 'rgb(var(--text))' }}>
                          {vehicleInfo.name} ({vehicleInfo.registration_plate})
                        </span>
                        {vehicleInfo.status && (
                          <span style={getStatusChipStyle(vehicleInfo.status)}>
                            {getVehicleStatusLabel(vehicleInfo.status)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: 'rgb(var(--muted))' }}>{t("vehicle.unassigned")}</span>
                    )}
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
              <div className="surface" style={{ padding: 'var(--space-5)', background: 'rgb(var(--border) / 0.15)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--text))', marginBottom: 'var(--space-3)' }}>
                  {t("field.notes")}
                </h3>
                <div style={{ fontSize: '15px', color: 'rgb(var(--text))', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {redactedBooking.notes}
                </div>
              </div>
            )}

            <BookingChecklistsSection
              instances={checklistInstances}
              locale={locale}
              t={t as (key: string, values?: Record<string, unknown>) => string}
            />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!booking) return null;

  // ── Manager view ─────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
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
            <BookingSummaryCard
              booking={booking}
              selectedVehicle={getSelectedVehicle()}
              locale={locale}
              t={t as (key: string) => string}
            />
          </div>

          <BookingEditForm
            formData={formData}
            vehicles={vehicles}
            saving={saving}
            error={error}
            conflictWarning={conflictWarning}
            isNoCustomerRequired={isNoCustomerRequired}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            t={t as (key: string) => string}
          />

          <BookingChecklistsSection
            instances={checklistInstances}
            locale={locale}
            t={t as (key: string, values?: Record<string, unknown>) => string}
          />
        </div>
      </div>
    </PageContainer>
  );
}