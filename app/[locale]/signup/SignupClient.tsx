"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import StaffAuthShell from "@/components/staff/StaffAuthShell";

export default function SignupClient() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("signup");

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("error.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: name.trim(),
          company_name: companyName.trim(),
          email: email.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "email_taken") {
          setError(t("error.emailTaken"));
        } else {
          setError(data.error || t("error.unexpected"));
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError(t("error.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  const backLink = (
    <Link
      href={`/${locale}`}
      style={{ fontSize: "14px", color: "rgb(var(--brand))", textDecoration: "none" }}
    >
      ← {t("backToHome")}
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
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("title")}
            </h1>
            <p
              style={{
                marginTop: "var(--space-2)",
                fontSize: "16px",
                color: "rgb(var(--muted))",
              }}
            >
              {t("subtitle")}
            </p>
          </div>

          {success ? (
            <div
              style={{
                padding: "var(--space-4)",
                background: "rgb(var(--success) / 0.1)",
                border: "1px solid rgb(var(--success) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--success))",
                fontSize: "15px",
                textAlign: "center",
              }}
            >
              {t("success")}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
            >
              <div>
                <label htmlFor="name" className="label">
                  {t("nameLabel")}
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className="input"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label htmlFor="companyName" className="label">
                  {t("companyNameLabel")}
                </label>
                <input
                  id="companyName"
                  name="companyName"
                  type="text"
                  className="input"
                  placeholder={t("companyNamePlaceholder")}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  autoComplete="organization"
                  style={{ width: "100%" }}
                />
              </div>

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
                {loading ? t("submitting") : t("submit")}
              </button>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: "14px", color: "rgb(var(--muted))" }}>
            {t("alreadyHaveAccount")}{" "}
            <Link
              href={`/${locale}/staff/login`}
              style={{ color: "rgb(var(--brand))", textDecoration: "underline" }}
            >
              {t("signIn")}
            </Link>
          </p>
        </div>
      </div>
    </StaffAuthShell>
  );
}
