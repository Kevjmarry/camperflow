"use client";

import { useState, useEffect, useCallback, FormEvent, ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/contexts/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string | null;
  role: string;
  can_manage: boolean;
  is_active?: boolean | null;
  status?: string | null;
}

const ROLE_OPTIONS = ["admin", "cleaning", "mechanical"] as const;

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
  });
  const [finalPaymentRemindersEnabled, setFinalPaymentRemindersEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);

  // ── Staff team ─────────────────────────────────────────────────────────────

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffSuccess, setStaffSuccess] = useState("");
  const [updatingStaffId, setUpdatingStaffId] = useState<string | null>(null);
  const [hasStatusColumns, setHasStatusColumns] = useState(false);

  // Invite (plain state — invite UI is a div, not a form)
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("cleaning");
  const [inviteCanManage, setInviteCanManage] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

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
        setCurrentStaffId(profile.id);
      }
    };
    init();
  }, [supabase, locale, router]);

  // ── Company → form ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name,
        logo_url: company.logo_url || "",
        primary_color: company.primary_color,
        secondary_color: company.secondary_color,
        emergency_accident_phone_primary:    (company as any).emergency_accident_phone_primary    ?? "",
        emergency_accident_phone_secondary:  (company as any).emergency_accident_phone_secondary  ?? "",
        emergency_breakdown_phone_primary:   (company as any).emergency_breakdown_phone_primary   ?? "",
        emergency_breakdown_phone_secondary: (company as any).emergency_breakdown_phone_secondary ?? "",
        pickup_time:                         "",
        dropoff_time:                        "",
        final_payment_due_days:              "",
      });
      setLogoPreview(company.logo_url);
      setLoading(false);
    } else if (!themeLoading) {
      setLoading(false);
      setError(t("errors.loadFailed"));
    }
  }, [company, themeLoading, t]);

  // ── Booking defaults + payment reminders → form (company_settings fetch) ───

  useEffect(() => {
    if (!company?.id) return;
    const load = async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("pickup_time, dropoff_time, final_payment_due_days, final_payment_reminders_enabled")
        .eq("id", company.id)
        .maybeSingle();
      if (data) {
        setFormData((prev) => ({
          ...prev,
          pickup_time:            (data as any).pickup_time            ?? "",
          dropoff_time:           (data as any).dropoff_time           ?? "",
          final_payment_due_days: (data as any).final_payment_due_days != null
                                    ? String((data as any).final_payment_due_days)
                                    : "",
        }));
        setFinalPaymentRemindersEnabled(!!(data as any).final_payment_reminders_enabled);
      }
    };
    load();
  }, [company?.id, supabase]);

  // ── Staff load (two-step, safe scoping) ────────────────────────────────────

  const loadStaff = useCallback(async () => {
    if (!company?.id) return;
    setStaffLoading(true);
    setStaffError("");
    try {
      const BASE = "id, auth_user_id, email, name, role, can_manage";

      // Step 1 — base fetch; try company_id first, fall back to RLS
      let baseRows: StaffMember[] = [];
      const byCompany = await supabase
        .from("staff_profiles")
        .select(BASE)
        .eq("company_id", company.id)
        .order("name", { ascending: true });

      if (!byCompany.error) {
        baseRows = (byCompany.data ?? []) as StaffMember[];
      } else {
        const byRls = await supabase
          .from("staff_profiles")
          .select(BASE)
          .order("name", { ascending: true });
        if (byRls.error) throw byRls.error;
        baseRows = (byRls.data ?? []) as StaffMember[];
      }

      // Step 2 — probe optional status columns
      let statusMap: Record<string, { is_active?: boolean | null; status?: string | null }> = {};
      let gotStatus = false;

      if (baseRows.length > 0) {
        const ids = baseRows.map((r) => r.id);
        const statusRes = await supabase
          .from("staff_profiles")
          .select("id, is_active, status")
          .in("id", ids);

        if (!statusRes.error && statusRes.data) {
          const anyPopulated = (statusRes.data as any[]).some(
            (r) => r.is_active !== null || r.status !== null
          );
          if (anyPopulated) {
            gotStatus = true;
            for (const r of statusRes.data as any[]) {
              statusMap[r.id] = { is_active: r.is_active, status: r.status };
            }
          }
        }
        // if statusRes errored, columns don't exist — stay silent
      }

      setHasStatusColumns(gotStatus);
      setStaffList(baseRows.map((r) => ({ ...r, ...(statusMap[r.id] ?? {}) })));
    } catch (err: any) {
      setStaffError(err.message || "Failed to load staff.");
    } finally {
      setStaffLoading(false);
    }
  }, [company?.id, supabase]);

  useEffect(() => {
    if (company?.id) loadStaff();
  }, [company?.id, loadStaff]);

  // ── Company form handlers ──────────────────────────────────────────────────

  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
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

      // Save branding + contact fields to companies
      const { error: saveErr } = await supabase
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
        })
        .eq("id", company?.id);
      if (saveErr) throw saveErr;

      // Save booking defaults + payment settings to company_settings
      const { error: settingsErr } = await supabase
        .from("company_settings")
        .update({
          pickup_time:                     formData.pickup_time.trim()  || null,
          dropoff_time:                    formData.dropoff_time.trim() || null,
          final_payment_due_days:          parsedDueDays,
          final_payment_reminders_enabled: finalPaymentRemindersEnabled,
        })
        .eq("id", company?.id);
      if (settingsErr) throw settingsErr;
      await refreshCompany();
      setSuccess(true); setLogoFile(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || t("errors.saveSettingsFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── Staff update handlers ──────────────────────────────────────────────────

  const flashStaff = (msg: string) => {
    setStaffSuccess(msg);
    setTimeout(() => setStaffSuccess(""), 3000);
  };

  const handleChangeRole = async (member: StaffMember, newRole: string) => {
    if (member.id === currentStaffId) return;
    setUpdatingStaffId(member.id); setStaffError("");
    try {
      const { error: e } = await supabase
        .from("staff_profiles").update({ role: newRole }).eq("id", member.id);
      if (e) throw e;
      await loadStaff(); flashStaff("Role updated.");
    } catch (err: any) { setStaffError(err.message || "Failed to update role."); }
    finally { setUpdatingStaffId(null); }
  };

  const handleToggleCanManage = async (member: StaffMember) => {
    if (member.id === currentStaffId) return;
    setUpdatingStaffId(member.id); setStaffError("");
    try {
      const { error: e } = await supabase
        .from("staff_profiles").update({ can_manage: !member.can_manage }).eq("id", member.id);
      if (e) throw e;
      await loadStaff(); flashStaff("Updated.");
    } catch (err: any) { setStaffError(err.message || "Failed to update."); }
    finally { setUpdatingStaffId(null); }
  };

  const handleToggleActive = async (member: StaffMember) => {
    if (member.id === currentStaffId) return;
    setUpdatingStaffId(member.id); setStaffError("");
    try {
      const currentlyActive =
        member.is_active !== null && member.is_active !== undefined
          ? member.is_active
          : member.status !== "inactive" && member.status !== "disabled";
      const patch: Record<string, unknown> =
        member.is_active !== null && member.is_active !== undefined
          ? { is_active: !currentlyActive }
          : { status: currentlyActive ? "inactive" : "active" };
      const { error: e } = await supabase
        .from("staff_profiles").update(patch).eq("id", member.id);
      if (e) throw e;
      await loadStaff(); flashStaff("Status updated.");
    } catch (err: any) { setStaffError(err.message || "Failed to update status."); }
    finally { setUpdatingStaffId(null); }
  };

  // ── Invite handler ─────────────────────────────────────────────────────────

  const handleInvite = async () => {
    setInviteError(""); setInviteSuccess("");
    if (!inviteEmail.trim()) { setInviteError("Email is required."); return; }
    if (!company?.id) return;
    setInviting(true);
    try {
      // Duplicate-email check: try company_id scope first, fall back to RLS —
      // mirrors the same pattern used in loadStaff.
      const normalizedEmail = inviteEmail.trim().toLowerCase();
      let existing: { id: string } | null = null;

      const byCompanyCheck = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("company_id", company.id)
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (!byCompanyCheck.error) {
        existing = byCompanyCheck.data as { id: string } | null;
      } else {
        const byRlsCheck = await supabase
          .from("staff_profiles")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle();
        if (!byRlsCheck.error) {
          existing = byRlsCheck.data as { id: string } | null;
        }
        // if byRlsCheck also errors, existing stays null and we proceed
      }

      if (existing) { setInviteError("A profile with that email already exists."); return; }

      const base: Record<string, unknown> = {
        email:      normalizedEmail,
        name:       inviteFullName.trim() || null,
        role:       inviteRole,
        can_manage: inviteCanManage,
      };

      // Attempt with company_id + status; retry without offending field(s) on error
      let row: Record<string, unknown> = { ...base, company_id: company.id, status: "pending" };
      let { error: insErr } = await supabase.from("staff_profiles").insert(row);

      if (insErr) {
        const msg = (insErr.message ?? "") + (insErr.details ?? "");
        const badCompany = msg.includes("company_id");
        const badStatus  = msg.includes("status");
        if (badCompany || badStatus) {
          const retry: Record<string, unknown> = { ...base };
          if (!badCompany) retry.company_id = company.id;
          if (!badStatus)  retry.status     = "pending";
          const r2 = await supabase.from("staff_profiles").insert(retry);
          insErr = r2.error ?? null;
        }
      }
      if (insErr) throw insErr;

      setInviteSuccess("Profile created. Share the app — they can sign up with this email.");
      setInviteEmail(""); setInviteFullName(""); setInviteRole("cleaning"); setInviteCanManage(false);
      setShowInvite(false);
      await loadStaff();
    } catch (err: any) {
      setInviteError(err.message || "Failed to create profile.");
    } finally {
      setInviting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const isMemberActive = (m: StaffMember) => {
    if (m.is_active !== null && m.is_active !== undefined) return !!m.is_active;
    if (m.status) return m.status !== "inactive" && m.status !== "disabled";
    return true;
  };

  const roleBadge: Record<string, string> = {
    admin:      "#368F8B",
    cleaning:   "#BC8235",
    mechanical: "#6B7280",
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

  // ── Grid column template for staff table ───────────────────────────────────

  const staffCols = hasStatusColumns ? "1fr 140px 110px 110px" : "1fr 140px 110px";

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

          {/* ═══════════════════════════════════════════════════════════════
              COMPANY SETTINGS FORM
              Staff Team is intentionally placed AFTER this closing tag.
          ═══════════════════════════════════════════════════════════════ */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

            {/* Company Information */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                {t("sections.information")}
              </h2>
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

            {/* Payment Reminders */}
            <div>
              <h2 style={{ fontSize: "20px", marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                Payment reminders
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: isAdmin ? "pointer" : "default" }}>
                    <input
                      type="checkbox"
                      checked={finalPaymentRemindersEnabled}
                      onChange={(e) => setFinalPaymentRemindersEnabled(e.target.checked)}
                      disabled={!isAdmin}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                      Enable final payment reminders
                    </span>
                  </label>
                  <p className="helper-text" style={{ marginTop: "var(--space-1)", marginLeft: "calc(16px + var(--space-3))" }}>
                    When enabled, customers are sent a reminder to complete their final payment before the rental starts.
                  </p>
                </div>
                <div>
                  <label htmlFor="final_payment_due_days" className="label">Final payment due (days before pickup)</label>
                  <input
                    id="final_payment_due_days" name="final_payment_due_days" type="number"
                    min="0" step="1" className="input"
                    placeholder="e.g. 14"
                    value={formData.final_payment_due_days} onChange={handleChange}
                    disabled={!isAdmin} style={{ width: "100%", maxWidth: "160px" }}
                  />
                  <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                    Number of days before pick-up that the final payment is due.
                  </p>
                </div>
              </div>
            </div>

            {/* Preview */}
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
          {/* ═══ END COMPANY SETTINGS FORM ═══ */}


          {/* ═══════════════════════════════════════════════════════════════
              STAFF TEAM — outside the company form, no nested forms here
          ═══════════════════════════════════════════════════════════════ */}
          <div>

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <h2 style={{ fontSize: "20px", color: "rgb(var(--text))" }}>Staff Team</h2>
              {isAdmin && (
                <button type="button" className="btn btn-secondary" style={{ fontSize: "14px" }}
                  onClick={() => { setShowInvite(!showInvite); setInviteError(""); setInviteSuccess(""); }}>
                  {showInvite ? "Cancel" : "Invite staff member"}
                </button>
              )}
            </div>

            {/* Invite panel — plain div, NO <form> */}
            {isAdmin && showInvite && (
              <div style={{ border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", padding: "var(--space-6)", marginBottom: "var(--space-6)", background: "rgb(var(--surface))" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "var(--space-4)", color: "rgb(var(--text))" }}>
                  Invite new staff member
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
                  <div>
                    <label className="label">Email *</label>
                    <input type="email" className="input" placeholder="staff@example.com"
                      value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label className="label">Full name</label>
                    <input type="text" className="input" placeholder="Optional"
                      value={inviteFullName} onChange={(e) => setInviteFullName(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label className="label">Role</label>
                    <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: "100%" }}>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "var(--space-1)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", fontSize: "14px", color: "rgb(var(--text))" }}>
                      <input type="checkbox" checked={inviteCanManage} onChange={(e) => setInviteCanManage(e.target.checked)} />
                      Can manage
                    </label>
                  </div>
                </div>
                <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>
                  A pending staff profile will be created. The person must sign up with this email — their profile will link automatically.
                </p>
                {inviteError && (
                  <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--error) / 0.1)", border: "1px solid rgb(var(--error) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--error))", fontSize: "14px", marginBottom: "var(--space-4)" }}>
                    {inviteError}
                  </div>
                )}
                {/* type="button" — critical to avoid submitting the outer company form */}
                <button type="button" className="btn btn-primary" onClick={handleInvite} disabled={inviting}
                  style={{ opacity: inviting ? 0.6 : 1, cursor: inviting ? "not-allowed" : "pointer" }}>
                  {inviting ? "Creating…" : "Create staff profile"}
                </button>
              </div>
            )}

            {/* Invite success */}
            {inviteSuccess && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--success) / 0.1)", border: "1px solid rgb(var(--success) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--success))", fontSize: "14px", marginBottom: "var(--space-4)" }}>
                {inviteSuccess}
              </div>
            )}

            {/* Staff list feedback */}
            {staffError && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--error) / 0.1)", border: "1px solid rgb(var(--error) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--error))", fontSize: "14px", marginBottom: "var(--space-4)" }}>
                {staffError}
              </div>
            )}
            {staffSuccess && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--success) / 0.1)", border: "1px solid rgb(var(--success) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--success))", fontSize: "14px", marginBottom: "var(--space-4)" }}>
                {staffSuccess}
              </div>
            )}

            {/* Staff list */}
            {staffLoading ? (
              <div style={{ color: "rgb(var(--muted))", fontSize: "14px" }}>Loading staff…</div>
            ) : staffList.length === 0 ? (
              <div style={{ padding: "var(--space-6)", textAlign: "center", color: "rgb(var(--muted))", fontSize: "14px", border: "1px dashed rgb(var(--border))", borderRadius: "var(--radius)" }}>
                No staff members found.
              </div>
            ) : (
              <div style={{ border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", overflow: "hidden" }}>

                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: staffCols, gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", background: "rgb(var(--surface))", borderBottom: "1px solid rgb(var(--border))" }}>
                  {["Name / Email", "Role", "Can manage", ...(hasStatusColumns ? ["Status"] : [])].map((h) => (
                    <span key={h} style={{ fontSize: "12px", fontWeight: 600, color: "rgb(var(--muted))", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {staffList.map((member) => {
                  const isSelf      = member.id === currentStaffId;
                  const isUpdating  = updatingStaffId === member.id;
                  const active      = isMemberActive(member);
                  const badgeColor  = roleBadge[member.role] ?? "#6B7280";

                  return (
                    <div key={member.id} style={{ display: "grid", gridTemplateColumns: staffCols, gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid rgb(var(--border))", alignItems: "center", fontSize: "14px", background: isSelf ? "rgb(var(--brand) / 0.04)" : "transparent", opacity: isUpdating ? 0.6 : 1, transition: "opacity 0.15s" }}>

                      {/* Name / email */}
                      <div>
                        <div style={{ fontWeight: 500, color: "rgb(var(--text))" }}>
                          {member.name || member.email || "Unnamed"}
                          {isSelf && <span style={{ marginLeft: "var(--space-2)", fontSize: "11px", color: "rgb(var(--brand))", fontWeight: 400 }}>(you)</span>}
                        </div>
                        {member.name && member.email && (
                          <div style={{ fontSize: "12px", color: "rgb(var(--muted))" }}>{member.email}</div>
                        )}
                      </div>

                      {/* Role */}
                      <div>
                        {isAdmin && !isSelf ? (
                          <select className="input" value={member.role} disabled={isUpdating}
                            onChange={(e) => handleChangeRole(member, e.target.value)}
                            style={{ fontSize: "13px", padding: "var(--space-1) var(--space-2)", width: "100%" }}>
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius)", fontSize: "12px", fontWeight: 500, background: `${badgeColor}18`, color: badgeColor }}>
                            {member.role}
                          </span>
                        )}
                      </div>

                      {/* Can manage */}
                      <div>
                        {isAdmin && !isSelf ? (
                          <button type="button" disabled={isUpdating} onClick={() => handleToggleCanManage(member)}
                            style={{ display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius)", fontSize: "12px", fontWeight: 500, cursor: isUpdating ? "not-allowed" : "pointer", border: "1px solid", borderColor: member.can_manage ? "rgb(var(--brand))" : "rgb(var(--border))", background: member.can_manage ? "rgb(var(--brand) / 0.1)" : "transparent", color: member.can_manage ? "rgb(var(--brand))" : "rgb(var(--muted))" }}>
                            {member.can_manage ? "Yes" : "No"}
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", fontWeight: 500, color: member.can_manage ? "rgb(var(--brand))" : "rgb(var(--muted))" }}>
                            {member.can_manage ? "Yes" : "No"}
                          </span>
                        )}
                      </div>

                      {/* Status (conditional) */}
                      {hasStatusColumns && (
                        <div>
                          {isAdmin && !isSelf ? (
                            <button type="button" disabled={isUpdating} onClick={() => handleToggleActive(member)}
                              style={{ display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius)", fontSize: "12px", fontWeight: 500, cursor: isUpdating ? "not-allowed" : "pointer", border: "1px solid", borderColor: active ? "rgb(var(--success))" : "rgb(var(--border))", background: active ? "rgb(var(--success) / 0.1)" : "transparent", color: active ? "rgb(var(--success))" : "rgb(var(--muted))" }}>
                              {active ? "Active" : "Inactive"}
                            </button>
                          ) : (
                            <span style={{ fontSize: "12px", fontWeight: 500, color: active ? "rgb(var(--success))" : "rgb(var(--muted))" }}>
                              {active ? "Active" : "Inactive"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="helper-text" style={{ marginTop: "var(--space-3)" }}>
              Changes take effect immediately. Staff will see updated access on their next page load.
            </p>
          </div>
          {/* ═══ END STAFF TEAM ═══ */}

        </div>
      </div>
    </PageContainer>
  );
}
