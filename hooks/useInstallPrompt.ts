"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "camperflow:install-dismissed";

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already dismissed by the user
    try {
      if (localStorage.getItem(DISMISSED_KEY)) {
        setDismissed(true);
        return;
      }
    } catch {}

    // Already running as an installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // iOS / iPadOS detection (no beforeinstallprompt support)
    const ua = window.navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) {
      setIsIOS(true);
    }

    // Chromium: capture the install prompt before it fires
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Hide the banner once the app is installed
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return {
    /** true when the Chromium native prompt is ready to fire */
    canPrompt: !!deferredPrompt,
    /** true on iOS/iPadOS where we show manual instructions instead */
    isIOS,
    /** true once installed or already running standalone */
    isInstalled,
    /** true after the user dismisses the banner (persisted) */
    dismissed,
    promptInstall,
    dismiss,
  };
}
