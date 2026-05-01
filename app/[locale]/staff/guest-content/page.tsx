"use client";

import { useState, useEffect, useMemo, FormEvent, ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaqItem {
  question: string;
  answer: string;
}

interface NearbyPlaceItem {
  title: string;
  url: string;
}


interface ReturnChecklist {
  id: string;
  name: string;
  active: boolean;
  item_count?: number;
}

// ─── SectionHeading ───────────────────────────────────────────────────────────

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <h2 style={{ fontSize: "20px", color: "rgb(var(--text))", marginBottom: subtitle ? "var(--space-1)" : 0 }}>
        {title}
      </h2>
      {subtitle && <p className="helper-text">{subtitle}</p>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuestContentPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const t = useTranslations("staffGuestContent");

  const [formData, setFormData] = useState({
    contact_phone: "",
    contact_whatsapp: "",
    emergency_accident_phone_primary: "",
    emergency_accident_phone_secondary: "",
    emergency_breakdown_phone_primary: "",
    emergency_breakdown_phone_secondary: "",
    before_arrival_info: "",
    pickup_info: "",
    important_before_pickup: "",
    before_return_info: "",
    return_info: "",
    included_items: "",
    rules_and_tips: "",
    help_intro: "",
    help_quick_fixes: "",
    help_videos: "",
  });
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [returnNearbyPlaces, setReturnNearbyPlaces] = useState<NearbyPlaceItem[]>([]);
// undefined = loading, null = not found, object = found
  const [returnChecklist, setReturnChecklist] = useState<ReturnChecklist | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // ── Auth ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/${locale}/staff/login`); return; }
      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("role, can_manage, company_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (profile) {
        setIsAdmin(profile.role === "admin" || profile.can_manage === true);
        if (!profile.company_id) { setLoading(false); return; }
        setCompanyId(profile.company_id);
        console.log("[GuestContent] companyId:", profile.company_id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [locale, router]);

  // ── Data load ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const [{ data }, { data: template }, { data: companyRow }] = await Promise.all([
        supabase
          .from("company_settings")
          .select("contact_phone, contact_whatsapp, pickup_info, important_before_pickup, return_info, rules_and_tips, before_arrival_info, before_return_info, included_items, faq_items, return_nearby_places, help_intro, help_quick_fixes, help_videos")
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("checklist_templates")
          .select("id, name, active, item_count")
          .eq("company_id", companyId)
          .eq("type", "guest_prereturn")
          .maybeSingle(),
        supabase
          .from("companies")
          .select("emergency_accident_phone_primary, emergency_accident_phone_secondary, emergency_breakdown_phone_primary, emergency_breakdown_phone_secondary")
          .eq("id", companyId)
          .maybeSingle(),
      ]);
      console.log("[GuestContent] company_settings raw:", data);
      if (data) {
        const payload = {
          contact_phone:           (data as any).contact_phone           ?? "",
          contact_whatsapp:        (data as any).contact_whatsapp        ?? "",
          pickup_info:             (data as any).pickup_info             ?? "",
          important_before_pickup: (data as any).important_before_pickup ?? "",
          return_info:             (data as any).return_info             ?? "",
          rules_and_tips:          (data as any).rules_and_tips          ?? "",
          before_arrival_info:     (data as any).before_arrival_info     ?? "",
          before_return_info:      (data as any).before_return_info      ?? "",
          included_items:          (data as any).included_items          ?? "",
          help_intro:              (data as any).help_intro              ?? "",
          help_quick_fixes:        (data as any).help_quick_fixes        ?? "",
          help_videos:             (data as any).help_videos             ?? "",
        };
        console.log("[GuestContent] setFormData payload:", payload);
        setFormData(prev => {
          const next = {
            ...prev,
            contact_phone:           (data as any).contact_phone           ?? "",
            contact_whatsapp:        (data as any).contact_whatsapp        ?? "",
            pickup_info:             (data as any).pickup_info             ?? "",
            important_before_pickup: (data as any).important_before_pickup ?? "",
            return_info:             (data as any).return_info             ?? "",
            rules_and_tips:          (data as any).rules_and_tips          ?? "",
            before_arrival_info:     (data as any).before_arrival_info     ?? "",
            before_return_info:      (data as any).before_return_info      ?? "",
            included_items:          (data as any).included_items          ?? "",
            help_intro:              (data as any).help_intro              ?? "",
            help_quick_fixes:        (data as any).help_quick_fixes        ?? "",
            help_videos:             (data as any).help_videos             ?? "",
          };
          console.log("[GuestContent] formData after setFormData:", next);
          return next;
        });
        setFaqItems((data as any).faq_items ?? []);
        setReturnNearbyPlaces((data as any).return_nearby_places ?? []);
      }
      if (companyRow) {
        setFormData(prev => ({
          ...prev,
          emergency_accident_phone_primary:    (companyRow as any).emergency_accident_phone_primary    ?? "",
          emergency_accident_phone_secondary:  (companyRow as any).emergency_accident_phone_secondary  ?? "",
          emergency_breakdown_phone_primary:   (companyRow as any).emergency_breakdown_phone_primary   ?? "",
          emergency_breakdown_phone_secondary: (companyRow as any).emergency_breakdown_phone_secondary ?? "",
        }));
      }
      setReturnChecklist(template ?? null);
      setLoading(false);
    };
    load();
  }, [companyId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess(false); setSaving(true);
    try {
      const [{ data: rows, error: err }, { error: companyErr }] = await Promise.all([
        supabase
          .from("company_settings")
          .update({
            contact_phone:       formData.contact_phone.trim()       || null,
            contact_whatsapp:    formData.contact_whatsapp.trim()    || null,
            pickup_info:         formData.pickup_info.trim()         || null,
            important_before_pickup: formData.important_before_pickup.trim() || null,
            return_info:         formData.return_info.trim()         || null,
            rules_and_tips:      formData.rules_and_tips.trim()      || null,
            before_arrival_info: formData.before_arrival_info.trim() || null,
            before_return_info:  formData.before_return_info.trim()  || null,
            included_items:      formData.included_items.trim()      || null,
            help_intro:          formData.help_intro.trim()          || null,
            help_quick_fixes:    formData.help_quick_fixes.trim()    || null,
            help_videos:         formData.help_videos.trim()         || null,
            faq_items:             faqItems.length > 0 ? faqItems : null,
            return_nearby_places:  returnNearbyPlaces.length > 0 ? returnNearbyPlaces : null,
          })
          .eq("id", companyId)
          .select("id"),
        supabase
          .from("companies")
          .update({
            emergency_accident_phone_primary:    formData.emergency_accident_phone_primary.trim()    || null,
            emergency_accident_phone_secondary:  formData.emergency_accident_phone_secondary.trim()  || null,
            emergency_breakdown_phone_primary:   formData.emergency_breakdown_phone_primary.trim()   || null,
            emergency_breakdown_phone_secondary: formData.emergency_breakdown_phone_secondary.trim() || null,
          })
          .eq("id", companyId),
      ]);
      if (err) throw err;
      if (companyErr) throw companyErr;
      if (!rows || rows.length === 0) throw new Error(t("errors.saveSettingsFailed"));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || t("errors.saveSettingsFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface page-surface">
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>{t("loading")}</div>
        </div>
      </PageContainer>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const countLines = (val: string, min = 3) => Math.max(min, val.split("\n").length);

  console.log("[GuestContent] render pickup_info:", formData.pickup_info);
  return (
    <PageContainer maxWidth="1400px">

      <div className="surface page-surface">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

          {/* Header */}
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

          {/* Main form */}
          <div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

                {/* Contact Numbers */}
                <div>
                  <SectionHeading title={t("sections.contact")} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", maxWidth: "600px" }}>
                    <div>
                      <label htmlFor="contact_phone" className="label">{t("labels.contactPhone")}</label>
                      <input
                        id="contact_phone" name="contact_phone" type="tel" className="input"
                        placeholder={t("placeholders.contactPhone")}
                        value={formData.contact_phone} onChange={handleChange}
                        disabled={!isAdmin} style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label htmlFor="contact_whatsapp" className="label">{t("labels.whatsappNumber")}</label>
                      <input
                        id="contact_whatsapp" name="contact_whatsapp" type="tel" className="input"
                        placeholder={t("placeholders.whatsappNumber")}
                        value={formData.contact_whatsapp} onChange={handleChange}
                        disabled={!isAdmin} style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contacts */}
                <div>
                  <SectionHeading title={t("sections.emergencyContacts")} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                    <div>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "var(--space-3)", color: "rgb(var(--text))" }}>
                        {t("labels.accidentNumbers")}
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", maxWidth: "600px" }}>
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
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", maxWidth: "600px" }}>
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

                {/* Booking Details */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      Booking Details
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-4)" }}>
                      <div>
                        <label htmlFor="included_items" className="label">{t("labels.includedItems")}</label>
                        <textarea
                          id="included_items" name="included_items" className="input"
                          placeholder={t("placeholders.includedItems")}
                          value={formData.included_items} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.included_items)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                      </div>
                    </div>
                  </details>
                </div>

                {/* Pickup */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      {t("sections.pickup")}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-4)" }}>
                      <div>
                        <label htmlFor="before_arrival_info" className="label">{t("labels.beforeArrival")}</label>
                        <textarea
                          id="before_arrival_info" name="before_arrival_info" className="input"
                          placeholder={t("placeholders.beforeArrival")}
                          value={formData.before_arrival_info} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.before_arrival_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>Lines ending : = headings.</p>
                      </div>
                      <div>
                        <label htmlFor="pickup_info" className="label">{t("labels.pickupInfo")}</label>
                        <textarea
                          id="pickup_info" name="pickup_info" className="input"
                          placeholder={t("placeholders.pickupInfo")}
                          value={formData.pickup_info} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.pickup_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>Maps link = Navigate card.</p>
                      </div>
                      <div>
                        <label htmlFor="important_before_pickup" className="label">Important before pickup</label>
                        <textarea
                          id="important_before_pickup" name="important_before_pickup" className="input"
                          placeholder=""
                          value={formData.important_before_pickup} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.important_before_pickup)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>Shown in Important before pickup card.</p>
                      </div>
                    </div>
                  </details>
                </div>

                {/* Return */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      {t("sections.return")}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>

                      {/* Before return checklist */}
                      <div>
                        <label htmlFor="before_return_info" className="label">{t("labels.beforeReturn")}</label>
                        <textarea
                          id="before_return_info" name="before_return_info" className="input"
                          placeholder={t("placeholders.beforeReturn")}
                          value={formData.before_return_info} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.before_return_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")} Lines ending : = headings. Shown as checklist on guest return page.</p>
                      </div>

                      {/* Nearby places */}
                      <div>
                        <label className="label">Nearby places <span style={{ fontWeight: 400, color: "rgb(var(--muted))" }}>— shown as tappable Maps links on the return page</span></label>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                          {returnNearbyPlaces.map((place, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 56px", gap: "var(--space-2)", alignItems: "center" }}>
                              <input
                                type="text"
                                className="input"
                                placeholder="Label (e.g. Supermarket)"
                                value={place.title}
                                disabled={!isAdmin}
                                onChange={(e) => setReturnNearbyPlaces(returnNearbyPlaces.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))}
                              />
                              <input
                                type="url"
                                className="input"
                                placeholder="https://maps.app.goo.gl/…"
                                value={place.url}
                                disabled={!isAdmin}
                                onChange={(e) => setReturnNearbyPlaces(returnNearbyPlaces.map((p, idx) => idx === i ? { ...p, url: e.target.value } : p))}
                              />
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => setReturnNearbyPlaces(returnNearbyPlaces.filter((_, idx) => idx !== i))}
                                  style={{ fontSize: "12px", color: "rgb(var(--error))", background: "none", border: "1px solid rgb(var(--error) / 0.4)", borderRadius: "var(--radius)", cursor: "pointer", padding: "0 var(--space-2)", height: "36px", whiteSpace: "nowrap" }}
                                >
                                  Remove
                                </button>
                              ) : <span />}
                            </div>
                          ))}
                          {isAdmin && (
                            <div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setReturnNearbyPlaces([...returnNearbyPlaces, { title: "", url: "" }])}
                                style={{ fontSize: "13px", marginTop: "var(--space-1)" }}
                              >
                                + Add place
                              </button>
                            </div>
                          )}
                          {returnNearbyPlaces.length === 0 && !isAdmin && (
                            <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>No nearby places configured.</p>
                          )}
                        </div>
                      </div>

                      {/* Return notes */}
                      <div>
                        <label htmlFor="return_info" className="label">Return notes <span style={{ fontWeight: 400, color: "rgb(var(--muted))" }}>— optional, shown in a collapsible card</span></label>
                        <textarea
                          id="return_info" name="return_info" className="input"
                          placeholder="Any additional return instructions…"
                          value={formData.return_info} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.return_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                      </div>

                    </div>
                  </details>
                </div>

                {/* FAQ */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      {t("sections.faq")}
                    </summary>
                    {t("faq.helper") && <p className="helper-text" style={{ marginBottom: "var(--space-4)" }}>{t("faq.helper")}</p>}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                      {faqItems.map((item, i) => (
                        <div
                          key={i}
                          style={{ border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                            <label className="label" style={{ margin: 0 }}>{t("faq.questionLabel", { number: i + 1 })}</label>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setFaqItems(faqItems.filter((_, idx) => idx !== i))}
                                style={{ fontSize: "12px", color: "rgb(var(--error))", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                {t("faq.removeButton")}
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            className="input"
                            placeholder={t("faq.questionPlaceholder")}
                            value={item.question}
                            disabled={!isAdmin}
                            onChange={(e) => setFaqItems(faqItems.map((f, idx) => idx === i ? { ...f, question: e.target.value } : f))}
                            style={{ width: "100%" }}
                          />
                          <textarea
                            className="input"
                            placeholder={t("faq.answerPlaceholder")}
                            value={item.answer}
                            disabled={!isAdmin}
                            onChange={(e) => setFaqItems(faqItems.map((f, idx) => idx === i ? { ...f, answer: e.target.value } : f))}
                            rows={4}
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
                          {t("faq.addButton")}
                        </button>
                      )}
                      {faqItems.length === 0 && !isAdmin && (
                        <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("faq.empty")}</p>
                      )}
                    </div>
                  </details>
                </div>

                {/* Help & How-to */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      Help & How-to
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-4)" }}>
                      <div>
                        <label htmlFor="help_intro" className="label">Help intro</label>
                        <textarea
                          id="help_intro" name="help_intro" className="input"
                          placeholder="Short intro text shown at the top of the Help & How-to contact card…"
                          value={formData.help_intro} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.help_intro)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>Shown as intro text in the contact card.</p>
                      </div>
                      <div>
                        <label htmlFor="help_quick_fixes" className="label">Quick fixes</label>
                        <textarea
                          id="help_quick_fixes" name="help_quick_fixes" className="input"
                          placeholder={"Water system:\nTurn tap clockwise to open\nCheck pump switch near sink\nElectricity:\nFlip the leisure battery switch\nConnect EHU cable if on hookup"}
                          value={formData.help_quick_fixes} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.help_quick_fixes, 6)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>Lines ending : = accordion title. Following lines = numbered steps.</p>
                      </div>
                      <div>
                        <label htmlFor="help_videos" className="label">How-to videos</label>
                        <textarea
                          id="help_videos" name="help_videos" className="input"
                          placeholder={"Water system:\nhttps://youtube.com/watch?v=…\nElectricity:\nhttps://youtube.com/watch?v=…"}
                          value={formData.help_videos} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.help_videos, 5)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>Lines ending : = group title. YouTube/video links below = embedded players.</p>
                      </div>
                      <div>
                        <label htmlFor="rules_and_tips" className="label">{t("labels.rulesAndTips")}</label>
                        <textarea
                          id="rules_and_tips" name="rules_and_tips" className="input"
                          placeholder={t("placeholders.rulesAndTips")}
                          value={formData.rules_and_tips} onChange={handleChange}
                          disabled={!isAdmin}
                          rows={countLines(formData.rules_and_tips)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                      </div>

                    </div>
                  </details>
                </div>

                {/* Feedback */}
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
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={saving}
                      style={{ opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
                    >
                      {saving ? t("actions.saving") : t("actions.saveChanges")}
                    </button>
                    <Link href={`/${locale}/staff`} className="btn btn-secondary">{t("actions.cancel")}</Link>
                  </div>
                )}
              </form>
            </div>


        </div>
      </div>
    </PageContainer>
  );
}
