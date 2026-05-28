"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ExtraCatalogItem {
  id: string;
  name: string; // legacy fallback — do not drop until migration is confirmed
  name_i18n: { en: string; de: string; sk: string };
  active: boolean;
}

export interface CompanySettings {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  company_timezone: string;
  core_operations_access?: boolean;
  review_funnel_access?: boolean;
}

interface ThemeContextType {
  company: CompanySettings | null;
  loading: boolean;
  refreshCompany: () => Promise<void>;
}

const defaultCompany: CompanySettings = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "CamperFlow",
  logo_url: null,
  primary_color: "#3b82f6",
  secondary_color: "#8b5cf6",
  accent_color: "#10b981",
  company_timezone: "Europe/Bratislava",
  core_operations_access: true,
  review_funnel_access: true,
};

const STORAGE_KEY = "camperflow:last_company_theme";

const ThemeContext = createContext<ThemeContextType>({
  company: null,
  loading: true,
  refreshCompany: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const requestIdRef = useRef(0);

  const applyAndCacheTheme = (settings: CompanySettings) => {
    applyTheme(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  };

  const loadCachedTheme = (): CompanySettings | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CompanySettings) : null;
    } catch {
      return null;
    }
  };

  const clearCachedTheme = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const loadCompanySettings = async (): Promise<void> => {
    const requestId = ++requestIdRef.current;

    const safeSetCompany = (value: CompanySettings | null) => {
      if (requestIdRef.current !== requestId) return;
      setCompany(value);
    };

    const safeSetLoading = (value: boolean) => {
      if (requestIdRef.current !== requestId) return;
      setLoading(value);
    };

    // Tracks whether getUser() confirmed an authenticated session.
    // Used in the catch to avoid wiping cache on a pure network failure
    // when auth state was never established.
    let userIsAuthenticated = false;

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // No authenticated user → cached theme is safe for public/pre-login display
      if (!user) {
        const cached = loadCachedTheme();
        if (cached) {
          safeSetCompany(cached);
          applyTheme(cached);
        } else {
          safeSetCompany(defaultCompany);
          applyTheme(defaultCompany);
        }
        return;
      }

      userIsAuthenticated = true;

      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("company_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!staffProfile?.company_id) {
        // Authenticated user with no company link — never show stale cached company data
        clearCachedTheme();
        applyTheme(defaultCompany);
        safeSetCompany(null);
        return;
      }

      const { data: companyData } = await supabase
        .from("companies")
        .select("id, name, logo_url, primary_color, secondary_color, accent_color, company_timezone, core_operations_access, review_funnel_access")
        .eq("id", staffProfile.company_id)
        .maybeSingle();

      if (!companyData) {
        // Company row missing for this profile — treat same as no company link
        clearCachedTheme();
        applyTheme(defaultCompany);
        safeSetCompany(null);
        return;
      }

      safeSetCompany(companyData);
      applyAndCacheTheme(companyData);
    } catch {
      if (userIsAuthenticated) {
        // Auth was confirmed but a subsequent query failed — don't fall back to stale cache
        clearCachedTheme();
        applyTheme(defaultCompany);
        safeSetCompany(null);
      } else {
        // getUser() itself threw (e.g. network down) — auth state unknown, keep cache
        const cached = loadCachedTheme();
        if (cached) {
          safeSetCompany(cached);
          applyTheme(cached);
        } else {
          safeSetCompany(defaultCompany);
          applyTheme(defaultCompany);
        }
      }
    } finally {
      safeSetLoading(false);
    }
  };

  const refreshCompany = async () => {
    setLoading(true);
    await loadCompanySettings();
  };

  useEffect(() => {
    const supabase = createClient();

    loadCompanySettings();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refreshCompany();
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider value={{ company, loading, refreshCompany }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(settings: CompanySettings) {
  function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "0 0 0";
    return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(
      result[3],
      16
    )}`;
  }

  function adjustBrightness(hex: string, amount: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;

    const r = Math.max(0, Math.min(255, parseInt(result[1], 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(result[2], 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(result[3], 16) + amount));

    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  const root = document.documentElement;
  root.style.setProperty("--brand", hexToRgb(settings.primary_color));
  root.style.setProperty(
    "--brand-hover",
    hexToRgb(adjustBrightness(settings.primary_color, -20))
  );
  root.style.setProperty(
    "--brand-light",
    hexToRgb(adjustBrightness(settings.primary_color, 200))
  );
  root.style.setProperty("--brand-2", hexToRgb(settings.secondary_color));
  root.style.setProperty("--accent", hexToRgb(settings.accent_color));
}

export type { ThemeContextType };
