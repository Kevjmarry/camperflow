"use client";

import { useRouter, useParams } from "next/navigation";
import { FormEvent, useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type Locale = "en" | "de";

export default function AppEntryPage() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const [bookingCode, setBookingCode] = useState("");
  const t = useTranslations("entry");

  const supabase = createClient();

  const locale = useMemo<Locale>(() => {
    const raw = params?.locale;
    return raw === "de" ? "de" : "en";
  }, [params]);

  useEffect(() => {
    const handleInviteSession = async () => {
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        await supabase.auth.getSession();
        window.history.replaceState(null, "", `/${locale}`);
        router.replace(`/${locale}/staff/login`);
      }
    };

    handleInviteSession();
  }, [locale, router, supabase]);

  const handleGuestSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = bookingCode.trim();
    if (code) {
      router.replace(`/${locale}/guest?code=${encodeURIComponent(code)}`);
    }
  };

  const handleStaffLogin = () => {
    router.push(`/${locale}/staff/login`);
  };

  const handleLocaleChange = (newLocale: Locale) => {
    router.push(`/${newLocale}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header style={{ borderBottom: "1px solid rgb(var(--border))" }}>
        <div className="container">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: "64px",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: "18px",
                color: "rgb(var(--text))",
              }}
            >
              {t("appName")}
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <button
                onClick={() => handleLocaleChange("en")}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "14px",
                  fontWeight: locale === "en" ? 600 : 400,
                  color: locale === "en" ? "rgb(var(--primary))" : "rgb(var(--muted))",
                  border: "none",
                  borderRadius: "var(--radius)",
                  background: locale === "en" ? "rgb(var(--primary) / 0.1)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                EN
              </button>

              <button
                onClick={() => handleLocaleChange("de")}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "14px",
                  fontWeight: locale === "de" ? 600 : 400,
                  color: locale === "de" ? "rgb(var(--primary))" : "rgb(var(--muted))",
                  border: "none",
                  borderRadius: "var(--radius)",
                  background: locale === "de" ? "rgb(var(--primary) / 0.1)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                DE
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-6) 0",
        }}
      >
        <div style={{ width: "100%", maxWidth: "480px", padding: "0 var(--space-4)" }}>
          <div className="surface" style={{ padding: "var(--space-8)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)", width: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <h2 style={{ fontSize: "24px", marginBottom: "var(--space-2)", color: "rgb(var(--text))" }}>
                    {t("guest.title")}
                  </h2>
                  <p style={{ fontSize: "15px", color: "rgb(var(--muted))" }}>{t("guest.description")}</p>
                </div>

                <form
                  onSubmit={handleGuestSubmit}
                  style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}
                >
                  <div style={{ width: "100%" }}>
                    <label htmlFor="bookingCode" className="label" style={{ textAlign: "center" }}>
                      {t("guest.bookingCodeLabel")}
                    </label>
                    <input
                      id="bookingCode"
                      type="text"
                      className="input"
                      placeholder={t("guest.bookingCodePlaceholder")}
                      value={bookingCode}
                      onChange={(e) => setBookingCode(e.target.value)}
                      autoComplete="off"
                      autoFocus
                      style={{ width: "100%" }}
                    />
                    <p className="helper-text" style={{ textAlign: "center" }}>
                      {t("guest.bookingCodeHelp")}
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
                  >
                    {t("guest.continue")}
                  </button>
                </form>
              </div>

              <div className="divider">
                <span>{t("divider.or")}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <h3 style={{ fontSize: "18px", marginBottom: "var(--space-2)", color: "rgb(var(--text))" }}>
                    {t("staff.title")}
                  </h3>
                  <p style={{ fontSize: "15px", color: "rgb(var(--muted))" }}>{t("staff.description")}</p>
                </div>

                <button
                  onClick={handleStaffLogin}
                  className="btn btn-secondary"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
                >
                  {t("staff.login")}
                </button>
              </div>
            </div>
          </div>

          <p style={{ textAlign: "center", marginTop: "var(--space-6)", fontSize: "13px", color: "rgb(var(--muted))" }}>
            {t("footer.legal")}
          </p>
        </div>
      </main>
    </div>
  );
}
