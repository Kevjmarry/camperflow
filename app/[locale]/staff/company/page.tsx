"use client";

import { useState, useEffect, useCallback, FormEvent, ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/contexts/ThemeContext";
import type { ExtraCatalogItem } from "@/contexts/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaqItem {
  question: string;
  answer: string;
}

// ─── AccordionSection ─────────────────────────────────────────────────────────

function AccordionSection({
  sectionKey,
  title,
  isOpen,
  onToggle,
  children,
}: {
  sectionKey: string;
  title: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: "1px solid rgb(var(--border))" }}>
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "var(--space-4) 0", textAlign: "left",
        }}
      >
        <span style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))" }}>{title}</span>
        <span style={{ color: "rgb(var(--muted))", fontSize: "12px", flexShrink: 0, marginLeft: "var(--space-3)" }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>
      {isOpen && (
        <div style={{ paddingBottom: "var(--space-5)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanySettingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { company, loading: themeLoading, refreshCompany } = useTheme();
  const t = useTranslations("staffCompany");

  // ── Company form ───────────────────────────────────────────────────────────

  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    primary_color: "#368F8B",
    secondary_color: "#BC8235",
    emergency_accident_phone_primary: "",
    emergency_accident_phone_secondary: "",
    emergency_breakdown_phone_primary: "",
    emergency_breakdown_phone_secondary: "",
    pickup_time: "",
    dropoff_time: "",
    final_payment_due_days: "",
    final_payment_urgent_days: "",
    // Company identity (for reports)
    address: "",
    email: "",
    registration_id: "",
    vat_id: "",
    // Guest Information
    contact_phone: "",
    contact_whatsapp: "",
    pickup_info: "",
    return_info: "",
    rules_and_tips: "",
    before_arrival_info: "",
    included_items: "",
  });
  const [finalPaymentRemindersEnabled, setFinalPaymentRemindersEnabled] = useState(false);
  const [preArrivalRemindersEnabled, setPreArrivalRemindersEnabled] = useState(true);
  const [returnPrepRemindersEnabled, setReturnPrepRemindersEnabled] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [extrasCatalog, setExtrasCatalog] = useState<ExtraCatalogItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  // isRealAdmin: role === 'admin' only — used for the System Recovery section.
  // isAdmin (above) also includes can_manage and gates the regular form fields.
  const [isRealAdmin, setIsRealAdmin] = useState(false);

  // ── Backlog review ────────────────────────────────────────────────────────

  type BacklogAction = 'complete' | 'cancel' | 'skip';
  interface StaleBooking {
    id: string;
    status: 'draft' | 'confirmed' | 'on_rent';
    customer_name: string | null;
    vehicle_name: string | null;
    return_at: string;
    pending_instances: number;
  }

  const [backlogReviewOpen, setBacklogReviewOpen] = useState(false);
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [backlogBookings, setBacklogBookings] = useState<StaleBooking[]>([]);
  const [backlogDecisions, setBacklogDecisions] = useState<Record<string, BacklogAction>>({});
  const [backlogReason, setBacklogReason] = useState('');
  const [backlogExecuting, setBacklogExecuting] = useState(false);
  const [backlogError, setBacklogError] = useState('');
  const [backlogResult, setBacklogResult] = useState<{
    completed: number; cancelled: number; skipped: number; instances: number;
  } | null>(null);

  // ── Accordion state (all closed by default) ────────────────────────────────

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Auth / profile load ────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/${locale}/staff/login`); return; }

      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("id, role, can_manage")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (profile) {
        setIsAdmin(profile.role === "admin" || profile.can_manage === true);
        setIsRealAdmin(profile.role === "admin");
      }
    };
    init();
  }, [supabase, locale, router]);

  // ── Company → form ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (company) {
      setFormData((prev) => ({
        ...prev,
        name: company.name,
        logo_url: company.logo_url || "",
        primary_color: company.primary_color,
        secondary_color: company.secondary_color,
        pickup_time:           prev.pickup_time,
        dropoff_time:          prev.dropoff_time,
        final_payment_due_days: prev.final_payment_due_days,
      }));
      setLogoPreview(company.logo_url);
      setLoading(false);
    } else if (!themeLoading) {
      setLoading(false);
      setError(t("errors.loadFailed"));
    }
  }, [company, themeLoading, t]);

  // ── Booking defaults + payment reminders + extras → form ──────────────────

  useEffect(() => {
    if (!company?.id) return;
    const load = async () => {
      const [{ data }, { data: companyRow }] = await Promise.all([
        supabase
          .from("company_settings")
          .select("pickup_time, dropoff_time, final_payment_due_days, final_payment_urgent_days, final_payment_reminders_enabled, pre_arrival_reminders_enabled, return_prep_reminders_enabled, contact_phone, contact_whatsapp, pickup_info, return_info, rules_and_tips, before_arrival_info, included_items, faq_items, extras_catalog")
          .eq("id", company.id)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("emergency_accident_phone_primary, emergency_accident_phone_secondary, emergency_breakdown_phone_primary, emergency_breakdown_phone_secondary, address, email, registration_id, vat_id")
          .eq("id", company.id)
          .maybeSingle(),
      ]);
      setFormData((prev) => ({
        ...prev,
        ...(data ? {
          pickup_time:            (data as any).pickup_time            ?? "",
          dropoff_time:           (data as any).dropoff_time           ?? "",
          final_payment_due_days: (data as any).final_payment_due_days != null
                                    ? String((data as any).final_payment_due_days)
                                    : "",
          final_payment_urgent_days: (data as any).final_payment_urgent_days != null
                                    ? String((data as any).final_payment_urgent_days)
                                    : "",
          contact_phone:      (data as any).contact_phone      ?? "",
          contact_whatsapp:   (data as any).contact_whatsapp   ?? "",
          pickup_info:        (data as any).pickup_info        ?? "",
          return_info:        (data as any).return_info        ?? "",
          rules_and_tips:     (data as any).rules_and_tips     ?? "",
          before_arrival_info:(data as any).before_arrival_info?? "",
          included_items:     (data as any).included_items     ?? "",
        } : {}),
        ...(companyRow ? {
          emergency_accident_phone_primary:    (companyRow as any).emergency_accident_phone_primary    ?? "",
          emergency_accident_phone_secondary:  (companyRow as any).emergency_accident_phone_secondary  ?? "",
          emergency_breakdown_phone_primary:   (companyRow as any).emergency_breakdown_phone_primary   ?? "",
          emergency_breakdown_phone_secondary: (companyRow as any).emergency_breakdown_phone_secondary ?? "",
          address:         (companyRow as any).address         ?? "",
          email:           (companyRow as any).email           ?? "",
          registration_id: (companyRow as any).registration_id ?? "",
          vat_id:          (companyRow as any).vat_id          ?? "",
        } : {}),
      }));
      if (data) {
        setFinalPaymentRemindersEnabled(!!(data as any).final_payment_reminders_enabled);
        setPreArrivalRemindersEnabled((data as any).pre_arrival_reminders_enabled ?? true);
        setReturnPrepRemindersEnabled((data as any).return_prep_reminders_enabled ?? true);
        setFaqItems((data as any).faq_items ?? []);
        setExtrasCatalog((data as any).extras_catalog ?? []);
      }
    };
    load();
  }, [company?.id, supabase]);

  // ── Company form handlers ──────────────────────────────────────────────────

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(t("errors.invalidFileType")); return; }
    if (file.size > 2 * 1024 * 1024)    { setError(t("errors.fileTooLarge"));     return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError("");
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile || !company) return null;
    try {
      setUploadingLogo(true);
      const ext = logoFile.name.split(".").pop();
      const fileName = `${company.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("company-logos")
        .upload(fileName, logoFile, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;
      return supabase.storage.from("company-logos").getPublicUrl(fileName).data.publicUrl;
    } catch (err: any) {
      setError(err.message || t("errors.uploadLogoFailed"));
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess(false); setSaving(true);
    if (!formData.name.trim()) { setError(t("errors.companyNameRequired")); setSaving(false); return; }
    try {
      let finalLogoUrl = formData.logo_url;
      if (logoFile) {
        const url = await uploadLogo();
        if (!url) { setSaving(false); return; }
        finalLogoUrl = url;
      }
      const parsedDueDays = formData.final_payment_due_days.trim()
        ? parseInt(formData.final_payment_due_days, 10)
        : null;
      const parsedUrgentDays = formData.final_payment_urgent_days.trim()
        ? parseInt(formData.final_payment_urgent_days, 10)
        : null;

      // Save branding + contact fields to companies
      const { data: companiesRows, error: saveErr } = await supabase
        .from("companies")
        .update({
          name:                                formData.name.trim(),
          logo_url:                            finalLogoUrl || null,
          primary_color:                       formData.primary_color,
          secondary_color:                     formData.secondary_color,
          emergency_accident_phone_primary:    formData.emergency_accident_phone_primary.trim()    || null,
          emergency_accident_phone_secondary:  formData.emergency_accident_phone_secondary.trim()  || null,
          emergency_breakdown_phone_primary:   formData.emergency_breakdown_phone_primary.trim()   || null,
          emergency_breakdown_phone_secondary: formData.emergency_breakdown_phone_secondary.trim() || null,
          address:         formData.address.trim()         || null,
          email:           formData.email.trim()           || null,
          registration_id: formData.registration_id.trim() || null,
          vat_id:          formData.vat_id.trim()          || null,
        })
        .eq("id", company?.id)
        .select("id");
      if (saveErr) throw saveErr;
      if (!companiesRows || companiesRows.length === 0) throw new Error("Failed to save company row.");

      // Save booking defaults + payment settings + guest info + extras to company_settings
      const { data: settingsRows, error: settingsErr } = await supabase
        .from("company_settings")
        .update({
          pickup_time:                     formData.pickup_time.trim()  || null,
          dropoff_time:                    formData.dropoff_time.trim() || null,
          final_payment_due_days:          parsedDueDays,
          final_payment_urgent_days:       parsedUrgentDays,
          final_payment_reminders_enabled: finalPaymentRemindersEnabled,
          pre_arrival_reminders_enabled:   preArrivalRemindersEnabled,
          return_prep_reminders_enabled:   returnPrepRemindersEnabled,
          contact_phone:                   formData.contact_phone.trim()       || null,
          contact_whatsapp:                formData.contact_whatsapp.trim()    || null,
          pickup_info:                     formData.pickup_info.trim()         || null,
          return_info:                     formData.return_info.trim()         || null,
          rules_and_tips:                  formData.rules_and_tips.trim()      || null,
          before_arrival_info:             formData.before_arrival_info.trim() || null,
          included_items:                  formData.included_items.trim()      || null,
          faq_items:                       faqItems.length > 0 ? faqItems : null,
          extras_catalog:                  extrasCatalog.length > 0 ? extrasCatalog : null,
        })
        .eq("id", company?.id)
        .select("id");
      if (settingsErr) throw settingsErr;
      if (!settingsRows || settingsRows.length === 0) throw new Error("Failed to save company settings row.");
      await refreshCompany();
      setSuccess(true); setLogoFile(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || t("errors.saveSettingsFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── Backlog review handlers ───────────────────────────────────────────────

  const openBacklogReview = async () => {
    setBacklogReviewOpen(true);
    setBacklogBookings([]);
    setBacklogDecisions({});
    setBacklogReason('');
    setBacklogResult(null);
    setBacklogError('');
    setBacklogLoading(true);
    try {
      const res = await fetch('/api/staff/admin/backlog-review');
      if (!res.ok) throw new Error(t('systemRecovery.backlogReview.errorLoad'));
      const data = await res.json();
      const bookings: StaleBooking[] = data.bookings ?? [];
      setBacklogBookings(bookings);
      const defaults: Record<string, BacklogAction> = {};
      for (const b of bookings) {
        defaults[b.id] = b.status === 'on_rent' ? 'complete' : 'skip';
      }
      setBacklogDecisions(defaults);
    } catch (err: any) {
      setBacklogError(err.message || t('systemRecovery.backlogReview.errorLoad'));
    } finally {
      setBacklogLoading(false);
    }
  };

  const executeBacklogReview = async () => {
    if (backlogReason.trim().length < 10) return;
    setBacklogExecuting(true);
    setBacklogError('');
    try {
      const decisions = Object.entries(backlogDecisions).map(([id, action]) => ({ id, action }));
      const res = await fetch('/api/staff/admin/backlog-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions, reason: backlogReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('systemRecovery.backlogReview.errorSubmit'));
      }
      const data = await res.json();
      setBacklogResult({
        completed: data.closed.completed,
        cancelled: data.closed.cancelled,
        skipped: data.closed.skipped,
        instances: data.instances_closed,
      });
      setBacklogBookings([]);
    } catch (err: any) {
      setBacklogError(err.message || t('systemRecovery.backlogReview.errorSubmit'));
    } finally {
      setBacklogExecuting(false);
    }
  };

  // ── Early return: loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>
            {t("loading")}
          </div>
        </div>
      </PageContainer>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

          {/* Page header */}
          <div>
            <Link
              href={`/${locale}/staff`}
              style={{ fontSize: "14px", color: "rgb(var(--brand))", textDecoration: "none", marginBottom: "var(--space-2)", display: "inline-block" }}
            >
              {t("navigation.backToDashboard")}
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>{t("title")}</h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {isAdmin ? t("description.admin") : t("description.viewer")}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

            {/* Company Information */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.information")}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                <div>
                  <label htmlFor="name" className="label">{t("labels.companyName")}</label>
                  <input
                    id="name" name="name" type="text" className="input"
                    placeholder={t("placeholders.companyName")}
                    value={formData.name} onChange={handleChange}
                    required disabled={!isAdmin}
                    style={{ width: "100%", maxWidth: "400px" }}
                  />
                </div>
                <div>
                  <label htmlFor="address" className="label">{t("labels.address")}</label>
                  <textarea
                    id="address" name="address" className="input"
                    placeholder={t("placeholders.address")}
                    value={formData.address} onChange={handleChange}
                    disabled={!isAdmin}
                    rows={3}
                    style={{ width: "100%", maxWidth: "500px", resize: "vertical", fontFamily: "inherit" }}
                  />
                  <p className="helper-text">{t("helpers.addressUsage")}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", maxWidth: "600px" }}>
                  <div>
                    <label htmlFor="email" className="label">{t("labels.companyEmail")}</label>
                    <input
                      id="email" name="email" type="email" className="input"
                      placeholder={t("placeholders.companyEmail")}
                      value={formData.email} onChange={handleChange}
                      disabled={!isAdmin} style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="registration_id" className="label">{t("labels.registrationId")}</label>
                    <input
                      id="registration_id" name="registration_id" type="text" className="input"
                      placeholder={t("placeholders.registrationId")}
                      value={formData.registration_id} onChange={handleChange}
                      disabled={!isAdmin} style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="vat_id" className="label">{t("labels.vatId")}</label>
                    <input
                      id="vat_id" name="vat_id" type="text" className="input"
                      placeholder={t("placeholders.vatId")}
                      value={formData.vat_id} onChange={handleChange}
                      disabled={!isAdmin} style={{ width: "100%" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Logo */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.logo")}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {logoPreview && (
                  <div style={{ width: "200px", height: "80px", border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-3)", background: "rgb(var(--surface))" }}>
                    <img src={logoPreview} alt={t("preview.logoAlt")} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                )}
                {isAdmin && (
                  <div>
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoChange} style={{ display: "none" }} id="logo-upload" />
                    <label htmlFor="logo-upload" className="btn btn-secondary" style={{ cursor: "pointer" }}>
                      {logoPreview ? t("actions.changeLogo") : t("actions.uploadLogo")}
                    </label>
                    <p className="helper-text" style={{ marginTop: "var(--space-2)" }}>{t("helpers.logoRequirements")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Brand Colours */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.brandColors")}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)" }}>
                <div>
                  <label htmlFor="primary_color" className="label">{t("labels.primaryColor")}</label>
                  <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                    <input type="color" id="primary_color" name="primary_color" value={formData.primary_color} onChange={handleChange} disabled={!isAdmin}
                      style={{ width: "60px", height: "44px", border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", cursor: isAdmin ? "pointer" : "not-allowed" }} />
                    <input type="text" value={formData.primary_color} onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })} className="input" disabled={!isAdmin} style={{ flex: 1 }} placeholder="#368F8B" />
                  </div>
                  <p className="helper-text">{t("helpers.primaryColorUsage")}</p>
                </div>
                <div>
                  <label htmlFor="secondary_color" className="label">{t("labels.secondaryColor")}</label>
                  <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                    <input type="color" id="secondary_color" name="secondary_color" value={formData.secondary_color} onChange={handleChange} disabled={!isAdmin}
                      style={{ width: "60px", height: "44px", border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", cursor: isAdmin ? "pointer" : "not-allowed" }} />
                    <input type="text" value={formData.secondary_color} onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })} className="input" disabled={!isAdmin} style={{ flex: 1 }} placeholder="#BC8235" />
                  </div>
                  <p className="helper-text">{t("helpers.secondaryColorUsage")}</p>
                </div>
              </div>
            </div>

            {/* Preview — directly under Brand Colors */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.preview")}
              </h2>
              <div className="surface" style={{ padding: "var(--space-6)" }}>
                <div style={{ background: "white", border: "1px solid rgb(var(--border))", padding: "var(--space-4)", borderRadius: "var(--radius)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  {logoPreview && <img src={logoPreview} alt={t("preview.logoInHeader")} style={{ height: "32px", maxWidth: "120px", objectFit: "contain" }} />}
                  <span style={{ color: "rgb(var(--text))", fontWeight: 600 }}>{formData.name || t("placeholders.yourCompany")}</span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
                  <div style={{ padding: "var(--space-3) var(--space-6)", background: formData.primary_color, color: "white", borderRadius: "var(--radius)", fontWeight: 500, fontSize: "15px" }}>
                    {t("preview.primaryButton")}
                  </div>
                  <div style={{ padding: "var(--space-3) var(--space-6)", background: "white", color: formData.primary_color, border: `1px solid ${formData.primary_color}`, borderRadius: "var(--radius)", fontWeight: 500, fontSize: "15px" }}>
                    {t("preview.secondaryButton")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  <div style={{ padding: "var(--space-2) var(--space-3)", background: `${formData.primary_color}15`, color: formData.primary_color, borderRadius: "var(--radius)", fontSize: "14px", fontWeight: 500 }}>
                    {t("preview.statusOnRent")}
                  </div>
                  <div style={{ padding: "var(--space-2) var(--space-3)", background: `${formData.secondary_color}15`, color: formData.secondary_color, borderRadius: "var(--radius)", fontSize: "14px", fontWeight: 500 }}>
                    {t("preview.statusNeedsCleaning")}
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contacts */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.emergencyContacts")}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "var(--space-3)", color: "rgb(var(--text))" }}>
                    {t("labels.accidentNumbers")}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
                    <div>
                      <label htmlFor="emergency_accident_phone_primary" className="label">{t("labels.primaryPhone")}</label>
                      <input id="emergency_accident_phone_primary" name="emergency_accident_phone_primary" type="tel" className="input"
                        placeholder={t("placeholders.phonePlaceholder")} value={formData.emergency_accident_phone_primary}
                        onChange={handleChange} disabled={!isAdmin} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <label htmlFor="emergency_accident_phone_secondary" className="label">{t("labels.secondaryPhone")}</label>
                      <input id="emergency_accident_phone_secondary" name="emergency_accident_phone_secondary" type="tel" className="input"
                        placeholder={t("placeholders.phonePlaceholder")} value={formData.emergency_accident_phone_secondary}
                        onChange={handleChange} disabled={!isAdmin} style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "var(--space-3)", color: "rgb(var(--text))" }}>
                    {t("labels.breakdownNumbers")}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
                    <div>
                      <label htmlFor="emergency_breakdown_phone_primary" className="label">{t("labels.primaryPhone")}</label>
                      <input id="emergency_breakdown_phone_primary" name="emergency_breakdown_phone_primary" type="tel" className="input"
                        placeholder={t("placeholders.phonePlaceholder")} value={formData.emergency_breakdown_phone_primary}
                        onChange={handleChange} disabled={!isAdmin} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <label htmlFor="emergency_breakdown_phone_secondary" className="label">{t("labels.secondaryPhone")}</label>
                      <input id="emergency_breakdown_phone_secondary" name="emergency_breakdown_phone_secondary" type="tel" className="input"
                        placeholder={t("placeholders.phonePlaceholder")} value={formData.emergency_breakdown_phone_secondary}
                        onChange={handleChange} disabled={!isAdmin} style={{ width: "100%" }} />
                    </div>
                  </div>
                  <p className="helper-text" style={{ marginTop: "var(--space-2)" }}>{t("helpers.emergencyPhoneUsage")}</p>
                </div>
              </div>
            </div>

            {/* Booking Defaults */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                Booking defaults
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)" }}>
                <div>
                  <label htmlFor="pickup_time" className="label">Default pick-up time</label>
                  <input
                    id="pickup_time" name="pickup_time" type="time" className="input"
                    value={formData.pickup_time} onChange={handleChange}
                    disabled={!isAdmin} style={{ width: "100%" }}
                  />
                  <p className="helper-text">Applied to new bookings as the default pick-up time.</p>
                </div>
                <div>
                  <label htmlFor="dropoff_time" className="label">Default drop-off time</label>
                  <input
                    id="dropoff_time" name="dropoff_time" type="time" className="input"
                    value={formData.dropoff_time} onChange={handleChange}
                    disabled={!isAdmin} style={{ width: "100%" }}
                  />
                  <p className="helper-text">Applied to new bookings as the default drop-off time.</p>
                </div>
              </div>
            </div>

            {/* Reminders */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-2)", color: "rgb(var(--text))" }}>
                Reminders
              </h2>
              <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>
                Controls which reminders appear for staff in the Operations dashboard.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

                {/* Balance invoice reminder */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: isAdmin ? "pointer" : "default" }}>
                      <input
                        type="checkbox"
                        checked={finalPaymentRemindersEnabled}
                        onChange={(e) => setFinalPaymentRemindersEnabled(e.target.checked)}
                        disabled={!isAdmin}
                      />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                        Enable balance invoice reminders
                      </span>
                    </label>
                    <p className="helper-text" style={{ marginTop: "var(--space-1)", marginLeft: "calc(16px + var(--space-3))" }}>
                      Reminds staff to send the remaining 50% invoice for bookings set to <strong>50% now + 50% later</strong>. Bookings set to <strong>100% upfront</strong> are always excluded.
                    </p>
                  </div>
                  {finalPaymentRemindersEnabled && (
                    <>
                      <div style={{ marginLeft: "calc(16px + var(--space-3))", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                        <div>
                          <label htmlFor="final_payment_due_days" className="label">Reminder window starts (days before pickup)</label>
                          <input
                            id="final_payment_due_days" name="final_payment_due_days" type="number"
                            min="0" step="1" className="input"
                            placeholder="e.g. 35"
                            value={formData.final_payment_due_days} onChange={handleChange}
                            disabled={!isAdmin} style={{ width: "100%", maxWidth: "160px" }}
                          />
                          <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                            The reminder appears this many days before pickup.
                          </p>
                        </div>
                        <div>
                          <label htmlFor="final_payment_urgent_days" className="label">100% upfront cutoff (days before pickup)</label>
                          <input
                            id="final_payment_urgent_days" name="final_payment_urgent_days" type="number"
                            min="0" step="1" className="input"
                            placeholder="e.g. 30"
                            value={formData.final_payment_urgent_days} onChange={handleChange}
                            disabled={!isAdmin} style={{ width: "100%", maxWidth: "160px" }}
                          />
                          <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                            Bookings with pickup this soon are treated as <strong>100% upfront</strong> — no remaining-balance reminder is shown, even if the booking is set to 50% now + 50% later.
                          </p>
                        </div>
                        <p className="helper-text" style={{ fontStyle: "italic" }}>
                          Example: with 35 and 30, reminders appear for split bookings 31–35 days before pickup.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Pre-arrival WhatsApp reminder */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: isAdmin ? "pointer" : "default" }}>
                    <input
                      type="checkbox"
                      checked={preArrivalRemindersEnabled}
                      onChange={(e) => setPreArrivalRemindersEnabled(e.target.checked)}
                      disabled={!isAdmin}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                      Enable pre-arrival WhatsApp reminders
                    </span>
                  </label>
                  <p className="helper-text" style={{ marginTop: "var(--space-1)", marginLeft: "calc(16px + var(--space-3))" }}>
                    Reminds staff to send a WhatsApp message to the customer the day before pickup.
                  </p>
                </div>

                {/* Return-prep WhatsApp reminder */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: isAdmin ? "pointer" : "default" }}>
                    <input
                      type="checkbox"
                      checked={returnPrepRemindersEnabled}
                      onChange={(e) => setReturnPrepRemindersEnabled(e.target.checked)}
                      disabled={!isAdmin}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                      Enable return-prep WhatsApp reminders
                    </span>
                  </label>
                  <p className="helper-text" style={{ marginTop: "var(--space-1)", marginLeft: "calc(16px + var(--space-3))" }}>
                    Reminds staff to send a WhatsApp message to the customer the day before return.
                  </p>
                </div>

              </div>
            </div>

            {/* Extras Catalog */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-2)", color: "rgb(var(--text))" }}>
                Extras catalog
              </h2>
              <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>
                Define the extras available for bookings (e.g. child seat, bike rack). Staff select from this list when creating or editing a booking.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {extrasCatalog.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--space-3)",
                      border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)",
                      padding: "var(--space-3) var(--space-4)",
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="Extra name"
                      value={item.name}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setExtrasCatalog(extrasCatalog.map((x) =>
                          x.id === item.id ? { ...x, name: e.target.value } : x
                        ))
                      }
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: isAdmin ? "pointer" : "default", flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={item.active}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          setExtrasCatalog(extrasCatalog.map((x) =>
                            x.id === item.id ? { ...x, active: e.target.checked } : x
                          ))
                        }
                      />
                      <span style={{ fontSize: "13px", color: "rgb(var(--muted))", whiteSpace: "nowrap" }}>Active</span>
                    </label>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setExtrasCatalog(extrasCatalog.filter((x) => x.id !== item.id))}
                        style={{ fontSize: "12px", color: "rgb(var(--error))", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      setExtrasCatalog([...extrasCatalog, { id: crypto.randomUUID(), name: "", active: true }])
                    }
                    style={{ alignSelf: "flex-start", fontSize: "14px", marginTop: "var(--space-1)" }}
                  >
                    Add extra
                  </button>
                )}
                {extrasCatalog.length === 0 && !isAdmin && (
                  <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>No extras configured.</p>
                )}
              </div>
            </div>

            {/* Guest Information */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-2)", color: "rgb(var(--text))" }}>
                Guest Information
              </h2>
              <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>
                Content shown to guests in their rental portal — pick-up instructions, house rules, etc.
              </p>

              {/* Contact numbers — always visible */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}>
                <div>
                  <label htmlFor="contact_phone" className="label">Contact phone</label>
                  <input
                    id="contact_phone" name="contact_phone" type="tel" className="input"
                    placeholder="+49 30 12345678"
                    value={formData.contact_phone} onChange={handleChange}
                    disabled={!isAdmin} style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label htmlFor="contact_whatsapp" className="label">WhatsApp number</label>
                  <input
                    id="contact_whatsapp" name="contact_whatsapp" type="tel" className="input"
                    placeholder="+49 30 12345678"
                    value={formData.contact_whatsapp} onChange={handleChange}
                    disabled={!isAdmin} style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Accordion text sections */}
              <AccordionSection sectionKey="pickup_info" title="Pick-up information" isOpen={!!openSections["pickup_info"]} onToggle={toggleSection}>
                <textarea
                  id="pickup_info" name="pickup_info" className="input"
                  placeholder="Where to find keys, access codes, parking…"
                  value={formData.pickup_info} onChange={handleChange}
                  disabled={!isAdmin}
                  rows={10}
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </AccordionSection>

              <AccordionSection sectionKey="return_info" title="Return information" isOpen={!!openSections["return_info"]} onToggle={toggleSection}>
                <textarea
                  id="return_info" name="return_info" className="input"
                  placeholder="Where to drop keys, cleaning expectations…"
                  value={formData.return_info} onChange={handleChange}
                  disabled={!isAdmin}
                  rows={10}
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </AccordionSection>

              <AccordionSection sectionKey="before_arrival_info" title="Before arrival" isOpen={!!openSections["before_arrival_info"]} onToggle={toggleSection}>
                <textarea
                  id="before_arrival_info" name="before_arrival_info" className="input"
                  placeholder="What guests should prepare before they arrive…"
                  value={formData.before_arrival_info} onChange={handleChange}
                  disabled={!isAdmin}
                  rows={10}
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </AccordionSection>

              <AccordionSection sectionKey="included_items" title="What's included" isOpen={!!openSections["included_items"]} onToggle={toggleSection}>
                <textarea
                  id="included_items" name="included_items" className="input"
                  placeholder="List items included with the rental…"
                  value={formData.included_items} onChange={handleChange}
                  disabled={!isAdmin}
                  rows={10}
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </AccordionSection>

              <AccordionSection sectionKey="rules_and_tips" title="Rules & tips" isOpen={!!openSections["rules_and_tips"]} onToggle={toggleSection}>
                <textarea
                  id="rules_and_tips" name="rules_and_tips" className="input"
                  placeholder="House rules, tips for the road…"
                  value={formData.rules_and_tips} onChange={handleChange}
                  disabled={!isAdmin}
                  rows={10}
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </AccordionSection>

              <AccordionSection sectionKey="faq" title="FAQ" isOpen={!!openSections["faq"]} onToggle={toggleSection}>
                <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>
                  Frequently asked questions shown to guests in their rental portal.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  {faqItems.map((item, i) => (
                    <div key={i} style={{ border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                        <label className="label" style={{ margin: 0 }}>Question {i + 1}</label>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setFaqItems(faqItems.filter((_, idx) => idx !== i))}
                            style={{ fontSize: "12px", color: "rgb(var(--error))", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        className="input"
                        placeholder="Question"
                        value={item.question}
                        disabled={!isAdmin}
                        onChange={(e) => setFaqItems(faqItems.map((f, idx) => idx === i ? { ...f, question: e.target.value } : f))}
                        style={{ width: "100%" }}
                      />
                      <textarea
                        className="input"
                        placeholder="Answer"
                        value={item.answer}
                        disabled={!isAdmin}
                        onChange={(e) => setFaqItems(faqItems.map((f, idx) => idx === i ? { ...f, answer: e.target.value } : f))}
                        rows={5}
                        style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  ))}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFaqItems([...faqItems, { question: "", answer: "" }])}
                      style={{ alignSelf: "flex-start", fontSize: "14px" }}
                    >
                      Add FAQ
                    </button>
                  )}
                  {faqItems.length === 0 && !isAdmin && (
                    <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>No FAQ items configured.</p>
                  )}
                </div>
              </AccordionSection>
            </div>

            {/* Form feedback */}
            {error && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--error) / 0.1)", border: "1px solid rgb(var(--error) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--error))", fontSize: "14px" }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--success) / 0.1)", border: "1px solid rgb(var(--success) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--success))", fontSize: "14px" }}>
                {t("success.saved")}
              </div>
            )}

            {isAdmin && (
              <div style={{ display: "flex", gap: "var(--space-3)", paddingTop: "var(--space-2)" }}>
                <button type="submit" className="btn btn-primary" disabled={saving || uploadingLogo}
                  style={{ opacity: saving || uploadingLogo ? 0.6 : 1, cursor: saving || uploadingLogo ? "not-allowed" : "pointer" }}>
                  {saving ? t("actions.saving") : uploadingLogo ? t("actions.uploadingLogo") : t("actions.saveChanges")}
                </button>
                <Link href={`/${locale}/staff`} className="btn btn-secondary">{t("actions.cancel")}</Link>
              </div>
            )}
          </form>

          {/* System Recovery — real admin only (role === 'admin'), outside the settings form */}
          {isRealAdmin && (
            <div style={{ borderTop: "2px solid rgb(var(--border))", paddingTop: "var(--space-6)" }}>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-2)", color: "rgb(var(--text))" }}>
                {t("systemRecovery.title")}
              </h2>
              <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>
                {t("systemRecovery.description")}
              </p>
              <div style={{
                border: "1px solid rgb(var(--error) / 0.3)",
                borderRadius: "var(--radius)",
                padding: "var(--space-5)",
                background: "rgb(var(--error) / 0.04)",
              }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-2)" }}>
                  {t("systemRecovery.backlogReview.title")}
                </h3>
                <p style={{ fontSize: "14px", color: "rgb(var(--muted))", marginBottom: "var(--space-4)", lineHeight: "1.5" }}>
                  {t("systemRecovery.backlogReview.description")}
                </p>
                <button
                  type="button"
                  onClick={openBacklogReview}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    background: "rgb(var(--error))",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {t("systemRecovery.backlogReview.button")}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Backlog review modal */}
      {backlogReviewOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !backlogExecuting) setBacklogReviewOpen(false);
          }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)",
          }}
        >
          <div className="surface" style={{
            maxWidth: 680, width: "100%", maxHeight: "90vh",
            padding: "var(--space-6)",
            display: "flex", flexDirection: "column", gap: "var(--space-4)",
            overflowY: "auto",
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "rgb(var(--text))", margin: 0 }}>
              {t("systemRecovery.backlogReview.modal.title")}
            </h2>

            {/* Loading */}
            {backlogLoading && (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))", margin: 0 }}>
                {t("systemRecovery.backlogReview.modal.loading")}
              </p>
            )}

            {/* Empty state */}
            {!backlogLoading && !backlogResult && backlogBookings.length === 0 && !backlogError && (
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))", margin: 0 }}>
                {t("systemRecovery.backlogReview.modal.empty")}
              </p>
            )}

            {/* Booking list */}
            {!backlogLoading && !backlogResult && backlogBookings.length > 0 && (
              <>
                {/* Bulk shortcut */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <p style={{ fontSize: "13px", color: "rgb(var(--muted))", margin: 0 }}>
                    {t("systemRecovery.backlogReview.modal.listHint")}
                  </p>
                  {backlogBookings.some((b) => b.status === 'on_rent') && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "13px", whiteSpace: "nowrap" }}
                      onClick={() => {
                        setBacklogDecisions((prev) => {
                          const next = { ...prev };
                          for (const b of backlogBookings) {
                            if (b.status === 'on_rent') next[b.id] = 'complete';
                          }
                          return next;
                        });
                      }}
                    >
                      {t("systemRecovery.backlogReview.modal.markAllOnRentComplete")}
                    </button>
                  )}
                </div>

                {/* Rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {backlogBookings.map((b) => {
                    const decision = backlogDecisions[b.id] ?? 'skip';
                    const returnDate = new Date(b.return_at).toLocaleDateString(locale, {
                      day: 'numeric', month: 'short', year: 'numeric',
                    });
                    return (
                      <div key={b.id} style={{
                        border: "1px solid rgb(var(--border))",
                        borderRadius: "var(--radius)",
                        padding: "var(--space-3) var(--space-4)",
                        display: "flex", flexDirection: "column", gap: "var(--space-2)",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                              {b.customer_name ?? '—'}
                            </span>
                            <span style={{ fontSize: "12px", color: "rgb(var(--muted))" }}>
                              {b.vehicle_name ?? '—'} · {t("systemRecovery.backlogReview.modal.returnedLabel")} {returnDate}
                              {b.pending_instances > 0 && (
                                <> · {t("systemRecovery.backlogReview.modal.instancesLabel", { count: b.pending_instances })}</>
                              )}
                            </span>
                          </div>
                          <span style={{
                            fontSize: "11px", fontWeight: 600, padding: "2px 8px",
                            borderRadius: "9999px",
                            background: b.status === 'on_rent'
                              ? "rgb(var(--warning) / 0.15)"
                              : "rgb(var(--muted) / 0.15)",
                            color: b.status === 'on_rent'
                              ? "rgb(var(--warning))"
                              : "rgb(var(--muted))",
                          }}>
                            {b.status}
                          </span>
                        </div>

                        {/* Action selector */}
                        <div style={{ display: "flex", gap: "var(--space-2)" }}>
                          {(['complete', 'cancel', 'skip'] as BacklogAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => setBacklogDecisions((prev) => ({ ...prev, [b.id]: action }))}
                              style={{
                                padding: "var(--space-1) var(--space-3)",
                                fontSize: "12px",
                                fontWeight: 500,
                                borderRadius: "var(--radius)",
                                border: "1px solid",
                                cursor: "pointer",
                                borderColor: decision === action
                                  ? action === 'complete' ? "rgb(var(--success))"
                                    : action === 'cancel' ? "rgb(var(--error))"
                                    : "rgb(var(--border))"
                                  : "rgb(var(--border))",
                                background: decision === action
                                  ? action === 'complete' ? "rgb(var(--success) / 0.12)"
                                    : action === 'cancel' ? "rgb(var(--error) / 0.12)"
                                    : "rgb(var(--muted) / 0.12)"
                                  : "transparent",
                                color: decision === action
                                  ? action === 'complete' ? "rgb(var(--success))"
                                    : action === 'cancel' ? "rgb(var(--error))"
                                    : "rgb(var(--muted))"
                                  : "rgb(var(--muted))",
                              }}
                            >
                              {t(`systemRecovery.backlogReview.modal.action_${action}`)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reason */}
                {Object.values(backlogDecisions).some((a) => a !== 'skip') && (
                  <div>
                    <label className="label">{t("systemRecovery.backlogReview.modal.reasonLabel")}</label>
                    <textarea
                      className="input"
                      placeholder={t("systemRecovery.backlogReview.modal.reasonPlaceholder")}
                      value={backlogReason}
                      onChange={(e) => setBacklogReason(e.target.value)}
                      rows={3}
                      style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                    />
                    {backlogReason.trim().length > 0 && backlogReason.trim().length < 10 && (
                      <p style={{ fontSize: "12px", color: "rgb(var(--error))", marginTop: "var(--space-1)" }}>
                        {t("systemRecovery.backlogReview.modal.reasonMinLength")}
                      </p>
                    )}
                    <p style={{ fontSize: "12px", color: "rgb(var(--muted))", marginTop: "var(--space-1)", fontStyle: "italic" }}>
                      {t("systemRecovery.backlogReview.modal.warning")}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Success */}
            {backlogResult && (
              <p style={{ fontSize: "14px", color: "rgb(var(--success))", margin: 0 }}>
                {t("systemRecovery.backlogReview.modal.success", {
                  completed: backlogResult.completed,
                  cancelled: backlogResult.cancelled,
                  skipped: backlogResult.skipped,
                  instances: backlogResult.instances,
                })}
              </p>
            )}

            {/* Error */}
            {backlogError && (
              <div style={{
                padding: "var(--space-3) var(--space-4)",
                background: "rgb(var(--error) / 0.1)",
                border: "1px solid rgb(var(--error) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--error))",
                fontSize: "14px",
              }}>
                {backlogError}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", paddingTop: "var(--space-2)" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBacklogReviewOpen(false)}
                disabled={backlogExecuting}
              >
                {backlogResult
                  ? t("systemRecovery.backlogReview.modal.close")
                  : t("systemRecovery.backlogReview.modal.cancel")}
              </button>
              {!backlogResult && backlogBookings.length > 0 &&
               Object.values(backlogDecisions).some((a) => a !== 'skip') && (
                <button
                  type="button"
                  onClick={executeBacklogReview}
                  disabled={backlogExecuting || backlogReason.trim().length < 10}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    background: (backlogExecuting || backlogReason.trim().length < 10)
                      ? "rgb(var(--error) / 0.45)"
                      : "rgb(var(--error))",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius)",
                    cursor: (backlogExecuting || backlogReason.trim().length < 10)
                      ? "not-allowed"
                      : "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {backlogExecuting
                    ? t("systemRecovery.backlogReview.modal.submitting")
                    : t("systemRecovery.backlogReview.modal.submit")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  );
}
