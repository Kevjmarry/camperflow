"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const REMEMBER_EMAIL_KEY = "staff_remembered_email";

type Mode = "login" | "reset";

export default function StaffLoginPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffLogin");
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
  }, []);

  const [mode, setMode] = useState<Mode>("login");
  const [resetSuccess, setResetSuccess] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setResetSuccess(false);
  };

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
        .select("id, role, company_id, active, can_manage")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();

      if (profileError || !staffProfile) {
        await supabase.auth.signOut();
        setError(t("error.accessDeniedError"));
        setLoading(false);
        return;
      }

      if (staffProfile.role !== "admin" && staffProfile.role !== "staff") {
        await supabase.auth.signOut();
        setError(t("error.accessDeniedError"));
        setLoading(false);
        return;
      }

      if (staffProfile.active !== true) {
        await supabase.auth.signOut();
        setError(t("error.accessDeniedError"));
        setLoading(false);
        return;
      }

      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      router.push(`/${locale}/staff`);
      router.refresh();
    } catch {
      setError(t("error.unexpected"));
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/${locale}/staff/reset`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      );

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setResetSuccess(true);
    } catch {
      setError(t("error.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "rgb(var(--app-bg))",
        color: "rgb(var(--text))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-8) var(--space-4)",
      }}
    >
      <style>{`
        .staff-login-card {
          padding: var(--space-6);
        }
        .staff-login-content {
          gap: var(--space-6);
        }
        .staff-login-form {
          gap: var(--space-4);
        }
        @media (min-width: 540px) {
          .staff-login-card {
            padding: var(--space-8) var(--space-10);
          }
          .staff-login-content {
            gap: var(--space-8);
          }
          .staff-login-form {
            gap: var(--space-5);
          }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <div className="surface staff-login-card">
          <div
            className="staff-login-content"
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Back link */}
            <div>
              <Link
                href={`/${locale}`}
                style={{
                  fontSize: "15px",
                  color: "rgb(var(--brand))",
                  textDecoration: "none",
                }}
              >
                ← {t("backToHome")}
              </Link>
            </div>

            {/* Heading */}
            <div style={{ textAlign: "center" }}>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {mode === "login" ? t("title") : "Reset password"}
              </h1>
              <p
                style={{
                  marginTop: "var(--space-2)",
                  fontSize: "16px",
                  color: "rgb(var(--muted))",
                }}
              >
                {mode === "login"
                  ? t("subtitle")
                  : "Enter your email and we'll send you a reset link."}
              </p>
            </div>

            {/* ── LOGIN FORM ── */}
            {mode === "login" && (
              <form
                onSubmit={handleLogin}
                className="staff-login-form"
                style={{
                  display: "flex",
                  flexDirection: "column",
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
                  <div style={{ marginTop: "var(--space-2)", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      style={{
                        background: "none",
                        border: "none",
                        padding: "6px 2px",
                        fontSize: "14px",
                        color: "rgb(var(--brand))",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    fontSize: "14px",
                    color: "rgb(var(--muted))",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  {t("rememberEmail")}
                </label>

                {error && (
                  <div
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      background: "rgb(var(--error) / 0.1)",
                      border: "1px solid rgb(var(--error) / 0.3)",
                      borderRadius: "var(--radius)",
                      color: "rgb(var(--error))",
                      fontSize: "15px",
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
            )}

            {/* ── RESET FORM ── */}
            {mode === "reset" && (
              <form
                onSubmit={handleResetPassword}
                className="staff-login-form"
                style={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div>
                  <label htmlFor="reset-email" className="label">
                    {t("emailLabel")}
                  </label>
                  <input
                    id="reset-email"
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

                {error && (
                  <div
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      background: "rgb(var(--error) / 0.1)",
                      border: "1px solid rgb(var(--error) / 0.3)",
                      borderRadius: "var(--radius)",
                      color: "rgb(var(--error))",
                      fontSize: "15px",
                    }}
                  >
                    {error}
                  </div>
                )}

                {resetSuccess && (
                  <div
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      background: "rgb(var(--success) / 0.1)",
                      border: "1px solid rgb(var(--success) / 0.3)",
                      borderRadius: "var(--radius)",
                      color: "rgb(var(--success))",
                      fontSize: "15px",
                    }}
                  >
                    Check your email for the reset link.
                  </div>
                )}

                {!resetSuccess && (
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
                    {loading ? "Sending…" : "Send reset link"}
                  </button>
                )}

                <div style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "6px 2px",
                      fontSize: "14px",
                      color: "rgb(var(--brand))",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    ← Back to sign in
                  </button>
                </div>
              </form>
            )}

            {/* Invite-only notice */}
            {mode === "login" && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: "14px",
                  color: "rgb(var(--muted))",
                  marginTop: "var(--space-2)",
                }}
              >
                {t("inviteOnly")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
