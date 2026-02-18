"use client";

import { useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
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

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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

  return (
    <PageContainer maxWidth="480px" showSignOut={false}>
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {/* Back link */}
          <div>
            <Link
              href={`/${locale}/staff/login`}
              style={{
                fontSize: "14px",
                color: "rgb(var(--brand))",
                textDecoration: "none",
              }}
            >
              ← Back to sign in
            </Link>
          </div>

          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              Set new password
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              Enter and confirm your new password below.
            </p>
          </div>

          {/* Form */}
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
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="label">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                className="input"
                placeholder="Repeat your new password"
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
                Password updated! Redirecting you to sign in…
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
                {loading ? "Updating…" : "Update password"}
              </button>
            )}
          </form>
        </div>
      </div>
    </PageContainer>
  );
}