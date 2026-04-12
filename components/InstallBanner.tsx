"use client";

import { useTranslations } from "next-intl";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * Minimal PWA install banner — three display modes:
 *
 * 1. Chromium (beforeinstallprompt available): native prompt button.
 * 2. iOS / iPadOS Safari: "Tap Share → Add to Home Screen" hint.
 * 3. All other browsers (Firefox, desktop Safari, etc.): generic
 *    "open browser menu → Install / Add to Home Screen" hint so
 *    users always see actionable guidance instead of nothing.
 *
 * Hidden once installed or after the user dismisses it (persisted).
 */
export function InstallBanner() {
  const t = useTranslations("installBanner");
  const { ready, canPrompt, isIOS, isInstalled, dismissed, promptInstall, dismiss } =
    useInstallPrompt();

  if (!ready || isInstalled || dismissed) return null;

  return (
    <div
      role="banner"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 32px)",
        maxWidth: 560,
        bottom: 16,
        zIndex: 9999,
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, display: "block" }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: "#111118" }}>
            {t("title")}
          </p>

          {/* ── iOS: tap Share → Add to Home Screen ── */}
          {isIOS && (
            <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.5, color: "#52525b" }}>
              {t("iosBefore")}{" "}
              <span aria-label="Share">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: "inline", width: 14, height: 14, verticalAlign: "text-bottom" }}
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{" "}
              {t("iosAfter")} <strong>{t("iosAction")}</strong>
            </p>
          )}

          {/* ── Chromium: native prompt available ── */}
          {!isIOS && canPrompt && (
            <>
              <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.5, color: "#52525b" }}>
                {t("chromiumHint")}
              </p>
              <button
                onClick={promptInstall}
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("chromiumButton")}
              </button>
            </>
          )}

          {/* ── Fallback: no prompt API and not iOS ── */}
          {!isIOS && !canPrompt && (
            <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.5, color: "#52525b" }}>
              {t("fallbackHint")}
            </p>
          )}
        </div>

        <button
          onClick={dismiss}
          aria-label={t("dismiss")}
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            borderRadius: 6,
            padding: 4,
            cursor: "pointer",
            color: "#a1a1aa",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 16, height: 16 }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
