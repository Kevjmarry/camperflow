"use client";

import { useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

export default function StaffLoginPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffLogin");
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        await supabase.auth.signOut();
        setError(t("error.accessDeniedError"));
        setLoading(false);
        return;
      }

      const { data: staffProfile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("id, role, active, company_id")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();

      if (profileError || !staffProfile || staffProfile.active !== true) {
        await supabase.auth.signOut();
        setError(t("error.accessDeniedError"));
        setLoading(false);
        return;
      }

      if (staffProfile.role !== "staff" && staffProfile.role !== "admin") {
        await supabase.auth.signOut();
        setError(t("error.accessDeniedError"));
        setLoading(false);
        return;
      }

      router.push(`/${locale}/staff`);
      router.refresh();
    } catch {
      setError(t("error.unexpected"));
      setLoading(false);
    }
  };

  return (
    <PageContainer maxWidth="480px" showSignOut={true}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("title")}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {t("subtitle")}
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <div>
              <label htmlFor="email" className="label">
                {t("emailLabel")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                {t("passwordLabel")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ width: "100%" }}
              />
            </div>

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

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? t("signingIn") : t("signIn")}
            </button>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}