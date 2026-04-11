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
  const { canPrompt, isIOS, isInstalled, dismissed, promptInstall, dismiss } =
    useInstallPrompt();

  // Already installed or permanently dismissed — show nothing
  if (isInstalled || dismissed) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-black/10 dark:bg-zinc-900 dark:ring-white/10"
    >
      {/* App icon */}
      <img
        src="/icons/icon-192.png"
        alt=""
        aria-hidden="true"
        className="h-10 w-10 flex-shrink-0 rounded-xl"
      />

      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
          {t("title")}
        </p>

        {/* ── iOS: tap Share → Add to Home Screen ── */}
        {isIOS && (
          <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
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
                className="inline h-3.5 w-3.5 align-text-bottom"
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
            <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              {t("chromiumHint")}
            </p>
            <button
              onClick={promptInstall}
              className="mt-1 self-start rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800"
            >
              {t("chromiumButton")}
            </button>
          </>
        )}

        {/* ── Fallback: no prompt API and not iOS ── */}
        {!isIOS && !canPrompt && (
          <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
            {t("fallbackHint")}
          </p>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="-mt-0.5 flex-shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
