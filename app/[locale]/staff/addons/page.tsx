"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import BackLink from "@/components/staff/BackLink";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/contexts/ThemeContext";

type Vehicle = { id: string; name: string; registration: string };

export default function AddonsPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { company, loading: themeLoading } = useTheme();
  const t = useTranslations("staffCompany");

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [widgetSaving, setWidgetSaving] = useState(false);
  const [widgetError, setWidgetError] = useState("");
  const [widgetSuccess, setWidgetSuccess] = useState(false);

  const [addonStates, setAddonStates] = useState<Record<string, boolean>>({});

  // Review Funnel fields
  const [reviewRequestRemindersEnabled, setReviewRequestRemindersEnabled] = useState(true);
  const [reviewRequestTemplate, setReviewRequestTemplate] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');

  // Availability Widget fields
  const [widgetPublicEnabled, setWidgetPublicEnabled] = useState(false);
  const [widgetVehicleIds, setWidgetVehicleIds] = useState<string[]>([]);
  const [widgetRequestEmail, setWidgetRequestEmail] = useState('');
  const [widgetShowHeader, setWidgetShowHeader] = useState(true);
  const [widgetHeaderTitle, setWidgetHeaderTitle] = useState('Vehicle Availability');
  const [widgetHeaderSubtitle, setWidgetHeaderSubtitle] = useState('Select dates to request availability');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // ── Auth check ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/${locale}/staff/login`); return; }
      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("role, can_manage")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (profile) {
        setIsAdmin(profile.role === "admin" || profile.can_manage === true);
      }
    };
    init();
  }, [supabase, locale, router]);

  // ── Load settings ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!company?.id) {
      if (!themeLoading) setLoading(false);
      return;
    }
    const load = async () => {
      const [{ data: settings }, { data: addons }, { data: vehicleRows }] = await Promise.all([
        supabase
          .from("company_settings")
          .select("review_request_reminders_enabled, review_request_whatsapp_template, google_review_url, widget_public_enabled, widget_vehicle_ids, widget_request_email, widget_show_header, widget_header_title, widget_header_subtitle")
          .eq("id", company.id)
          .maybeSingle(),
        supabase
          .from("company_addons")
          .select("addon_key, enabled")
          .eq("company_id", company.id),
        supabase
          .from("vehicles")
          .select("id, name, registration")
          .eq("company_id", company.id)
          .order("name"),
      ]);
      if (settings) {
        setReviewRequestRemindersEnabled((settings as any).review_request_reminders_enabled ?? true);
        setReviewRequestTemplate((settings as any).review_request_whatsapp_template ?? '');
        setGoogleReviewUrl((settings as any).google_review_url ?? '');
        setWidgetPublicEnabled((settings as any).widget_public_enabled ?? false);
        setWidgetVehicleIds((settings as any).widget_vehicle_ids ?? []);
        setWidgetRequestEmail((settings as any).widget_request_email ?? '');
        setWidgetShowHeader((settings as any).widget_show_header ?? true);
        setWidgetHeaderTitle((settings as any).widget_header_title ?? 'Vehicle Availability');
        setWidgetHeaderSubtitle((settings as any).widget_header_subtitle ?? 'Select dates to request availability');
      }
      if (addons) {
        const states: Record<string, boolean> = {};
        for (const row of addons) {
          states[(row as any).addon_key] = (row as any).enabled;
        }
        setAddonStates(states);
      }
      if (vehicleRows) {
        setVehicles(vehicleRows as Vehicle[]);
      }
      setLoading(false);
    };
    load();
  }, [company?.id, themeLoading, supabase]);

  // ── Review Funnel save ──────────────────────────────────────────────────────

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;
    setError(""); setSuccess(false); setSaving(true);
    try {
      const { error: saveErr } = await supabase
        .from("company_settings")
        .update({
          review_request_reminders_enabled: reviewRequestRemindersEnabled,
          review_request_whatsapp_template: reviewRequestTemplate.trim() || null,
          google_review_url:                googleReviewUrl.trim() || null,
        })
        .eq("id", company.id);
      if (saveErr) throw saveErr;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || t("errors.saveSettingsFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── Widget save ─────────────────────────────────────────────────────────────

  const handleWidgetSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;
    setWidgetError(""); setWidgetSuccess(false); setWidgetSaving(true);
    try {
      const { error: saveErr } = await supabase
        .from("company_settings")
        .update({
          widget_public_enabled:    widgetPublicEnabled,
          widget_vehicle_ids:       widgetVehicleIds.length > 0 ? widgetVehicleIds : null,
          widget_request_email:     widgetRequestEmail.trim() || null,
          widget_show_header:       widgetShowHeader,
          widget_header_title:      widgetHeaderTitle.trim() || null,
          widget_header_subtitle:   widgetHeaderSubtitle.trim() || null,
        })
        .eq("id", company.id);
      if (saveErr) throw saveErr;
      setWidgetSuccess(true);
      setTimeout(() => setWidgetSuccess(false), 3000);
    } catch (err: any) {
      setWidgetError(err.message || t("errors.saveSettingsFailed"));
    } finally {
      setWidgetSaving(false);
    }
  };

  // ── Vehicle selection helpers ───────────────────────────────────────────────

  const toggleVehicle = (id: string) => {
    setWidgetVehicleIds(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  // null = all vehicles; non-empty array = specific subset
  const allVehiclesSelected = widgetVehicleIds.length === 0;

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface">
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>
            {t("loading")}
          </div>
        </div>
      </PageContainer>
    );
  }

  const reviewFunnelEnabled = addonStates['review_funnel'] === true;
  const availabilityWidgetEnabled = addonStates['availability_widget'] === true;

  // Embed snippet shown to staff
  const embedSnippet = company?.id
    ? `<iframe\n  src="${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/widget/${company.id}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border:none;border-radius:8px;"\n></iframe>`
    : '';

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="1400px">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div>
          <BackLink href={`/${locale}/staff`}>Back to dashboard</BackLink>
        </div>
        <div className="surface page-surface">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

            {/* Page header */}
            <div>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))", margin: 0 }}>Add-ons</h1>
              <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
                Extend CamperFlow with optional features for your business.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

              {/* ── Review Funnel ──────────────────────────────────────────────── */}
              <div style={{
                border: "1px solid rgb(var(--border))",
                borderRadius: "var(--radius)",
                opacity: reviewFunnelEnabled ? 1 : 0.6,
              }}>

                {/* Card header */}
                <div style={{
                  padding: "var(--space-5) var(--space-6)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  flexWrap: "wrap",
                  borderBottom: "1px solid rgb(var(--border))",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <span style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))" }}>
                      Review Funnel
                    </span>
                    <p style={{ fontSize: "14px", color: "rgb(var(--muted))", margin: 0, lineHeight: 1.5, maxWidth: "480px" }}>
                      Automatically send post-stay WhatsApp messages to guests and guide happy guests to leave a Google Review.
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    background: reviewFunnelEnabled
                      ? "rgb(var(--success) / 0.12)"
                      : "rgb(var(--muted) / 0.12)",
                    color: reviewFunnelEnabled
                      ? "rgb(var(--success))"
                      : "rgb(var(--muted))",
                    whiteSpace: "nowrap",
                  }}>
                    {reviewFunnelEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                {/* Card body */}
                <form onSubmit={handleSave} style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

                  {!reviewFunnelEnabled && (
                    <p style={{ margin: 0, fontSize: "13px", color: "rgb(var(--muted))", fontStyle: "italic" }}>
                      This add-on is not enabled for this company.
                    </p>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: (isAdmin && reviewFunnelEnabled) ? "pointer" : "default" }}>
                        <input
                          type="checkbox"
                          checked={reviewRequestRemindersEnabled}
                          onChange={(e) => setReviewRequestRemindersEnabled(e.target.checked)}
                          disabled={!isAdmin || !reviewFunnelEnabled}
                        />
                        <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                          {t("reminders.reviewRequest.label")}
                        </span>
                      </label>
                      <p className="helper-text" style={{ marginTop: "var(--space-1)", marginLeft: "calc(16px + var(--space-3))" }}>
                        {t("reminders.reviewRequest.helper")}
                      </p>
                    </div>
                    <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                      <label htmlFor="review_request_template" className="label">
                        {t("reminders.reviewRequest.templateLabel")}
                      </label>
                      <textarea
                        id="review_request_template"
                        className="input"
                        rows={4}
                        placeholder={t("reminders.reviewRequest.templatePlaceholder")}
                        value={reviewRequestTemplate}
                        onChange={(e) => setReviewRequestTemplate(e.target.value)}
                        disabled={!isAdmin || !reviewFunnelEnabled}
                        style={{ width: "100%", maxWidth: "560px", resize: "vertical", fontFamily: "inherit" }}
                      />
                      <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                        {t("reminders.reviewRequest.templateHelper")}
                      </p>
                    </div>
                  </div>

                  <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                    <label htmlFor="google_review_url" className="label">
                      {t("reminders.reviewRequest.googleReviewUrlLabel")}
                    </label>
                    <input
                      id="google_review_url"
                      type="url"
                      className="input"
                      placeholder={t("reminders.reviewRequest.googleReviewUrlPlaceholder")}
                      value={googleReviewUrl}
                      onChange={(e) => setGoogleReviewUrl(e.target.value)}
                      disabled={!isAdmin || !reviewFunnelEnabled}
                      style={{ width: "100%", maxWidth: "560px" }}
                    />
                    <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                      {t("reminders.reviewRequest.googleReviewUrlHelper")}
                    </p>
                    {!googleReviewUrl.trim() && reviewFunnelEnabled && (
                      <p style={{
                        marginTop: "var(--space-2)",
                        fontSize: "13px",
                        color: "rgb(161 98 7)",
                        background: "rgb(254 243 199)",
                        border: "1px solid rgb(253 230 138)",
                        borderRadius: "var(--radius)",
                        padding: "var(--space-2) var(--space-3)",
                        lineHeight: 1.5,
                      }}>
                        {t("reminders.reviewRequest.noReviewUrlWarning")}
                      </p>
                    )}
                  </div>

                  <div style={{ marginLeft: "calc(16px + var(--space-3))", marginTop: "var(--space-1)" }}>
                    <a
                      href={reviewFunnelEnabled ? `/${locale}/guest/feedback?preview=1` : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={reviewFunnelEnabled ? 0 : -1}
                      aria-disabled={!reviewFunnelEnabled}
                      className="btn"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        fontSize: "13px",
                        fontWeight: 500,
                        background: reviewFunnelEnabled ? "rgb(var(--brand-light))" : "rgb(var(--muted) / 0.08)",
                        color: reviewFunnelEnabled ? "rgb(var(--brand))" : "rgb(var(--muted))",
                        border: reviewFunnelEnabled
                          ? "1px solid rgb(var(--brand) / 0.35)"
                          : "1px solid rgb(var(--border))",
                        padding: "var(--space-2) var(--space-4)",
                        pointerEvents: reviewFunnelEnabled ? "auto" : "none",
                        cursor: reviewFunnelEnabled ? "pointer" : "default",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path d="M5.5 2.5H2a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V8.5M8.5 1H13m0 0v4.5M13 1 6.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {t("reminders.reviewRequest.previewFeedbackPage")}
                    </a>
                  </div>

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
                    <div>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={saving || !reviewFunnelEnabled}
                        style={{ opacity: (saving || !reviewFunnelEnabled) ? 0.6 : 1, cursor: (saving || !reviewFunnelEnabled) ? "not-allowed" : "pointer" }}
                      >
                        {saving ? t("actions.saving") : t("actions.saveChanges")}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* ── Availability Widget ────────────────────────────────────────── */}
              <div style={{
                border: "1px solid rgb(var(--border))",
                borderRadius: "var(--radius)",
                opacity: availabilityWidgetEnabled ? 1 : 0.6,
              }}>

                {/* Card header */}
                <div style={{
                  padding: "var(--space-5) var(--space-6)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  flexWrap: "wrap",
                  borderBottom: "1px solid rgb(var(--border))",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <span style={{ fontSize: "16px", fontWeight: 600, color: "rgb(var(--text))" }}>
                      Availability Widget
                    </span>
                    <p style={{ fontSize: "14px", color: "rgb(var(--muted))", margin: 0, lineHeight: 1.5, maxWidth: "480px" }}>
                      Embed a live availability calendar on your website so guests can check vehicle availability before enquiring.
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    background: availabilityWidgetEnabled
                      ? "rgb(var(--success) / 0.12)"
                      : "rgb(var(--muted) / 0.12)",
                    color: availabilityWidgetEnabled
                      ? "rgb(var(--success))"
                      : "rgb(var(--muted))",
                    whiteSpace: "nowrap",
                  }}>
                    {availabilityWidgetEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                {/* Card body */}
                <form onSubmit={handleWidgetSave} style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

                  {!availabilityWidgetEnabled && (
                    <p style={{ margin: 0, fontSize: "13px", color: "rgb(var(--muted))", fontStyle: "italic" }}>
                      This add-on is not enabled for this company.
                    </p>
                  )}

                  {/* Public embed toggle */}
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: (isAdmin && availabilityWidgetEnabled) ? "pointer" : "default" }}>
                      <input
                        type="checkbox"
                        checked={widgetPublicEnabled}
                        onChange={(e) => setWidgetPublicEnabled(e.target.checked)}
                        disabled={!isAdmin || !availabilityWidgetEnabled}
                      />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "rgb(var(--text))" }}>
                        Enable public widget
                      </span>
                    </label>
                    <p className="helper-text" style={{ marginTop: "var(--space-1)", marginLeft: "calc(16px + var(--space-3))" }}>
                      When enabled, the embed link below will serve a live availability calendar to your website visitors.
                    </p>
                  </div>

                  {/* Vehicle selection */}
                  <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                    <span className="label" style={{ display: "block", marginBottom: "var(--space-2)" }}>
                      Vehicles shown in widget
                    </span>
                    <p className="helper-text" style={{ marginTop: 0, marginBottom: "var(--space-3)" }}>
                      Select which vehicles guests can see. Leave all unchecked to show all vehicles.
                    </p>
                    {vehicles.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "rgb(var(--muted))", fontStyle: "italic" }}>
                        No vehicles found for this company.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                        {vehicles.map(v => (
                          <label
                            key={v.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "var(--space-3)",
                              cursor: (isAdmin && availabilityWidgetEnabled) ? "pointer" : "default",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={widgetVehicleIds.includes(v.id)}
                              onChange={() => toggleVehicle(v.id)}
                              disabled={!isAdmin || !availabilityWidgetEnabled}
                            />
                            <span style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                              {v.name}
                              <span style={{ marginLeft: "var(--space-2)", fontSize: "12px", color: "rgb(var(--muted))" }}>
                                {v.registration}
                              </span>
                            </span>
                          </label>
                        ))}
                        {allVehiclesSelected && vehicles.length > 0 && (
                          <p style={{ margin: "var(--space-1) 0 0", fontSize: "12px", color: "rgb(var(--muted))", fontStyle: "italic" }}>
                            All vehicles will be shown (none selected = show all).
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reservation request email */}
                  <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                    <label htmlFor="widget_request_email" className="label">
                      Reservation request email
                    </label>
                    <input
                      id="widget_request_email"
                      type="email"
                      className="input"
                      placeholder="e.g. bookings@yourcompany.com"
                      value={widgetRequestEmail}
                      onChange={(e) => setWidgetRequestEmail(e.target.value)}
                      disabled={!isAdmin || !availabilityWidgetEnabled}
                      style={{ width: "100%", maxWidth: "400px" }}
                    />
                    <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                      Enquiries submitted via the widget are sent to this address. Leave blank to use your company contact email.
                    </p>
                  </div>

                  {/* Widget header settings */}
                  <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                    <span className="label" style={{ display: "block", marginBottom: "var(--space-3)" }}>
                      Widget header
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: (isAdmin && availabilityWidgetEnabled) ? "pointer" : "default", marginBottom: "var(--space-3)" }}>
                      <input
                        type="checkbox"
                        checked={widgetShowHeader}
                        onChange={(e) => setWidgetShowHeader(e.target.checked)}
                        disabled={!isAdmin || !availabilityWidgetEnabled}
                      />
                      <span style={{ fontSize: "14px", color: "rgb(var(--text))" }}>Show header on widget</span>
                    </label>
                    {widgetShowHeader && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                        <div>
                          <label htmlFor="widget_header_title" className="label">Header title</label>
                          <input
                            id="widget_header_title"
                            type="text"
                            className="input"
                            placeholder="Vehicle Availability"
                            value={widgetHeaderTitle}
                            onChange={(e) => setWidgetHeaderTitle(e.target.value)}
                            disabled={!isAdmin || !availabilityWidgetEnabled}
                            style={{ width: "100%", maxWidth: "400px" }}
                          />
                        </div>
                        <div>
                          <label htmlFor="widget_header_subtitle" className="label">Header subtitle</label>
                          <input
                            id="widget_header_subtitle"
                            type="text"
                            className="input"
                            placeholder="Select dates to request availability"
                            value={widgetHeaderSubtitle}
                            onChange={(e) => setWidgetHeaderSubtitle(e.target.value)}
                            disabled={!isAdmin || !availabilityWidgetEnabled}
                            style={{ width: "100%", maxWidth: "400px" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Embed code preview */}
                  <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                    <span className="label" style={{ display: "block", marginBottom: "var(--space-2)" }}>
                      Embed code
                    </span>
                    <p className="helper-text" style={{ marginTop: 0, marginBottom: "var(--space-3)" }}>
                      Paste this snippet into your website where you want the availability calendar to appear.
                    </p>
                    <pre style={{
                      margin: 0,
                      padding: "var(--space-4)",
                      background: "rgb(var(--surface-alt, var(--surface)))",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "rgb(var(--text))",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      lineHeight: 1.6,
                      opacity: availabilityWidgetEnabled ? 1 : 0.5,
                    }}>
                      {embedSnippet || '<iframe\n  src="/widget/[company-id]"\n  ...\n></iframe>'}
                    </pre>
                    {availabilityWidgetEnabled && embedSnippet && (
                      <button
                        type="button"
                        className="btn"
                        style={{
                          marginTop: "var(--space-2)",
                          fontSize: "12px",
                          padding: "var(--space-1) var(--space-3)",
                        }}
                        onClick={() => navigator.clipboard?.writeText(embedSnippet)}
                      >
                        Copy
                      </button>
                    )}
                  </div>

                  {/* Preview button */}
                  <div style={{ marginLeft: "calc(16px + var(--space-3))" }}>
                    <a
                      href={availabilityWidgetEnabled && company?.id ? `/${locale}/widget/${company.id}` : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={availabilityWidgetEnabled ? 0 : -1}
                      aria-disabled={!availabilityWidgetEnabled}
                      className="btn"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        fontSize: "13px",
                        fontWeight: 500,
                        background: availabilityWidgetEnabled ? "rgb(var(--brand-light))" : "rgb(var(--muted) / 0.08)",
                        color: availabilityWidgetEnabled ? "rgb(var(--brand))" : "rgb(var(--muted))",
                        border: availabilityWidgetEnabled
                          ? "1px solid rgb(var(--brand) / 0.35)"
                          : "1px solid rgb(var(--border))",
                        padding: "var(--space-2) var(--space-4)",
                        pointerEvents: availabilityWidgetEnabled ? "auto" : "none",
                        cursor: availabilityWidgetEnabled ? "pointer" : "default",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path d="M5.5 2.5H2a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V8.5M8.5 1H13m0 0v4.5M13 1 6.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Preview widget
                    </a>
                  </div>

                  {widgetError && (
                    <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--error) / 0.1)", border: "1px solid rgb(var(--error) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--error))", fontSize: "14px" }}>
                      {widgetError}
                    </div>
                  )}
                  {widgetSuccess && (
                    <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgb(var(--success) / 0.1)", border: "1px solid rgb(var(--success) / 0.3)", borderRadius: "var(--radius)", color: "rgb(var(--success))", fontSize: "14px" }}>
                      {t("success.saved")}
                    </div>
                  )}

                  {isAdmin && (
                    <div>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={widgetSaving || !availabilityWidgetEnabled}
                        style={{ opacity: (widgetSaving || !availabilityWidgetEnabled) ? 0.6 : 1, cursor: (widgetSaving || !availabilityWidgetEnabled) ? "not-allowed" : "pointer" }}
                      >
                        {widgetSaving ? t("actions.saving") : t("actions.saveChanges")}
                      </button>
                    </div>
                  )}
                </form>
              </div>

            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
