"use client";

import { useState, useEffect, useMemo, FormEvent, ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import BackLink from "@/components/staff/BackLink";
import { localeNames, type Locale } from "@/i18n";

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

// Fields that vary per language — stored as company_settings.guest_content_i18n JSONB
interface I18nFields {
  before_arrival_info: string;
  pickup_info: string;
  important_before_pickup: string;
  before_return_info: string;
  return_info: string;
  included_items: string;
  rules_and_tips: string;
  help_intro: string;
  help_quick_fixes: string;
  help_videos: string;
  faq_items: FaqItem[];
}

// Fields shared across all languages — stored in companies / company_settings
interface SharedFields {
  contact_phone: string;
  contact_whatsapp: string;
  emergency_accident_phone_primary: string;
  emergency_accident_phone_secondary: string;
  emergency_breakdown_phone_primary: string;
  emergency_breakdown_phone_secondary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGS = ["EN", "DE", "SK", "PL", "CS"] as const;
type Lang = typeof LANGS[number];

// Shape of the JSONB column: { EN: {...}, DE: {...}, SK: {...}, PL: {...}, CS: {...} }
type I18nJson = Partial<Record<Lang, Partial<Omit<I18nFields, "faq_items"> & { faq_items: FaqItem[] | null }>>>;

const EMPTY_I18N: I18nFields = {
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
  faq_items: [],
};

function makeEmptyI18nRecord(): Record<Lang, I18nFields> {
  return {
    EN: { ...EMPTY_I18N, faq_items: [] },
    DE: { ...EMPTY_I18N, faq_items: [] },
    SK: { ...EMPTY_I18N, faq_items: [] },
    PL: { ...EMPTY_I18N, faq_items: [] },
    CS: { ...EMPTY_I18N, faq_items: [] },
  };
}

const EMPTY_SHARED: SharedFields = {
  contact_phone: "",
  contact_whatsapp: "",
  emergency_accident_phone_primary: "",
  emergency_accident_phone_secondary: "",
  emergency_breakdown_phone_primary: "",
  emergency_breakdown_phone_secondary: "",
};

// ─── LangTabs ─────────────────────────────────────────────────────────────────

function LangTabs({ active, onChange, langs }: { active: Lang; onChange: (l: Lang) => void; langs: readonly Lang[] }) {
  return (
    <div style={{ borderBottom: "1px solid rgb(var(--border))" }}>
      {langs.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          style={{
            padding: "var(--space-2) var(--space-5)",
            fontSize: "14px",
            fontWeight: active === lang ? 600 : 400,
            color: active === lang ? "rgb(var(--brand))" : "rgb(var(--muted))",
            background: "none",
            border: "none",
            borderBottom: active === lang ? "2px solid rgb(var(--brand))" : "2px solid transparent",
            cursor: "pointer",
            marginBottom: "-1px",
          }}
        >
          {lang}
        </button>
      ))}
    </div>
  );
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

// ─── NeedsTranslationHint ─────────────────────────────────────────────────────

function NeedsTranslationHint({ value, label }: { value: string; label: string }) {
  if (!value.startsWith("TODO_TRANSLATE:")) return null;
  return (
    <p style={{ fontSize: "11px", color: "#b45309", marginTop: "2px", marginBottom: 0, fontWeight: 500 }}>
      {label}
    </p>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuestContentPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const t = useTranslations("staffGuestContent");

  const [sharedData, setSharedData] = useState<SharedFields>(EMPTY_SHARED);
  // In-memory editing state, one slot per language
  const [i18nByLang, setI18nByLang] = useState<Record<Lang, I18nFields>>(makeEmptyI18nRecord());
  // Raw JSONB as last saved — used to merge only the active lang on each save
  const [rawI18nJson, setRawI18nJson] = useState<I18nJson>({});
  const [returnNearbyPlaces, setReturnNearbyPlaces] = useState<NearbyPlaceItem[]>([]);
  // undefined = loading, null = not found, object = found
  const [returnChecklist, setReturnChecklist] = useState<ReturnChecklist | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [activeLang, setActiveLang] = useState<Lang>(() => locale === "de" ? "DE" : locale === "sk" ? "SK" : locale === "pl" ? "PL" : locale === "cs" ? "CS" : "EN");
  const [copyWarning, setCopyWarning] = useState(false);
  const [configuredOriginalLang, setConfiguredOriginalLang] = useState<Lang | null>(null);

  // AI translation state
  const [translating, setTranslating] = useState(false);
  const [translationPreview, setTranslationPreview] = useState<I18nFields | null>(null);
  const [translationError, setTranslationError] = useState("");

  // Guest language settings — lowercase locale codes matching DB
  const ALL_LOCALES = ['sk', 'en', 'de', 'pl', 'cs'] as const;
  const [langOrder, setLangOrder] = useState<string[]>([...ALL_LOCALES]);
  const [langEnabled, setLangEnabled] = useState<Set<string>>(new Set(ALL_LOCALES));

  // Derived: enabled langs in configured order, always including default_guest_language
  const visibleLangs = useMemo<Lang[]>(() => {
    const ordered = langOrder
      .filter(l => langEnabled.has(l))
      .map(l => l.toUpperCase() as Lang)
      .filter(l => (LANGS as readonly string[]).includes(l));
    if (configuredOriginalLang && !ordered.includes(configuredOriginalLang)) {
      ordered.push(configuredOriginalLang);
    }
    return ordered.length > 0 ? ordered : [...LANGS];
  }, [langOrder, langEnabled, configuredOriginalLang]);

  // If the active tab is no longer visible, fall back to default_guest_language or first visible
  useEffect(() => {
    if (!visibleLangs.includes(activeLang)) {
      const fallback =
        configuredOriginalLang && visibleLangs.includes(configuredOriginalLang)
          ? configuredOriginalLang
          : visibleLangs[0];
      if (fallback) setActiveLang(fallback);
    }
  }, [visibleLangs]);

  // Derived: company's configured original language (or first lang with saved content)
  const originalLang = useMemo<Lang | null>(() => {
    const hasContent = (lang: Lang) => {
      const fields = rawI18nJson[lang];
      if (!fields) return false;
      return Object.entries(fields).some(([k, v]) =>
        k === "faq_items"
          ? Array.isArray(v) && v.length > 0
          : typeof v === "string" && v.trim().length > 0
      );
    };
    if (configuredOriginalLang && hasContent(configuredOriginalLang)) return configuredOriginalLang;
    for (const lang of LANGS) {
      if (hasContent(lang)) return lang;
    }
    return null;
  }, [rawI18nJson, configuredOriginalLang]);

  // Derived: current lang's i18n fields and FAQ helper
  const currentI18n = i18nByLang[activeLang];
  const faqItems = currentI18n.faq_items;
  const setFaqItems = (items: FaqItem[]) =>
    setI18nByLang(prev => ({
      ...prev,
      [activeLang]: { ...prev[activeLang], faq_items: items },
    }));

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
      const [{ data: settings }, { data: companyRow }] = await Promise.all([
        supabase
          .from("company_settings")
          .select("contact_phone, contact_whatsapp, pickup_info, important_before_pickup, return_info, rules_and_tips, before_arrival_info, before_return_info, included_items, faq_items, return_nearby_places, help_intro, help_quick_fixes, help_videos, guest_content_i18n, default_guest_language, guest_languages_order")
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("emergency_accident_phone_primary, emergency_accident_phone_secondary, emergency_breakdown_phone_primary, emergency_breakdown_phone_secondary")
          .eq("id", companyId)
          .maybeSingle(),
      ]);

      // Non-blocking: checklist template query is optional — must not abort the page load
      let template: ReturnChecklist | null = null;
      try {
        const { data } = await supabase
          .from("checklist_templates")
          .select("id, name, active, item_count")
          .eq("company_id", companyId)
          .eq("type", "return")
          .maybeSingle();
        template = data ?? null;
      } catch {
        // Non-fatal
      }

      // The JSONB column holds { EN: {...}, DE: {...}, SK: {...} } or null
      const rawJson: I18nJson = ((settings as any)?.guest_content_i18n ?? {}) as I18nJson;
      setRawI18nJson(rawJson);
      const rawLang = ((settings as any)?.default_guest_language ?? "").toUpperCase();
      setConfiguredOriginalLang((LANGS as readonly string[]).includes(rawLang) ? rawLang as Lang : null);

      // Guest language settings
      const storedOrder: string[] = (settings as any)?.guest_languages_order ?? [];
      if (storedOrder.length > 0) {
        const enabledSet = new Set(storedOrder);
        const allLower = ['sk', 'en', 'de', 'pl', 'cs'];
        const disabled = allLower.filter(l => !enabledSet.has(l));
        setLangOrder([...storedOrder, ...disabled]);
        setLangEnabled(enabledSet);
      }

      // Legacy flat columns are SK-only fallback — EN and DE start empty unless
      // guest_content_i18n already has saved content for that language.
      const skFallback: I18nFields = {
        before_arrival_info:     (settings as any)?.before_arrival_info     ?? "",
        pickup_info:             (settings as any)?.pickup_info             ?? "",
        important_before_pickup: (settings as any)?.important_before_pickup ?? "",
        before_return_info:      (settings as any)?.before_return_info      ?? "",
        return_info:             (settings as any)?.return_info             ?? "",
        included_items:          (settings as any)?.included_items          ?? "",
        rules_and_tips:          (settings as any)?.rules_and_tips          ?? "",
        help_intro:              (settings as any)?.help_intro              ?? "",
        help_quick_fixes:        (settings as any)?.help_quick_fixes        ?? "",
        help_videos:             (settings as any)?.help_videos             ?? "",
        faq_items:               (settings as any)?.faq_items               ?? [],
      };

      // For EN/DE: fall back to empty. For SK: fall back to legacy flat columns.
      const byLang = makeEmptyI18nRecord();
      for (const lang of LANGS) {
        const stored = rawJson[lang];
        const fb = lang === "SK" ? skFallback : EMPTY_I18N;
        byLang[lang] = {
          before_arrival_info:     stored?.before_arrival_info     ?? fb.before_arrival_info,
          pickup_info:             stored?.pickup_info             ?? fb.pickup_info,
          important_before_pickup: stored?.important_before_pickup ?? fb.important_before_pickup,
          before_return_info:      stored?.before_return_info      ?? fb.before_return_info,
          return_info:             stored?.return_info             ?? fb.return_info,
          included_items:          stored?.included_items          ?? fb.included_items,
          rules_and_tips:          stored?.rules_and_tips          ?? fb.rules_and_tips,
          help_intro:              stored?.help_intro              ?? fb.help_intro,
          help_quick_fixes:        stored?.help_quick_fixes        ?? fb.help_quick_fixes,
          help_videos:             stored?.help_videos             ?? fb.help_videos,
          faq_items:               stored?.faq_items               ?? fb.faq_items,
        };
      }
      setI18nByLang(byLang);

      setSharedData({
        contact_phone:                       (settings as any)?.contact_phone                         ?? "",
        contact_whatsapp:                    (settings as any)?.contact_whatsapp                      ?? "",
        emergency_accident_phone_primary:    (companyRow as any)?.emergency_accident_phone_primary    ?? "",
        emergency_accident_phone_secondary:  (companyRow as any)?.emergency_accident_phone_secondary  ?? "",
        emergency_breakdown_phone_primary:   (companyRow as any)?.emergency_breakdown_phone_primary   ?? "",
        emergency_breakdown_phone_secondary: (companyRow as any)?.emergency_breakdown_phone_secondary ?? "",
      });
      const rawNearbyPlaces = (settings as any)?.return_nearby_places;
      setReturnNearbyPlaces(rawNearbyPlaces ?? []);
      setReturnChecklist(template ?? null);
      setLoading(false);
    };
    load();
  }, [companyId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLangChange = (l: Lang) => {
    setActiveLang(l);
    setCopyWarning(false);
    setTranslationError("");
  };

  const handleCopyFrom = () => {
    if (!originalLang) return;
    if (!window.confirm(t("copyFrom.confirm", { from: originalLang, to: activeLang }))) return;
    setI18nByLang(prev => ({ ...prev, [activeLang]: { ...prev[originalLang] } }));
    setCopyWarning(true);
  };

  const handleAiTranslate = async () => {
    if (!originalLang || !configuredOriginalLang) return;
    setTranslationError("");
    setTranslating(true);
    try {
      const sourceContent = i18nByLang[originalLang];
      const res = await fetch("/api/staff/translate-guest-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLang: originalLang,
          targetLang: activeLang,
          content: sourceContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTranslationError(data?.error || t("aiTranslate.errorFailed"));
        return;
      }
      setTranslationPreview(data.translated as I18nFields);
    } catch {
      setTranslationError(t("aiTranslate.errorFailed"));
    } finally {
      setTranslating(false);
    }
  };

  const doSave = async (i18nOverride?: I18nFields) => {
    setError(""); setSuccess(false); setSaving(true);
    try {
      const i18n = i18nOverride ?? i18nByLang[activeLang];
      const updatedJson: I18nJson = {
        ...rawI18nJson,
        [activeLang]: {
          before_arrival_info:     i18n.before_arrival_info.trim()     || null,
          pickup_info:             i18n.pickup_info.trim()             || null,
          important_before_pickup: i18n.important_before_pickup.trim() || null,
          before_return_info:      i18n.before_return_info.trim()      || null,
          return_info:             i18n.return_info.trim()             || null,
          included_items:          i18n.included_items.trim()          || null,
          rules_and_tips:          i18n.rules_and_tips.trim()          || null,
          help_intro:              i18n.help_intro.trim()              || null,
          help_quick_fixes:        i18n.help_quick_fixes.trim()        || null,
          help_videos:             i18n.help_videos.trim()             || null,
          faq_items:               i18n.faq_items.length > 0 ? i18n.faq_items : null,
        },
      };

      const defaultLang = configuredOriginalLang?.toLowerCase();
      const enabledOrdered = langOrder.filter(l => langEnabled.has(l));
      if (defaultLang && !enabledOrdered.includes(defaultLang)) enabledOrdered.push(defaultLang);

      const [{ data: rows, error: settingsErr }, { error: companyErr }] = await Promise.all([
        supabase
          .from("company_settings")
          .update({
            contact_phone:           sharedData.contact_phone.trim()    || null,
            contact_whatsapp:        sharedData.contact_whatsapp.trim() || null,
            return_nearby_places:    returnNearbyPlaces.length > 0 ? returnNearbyPlaces : null,
            guest_content_i18n:      updatedJson,
            guest_languages_order:   enabledOrdered.length > 0 ? enabledOrdered : null,
          })
          .eq("id", companyId)
          .select("id"),
        supabase
          .from("companies")
          .update({
            emergency_accident_phone_primary:    sharedData.emergency_accident_phone_primary.trim()    || null,
            emergency_accident_phone_secondary:  sharedData.emergency_accident_phone_secondary.trim()  || null,
            emergency_breakdown_phone_primary:   sharedData.emergency_breakdown_phone_primary.trim()   || null,
            emergency_breakdown_phone_secondary: sharedData.emergency_breakdown_phone_secondary.trim() || null,
          })
          .eq("id", companyId),
      ]);
      if (settingsErr) throw settingsErr;
      if (companyErr) throw companyErr;
      if (!rows || rows.length === 0) throw new Error(t("errors.saveSettingsFailed"));
      setRawI18nJson(updatedJson);
      const allLower = ['sk', 'en', 'de', 'pl', 'cs'];
      const disabled = allLower.filter(l => !enabledOrdered.includes(l));
      setLangOrder([...enabledOrdered, ...disabled]);
      setLangEnabled(new Set(enabledOrdered));
      setSuccess(true);
      setCopyWarning(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || t("errors.saveSettingsFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelTranslation = () => {
    setTranslationPreview(null);
    setTranslationError("");
  };

  const handleApplyAndSave = async () => {
    if (!translationPreview) return;
    const applied = translationPreview;
    setI18nByLang(prev => ({ ...prev, [activeLang]: applied }));
    setTranslationPreview(null);
    setTranslationError("");
    await doSave(applied);
  };

  const handleLangToggle = (locale: string) => {
    const defaultLang = configuredOriginalLang?.toLowerCase();
    if (locale === defaultLang) return;
    setLangEnabled(prev => {
      const next = new Set(prev);
      if (next.has(locale)) { next.delete(locale); } else { next.add(locale); }
      return next;
    });
  };

  const handleLangMoveUp = (locale: string) => {
    const idx = langOrder.indexOf(locale);
    if (idx <= 0) return;
    const next = [...langOrder];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setLangOrder(next);
  };

  const handleLangMoveDown = (locale: string) => {
    const idx = langOrder.indexOf(locale);
    if (idx < 0 || idx >= langOrder.length - 1) return;
    const next = [...langOrder];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setLangOrder(next);
  };

  const handleSharedChange = (e: ChangeEvent<HTMLInputElement>) =>
    setSharedData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleI18nChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setI18nByLang(prev => ({
      ...prev,
      [activeLang]: { ...prev[activeLang], [e.target.name]: e.target.value },
    }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await doSave();
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

  return (
    <PageContainer maxWidth="1400px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <BackLink href={`/${locale}/staff`}>{t("navigation.backToDashboard")}</BackLink>
        </div>
      <div className="surface page-surface">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

          {/* Header */}
          <div>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))", margin: 0 }}>{t("title")}</h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {isAdmin ? t("description.admin") : t("description.viewer")}
            </p>
          </div>

          {/* Main form */}
          <div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>

                {/* Guest Language Settings */}
                <div>
                  <SectionHeading
                    title={t("sections.guestLanguages")}
                    subtitle={t("languageSettings.description")}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxWidth: "360px" }}>
                    {langOrder.map((locale, idx) => {
                      const isDefault = locale === configuredOriginalLang?.toLowerCase();
                      const enabled = langEnabled.has(locale);
                      return (
                        <div
                          key={locale}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-3)",
                            padding: "var(--space-2) var(--space-3)",
                            borderRadius: "var(--radius)",
                            border: "1px solid rgb(var(--border))",
                            background: enabled ? "rgb(var(--brand) / 0.04)" : "transparent",
                            opacity: !enabled ? 0.65 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={!isAdmin || isDefault}
                            onChange={() => handleLangToggle(locale)}
                            style={{ cursor: isDefault || !isAdmin ? "default" : "pointer", flexShrink: 0 }}
                          />
                          <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgb(var(--muted))", minWidth: "22px" }}>
                            {locale}
                          </span>
                          <span style={{ fontSize: "14px", flex: 1 }}>
                            {localeNames[locale as Locale]}
                          </span>
                          {isDefault && (
                            <span style={{ fontSize: "11px", color: "rgb(var(--muted))", fontStyle: "italic", flexShrink: 0 }}>
                              {t("languageSettings.alwaysEnabled")}
                            </span>
                          )}
                          {isAdmin && enabled && (
                            <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => handleLangMoveUp(locale)}
                                disabled={idx === 0}
                                aria-label={t("languageSettings.moveUp")}
                                style={{ padding: "2px 5px", fontSize: "12px", border: "1px solid rgb(var(--border))", borderRadius: "var(--radius-sm)", background: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, lineHeight: 1 }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLangMoveDown(locale)}
                                disabled={idx === langOrder.length - 1}
                                aria-label={t("languageSettings.moveDown")}
                                style={{ padding: "2px 5px", fontSize: "12px", border: "1px solid rgb(var(--border))", borderRadius: "var(--radius-sm)", background: "none", cursor: idx === langOrder.length - 1 ? "default" : "pointer", opacity: idx === langOrder.length - 1 ? 0.3 : 1, lineHeight: 1 }}
                              >
                                ↓
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Language tabs + copy-from */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
                    <LangTabs active={activeLang} onChange={handleLangChange} langs={visibleLangs} />
                    {isAdmin && originalLang && originalLang !== activeLang && (
                      <div style={{ paddingBottom: "1px", display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={handleCopyFrom}
                          style={{
                            fontSize: "12px",
                            padding: "3px 10px",
                            borderRadius: "var(--radius)",
                            border: "1px solid rgb(var(--border))",
                            background: "none",
                            cursor: "pointer",
                            color: "rgb(var(--muted))",
                            lineHeight: "1.4",
                          }}
                        >
                          {t("copyFrom.button", { lang: originalLang })}
                        </button>
                        <button
                          type="button"
                          onClick={handleAiTranslate}
                          disabled={translating}
                          style={{
                            fontSize: "12px",
                            padding: "3px 10px",
                            borderRadius: "var(--radius)",
                            border: "1px solid rgb(var(--brand) / 0.4)",
                            background: "rgb(var(--brand) / 0.06)",
                            cursor: translating ? "not-allowed" : "pointer",
                            color: translating ? "rgb(var(--muted))" : "rgb(var(--brand))",
                            lineHeight: "1.4",
                            opacity: translating ? 0.6 : 1,
                          }}
                        >
                          {translating ? t("aiTranslate.translating") : t("aiTranslate.button", { lang: originalLang })}
                        </button>
                      </div>
                    )}
                  </div>
                  {copyWarning && (
                    <p style={{ fontSize: "12px", color: "#b45309", fontWeight: 500, marginTop: "var(--space-2)", marginBottom: 0 }}>
                      {t("copyFrom.warning")}
                    </p>
                  )}
                  {translationError && (
                    <p style={{ fontSize: "12px", color: "rgb(var(--error))", fontWeight: 500, marginTop: "var(--space-2)", marginBottom: 0 }}>
                      {translationError}
                    </p>
                  )}
                  <p className="helper-text" style={{ marginTop: "var(--space-2)" }}>
                    {t("copyFrom.langHint")}
                  </p>
                </div>

                {/* Contact Numbers — shared across all languages */}
                <div>
                  <SectionHeading title={t("sections.contact")} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)", maxWidth: "600px" }}>
                    <div>
                      <label htmlFor="contact_phone" className="label">{t("labels.contactPhone")}</label>
                      <input
                        id="contact_phone" name="contact_phone" type="tel" className="input"
                        placeholder={t("placeholders.contactPhone")}
                        value={sharedData.contact_phone} onChange={handleSharedChange}
                        disabled={!isAdmin} style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label htmlFor="contact_whatsapp" className="label">{t("labels.whatsappNumber")}</label>
                      <input
                        id="contact_whatsapp" name="contact_whatsapp" type="tel" className="input"
                        placeholder={t("placeholders.whatsappNumber")}
                        value={sharedData.contact_whatsapp} onChange={handleSharedChange}
                        disabled={!isAdmin} style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contacts — shared across all languages */}
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
                            placeholder={t("placeholders.phonePlaceholder")} value={sharedData.emergency_accident_phone_primary}
                            onChange={handleSharedChange} disabled={!isAdmin} style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label htmlFor="emergency_accident_phone_secondary" className="label">{t("labels.secondaryPhone")}</label>
                          <input id="emergency_accident_phone_secondary" name="emergency_accident_phone_secondary" type="tel" className="input"
                            placeholder={t("placeholders.phonePlaceholder")} value={sharedData.emergency_accident_phone_secondary}
                            onChange={handleSharedChange} disabled={!isAdmin} style={{ width: "100%" }} />
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
                            placeholder={t("placeholders.phonePlaceholder")} value={sharedData.emergency_breakdown_phone_primary}
                            onChange={handleSharedChange} disabled={!isAdmin} style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label htmlFor="emergency_breakdown_phone_secondary" className="label">{t("labels.secondaryPhone")}</label>
                          <input id="emergency_breakdown_phone_secondary" name="emergency_breakdown_phone_secondary" type="tel" className="input"
                            placeholder={t("placeholders.phonePlaceholder")} value={sharedData.emergency_breakdown_phone_secondary}
                            onChange={handleSharedChange} disabled={!isAdmin} style={{ width: "100%" }} />
                        </div>
                      </div>
                      <p className="helper-text" style={{ marginTop: "var(--space-2)" }}>{t("helpers.emergencyPhoneUsage")}</p>
                    </div>
                  </div>
                </div>

                {/* Booking Details — per language */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      {t("sections.bookingDetails")}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-4)" }}>
                      <div>
                        <label htmlFor="included_items" className="label">{t("labels.includedItems")}</label>
                        <textarea
                          id="included_items" name="included_items" className="input"
                          placeholder={t("placeholders.includedItems")}
                          value={currentI18n.included_items} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.included_items)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.included_items} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                      </div>
                    </div>
                  </details>
                </div>

                {/* Pickup — per language */}
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
                          value={currentI18n.before_arrival_info} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.before_arrival_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.before_arrival_info} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.linesEndingHeadings")}</p>
                      </div>
                      <div>
                        <label htmlFor="pickup_info" className="label">{t("labels.pickupInfo")}</label>
                        <textarea
                          id="pickup_info" name="pickup_info" className="input"
                          placeholder={t("placeholders.pickupInfo")}
                          value={currentI18n.pickup_info} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.pickup_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.pickup_info} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.mapsLinkNavigate")}</p>
                      </div>
                      <div>
                        <label htmlFor="important_before_pickup" className="label">{t("labels.importantBeforePickup")}</label>
                        <textarea
                          id="important_before_pickup" name="important_before_pickup" className="input"
                          placeholder=""
                          value={currentI18n.important_before_pickup} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.important_before_pickup)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.important_before_pickup} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.importantBeforePickupHint")}</p>
                      </div>
                    </div>
                  </details>
                </div>

                {/* Return — text per language, nearby places shared */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      {t("sections.return")}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>

                      {/* Before return checklist — per language */}
                      <div>
                        <label htmlFor="before_return_info" className="label">{t("labels.beforeReturn")}</label>
                        <textarea
                          id="before_return_info" name="before_return_info" className="input"
                          placeholder={t("placeholders.beforeReturn")}
                          value={currentI18n.before_return_info} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.before_return_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.before_return_info} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")} Lines ending : = headings. Shown as checklist on guest return page.</p>
                      </div>

                      {/* Nearby places — shared (URLs don't translate) */}
                      <div>
                        <label className="label">{t("labels.nearbyPlaces")} <span style={{ fontWeight: 400, color: "rgb(var(--muted))" }}>— {t("labels.nearbyPlacesDesc")}</span></label>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                          {returnNearbyPlaces.map((place, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 56px", gap: "var(--space-2)", alignItems: "center" }}>
                              <input
                                type="text"
                                className="input"
                                placeholder={t("placeholders.nearbyPlaceLabel")}
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
                                  {t("actions.removePlace")}
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
                                {t("actions.addPlace")}
                              </button>
                            </div>
                          )}
                          {returnNearbyPlaces.length === 0 && !isAdmin && (
                            <p style={{ fontSize: "14px", color: "rgb(var(--muted))" }}>{t("helpers.nearbyPlacesEmpty")}</p>
                          )}
                        </div>
                      </div>

                      {/* Return notes — per language */}
                      <div>
                        <label htmlFor="return_info" className="label">{t("labels.returnNotes")} <span style={{ fontWeight: 400, color: "rgb(var(--muted))" }}>— {t("labels.returnNotesDesc")}</span></label>
                        <textarea
                          id="return_info" name="return_info" className="input"
                          placeholder={t("placeholders.returnNotes")}
                          value={currentI18n.return_info} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.return_info)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.return_info} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.textareaHelper")}</p>
                      </div>

                    </div>
                  </details>
                </div>

                {/* FAQ — per language */}
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
                          <NeedsTranslationHint label={t("hints.needsTranslation")} value={item.question} />
                          <textarea
                            className="input"
                            placeholder={t("faq.answerPlaceholder")}
                            value={item.answer}
                            disabled={!isAdmin}
                            onChange={(e) => setFaqItems(faqItems.map((f, idx) => idx === i ? { ...f, answer: e.target.value } : f))}
                            rows={4}
                            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                          />
                          <NeedsTranslationHint label={t("hints.needsTranslation")} value={item.answer} />
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

                {/* Help & How-to — per language */}
                <div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "20px", color: "rgb(var(--text))", marginBottom: "var(--space-4)", userSelect: "none" }}>
                      {t("sections.helpHowTo")}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", marginTop: "var(--space-4)" }}>
                      <div>
                        <label htmlFor="help_intro" className="label">{t("labels.helpIntro")}</label>
                        <textarea
                          id="help_intro" name="help_intro" className="input"
                          placeholder={t("placeholders.helpIntro")}
                          value={currentI18n.help_intro} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.help_intro)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.help_intro} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.helpIntroHint")}</p>
                      </div>
                      <div>
                        <label htmlFor="help_quick_fixes" className="label">{t("labels.quickFixes")}</label>
                        <textarea
                          id="help_quick_fixes" name="help_quick_fixes" className="input"
                          placeholder={"Water system:\nTurn tap clockwise to open\nCheck pump switch near sink\nElectricity:\nFlip the leisure battery switch\nConnect EHU cable if on hookup"}
                          value={currentI18n.help_quick_fixes} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.help_quick_fixes, 6)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.help_quick_fixes} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.quickFixesHint")}</p>
                      </div>
                      <div>
                        <label htmlFor="help_videos" className="label">{t("labels.howToVideos")}</label>
                        <textarea
                          id="help_videos" name="help_videos" className="input"
                          placeholder={"Water system:\nhttps://youtube.com/watch?v=…\nElectricity:\nhttps://youtube.com/watch?v=…"}
                          value={currentI18n.help_videos} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.help_videos, 5)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.help_videos} />
                        <p className="helper-text" style={{ marginTop: "var(--space-1)" }}>{t("helpers.howToVideosHint")}</p>
                      </div>
                      <div>
                        <label htmlFor="rules_and_tips" className="label">{t("labels.rulesAndTips")}</label>
                        <textarea
                          id="rules_and_tips" name="rules_and_tips" className="input"
                          placeholder={t("placeholders.rulesAndTips")}
                          value={currentI18n.rules_and_tips} onChange={handleI18nChange}
                          disabled={!isAdmin}
                          rows={countLines(currentI18n.rules_and_tips)}
                          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <NeedsTranslationHint label={t("hints.needsTranslation")} value={currentI18n.rules_and_tips} />
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
      </div>
      {/* AI Translation Loading Modal */}
      {translating && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgb(0 0 0 / 0.55)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              background: "rgb(var(--surface))",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 20px 60px rgb(0 0 0 / 0.3)",
              width: "100%",
              maxWidth: "420px",
              padding: "var(--space-10) var(--space-8)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-4)",
              textAlign: "center",
            }}
          >
            <>
              <style>{`
                @keyframes cf-ai-spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
              <span
                style={{
                  width: "38px",
                  height: "38px",
                  borderTop: "5px solid rgb(var(--brand))",
                  borderRight: "2px solid rgb(var(--brand) / 0.35)",
                  borderBottom: "5px solid transparent",
                  borderLeft: "2px solid transparent",
                  borderRadius: "50%",
                  display: "block",
                  flexShrink: 0,
                  animation: "cf-ai-spin 0.85s linear infinite",
                }}
              />
            </>
            <div>
              <p style={{ fontSize: "17px", fontWeight: 700, color: "rgb(var(--text))", margin: 0 }}>
                {t("aiTranslate.loadingTitle")}
              </p>
              <p style={{ fontSize: "14px", color: "rgb(var(--muted))", marginTop: "var(--space-2)", marginBottom: 0 }}>
                {t("aiTranslate.loadingSubtitle")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Translation Preview Modal */}
      {translationPreview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgb(0 0 0 / 0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              background: "rgb(var(--surface))",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 20px 60px rgb(0 0 0 / 0.3)",
              width: "100%",
              maxWidth: "660px",
              maxHeight: "82vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid rgb(var(--border))" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "rgb(var(--text))", margin: 0 }}>
                {t("aiTranslate.previewTitle", { lang: activeLang })}
              </h2>
              <p style={{ fontSize: "13px", color: "rgb(var(--muted))", marginTop: "var(--space-1)", marginBottom: 0 }}>
                {t("aiTranslate.previewSubtitle")}
              </p>
            </div>

            {/* Scrollable field preview */}
            <div style={{ overflowY: "auto", flex: 1, padding: "var(--space-5) var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {(
                [
                  ["before_arrival_info", t("labels.beforeArrival")],
                  ["pickup_info", t("labels.pickupInfo")],
                  ["important_before_pickup", t("labels.importantBeforePickup")],
                  ["before_return_info", t("labels.beforeReturn")],
                  ["return_info", t("labels.returnNotes")],
                  ["included_items", t("labels.includedItems")],
                  ["rules_and_tips", t("labels.rulesAndTips")],
                  ["help_intro", t("labels.helpIntro")],
                  ["help_quick_fixes", t("labels.quickFixes")],
                  ["help_videos", t("labels.howToVideos")],
                ] as [keyof I18nFields, string][]
              ).map(([field, label]) => {
                const val = translationPreview[field];
                const text = typeof val === "string" ? val : "";
                return (
                  <div key={field}>
                    <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgb(var(--muted))", marginBottom: "var(--space-1)" }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: "13px",
                      color: text ? "rgb(var(--text))" : "rgb(var(--muted))",
                      background: "rgb(var(--brand) / 0.04)",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      padding: "var(--space-2) var(--space-3)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: "120px",
                      overflowY: "auto",
                      fontFamily: "inherit",
                    }}>
                      {text || t("aiTranslate.previewEmpty")}
                    </div>
                  </div>
                );
              })}

              {/* FAQ items preview */}
              {translationPreview.faq_items.length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgb(var(--muted))", marginBottom: "var(--space-2)" }}>
                    {t("sections.faq")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {translationPreview.faq_items.map((item, i) => (
                      <div key={i} style={{ border: "1px solid rgb(var(--border))", borderRadius: "var(--radius)", padding: "var(--space-3)", background: "rgb(var(--brand) / 0.04)" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "rgb(var(--text))", marginBottom: "var(--space-1)" }}>
                          {item.question || t("aiTranslate.previewEmpty")}
                        </div>
                        <div style={{ fontSize: "13px", color: "rgb(var(--muted))", whiteSpace: "pre-wrap" }}>
                          {item.answer || t("aiTranslate.previewEmpty")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: "var(--space-4) var(--space-6)", borderTop: "1px solid rgb(var(--border))", display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelTranslation}
                style={{ fontSize: "14px" }}
              >
                {t("aiTranslate.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyAndSave}
                disabled={saving}
                style={{ fontSize: "14px", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? t("actions.saving") : t("aiTranslate.applyAndSave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
