"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
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
  console.log("INSTALL_BANNER_RENDERED");
  const t = useTranslations("installBanner");
  const pathname = usePathname();
  const { ready, canPrompt, isIOS, isInstalled, dismissed, promptInstall, dismiss } =
    useInstallPrompt();

  // DEBUG: show state instead of hiding so we can see which condition fires
  if (!ready || isInstalled || dismissed) {
    return (
      <>
        <div style={{position:'fixed',top:10,left:10,zIndex:99999,background:'red',color:'white',padding:'6px'}}>INSTALL_BANNER_MOUNTED</div>
        <div className="fixed top-12 left-4 z-[9999] bg-red-600 text-white text-xs p-2 rounded">
          <div>path={pathname}</div>
          <div>ready={String(ready)}</div>
          <div>isInstalled={String(isInstalled)}</div>
          <div>dismissed={String(dismissed)}</div>
          <div>canPrompt={String(canPrompt)}</div>
          <div>isIOS={String(isIOS)}</div>
        </div>
      </>
    );
  }

  return (
    <div
      role="banner"
      data-testid="install-banner"
      className="fixed inset-x-4 bottom-20 z-[9999] rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-3">
        {/* App icon */}
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 flex-none rounded-lg"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("title")}
          </p>

          {/* ── iOS: tap Share → Add to Home Screen ── */}
          {isIOS && (
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
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
              <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                {t("chromiumHint")}
              </p>
              <button
                onClick={promptInstall}
                className="mt-2 inline-flex rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
              >
                {t("chromiumButton")}
              </button>
            </>
          )}

          {/* ── Fallback: no prompt API and not iOS ── */}
          {!isIOS && !canPrompt && (
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              {t("fallbackHint")}
            </p>
          )}
        </div>

        {/* DEBUG — remove before ship */}
        <pre className="mt-2 rounded bg-zinc-100 p-1 text-[10px] leading-4 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {`path=${pathname}\nready=${ready} installed=${isInstalled} dismissed=${dismissed}\ncanPrompt=${canPrompt} isIOS=${isIOS}`}
        </pre>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="flex-none rounded p-1 text-zinc-400"
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
    </div>
  );
}
