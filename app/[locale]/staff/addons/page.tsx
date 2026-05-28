"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import BackLink from "@/components/staff/BackLink";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/contexts/ThemeContext";

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

  const [addonStates, setAddonStates] = useState<Record<string, boolean>>({});

  // Review Funnel fields
  const [reviewRequestRemindersEnabled, setReviewRequestRemindersEnabled] = useState(true);
  const [reviewRequestTemplate, setReviewRequestTemplate] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');

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

  // ── Load review funnel settings ─────────────────────────────────────────────

  useEffect(() => {
    if (!company?.id) {
      if (!themeLoading) setLoading(false);
      return;
    }
    const load = async () => {
      const [{ data }, { data: addons }] = await Promise.all([
        supabase
          .from("company_settings")
          .select("review_request_reminders_enabled, review_request_whatsapp_template, google_review_url")
          .eq("id", company.id)
          .maybeSingle(),
        supabase
          .from("company_addons")
          .select("addon_key, enabled")
          .eq("company_id", company.id),
      ]);
      if (data) {
        setReviewRequestRemindersEnabled((data as any).review_request_reminders_enabled ?? true);
        setReviewRequestTemplate((data as any).review_request_whatsapp_template ?? '');
        setGoogleReviewUrl((data as any).google_review_url ?? '');
      }
      if (addons) {
        const states: Record<string, boolean> = {};
        for (const row of addons) {
          states[(row as any).addon_key] = (row as any).enabled;
        }
        setAddonStates(states);
      }
      setLoading(false);
    };
    load();
  }, [company?.id, themeLoading, supabase]);

  // ── Save handler ────────────────────────────────────────────────────────────

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

  // ── Early return: loading ───────────────────────────────────────────────────

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

  // Explicit DB state: only true === Enabled; false or missing row === Disabled
  const reviewFunnelEnabled = addonStates['review_funnel'] === true;
  const availabilityWidgetEnabled = addonStates['availability_widget'] === true;

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

                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: isAdmin ? "pointer" : "default" }}>
                        <input
                          type="checkbox"
                          checked={reviewRequestRemindersEnabled}
                          onChange={(e) => setReviewRequestRemindersEnabled(e.target.checked)}
                          disabled={!isAdmin}
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
                        disabled={!isAdmin}
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
                      disabled={!isAdmin}
                      style={{ width: "100%", maxWidth: "560px" }}
                    />
                    <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>
                      {t("reminders.reviewRequest.googleReviewUrlHelper")}
                    </p>
                    {!googleReviewUrl.trim() && (
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
                      href={`/${locale}/guest/feedback?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        fontSize: "13px",
                        fontWeight: 500,
                        background: "rgb(var(--brand-light))",
                        color: "rgb(var(--brand))",
                        border: "1px solid rgb(var(--brand) / 0.35)",
                        padding: "var(--space-2) var(--space-4)",
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
                        disabled={saving}
                        style={{ opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
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
                padding: "var(--space-5) var(--space-6)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                flexWrap: "wrap",
                opacity: availabilityWidgetEnabled ? 1 : 0.6,
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

            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
