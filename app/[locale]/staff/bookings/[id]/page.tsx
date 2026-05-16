"use client";

import React, { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import BackLink from "@/components/staff/BackLink";
import QRCode from "qrcode";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getEffectiveUser } from "@/lib/supabase/getEffectiveUser";
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
  // ops fields
  payment_plan: 'split' | 'full' | 'custom' | null;
  invoice_reminder_dismissed_at: string | null;
}

const EMPTY_STAFF_META: StaffMeta = {
  pets: null,
  guest_count: null,
  airport_transfer: null,
  extra_driver: null,
  whatsapp_optin: null,
  marketing_optin: null,
  payment_plan: null,
  invoice_reminder_dismissed_at: null,
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
  source_type: string | null;
  source_metadata: Record<string, unknown> | null;
  staff_metadata: Record<string, unknown> | null;
  internal_notes: string | null;
  balance_invoice_sent: boolean | null;
  prearrival_whatsapp_sent: boolean | null;
  return_whatsapp_sent: boolean | null;
  review_request_whatsapp_sent: boolean | null;
  balance_invoice_reminder_enabled: boolean | null;
  prearrival_reminder_enabled: boolean | null;
  return_prep_reminder_enabled: boolean | null;
  review_request_reminder_enabled: boolean | null;
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

function GuestAccessBlock({
  bookingNumber,
  guestLocale,
  t,
}: {
  bookingNumber: string;
  guestLocale: string;
  t: (key: string) => string;
}) {
  const guestUrl = `https://app.camperflow.io/${guestLocale}/guest?code=${bookingNumber}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, guestUrl, {
        width: 148,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }
  }, [guestUrl]);

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadPng = async () => {
    const offscreen = document.createElement("canvas");
    await QRCode.toCanvas(offscreen, guestUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    const a = document.createElement("a");
    a.href = offscreen.toDataURL("image/png");
    a.download = `guest-qr-${bookingNumber}.png`;
    a.click();
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: t("guestAccess.shareTitle"), url: guestUrl });
    } else {
      await copy(guestUrl, setCopiedLink);
    }
  };

  const chipBtn = (active: boolean): React.CSSProperties => ({
    fontSize: "12px",
    padding: "3px 10px",
    background: active ? "rgb(var(--success) / 0.12)" : "rgb(var(--border) / 0.5)",
    border: "1px solid " + (active ? "rgb(var(--success) / 0.3)" : "rgb(var(--border))"),
    borderRadius: "var(--radius)",
    cursor: "pointer",
    color: active ? "rgb(var(--success))" : "rgb(var(--text))",
    fontWeight: 500,
    transition: "color 0.15s, background 0.15s, border-color 0.15s",
    whiteSpace: "nowrap" as const,
    lineHeight: "20px",
  });

  return (
    <div
      className="surface"
      style={{
        padding: "var(--space-5)",
        background: "rgb(var(--border) / 0.15)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgb(var(--border) / 0.5)", paddingBottom: "var(--space-3)" }}>
        <div style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: 3 }}>
          {t("guestAccess.title")}
        </div>
        <div style={{ fontSize: "13px", color: "rgb(var(--muted))" }}>
          {t("guestAccess.subtitle")}
        </div>
      </div>

      {/* Two-column layout: details left, QR right */}
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* Left: booking code + guest link */}
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

          {/* Booking code — hero row */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {t("guestAccess.bookingCode")}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "10px 14px",
                background: "rgb(var(--border) / 0.35)",
                border: "1px solid rgb(var(--border))",
                borderRadius: "var(--radius)",
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "rgb(var(--text))",
                  letterSpacing: "0.08em",
                  lineHeight: 1,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {bookingNumber}
              </code>
              <button onClick={() => copy(bookingNumber, setCopiedCode)} style={chipBtn(copiedCode)}>
                {copiedCode ? t("guestAccess.copied") : t("guestAccess.copy")}
              </button>
            </div>
          </div>

          {/* Guest link */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {t("guestAccess.guestLink")}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "rgb(var(--muted))",
                background: "rgb(var(--border) / 0.25)",
                border: "1px solid rgb(var(--border) / 0.6)",
                borderRadius: "var(--radius)",
                padding: "7px 10px",
                wordBreak: "break-all",
                lineHeight: 1.6,
              }}
            >
              {guestUrl}
            </div>
            <div>
              <button onClick={() => copy(guestUrl, setCopiedLink)} style={chipBtn(copiedLink)}>
                {copiedLink ? t("guestAccess.copied") : t("guestAccess.copyLink")}
              </button>
            </div>
          </div>
        </div>

        {/* Right: QR panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-3)",
            background: "#ffffff",
            border: "1px solid rgb(var(--border))",
            borderRadius: "var(--radius)",
          }}
        >
          <canvas ref={canvasRef} style={{ display: "block" }} />
          <div style={{ display: "flex", gap: "var(--space-2)", width: "100%", marginTop: "var(--space-1)" }}>
            <button
              className="btn btn-secondary"
              onClick={downloadPng}
              style={{ flex: 1, fontSize: "12px", padding: "5px 8px", minHeight: "unset" }}
            >
              {t("guestAccess.downloadQr")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={share}
              style={{ flex: 1, fontSize: "12px", padding: "5px 8px", minHeight: "unset" }}
            >
              {t("guestAccess.share")}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "rgb(var(--muted))", textAlign: "center" }}>
            {t("guestAccess.printHint")}
          </div>
        </div>

      </div>
    </div>
  );
}

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
  // Keys in staff_metadata that this form doesn't own (e.g. handover_vehicle_data,
  // handover_evidence_photos, return_vehicle_data, return_evidence_photos).
  // Preserved verbatim on every save to prevent overwrite data loss.
  const staffMetaPassthroughRef = useRef<Record<string, unknown>>({});
  const [internalNotes, setInternalNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [conflictWarning, setConflictWarning] = useState("");
  const [sameDayConflictWarning, setSameDayConflictWarning] = useState("");
  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [allCustomers, setAllCustomers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [linkingCustomer, setLinkingCustomer] = useState(false);
  const [linkCustomerSuccess, setLinkCustomerSuccess] = useState(false);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState("");
  const [guestLocale, setGuestLocale] = useState<string>('sk');
  const [reminderSaving, setReminderSaving] = useState<string | null>(null);
  const [opsSent, setOpsSent] = useState<{ balance_invoice_sent: boolean | null; prearrival_whatsapp_sent: boolean | null; return_whatsapp_sent: boolean | null; review_request_whatsapp_sent: boolean | null }>({ balance_invoice_sent: null, prearrival_whatsapp_sent: null, return_whatsapp_sent: null, review_request_whatsapp_sent: null });
  const [opsEnabled, setOpsEnabled] = useState<{ balance_invoice_reminder_enabled: boolean | null; prearrival_reminder_enabled: boolean | null; return_prep_reminder_enabled: boolean | null; review_request_reminder_enabled: boolean | null }>({ balance_invoice_reminder_enabled: null, prearrival_reminder_enabled: null, return_prep_reminder_enabled: null, review_request_reminder_enabled: null });
  const [finalPaymentDueDays, setFinalPaymentDueDays] = useState<number | null>(null);
  const [customPaymentReminderDays, setCustomPaymentReminderDays] = useState<number>(1);

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
    console.log('[CUC] checkUserCapabilities called');
    try {
      const user = await getEffectiveUser(supabase);
      console.log('[CUC] getEffectiveUser returned:', user ? `user:${user.id}` : 'null');
      if (!user) {
        console.log('[CUC] BRANCH: setError notAuthenticated');
        setError(t("error.notAuthenticated"));
        setLoading(false);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('can_manage')
        .eq('auth_user_id', user.id)
        .single();
      // On network failure (offline) fall back to true so an authenticated user
      // reaches fetchBooking rather than the unauthenticated-redacted RPC path.
      setCanManage(profileError ? true : (profile?.can_manage ?? false));
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
          // Do not pre-populate with machine-imported notes (iCal DESCRIPTION,
          // Bookingmood CSV notes, etc.). Imported bookings have a source_type;
          // manually created bookings do not.
          notes: data.source_type ? "" : (data.notes || ""),
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
          payment_plan:     sm.payment_plan === 'split' || sm.payment_plan === 'full' || sm.payment_plan === 'custom' ? sm.payment_plan : null,
          invoice_reminder_dismissed_at: typeof sm.invoice_reminder_dismissed_at === 'string' ? sm.invoice_reminder_dismissed_at : null,
        });
        setOpsSent({
          balance_invoice_sent:          data.balance_invoice_sent ?? null,
          prearrival_whatsapp_sent:      data.prearrival_whatsapp_sent ?? null,
          return_whatsapp_sent:          data.return_whatsapp_sent ?? null,
          review_request_whatsapp_sent:  data.review_request_whatsapp_sent ?? null,
        });
        setOpsEnabled({
          balance_invoice_reminder_enabled:  data.balance_invoice_reminder_enabled === true ? true : data.balance_invoice_reminder_enabled === false ? false : null,
          prearrival_reminder_enabled:       data.prearrival_reminder_enabled === true ? true : data.prearrival_reminder_enabled === false ? false : null,
          return_prep_reminder_enabled:      data.return_prep_reminder_enabled === true ? true : data.return_prep_reminder_enabled === false ? false : null,
          review_request_reminder_enabled:   data.review_request_reminder_enabled === false ? false : true,
        });

        // Capture every key the booking form doesn't manage so we can round-trip
        // them unchanged on save (prevents overwriting checklist-saved data).
        const FORM_OWNED_KEYS = new Set([
          'pets', 'guest_count', 'airport_transfer', 'extra_driver',
          'whatsapp_optin', 'marketing_optin', 'payment_plan',
          'invoice_reminder_dismissed_at',
        ]);
        const passthrough: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(sm)) {
          if (!FORM_OWNED_KEYS.has(k)) passthrough[k] = v;
        }
        staffMetaPassthroughRef.current = passthrough;

        setInternalNotes(data.internal_notes || "");

        const { data: langSettings } = await supabase
          .from('company_settings')
          .select('default_guest_language')
          .eq('id', data.company_id)
          .maybeSingle();
        const lang = (langSettings as any)?.default_guest_language;
        setGuestLocale(lang && ['en', 'de', 'sk'].includes(lang) ? lang : 'sk');

        let { data: reminderSettings, error: reminderError } = await supabase
          .from('company_settings')
          .select('final_payment_due_days, custom_payment_reminder_days')
          .eq('id', data.company_id)
          .maybeSingle();
        if (reminderError) {
          // custom_payment_reminder_days column may not exist yet — retry without it
          ({ data: reminderSettings } = await supabase
            .from('company_settings')
            .select('final_payment_due_days')
            .eq('id', data.company_id)
            .maybeSingle());
        }
        const rawDueDays = (reminderSettings as any)?.final_payment_due_days;
        setFinalPaymentDueDays(rawDueDays != null ? Number(rawDueDays) : null);
        setCustomPaymentReminderDays(typeof (reminderSettings as any)?.custom_payment_reminder_days === 'number' ? (reminderSettings as any).custom_payment_reminder_days : 1);

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

        await fetchChecklistInstances();
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

  const checkVehicleAvailability = async (): Promise<{ type: 'none' | 'hard' } | { type: 'sameDay'; message: string }> => {
    if (!formData.vehicle_id || !formData.pickup_at || !formData.return_at) {
      setConflictWarning("");
      setSameDayConflictWarning("");
      return { type: 'none' };
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

      const isSameCalendarDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

      const conflictBooking = data?.find(b => {
        const ep = new Date(b.pickup_at);
        const er = new Date(b.return_at);
        return newPickup < er && newReturn > ep;
      });

      if (conflictBooking) {
        const ep = new Date(conflictBooking.pickup_at);
        const er = new Date(conflictBooking.return_at);

        if (isSameCalendarDay(er, newPickup) && newPickup < er) {
          // Auto-snap: force pickup_at to the exact return time of the preceding booking
          setFormData(prev => ({ ...prev, pickup_at: toDatetimeLocal(conflictBooking.return_at) }));
          setSameDayConflictWarning("");
          setConflictWarning("");
          return { type: 'none' };
        }

        if (isSameCalendarDay(newReturn, ep)) {
          const msg = t("warning.sameDayConflict", { bookingNumber: conflictBooking.booking_number });
          setSameDayConflictWarning(msg);
          setConflictWarning("");
          return { type: 'sameDay', message: msg };
        }

        setConflictWarning(
          t("warning.vehicleConflict", { bookingNumber: conflictBooking.booking_number })
        );
        setSameDayConflictWarning("");
        return { type: 'hard' };
      }

      setConflictWarning("");
      setSameDayConflictWarning("");
      return { type: 'none' };
    } catch (err: any) {
      console.error('Error checking availability:', err);
      return { type: 'none' };
    }
  };

  useEffect(() => {
    if (canManage && formData.vehicle_id && formData.pickup_at && formData.return_at && !loading) {
      checkVehicleAvailability();
    }
  }, [formData.vehicle_id, formData.pickup_at, formData.return_at]);

  useEffect(() => {
    if (!loading && window.location.hash === '#reminders') {
      document.getElementById('reminders')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [loading]);

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
      const availResult = await checkVehicleAvailability();
      if (availResult.type === 'hard') {
        setError(t("error.vehicleUnavailable"));
        setSaving(false);
        return;
      }
      if (availResult.type === 'sameDay') {
        if (!window.confirm(availResult.message)) {
          setSaving(false);
          return;
        }
      }
    }

    // Build staff_metadata: start with passthrough keys (checklist data etc.),
    // then overlay form-owned keys that have an explicit override (non-null).
    const staffMetaObj: Record<string, unknown> = { ...staffMetaPassthroughRef.current };
    for (const [k, v] of Object.entries(staffMeta)) {
      if (v !== null) staffMetaObj[k] = v;
    }
    const staffMetaDb = staffMetaObj;

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
          payment_type: (['split', 'full', 'custom'] as const).includes(staffMeta.payment_plan as never) ? staffMeta.payment_plan : null,
          internal_notes: internalNotes.trim() || null,
          balance_invoice_sent: staffMeta.payment_plan === null ? null : opsSent.balance_invoice_sent,
          balance_invoice_reminder_enabled: staffMeta.payment_plan === null ? false : opsEnabled.balance_invoice_reminder_enabled,
          prearrival_whatsapp_sent: opsSent.prearrival_whatsapp_sent,
          return_whatsapp_sent: opsSent.return_whatsapp_sent,
          review_request_whatsapp_sent: opsSent.review_request_whatsapp_sent,
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

      setSameDayConflictWarning("");
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
      const res = await fetch(`/api/staff/bookings/${booking!.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert_reason: revertReason }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || t("revert.errorFailed"));
      }
      setRevertModalOpen(false);
      setRevertReason("");
      await fetchBooking();      // refreshes booking data + checklist data
      await fetchVehicles();     // refreshes vehicle state
    } catch (err: any) {
      setRevertError(err.message || t("revert.errorFailed"));
    } finally {
      setReverting(false);
    }
  };

  const handleReminderToggle = async (
    field: 'balance_invoice_sent' | 'prearrival_whatsapp_sent' | 'return_whatsapp_sent' | 'review_request_whatsapp_sent',
    type: 'balance_invoice' | 'pre_arrival' | 'return_prep' | 'review_request',
    checked: boolean,
  ) => {
    if (!checked) {
      setOpsSent(prev => ({ ...prev, [field]: false }));
      return;
    }
    setReminderSaving(field);
    try {
      const res = await fetch(`/api/staff/bookings/${id}/mark-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error || 'Failed to mark reminder');
        return;
      }
      setOpsSent(prev => ({ ...prev, [field]: true }));
    } finally {
      setReminderSaving(null);
    }
  };

  const handleReminderEnabledToggle = async (
    field: 'balance_invoice_reminder_enabled' | 'prearrival_reminder_enabled' | 'return_prep_reminder_enabled' | 'review_request_reminder_enabled',
    enabled: boolean,
  ) => {
    setReminderSaving(field);
    try {
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ [field]: enabled })
        .eq('id', id);
      if (updateErr) { setError(updateErr.message); return; }
      setOpsEnabled(prev => ({ ...prev, [field]: enabled }));
    } finally {
      setReminderSaving(null);
    }
  };

  const getSelectedVehicle = (): Vehicle | null => {
    let vehicle: Vehicle | null;
    if (canManage) {
      if (!formData.vehicle_id) return null;
      vehicle = vehicles.find(v => v.id === formData.vehicle_id) ?? null;
    } else {
      vehicle = vehicleInfo;
    }

    if (vehicle && vehicle.status !== 'on_rent') {
      const savedBookingStatus = booking?.status ?? redactedBooking?.status;

      if (savedBookingStatus === 'confirmed') {
        // For a confirmed booking, status depends on prep completion.
        // DB may be stale (INSERT doesn't fire the recompute trigger) so
        // cross-check against the loaded checklist instances.
        const prepIncomplete = checklistInstances.some(
          (i) => ['cleaning', 'mechanical'].includes(i.checklist_type) && i.status !== 'completed'
        );
        return { ...vehicle, status: prepIncomplete ? 'preparing' : 'ready' };
      }

      // Stale-state guard: DB says ready but prep checklists are incomplete.
      if (vehicle.status === 'ready') {
        const prepIncomplete = checklistInstances.some(
          (i) => ['cleaning', 'mechanical'].includes(i.checklist_type) && i.status !== 'completed'
        );
        if (prepIncomplete) {
          return { ...vehicle, status: 'preparing' };
        }
      }
    }

    return vehicle;
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
      // When the booking is imported, values in staff_metadata were auto-parsed
      // from the source (e.g. iCal DESCRIPTION) — not set by staff manually.
      // Show a neutral "Imported" label instead of "Edited by staff".
      if (booking?.source_type) {
        return (
          <span style={{
            fontSize: '11px',
            color: 'rgb(var(--muted))',
            marginTop: '4px',
            display: 'block',
          }}>
            {t("tripDetails.usingImported")}
          </span>
        );
      }
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

  // ── Checklist gating ──────────────────────────────────────────────────────

  const handoverCompleted = checklistInstances.some(
    (i) => (i.checklist_type === 'handover' || i.checklist_type === 'pickup') && i.status === 'completed'
  );
  const statusOrder: Record<string, number> = { in_progress: 0, not_started: 1, pending: 1, completed: 2 };
  const typeOrder: Record<string, number> = { handover: 0, pickup: 0, return: 1, cleaning: 2, mechanical: 3 };
  const sortChecklists = (a: ChecklistInstance, b: ChecklistInstance) => {
    const sd = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
    if (sd !== 0) return sd;
    return (typeOrder[a.checklist_type] ?? 99) - (typeOrder[b.checklist_type] ?? 99);
  };
  const returnInstances = checklistInstances.filter((i) => i.checklist_type === 'return').sort(sortChecklists);
  const nonReturnInstances = checklistInstances.filter((i) => i.checklist_type !== 'return').sort(sortChecklists);
  const handoverBlockerInstance = nonReturnInstances.find((i) => i.checklist_type === 'handover');
  const returnBlockerLabel = handoverBlockerInstance
    ? `${handoverBlockerInstance.template?.name ?? handoverBlockerInstance.template?.title ?? handoverBlockerInstance.checklist_type}: ${
        handoverBlockerInstance.status === 'in_progress'
          ? t('checklists.status.inProgress')
          : t('checklists.status.notStarted')
      }`
    : null;

  // ── Early returns ─────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface" style={{ textAlign: 'center' }}>
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
        <div className="surface page-surface" style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgb(var(--muted))' }}>{t("loading")}</p>
        </div>
      </PageContainer>
    );
  }

  if (error && !booking && !redactedBooking) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface">
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
    const displayVehicle = getSelectedVehicle();
    return (
      <PageContainer maxWidth="1400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <BackLink href={`/${locale}/staff/bookings`}>{t("action.backToBookings")}</BackLink>
          </div>
          <div className="surface page-surface">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

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
                      <span style={{ color: 'rgb(var(--text))' }}>
                        {vehicleInfo.name} ({vehicleInfo.registration_plate})
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
              instances={nonReturnInstances}
              locale={locale}
              t={t as (key: string, values?: Record<string, unknown>) => string}
            />
            {returnInstances.map((instance) => {
              const statusLabel = instance.status === 'completed' ? t('checklists.status.completed') : instance.status === 'in_progress' ? t('checklists.status.inProgress') : t('checklists.status.notStarted');
              const actionLabel = instance.status === 'completed' ? t('checklists.viewReport') : instance.status === 'in_progress' ? t('checklists.continueChecklist') : t('checklists.openChecklist');
              return (
                <div key={instance.id} style={{ padding: 'var(--space-4)', background: 'rgb(var(--border) / 0.3)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))', marginBottom: 'var(--space-1)' }}>{instance.template?.name ?? instance.template?.title ?? instance.checklist_type}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span style={getStatusChipStyle(instance.status)}>{statusLabel}</span>
                      {!handoverCompleted && returnBlockerLabel && (
                        <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                          {returnBlockerLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  {handoverCompleted ? (
                    <Link href={`/${locale}/staff/checklists/${instance.id}?from=booking`} className="btn btn-secondary" style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px' }}>
                      {actionLabel}
                    </Link>
                  ) : (
                    <span className="btn btn-secondary" style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px', opacity: 0.5, cursor: 'not-allowed', userSelect: 'none' }}>
                      {t('checklists.openChecklist')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={`/${locale}/staff/bookings`}>{t("action.backToBookings")}</BackLink>
        </div>
        <div className="surface page-surface">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Summary card */}
          <div>
            <BookingSummaryCard
              booking={booking}
              selectedVehicle={getSelectedVehicle()}
              locale={locale}
              t={t as (key: string) => string}
            />
          </div>

          {/* ── Guest Access ─────────────────────────────────────────────── */}
          <GuestAccessBlock
            bookingNumber={booking.booking_number}
            guestLocale={guestLocale}
            t={t as (key: string) => string}
          />

          {/* ── Linked Customer ─────────────────────────────────────────── */}
          <div className="surface" style={{ padding: 'var(--space-5)', background: 'rgb(var(--border) / 0.15)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgb(var(--muted))', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t("customer.title")}
            </h3>
            {linkedCustomer ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <Link
                  href={`/${locale}/staff/customers/${linkedCustomer.id}`}
                  style={{ fontSize: '16px', fontWeight: 600, color: 'rgb(var(--accent))', textDecoration: 'none' }}
                >
                  {(linkedCustomer.full_name ?? "").replace(/^(\[\?\]|\?)\s*/, '').trim() || t("customer.unnamed")}
                </Link>
                <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', fontSize: '14px', color: 'rgb(var(--muted))' }}>
                  {linkedCustomer.email && <span>{linkedCustomer.email}</span>}
                  {linkedCustomer.phone && <span>{linkedCustomer.phone}</span>}
                  {!linkedCustomer.email && !linkedCustomer.phone && <span>{t("customer.noContactInfo")}</span>}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '14px', color: 'rgb(var(--muted))', margin: 0 }}>{t("customer.noLinked")}</p>
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
              {t("customer.linkChangeButton")}
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
                  <option value="">{t("customer.selectPlaceholder")}</option>
                  {allCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{(c.full_name ?? "").replace(/^(\[\?\]|\?)\s*/, '').trim() || t("customer.unnamed")}</option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: 'rgb(var(--muted))', marginTop: 'var(--space-1)', margin: '4px 0 0' }}>
                  {t("customer.linkSavesImmediately")}
                </p>
              </div>
            )}
            {linkCustomerSuccess && (
              <p style={{ fontSize: '13px', color: 'rgb(var(--success, 34 197 94))', marginTop: 'var(--space-2)', margin: '8px 0 0' }}>
                {t("customer.linkedSuccess")}
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

            {/* ── Notes ───────────────────────────────────────────────────── */}
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
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
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

            {/* ── Operations ───────────────────────────────────────────────── */}
            <div id="reminders" style={{
              paddingTop: 'var(--space-2)',
              borderTop: '1px solid rgb(var(--border) / 0.4)',
            }}>
              <h2 style={{ fontSize: '18px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                {t("booking.reminders")}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label className="label">{t("operations.invoiceSetupLabel")}</label>
                  <select
                    className="input"
                    style={{ width: '100%', maxWidth: '260px' }}
                    value={staffMeta.payment_plan ?? ''}
                    onChange={(e) => setStaffMeta(prev => ({
                      ...prev,
                      payment_plan: e.target.value === 'split' || e.target.value === 'full' || e.target.value === 'custom' ? e.target.value : null,
                    }))}
                  >
                    <option value="">{t("operations.paymentPlan.notSet")}</option>
                    <option value="split">{t("operations.paymentPlan.split")}</option>
                    <option value="full">{t("operations.paymentPlan.full")}</option>
                    <option value="custom">{t("operations.paymentPlan.custom")}</option>
                  </select>
                  <p style={{ margin: 'var(--space-2) 0 0', fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {t("operations.invoiceSetupHint")}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <p style={{ margin: '0 0 var(--space-1)', fontSize: '13px', color: 'rgb(var(--muted))' }}>
                    {t("operations.tasksProgress", {
                      done: [
                        ...((staffMeta.payment_plan === 'split' || staffMeta.payment_plan === 'custom') ? [opsSent.balance_invoice_sent] : []),
                        opsSent.prearrival_whatsapp_sent,
                        opsSent.return_whatsapp_sent,
                        opsSent.review_request_whatsapp_sent,
                      ].filter(Boolean).length,
                      total: (staffMeta.payment_plan === 'split' || staffMeta.payment_plan === 'custom') ? 4 : 3,
                    })}
                  </p>
                  <p style={{ margin: '0 0 var(--space-2)', fontSize: '12px', color: 'rgb(var(--muted))' }}>
                    {t("operations.tasksHint")}
                  </p>
                  {/* Task: Final payment checked — only for split payment */}
                  {(staffMeta.payment_plan === 'split' || staffMeta.payment_plan === 'custom') && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgb(var(--surface) / 0.6)', borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border) / 0.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        aria-label={opsEnabled.balance_invoice_reminder_enabled ? "Disable reminder" : "Enable reminder"}
                        disabled={reminderSaving === 'balance_invoice_reminder_enabled'}
                        onClick={() => handleReminderEnabledToggle('balance_invoice_reminder_enabled', !opsEnabled.balance_invoice_reminder_enabled)}
                        style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 2, background: opsEnabled.balance_invoice_reminder_enabled === true ? 'rgb(var(--success))' : opsEnabled.balance_invoice_reminder_enabled === false ? 'rgb(var(--error))' : 'rgb(var(--border))', transition: 'background 0.15s', display: 'flex', alignItems: 'center' }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'block', transform: opsEnabled.balance_invoice_reminder_enabled === true ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
                      </button>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>{t("operations.task.balanceInvoiceReminder")}</div>
                        {opsEnabled.balance_invoice_reminder_enabled === true && (
                          <div style={{ fontSize: '12px', color: opsSent.balance_invoice_sent === true ? 'rgb(var(--success))' : opsSent.balance_invoice_sent === null ? 'rgb(var(--border))' : 'rgb(var(--muted))', marginTop: '2px' }}>
                            {opsSent.balance_invoice_sent === true ? t("operations.task.sent") : t("operations.task.notSent")}
                          </div>
                        )}
                      </div>
                    </div>
                    {opsEnabled.balance_invoice_reminder_enabled === true && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                        {staffMeta.payment_plan === 'split' && finalPaymentDueDays != null && (
                          <span style={{ fontSize: '11px', color: 'rgb(var(--muted))', background: 'rgb(var(--border) / 0.5)', borderRadius: '9999px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            {t("operations.task.balanceReminderTiming", { days: finalPaymentDueDays })}
                          </span>
                        )}
                        {staffMeta.payment_plan === 'custom' && (
                          <span style={{ fontSize: '11px', color: 'rgb(var(--muted))', background: 'rgb(var(--border) / 0.5)', borderRadius: '9999px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            {t("operations.task.balanceReminderTimingCustom", { days: customPaymentReminderDays })}
                          </span>
                        )}
                        {opsSent.balance_invoice_sent === true ? (
                          <button
                            type="button"
                            style={{ fontSize: '13px', whiteSpace: 'nowrap', padding: '5px 12px', background: 'rgb(var(--success) / 0.12)', border: '1px solid rgb(var(--success) / 0.3)', borderRadius: 'var(--radius)', color: 'rgb(var(--success))', cursor: 'pointer', fontWeight: 500 }}
                            disabled={reminderSaving === 'balance_invoice_sent'}
                            onClick={() => handleReminderToggle('balance_invoice_sent', 'balance_invoice', false)}
                          >
                            ✓ {t("operations.task.sent")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '13px', whiteSpace: 'nowrap', opacity: opsSent.balance_invoice_sent === null ? 0.55 : 1 }}
                            disabled={reminderSaving === 'balance_invoice_sent'}
                            onClick={() => handleReminderToggle('balance_invoice_sent', 'balance_invoice', true)}
                          >
                            {t("operations.task.markChecked")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>}
                  {/* Task: Pre-arrival WhatsApp message */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgb(var(--surface) / 0.6)', borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border) / 0.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        aria-label={opsEnabled.prearrival_reminder_enabled ? "Disable reminder" : "Enable reminder"}
                        disabled={reminderSaving === 'prearrival_reminder_enabled'}
                        onClick={() => handleReminderEnabledToggle('prearrival_reminder_enabled', !opsEnabled.prearrival_reminder_enabled)}
                        style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 2, background: opsEnabled.prearrival_reminder_enabled === true ? 'rgb(var(--success))' : opsEnabled.prearrival_reminder_enabled === false ? 'rgb(var(--error))' : 'rgb(var(--border))', transition: 'background 0.15s', display: 'flex', alignItems: 'center' }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'block', transform: opsEnabled.prearrival_reminder_enabled === true ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
                      </button>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>{t("operations.task.preArrivalReminder")}</div>
                        {opsEnabled.prearrival_reminder_enabled === true && (
                          <div style={{ fontSize: '12px', color: opsSent.prearrival_whatsapp_sent === true ? 'rgb(var(--success))' : opsSent.prearrival_whatsapp_sent === null ? 'rgb(var(--border))' : 'rgb(var(--muted))', marginTop: '2px' }}>
                            {opsSent.prearrival_whatsapp_sent === true ? t("operations.task.sent") : t("operations.task.notSent")}
                          </div>
                        )}
                      </div>
                    </div>
                    {opsEnabled.prearrival_reminder_enabled === true && (opsSent.prearrival_whatsapp_sent === true ? (
                      <button
                        type="button"
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', padding: '5px 12px', background: 'rgb(var(--success) / 0.12)', border: '1px solid rgb(var(--success) / 0.3)', borderRadius: 'var(--radius)', color: 'rgb(var(--success))', cursor: 'pointer', fontWeight: 500 }}
                        disabled={reminderSaving === 'prearrival_whatsapp_sent'}
                        onClick={() => handleReminderToggle('prearrival_whatsapp_sent', 'pre_arrival', false)}
                      >
                        ✓ {t("operations.task.sent")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', opacity: opsSent.prearrival_whatsapp_sent === null ? 0.55 : 1 }}
                        disabled={reminderSaving === 'prearrival_whatsapp_sent'}
                        onClick={() => handleReminderToggle('prearrival_whatsapp_sent', 'pre_arrival', true)}
                      >
                        {t("operations.task.markSent")}
                      </button>
                    ))}
                  </div>
                  {/* Task: Return-prep WhatsApp message */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgb(var(--surface) / 0.6)', borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border) / 0.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        aria-label={opsEnabled.return_prep_reminder_enabled ? "Disable reminder" : "Enable reminder"}
                        disabled={reminderSaving === 'return_prep_reminder_enabled'}
                        onClick={() => handleReminderEnabledToggle('return_prep_reminder_enabled', !opsEnabled.return_prep_reminder_enabled)}
                        style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 2, background: opsEnabled.return_prep_reminder_enabled === true ? 'rgb(var(--success))' : opsEnabled.return_prep_reminder_enabled === false ? 'rgb(var(--error))' : 'rgb(var(--border))', transition: 'background 0.15s', display: 'flex', alignItems: 'center' }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'block', transform: opsEnabled.return_prep_reminder_enabled === true ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
                      </button>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>{t("operations.task.returnPrepReminder")}</div>
                        {opsEnabled.return_prep_reminder_enabled === true && (
                          <div style={{ fontSize: '12px', color: opsSent.return_whatsapp_sent === true ? 'rgb(var(--success))' : opsSent.return_whatsapp_sent === null ? 'rgb(var(--border))' : 'rgb(var(--muted))', marginTop: '2px' }}>
                            {opsSent.return_whatsapp_sent === true ? t("operations.task.sent") : t("operations.task.notSent")}
                          </div>
                        )}
                      </div>
                    </div>
                    {opsEnabled.return_prep_reminder_enabled === true && (opsSent.return_whatsapp_sent === true ? (
                      <button
                        type="button"
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', padding: '5px 12px', background: 'rgb(var(--success) / 0.12)', border: '1px solid rgb(var(--success) / 0.3)', borderRadius: 'var(--radius)', color: 'rgb(var(--success))', cursor: 'pointer', fontWeight: 500 }}
                        disabled={reminderSaving === 'return_whatsapp_sent'}
                        onClick={() => handleReminderToggle('return_whatsapp_sent', 'return_prep', false)}
                      >
                        ✓ {t("operations.task.sent")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', opacity: opsSent.return_whatsapp_sent === null ? 0.55 : 1 }}
                        disabled={reminderSaving === 'return_whatsapp_sent'}
                        onClick={() => handleReminderToggle('return_whatsapp_sent', 'return_prep', true)}
                      >
                        {t("operations.task.markSent")}
                      </button>
                    ))}
                  </div>
                  {/* Task: Review request WhatsApp message */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgb(var(--surface) / 0.6)', borderRadius: 'var(--radius)', border: '1px solid rgb(var(--border) / 0.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        aria-label={opsEnabled.review_request_reminder_enabled ? "Disable reminder" : "Enable reminder"}
                        disabled={reminderSaving === 'review_request_reminder_enabled'}
                        onClick={() => handleReminderEnabledToggle('review_request_reminder_enabled', !opsEnabled.review_request_reminder_enabled)}
                        style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 2, background: opsEnabled.review_request_reminder_enabled === true ? 'rgb(var(--success))' : opsEnabled.review_request_reminder_enabled === false ? 'rgb(var(--error))' : 'rgb(var(--border))', transition: 'background 0.15s', display: 'flex', alignItems: 'center' }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'block', transform: opsEnabled.review_request_reminder_enabled === true ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
                      </button>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))' }}>{t("operations.task.reviewRequestReminder")}</div>
                        {opsEnabled.review_request_reminder_enabled === true && (
                          <div style={{ fontSize: '12px', color: opsSent.review_request_whatsapp_sent === true ? 'rgb(var(--success))' : opsSent.review_request_whatsapp_sent === null ? 'rgb(var(--border))' : 'rgb(var(--muted))', marginTop: '2px' }}>
                            {opsSent.review_request_whatsapp_sent === true ? t("operations.task.sent") : t("operations.task.notSent")}
                          </div>
                        )}
                      </div>
                    </div>
                    {opsEnabled.review_request_reminder_enabled === true && (opsSent.review_request_whatsapp_sent === true ? (
                      <button
                        type="button"
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', padding: '5px 12px', background: 'rgb(var(--success) / 0.12)', border: '1px solid rgb(var(--success) / 0.3)', borderRadius: 'var(--radius)', color: 'rgb(var(--success))', cursor: 'pointer', fontWeight: 500 }}
                        disabled={reminderSaving === 'review_request_whatsapp_sent'}
                        onClick={() => handleReminderToggle('review_request_whatsapp_sent', 'review_request', false)}
                      >
                        ✓ {t("operations.task.sent")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', opacity: opsSent.review_request_whatsapp_sent === null ? 0.55 : 1 }}
                        disabled={reminderSaving === 'review_request_whatsapp_sent'}
                        onClick={() => handleReminderToggle('review_request_whatsapp_sent', 'review_request', true)}
                      >
                        {t("operations.task.markSent")}
                      </button>
                    ))}
                  </div>
                </div>
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
            {sameDayConflictWarning && !conflictWarning && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--warning) / 0.07)',
                border: '1px solid rgb(var(--warning) / 0.25)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--warning))',
                fontSize: '14px',
              }}>
                {sameDayConflictWarning}
              </div>
            )}

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

              <a
                href={`/api/staff/bookings/${id}/evidence-pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ minWidth: '120px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {t("action.downloadEvidenceReport")}
              </a>

              <a
                href={`/api/staff/bookings/${id}/evidence-zip`}
                className="btn btn-secondary"
                style={{ minWidth: '120px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {t("action.downloadEvidencePhotos")}
              </a>

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
          {booking.status === 'confirmed' && handoverCompleted && selectedVehicle?.status !== 'preparing' && (
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <BookingChecklistsSection
            instances={nonReturnInstances}
            locale={locale}
            t={t as (key: string, values?: Record<string, unknown>) => string}
          />
          {returnInstances.map((instance) => {
            const statusLabel = instance.status === 'completed' ? t('checklists.status.completed') : instance.status === 'in_progress' ? t('checklists.status.inProgress') : t('checklists.status.notStarted');
            const actionLabel = instance.status === 'completed' ? t('checklists.viewReport') : instance.status === 'in_progress' ? t('checklists.continueChecklist') : t('checklists.openChecklist');
            return (
              <div key={instance.id} style={{ padding: 'var(--space-4)', background: 'rgb(var(--border) / 0.3)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgb(var(--text))', marginBottom: 'var(--space-1)' }}>{instance.template?.name ?? instance.template?.title ?? instance.checklist_type}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={getStatusChipStyle(instance.status)}>{statusLabel}</span>
                    {!handoverCompleted && returnBlockerLabel && (
                      <span style={{ fontSize: '12px', color: 'rgb(var(--muted))' }}>
                        {returnBlockerLabel}
                      </span>
                    )}
                  </div>
                </div>
                {handoverCompleted ? (
                  <Link href={`/${locale}/staff/checklists/${instance.id}?from=booking`} className="btn btn-secondary" style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px' }}>
                    {actionLabel}
                  </Link>
                ) : (
                  <span className="btn btn-secondary" style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-4)', minHeight: '36px', opacity: 0.5, cursor: 'not-allowed', userSelect: 'none' }}>
                    {t('checklists.openChecklist')}
                  </span>
                )}
              </div>
            );
          })}
          </div>

        </div>
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
