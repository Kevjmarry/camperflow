"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import StaffAuthShell from "@/components/staff/StaffAuthShell";
import { createClient } from "@/lib/supabase/client";

export default function StaffResetPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffLogin");
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      setSessionChecking(true);

      try {
        // First, check if a session already exists
        const { data: existingSession } = await supabase.auth.getSession();

        if (existingSession?.session) {
          setSessionReady(true);
          setSessionChecking(false);
          return;
        }

        // No session – try to extract tokens from the URL hash
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            setError(setSessionError.message);
            setSessionChecking(false);
            return;
          }

          // Re-check session after setting it
          const { data: refreshedSession } = await supabase.auth.getSession();

          if (refreshedSession?.session) {
            setSessionReady(true);
          } else {
            setError(t("reset.sessionMissing"));
          }
        } else {
          setError(t("reset.sessionMissing"));
        }
      } catch {
        setError(t("error.unexpected"));
      } finally {
        setSessionChecking(false);
      }
    };

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordsNoMatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${locale}/staff/login`);
      }, 2000);
    } catch {
      setError(t("error.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  const backLink = (
    <Link
      href={`/${locale}/staff/login`}
      style={{ fontSize: "14px", color: "rgb(var(--brand))", textDecoration: "none" }}
    >
      ← {t("backToSignIn")}
    </Link>
  );

  return (
    <StaffAuthShell backLink={backLink}>
      <div className="surface staff-auth-card">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("reset.title")}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {t("reset.subtitle")}
            </p>
          </div>

          {/* Session checking state */}
          {sessionChecking && (
            <p style={{ textAlign: "center", color: "rgb(var(--muted))", fontSize: "14px" }}>
              {t("reset.verifying")}
            </p>
          )}

          {/* Error (session missing or form errors) */}
          {!sessionChecking && error && (
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

          {/* Form – only rendered once session is confirmed */}
          {!sessionChecking && sessionReady && (
            <form
              onSubmit={handleReset}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
              }}
            >
              <div>
                <label htmlFor="password" className="label">
                  {t("reset.newPasswordLabel")}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  placeholder={t("passwordMinPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="label">
                  {t("reset.confirmPasswordLabel")}
                </label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  className="input"
                  placeholder={t("reset.confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
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

              {success && (
                <div
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    background: "rgb(var(--success) / 0.1)",
                    border: "1px solid rgb(var(--success) / 0.3)",
                    borderRadius: "var(--radius)",
                    color: "rgb(var(--success))",
                    fontSize: "14px",
                  }}
                >
                  {t("reset.success")}
                </div>
              )}

              {!success && (
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
                  {loading ? t("reset.updating") : t("reset.updatePassword")}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </StaffAuthShell>
  );
}