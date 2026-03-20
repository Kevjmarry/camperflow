"use client";

import React, { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getStatusChipStyle } from "@/lib/statusChip";
import { BookingChecklistsSection, ChecklistInstance } from "@/components/bookings/BookingChecklistsSection";
import { BookingSummaryCard } from "@/components/bookings/BookingSummaryCard";
import type { BookingFormData } from "@/components/bookings/BookingEditForm";

type BookingStatus = 'draft' | 'confirmed' | 'blocked' | 'on_rent' | 'completed' | 'cancelled';
type VehicleStatus = 'ready' | 'preparing' | 'on_rent';

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: VehicleStatus | null;
}

// Staff-owned overrides — separate from source_metadata (import-owned).
// Only keys with non-null values are persisted to the DB.
interface StaffMeta {
  pets: boolean | null;
  guest_count: number | null;
  airport_transfer: boolean | null;
  extra_driver: boolean | null;
  whatsapp_optin: boolean | null;
  marketing_optin: boolean | null;
}

const EMPTY_STAFF_META: StaffMeta = {
  pets: null,
  guest_count: null,
  airport_transfer: null,
  extra_driver: null,
  whatsapp_optin: null,
  marketing_optin: null,
};

// Config for the visible boolean trip-detail fields (marketing_optin kept in StaffMeta
// for data round-trip safety but not exposed in the UI).
const BOOL_META_FIELDS: { key: keyof Omit<StaffMeta, 'guest_count'>; labelKey: string }[] = [
  { key: 'extra_driver',     labelKey: 'field.extraDriver' },
  { key: 'pets',             labelKey: 'field.pets' },
  { key: 'airport_transfer', labelKey: 'field.airportTransfer' },
  { key: 'whatsapp_optin',   labelKey: 'field.whatsappOptin' },
];

interface Booking {
  id: string;
  booking_number: string;
  status: BookingStatus;
  pickup_at: string;
  return_at: string;
  vehicle_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  company_id: string;
  source_metadata: Record<string, unknown> | null;
  staff_metadata: Record<string, unknown> | null;
  internal_notes: string | null;
}

interface LinkedCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
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
  const [linkedCustomer, setLinkedCustomer] = useState<LinkedCustomer | null>(null);
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
  const [staffMeta, setStaffMeta] = useState<StaffMeta>(EMPTY_STAFF_META);
  const [internalNotes, setInternalNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [conflictWarning, setConflictWarning] = useState("");
  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [allCustomers, setAllCustomers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [linkingCustomer, setLinkingCustomer] = useState(false);
  const [linkCustomerSuccess, setLinkCustomerSuccess] = useState(false);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState("");

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

        // Load staff_metadata — only keys present in the DB object become overrides.
        // Absent key means no override (null), not false.
        const sm = (data.staff_metadata ?? {}) as Record<string, unknown>;
        setStaffMeta({
          pets:             'pets'             in sm ? Boolean(sm.pets)             : null,
          guest_count:      typeof sm.guest_count === 'number' ? sm.guest_count    : null,
          airport_transfer: 'airport_transfer' in sm ? Boolean(sm.airport_transfer): null,
          extra_driver:     'extra_driver'     in sm ? Boolean(sm.extra_driver)    : null,
          whatsapp_optin:   'whatsapp_optin'   in sm ? Boolean(sm.whatsapp_optin)  : null,
          marketing_optin:  'marketing_optin'  in sm ? Boolean(sm.marketing_optin) : null,
        });
        setInternalNotes(data.internal_notes || "");

        if (data.customer_id) {
          const { data: custData } = await supabase
            .from('customers')
            .select('id, full_name, email, phone')
            .eq('id', data.customer_id)
            .eq('company_id', data.company_id)
            .maybeSingle();
          setLinkedCustomer(custData ?? null);
        } else {
          setLinkedCustomer(null);
        }

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

  const fetchAllCustomers = async (companyId: string) => {
    const { data } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq('company_id', companyId)
      .order('full_name', { ascending: true });
    setAllCustomers(data || []);
  };

  const handleLinkCustomer = async (customerId: string) => {
    setLinkingCustomer(true);

    // 1. Fetch the customer record first so we can write snapshot fields in one update
    const { data: custFull, error: custError } = await supabase
      .from('customers')
      .select('id, full_name, email, phone')
      .eq('id', customerId)
      .single();

    if (custError || !custFull) {
      setError(custError?.message ?? "Failed to load customer record.");
      setLinkingCustomer(false);
      return;
    }

    // 2. Single update: customer_id + snapshot fields
    const { error: linkError } = await supabase
      .from('bookings')
      .update({
        customer_id: customerId,
        customer_name: custFull.full_name ?? "",
        customer_email: custFull.email ?? null,
        customer_phone: custFull.phone ?? "",
      })
      .eq('id', id);

    setLinkingCustomer(false);

    if (linkError) {
      setError(linkError.message);
      return;
    }

    // 3. Update local state immediately
    setLinkedCustomer(custFull);
    setFormData(prev => ({
      ...prev,
      customer_name: custFull.full_name ?? "",
      customer_email: custFull.email ?? "",
      customer_phone: custFull.phone ?? "",
    }));
    setBooking(prev => prev ? {
      ...prev,
      customer_id: customerId,
      customer_name: custFull.full_name ?? "",
      customer_email: custFull.email ?? null,
      customer_phone: custFull.phone ?? "",
    } : prev);

    // 4. Clear stale feedback
    setError("");
    setConflictWarning("");
    setLinkCustomerOpen(false);
    setLinkCustomerSuccess(true);

    await fetchBooking();
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

    // Guest capacity check — derives max from vehicle name (no extra DB column needed)
    if (formData.vehicle_id) {
      const veh = vehicles.find(v => v.id === formData.vehicle_id);
      if (veh) {
        const cap = /ducato|spark/i.test(veh.name) ? 4 : 5;
        const sm = booking?.source_metadata ?? {};
        const effGuests =
          staffMeta.guest_count !== null
            ? staffMeta.guest_count
            : typeof sm.guest_count === 'number' ? sm.guest_count : null;
        if (effGuests !== null && effGuests > cap) {
          setError(t("tripDetails.guestExceedsCapacity", { max: cap }));
          setSaving(false);
          return;
        }
      }
    }

    if (formData.vehicle_id && booking && isActiveStatus(booking.status)) {
      const isAvailable = await checkVehicleAvailability();
      if (!isAvailable) {
        setError(t("error.vehicleUnavailable"));
        setSaving(false);
        return;
      }
    }

    // Build staff_metadata: only persist keys that have an explicit override (non-null).
    // If all fields are null (no overrides), write null to the column.
    const staffMetaObj: Record<string, boolean | number> = {};
    for (const [k, v] of Object.entries(staffMeta)) {
      if (v !== null) staffMetaObj[k] = v;
    }
    const staffMetaDb = Object.keys(staffMetaObj).length > 0 ? staffMetaObj : null;

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
          staff_metadata: staffMetaDb,
          internal_notes: internalNotes.trim() || null,
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

  const handleRevert = async () => {
    try {
      setReverting(true);
      setRevertError("");
      const res = await fetch(`/api/staff/bookings/${id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revert_reason: revertReason }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || t("revert.errorFailed"));
      }
      setRevertModalOpen(false);
      setRevertReason("");
      await fetchBooking();
    } catch (err: any) {
      setRevertError(err.message || t("revert.errorFailed"));
    } finally {
      setReverting(false);
    }
  };

  const getSelectedVehicle = (): Vehicle | null => {
    if (canManage) {
      if (!formData.vehicle_id) return null;
      return vehicles.find(v => v.id === formData.vehicle_id) ?? null;
    }
    return vehicleInfo;
  };

  // ── Trip Details helpers ───────────────────────────────────────────────────

  /**
   * Small status line shown below each trip-detail control.
   * - "Edited by staff" (brand) when staff_metadata has an explicit value.
   * - "Imported: Yes/No/X" (muted) when showing the imported value with no staff override.
   * - "No imported value" (muted) when neither source nor staff has data.
   */
  function renderMetaStatus(staffVal: unknown, sourceVal: unknown): React.ReactElement {
    if (staffVal !== null && staffVal !== undefined) {
      return (
        <span style={{
          fontSize: '11px',
          color: 'rgb(var(--brand))',
          fontWeight: 500,
          marginTop: '4px',
          display: 'block',
        }}>
          {t("tripDetails.staffOverride")}
        </span>
      );
    }
    if (sourceVal !== null && sourceVal !== undefined) {
      const displayVal =
        sourceVal === true  ? t("tripDetails.yes") :
        sourceVal === false ? t("tripDetails.no")  :
        String(sourceVal);
      return (
        <span style={{
          fontSize: '11px',
          color: 'rgb(var(--muted))',
          marginTop: '4px',
          display: 'block',
        }}>
          {t("tripDetails.usingImported")}: {displayVal}
        </span>
      );
    }
    return (
      <span style={{
        fontSize: '11px',
        color: 'rgb(var(--muted))',
        marginTop: '4px',
        display: 'block',
      }}>
        {t("tripDetails.noImportedValue")}
      </span>
    );
  }

  // ── Early returns ─────────────────────────────────────────────────────────

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

  // ── Non-manager (redacted) view ───────────────────────────────────────────

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

  // ── Manager view ──────────────────────────────────────────────────────────

  const srcMeta = booking.source_metadata ?? {};

  // Vehicle capacity: Ducato / Spark → 4 guests, Siena and others → 5
  const selectedVehicle = getSelectedVehicle();
  const vehicleCapacity: number | null = selectedVehicle
    ? (/ducato|spark/i.test(selectedVehicle.name) ? 4 : 5)
    : null;
  const effectiveGuestCount: number | null =
    staffMeta.guest_count !== null
      ? staffMeta.guest_count
      : typeof srcMeta.guest_count === 'number' ? srcMeta.guest_count : null;
  const guestExceedsCapacity =
    vehicleCapacity !== null && effectiveGuestCount !== null && effectiveGuestCount > vehicleCapacity;

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Back link + summary card */}
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

          {/* ── Linked Customer ─────────────────────────────────────────── */}
          <div className="surface" style={{ padding: 'var(--space-5)', background: 'rgb(var(--border) / 0.15)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--muted))', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Customer
            </h3>
            {linkedCustomer ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <Link
                  href={`/${locale}/staff/customers/${linkedCustomer.id}`}
                  style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--accent))', textDecoration: 'none' }}
                >
                  {linkedCustomer.full_name ?? "Unnamed customer"}
                </Link>
                <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', fontSize: '14px', color: 'rgb(var(--muted))' }}>
                  {linkedCustomer.email && <span>{linkedCustomer.email}</span>}
                  {linkedCustomer.phone && <span>{linkedCustomer.phone}</span>}
                  {!linkedCustomer.email && !linkedCustomer.phone && <span>No contact info</span>}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>No customer linked</p>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 'var(--space-3)', fontSize: '13px' }}
              onClick={() => {
                if (!linkCustomerOpen && allCustomers.length === 0 && booking) {
                  fetchAllCustomers(booking.company_id);
                }
                setLinkCustomerSuccess(false);
                setLinkCustomerOpen(o => !o);
              }}
            >
              Link / change customer
            </button>
            {linkCustomerOpen && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <select
                  className="input"
                  style={{ width: '100%', maxWidth: '360px' }}
                  defaultValue=""
                  disabled={linkingCustomer}
                  onChange={(e) => { if (e.target.value) handleLinkCustomer(e.target.value); }}
                >
                  <option value="">-- Select customer --</option>
                  {allCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name ?? "Unnamed"}</option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: 'var(--space-1)', margin: '4px 0 0' }}>
                  Changing the linked customer saves immediately.
                </p>
              </div>
            )}
            {linkCustomerSuccess && (
              <p style={{ fontSize: '13px', color: 'rgb(var(--success, 34 197 94))', marginTop: 'var(--space-2)', margin: '8px 0 0' }}>
                Customer linked successfully.
              </p>
            )}
          </div>

          {/*
           * Single unified form — Booking Details, Customer Details, Notes,
           * Trip Details, and Internal Notes are all part of one form so that
           * the action buttons sit naturally at the very bottom.
           */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
          >
            {/* ── Booking Details ─────────────────────────────────────────── */}
            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("section.bookingDetails")}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="status" className="label">{t("field.status")}</label>
                  <select
                    id="status"
                    name="status"
                    className="input"
                    value={formData.status}
                    onChange={handleChange}
                    style={{ width: '100%' }}
                  >
                    <option value="draft">{t("status.pending")}</option>
                    <option value="confirmed">{t("status.confirmed")}</option>
                    <option value="blocked">{t("status.blocked")}</option>
                    <option value="on_rent">{t("status.onRent")}</option>
                    <option value="completed">{t("status.completed")}</option>
                    <option value="cancelled">{t("status.cancelled")}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pickup_at" className="label">{t("field.pickupDateTime")}</label>
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
                  <label htmlFor="return_at" className="label">{t("field.returnDateTime")}</label>
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
                  <label htmlFor="vehicle_id" className="label">{t("field.vehicle")}</label>
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

            {/* ── Customer Details ─────────────────────────────────────────── */}
            <div>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("section.customerDetails")}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="customer_name" className="label">
                    {t("field.customerName")}
                    {!isNoCustomerRequired && <span style={{ color: 'rgb(var(--error))' }}> *</span>}
                  </label>
                  <input
                    id="customer_name"
                    name="customer_name"
                    type="text"
                    className="input"
                    value={formData.customer_name}
                    onChange={handleChange}
                    required={!isNoCustomerRequired}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label htmlFor="customer_phone" className="label">
                    {t("field.phoneNumber")}
                    {!isNoCustomerRequired && <span style={{ color: 'rgb(var(--error))' }}> *</span>}
                  </label>
                  <input
                    id="customer_phone"
                    name="customer_phone"
                    type="tel"
                    className="input"
                    value={formData.customer_phone}
                    onChange={handleChange}
                    required={!isNoCustomerRequired}
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

            {/* ── Trip Details ─────────────────────────────────────────────── */}
            <div style={{
              paddingTop: 'var(--space-2)',
              borderTop: '1px solid rgb(var(--border) / 0.4)',
            }}>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("section.tripDetails")}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--space-4)',
              }}>
                {/* Guests — number field */}
                <div>
                  <label className="label">{t("field.guests")}</label>
                  <input
                    type="number"
                    min={0}
                    max={vehicleCapacity ?? undefined}
                    className="input"
                    style={{
                      width: '100%',
                      borderColor: guestExceedsCapacity ? 'rgb(var(--error))' : undefined,
                    }}
                    value={
                      staffMeta.guest_count !== null
                        ? staffMeta.guest_count
                        : srcMeta.guest_count !== undefined
                          ? String(srcMeta.guest_count)
                          : ""
                    }
                    onChange={(e) => setStaffMeta(prev => ({
                      ...prev,
                      guest_count: e.target.value === "" ? null : Number(e.target.value),
                    }))}
                  />
                  {vehicleCapacity !== null && !guestExceedsCapacity && (
                    <span style={{ fontSize: '11px', color: 'rgb(var(--muted))', marginTop: '4px', display: 'block' }}>
                      {t("tripDetails.maxGuests", { max: vehicleCapacity })}
                    </span>
                  )}
                  {guestExceedsCapacity && (
                    <span style={{ fontSize: '11px', color: 'rgb(var(--error))', fontWeight: 500, marginTop: '4px', display: 'block' }}>
                      {t("tripDetails.guestExceedsCapacity", { max: vehicleCapacity })}
                    </span>
                  )}
                  {renderMetaStatus(staffMeta.guest_count, srcMeta.guest_count)}
                </div>

                {/* Boolean fields — 3-state select */}
                {BOOL_META_FIELDS.map(({ key, labelKey }) => (
                  <div key={key}>
                    <label className="label">{t(labelKey)}</label>
                    <select
                      className="input"
                      style={{ width: '100%' }}
                      value={
                        staffMeta[key] !== null
                          ? String(staffMeta[key])
                          : srcMeta[key] !== undefined
                            ? String(srcMeta[key])
                            : ""
                      }
                      onChange={(e) => setStaffMeta(prev => ({
                        ...prev,
                        [key]: e.target.value === "" ? null : e.target.value === "true",
                      }))}
                    >
                      <option value="true">{t("tripDetails.yes")}</option>
                      <option value="false">{t("tripDetails.no")}</option>
                      {srcMeta[key] !== undefined
                        ? <option value="">{t("tripDetails.noOverride")}</option>
                        : <option value="">{t("tripDetails.notSet")}</option>
                      }
                    </select>
                    {renderMetaStatus(staffMeta[key], srcMeta[key])}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Internal Notes ───────────────────────────────────────────── */}
            <div style={{
              paddingTop: 'var(--space-2)',
              borderTop: '1px solid rgb(var(--border) / 0.4)',
            }}>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-2)', color: 'rgb(var(--text))' }}>
                {t("section.internalNotes")}
              </h2>
              <p style={{ fontSize: '13px', color: 'rgb(var(--muted))', marginBottom: 'var(--space-3)' }}>
                {t("field.internalNotes")}
              </p>
              <textarea
                className="input"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={4}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {/* ── Feedback + actions ───────────────────────────────────────── */}
            {conflictWarning && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--warning) / 0.1)',
                border: '1px solid rgb(var(--warning) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--warning))',
                fontSize: '14px',
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
                fontSize: '14px',
              }}>
                {error}
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-2)',
              flexWrap: 'wrap',
            }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !!conflictWarning || guestExceedsCapacity}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  opacity: (saving || conflictWarning || guestExceedsCapacity) ? 0.6 : 1,
                  cursor: (saving || conflictWarning || guestExceedsCapacity) ? 'not-allowed' : 'pointer',
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
                  borderColor: 'rgb(var(--error))',
                }}
              >
                {t("action.delete")}
              </button>

              {booking.status === 'on_rent' && (
                <button
                  type="button"
                  onClick={() => { setRevertError(""); setRevertModalOpen(true); }}
                  className="btn btn-secondary"
                  disabled={saving}
                  style={{ minWidth: '120px' }}
                >
                  {t("revert.button")}
                </button>
              )}
            </div>
          </form>

          {/* Checklists sit outside the form — read-only, no submit relation */}
          {booking.status === 'confirmed' && checklistInstances.some(i => i.checklist_type === 'handover' && i.status === 'completed') && selectedVehicle?.status !== 'preparing' && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'rgb(var(--warning) / 0.1)',
              border: '1px solid rgb(var(--warning) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--warning))',
              fontSize: '14px',
            }}>
              {t("pickupChecklistReopenHint")}
            </div>
          )}
          <BookingChecklistsSection
            instances={checklistInstances}
            locale={locale}
            t={t as (key: string, values?: Record<string, unknown>) => string}
          />

        </div>
      </div>

      {/* ── Revert handover modal ─────────────────────────────────────────── */}
      {revertModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setRevertModalOpen(false); }}
        >
          <div
            className="surface"
            style={{
              width: '100%',
              maxWidth: 440,
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <h2 style={{ fontSize: '18px', color: 'rgb(var(--text))', margin: 0 }}>
              {t("revert.modalTitle")}
            </h2>
            <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>
              {t("revert.modalDescription")}
            </p>
            <div>
              <label style={{ fontSize: '12px', color: 'rgb(var(--muted))', display: 'block', marginBottom: 4 }}>
                {t("revert.reasonLabel")}
              </label>
              <textarea
                className="input"
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                placeholder={t("revert.reasonPlaceholder")}
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            {revertError && (
              <div style={{
                padding: 'var(--space-3)',
                background: 'rgb(var(--error) / 0.1)',
                border: '1px solid rgb(var(--error) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--error))',
                fontSize: '13px',
              }}>
                {revertError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setRevertModalOpen(false)}
                disabled={reverting}
              >
                {t("revert.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRevert}
                disabled={reverting}
              >
                {reverting ? t("revert.reverting") : t("revert.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
