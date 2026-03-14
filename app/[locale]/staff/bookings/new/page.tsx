"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: string;
}

/** Format a local date + a "HH:MM[:SS]" time string into a datetime-local value. */
function toDatetimeLocal(date: Date, timeStr: string): string {
  const [hh, mm] = timeStr.split(":");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T${hh.padStart(2, "0")}:${(mm ?? "00").padStart(2, "0")}`;
}

/** Normalize a raw status value to one that satisfies `bookings_status_check`. */
function normalizeStatus(raw: string): "draft" | "confirmed" | "blocked" | "on_rent" | "completed" | "cancelled" {
  const trimmed = raw.trim();
  // Guard against the legacy label value "pending" leaking through
  if (trimmed === "pending") return "draft";
  if (["draft", "confirmed", "blocked", "on_rent", "completed", "cancelled"].includes(trimmed)) {
    return trimmed as "draft" | "confirmed" | "blocked" | "on_rent" | "completed" | "cancelled";
  }
  return "confirmed";
}

export default function NewBookingPage() {
  const t = useTranslations("staff.bookings.new");

  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (permissionCheckComplete && isAdmin) {
      fetchVehicles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionCheckComplete, isAdmin]);

  useEffect(() => {
    if (!companyId) return;
    const applyDefaults = async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("pickup_time, dropoff_time")
        .eq("id", companyId)
        .maybeSingle();
      if (!data) return;
      const today = new Date();
      setFormData((prev) => ({
        ...prev,
        pickup_at: prev.pickup_at || (data.pickup_time ? toDatetimeLocal(today, data.pickup_time) : ""),
        return_at: prev.return_at || (data.dropoff_time ? toDatetimeLocal(today, data.dropoff_time) : ""),
      }));
    };
    applyDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const checkAdminAccess = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/${locale}/staff`);
        return;
      }

      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("company_id, role, can_manage")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const hasAdminAccess =
        profile?.role === "admin" || profile?.can_manage === true;

      if (!hasAdminAccess) {
        router.push(`/${locale}/staff`);
        return;
      }

      setIsAdmin(true);
      setCompanyId(profile.company_id);
      setPermissionCheckComplete(true);
    } catch (err) {
      console.error("Permission check error:", err);
      router.push(`/${locale}/staff`);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setVehicles(data || []);
    } catch (err: any) {
      console.error("Failed to fetch vehicles:", err);
    }
  };

  const generateBookingNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
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
        .from("bookings")
        .select("id, booking_number, pickup_at, return_at")
        .eq("vehicle_id", formData.vehicle_id)
        .in("status", ["draft", "confirmed", "blocked", "on_rent"]);

      if (error) throw error;

      const newPickup = new Date(formData.pickup_at);
      const newReturn = new Date(formData.return_at);

      const conflictBooking = data?.find((booking) => {
        const existingPickup = new Date(booking.pickup_at);
        const existingReturn = new Date(booking.return_at);
        return newPickup < existingReturn && newReturn > existingPickup;
      });

      if (conflictBooking) {
        setConflictWarning(
          t("conflictWarning", { bookingNumber: conflictBooking.booking_number })
        );
        return false;
      }

      setConflictWarning("");
      return true;
    } catch (err: any) {
      console.error("Error checking availability:", err);
      return true;
    }
  };

  useEffect(() => {
    if (formData.vehicle_id && formData.pickup_at && formData.return_at) {
      checkVehicleAvailability();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.vehicle_id, formData.pickup_at, formData.return_at]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
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
      setError(t("errors.notAdmin"));
      return;
    }

    if (!companyId) {
      setError(t("errors.noCompany"));
      return;
    }

    // Normalize status before any logic or DB write
    const normalizedStatus = normalizeStatus(formData.status);
    const isBlocked = normalizedStatus === "blocked";

    if (!isBlocked && !formData.customer_name.trim()) {
      setError(t("errors.customerNameRequired"));
      return;
    }

    if (!isBlocked && !formData.customer_phone.trim()) {
      setError(t("errors.customerPhoneRequired"));
      return;
    }

    if (!formData.pickup_at || !formData.return_at) {
      setError(t("errors.datesRequired"));
      return;
    }

    if (new Date(formData.return_at) <= new Date(formData.pickup_at)) {
      setError(t("errors.returnAfterPickup"));
      return;
    }

    if (formData.vehicle_id) {
      const isAvailable = await checkVehicleAvailability();
      if (!isAvailable) {
        setError(t("errors.vehicleUnavailable"));
        return;
      }
    }

    setLoading(true);

    try {
      const bookingNumber = generateBookingNumber();

      const { data, error: insertError } = await supabase
        .from("bookings")
        .insert([
          {
            company_id: companyId,
            booking_number: bookingNumber,
            status: normalizedStatus,
            pickup_at: formData.pickup_at,
            return_at: formData.return_at,
            vehicle_id: formData.vehicle_id || null,
            customer_name: formData.customer_name.trim() || null,
            customer_phone: formData.customer_phone.trim() || null,
            customer_email: formData.customer_email.trim() || null,
            notes: formData.notes.trim() || null,
          },
        ])
        .select("id")
        .maybeSingle();

      if (insertError) {
        const e: any = insertError;
        const msg =
          e?.message ||
          e?.error ||
          e?.code ||
          e?.details ||
          e?.hint ||
          (e && typeof e === "object" ? JSON.stringify(e) : String(e)) ||
          t("errors.createFailed");
        console.error("Create booking error:", e, "stringified:", JSON.stringify(e));
        setError(msg);
        setLoading(false);
        return;
      }

      router.push(`/${locale}/staff/bookings`);
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
        (e && typeof e === "object" ? JSON.stringify(e) : String(e)) ||
        t("errors.createFailed");
      console.error("Create booking error:", e, "stringified:", JSON.stringify(e));
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!permissionCheckComplete) {
    return (
      <PageContainer maxWidth="1400px">
        <div
          className="surface"
          style={{ padding: "var(--space-8)", textAlign: "center" }}
        >
          <p style={{ color: "rgb(var(--muted))" }}>
            {t("checkingPermissions")}
          </p>
        </div>
      </PageContainer>
    );
  }

  // Derive isBlocked for rendering from the normalized status so the UI
  // always reflects what will actually be sent to the database.
  const isBlocked = normalizeStatus(formData.status) === "blocked";

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div>
            <Link
              href={`/${locale}/staff/bookings`}
              style={{
                fontSize: "14px",
                color: "rgb(var(--brand))",
                textDecoration: "none",
                marginBottom: "var(--space-2)",
                display: "inline-block",
              }}
            >
              {t("backToBookings")}
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("title")}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {t("subtitle")}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-6)",
            }}
          >
            <div>
              <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.bookingDetails")}
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "var(--space-4)",
                }}
              >
                <div>
                  <label htmlFor="pickup_at" className="label">
                    {t("fields.pickupAt")}
                  </label>
                  <input
                    id="pickup_at"
                    name="pickup_at"
                    type="datetime-local"
                    className="input"
                    value={formData.pickup_at}
                    onChange={handleChange}
                    required
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label htmlFor="return_at" className="label">
                    {t("fields.returnAt")}
                  </label>
                  <input
                    id="return_at"
                    name="return_at"
                    type="datetime-local"
                    className="input"
                    value={formData.return_at}
                    onChange={handleChange}
                    required
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label htmlFor="vehicle_id" className="label">
                    {t("fields.vehicleOptional")}
                  </label>
                  <select
                    id="vehicle_id"
                    name="vehicle_id"
                    className="input"
                    value={formData.vehicle_id}
                    onChange={handleChange}
                    style={{ width: "100%" }}
                  >
                    <option value="">{t("vehicle.unassigned")}</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.name} ({vehicle.registration_plate})
                      </option>
                    ))}
                  </select>
                  <p className="helper-text">{t("vehicle.helper")}</p>
                </div>

                <div>
                  <label htmlFor="status" className="label">
                    {t("fields.status")}
                  </label>
                  {/* Values are strictly the DB enum tokens: draft | confirmed | blocked */}
                  <select
                    id="status"
                    name="status"
                    className="input"
                    value={formData.status}
                    onChange={handleChange}
                    style={{ width: "100%" }}
                  >
                    <option value="draft">{t("statusOptions.pending")}</option>
                    <option value="confirmed">{t("statusOptions.confirmed")}</option>
                    <option value="blocked">{t("statusOptions.blocked")}</option>
                  </select>
                  <p className="helper-text">{t("statusHelper")}</p>
                </div>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: "18px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.customerDetails")}
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "var(--space-4)",
                }}
              >
                <div>
                  <label htmlFor="customer_name" className="label">
                    {t("fields.customerName")}{" "}
                    {!isBlocked && <span style={{ color: "rgb(var(--error))" }}>*</span>}
                  </label>
                  <input
                    id="customer_name"
                    name="customer_name"
                    type="text"
                    className="input"
                    placeholder={t("placeholders.fullName")}
                    value={formData.customer_name}
                    onChange={handleChange}
                    required={!isBlocked}
                    style={{ width: "100%" }}
                  />
                  {isBlocked && <p className="helper-text">{t("blockedOptionalHelper")}</p>}
                </div>

                <div>
                  <label htmlFor="customer_phone" className="label">
                    {t("fields.customerPhone")}{" "}
                    {!isBlocked && <span style={{ color: "rgb(var(--error))" }}>*</span>}
                  </label>
                  <input
                    id="customer_phone"
                    name="customer_phone"
                    type="tel"
                    className="input"
                    placeholder={t("placeholders.phone")}
                    value={formData.customer_phone}
                    onChange={handleChange}
                    required={!isBlocked}
                    style={{ width: "100%" }}
                  />
                  {isBlocked && <p className="helper-text">{t("blockedOptionalHelper")}</p>}
                </div>

                <div>
                  <label htmlFor="customer_email" className="label">
                    {t("fields.emailOptional")}
                  </label>
                  <input
                    id="customer_email"
                    name="customer_email"
                    type="email"
                    className="input"
                    placeholder={t("placeholders.email")}
                    value={formData.customer_email}
                    onChange={handleChange}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="label">
                {t("fields.notesOptional")}
              </label>
              <textarea
                id="notes"
                name="notes"
                className="input"
                placeholder={t("placeholders.notes")}
                value={formData.notes}
                onChange={handleChange}
                rows={4}
                style={{
                  width: "100%",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {conflictWarning && (
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "rgb(var(--warning) / 0.1)",
                  border: "1px solid rgb(var(--warning) / 0.3)",
                  borderRadius: "var(--radius)",
                  color: "rgb(var(--warning))",
                  fontSize: "14px",
                }}
              >
                {conflictWarning}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "rgb(var(--error) / 0.1)",
                  border: "1px solid rgb(var(--error) / 0.3)",
                  borderRadius: "var(--radius)",
                  color: "rgb(var(--error))",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                paddingTop: "var(--space-2)",
              }}
            >
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !!conflictWarning}
                style={{
                  flex: 1,
                  opacity: loading || conflictWarning ? 0.6 : 1,
                  cursor: loading || conflictWarning ? "not-allowed" : "pointer",
                }}
              >
                {loading ? t("creating") : t("create")}
              </button>
              <Link
                href={`/${locale}/staff/bookings`}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                {t("cancel")}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}