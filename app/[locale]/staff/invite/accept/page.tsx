"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import StaffAuthShell from "@/components/staff/StaffAuthShell";
import { createClient } from "@/lib/supabase/client";

export default function StaffInviteAcceptPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffLogin");
  const supabase = createClient();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const pid = params.get("profile_id");
        setProfileId(pid);

        if (code) {
          // Invite link: discard any existing session before exchanging so the resulting
          // session always belongs to the invitee, never to a previously logged-in user.
          await supabase.auth.signOut();
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setError(exchangeError.message);
            return;
          }
          setSessionReady(true);
        } else {
          // No code in URL — page was reloaded after a successful exchange.
          // The invitee's session is already stored in cookies; use it.
          const { data: existing } = await supabase.auth.getSession();
          if (existing?.session) {
            setSessionReady(true);
          } else {
            setError(t("invite.invalidLink"));
          }
        }
      } catch {
        setError(t("invite.unexpected"));
      } finally {
        setSessionChecking(false);
      }
    };

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetPassword = async (e: FormEvent) => {
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
        return;
      }

      if (profileId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("staff_profiles")
            .update({ auth_user_id: user.id })
            .eq("profile_id", profileId)
            .is("auth_user_id", null);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${locale}/staff/login`);
      }, 2000);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StaffAuthShell>
      <div className="surface staff-auth-card">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("invite.title")}
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              {t("invite.subtitle")}
            </p>
          </div>

          {sessionChecking && (
            <p
              style={{
                textAlign: "center",
                color: "rgb(var(--muted))",
                fontSize: "14px",
              }}
            >
              {t("invite.verifying")}
            </p>
          )}

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

          {!sessionChecking && sessionReady && (
            <form
              onSubmit={handleSetPassword}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
              }}
            >
              <div>
                <label htmlFor="password" className="label">
                  {t("invite.passwordLabel")}
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
                  {t("invite.confirmPasswordLabel")}
                </label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  className="input"
                  placeholder={t("invite.confirmPasswordPlaceholder")}
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
                  {t("invite.success")}
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
                  {loading ? t("invite.settingUp") : t("invite.setPassword")}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </StaffAuthShell>
  );
}
