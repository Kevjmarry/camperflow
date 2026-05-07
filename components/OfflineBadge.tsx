"use client";

import { useEffect, useState } from "react";

async function checkOffline(): Promise<boolean> {
  console.log('[OfflineBadge] checkOffline | navigator.onLine:', navigator.onLine);
  if (!navigator.onLine) {
    console.log('[OfflineBadge] short-circuit: onLine=false → offline=true');
    return true;
  }
  try {
    await fetch(`/manifest.json?t=${Date.now()}`, { cache: "no-store" });
    console.log('[OfflineBadge] manifest fetch OK → offline=false');
    return false;
  } catch (err) {
    console.warn('[OfflineBadge] manifest fetch FAILED → offline=true', err);
    return true;
  }
}

export function OfflineBadge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    console.log('[OfflineBadge] mounted | navigator.onLine:', navigator.onLine);
    const update = () => checkOffline().then((result) => {
      console.log('[OfflineBadge] setOffline →', result);
      setOffline(result);
    });
    update();
    window.addEventListener("offline", update);
    window.addEventListener("online", update);
    return () => {
      window.removeEventListener("offline", update);
      window.removeEventListener("online", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Offline"
      style={{
        position: "fixed",
        top: 13,
        right: 216,
        zIndex: 9999,
        backgroundColor: "#ef4444",
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        padding: "3px 9px",
        borderRadius: 9999,
        pointerEvents: "none",
        userSelect: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }}
    >
      Offline
    </div>
  );
}
