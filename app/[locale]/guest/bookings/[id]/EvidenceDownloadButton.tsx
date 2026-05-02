"use client";

import { zipSync } from "fflate";
import { useState } from "react";

interface Props {
  urls: string[];
  label: string;
}

export function EvidenceDownloadButton({ urls, label }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const entries = await Promise.all(
        urls.map(async (url, i) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to fetch photo ${i + 1}`);
          const buf = await res.arrayBuffer();
          const rawName = url.split("?")[0].split("/").pop() ?? `photo_${i + 1}`;
          const safeName = `${String(i + 1).padStart(3, "0")}_${rawName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          return [safeName, new Uint8Array(buf)] as [string, Uint8Array];
        })
      );

      const files: Record<string, Uint8Array> = {};
      for (const [name, data] of entries) {
        files[name] = data;
      }

      // level 0 = store only; images are already compressed so recompressing wastes time
      const zip = zipSync(files, { level: 0 });
      const blob = new Blob([new Uint8Array(zip)], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "evidence_photos.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("ZIP download failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--radius)",
        border: "1px solid rgb(var(--border))",
        background: "rgb(var(--surface))",
        color: "rgb(var(--text-secondary))",
        fontSize: "13px",
        fontWeight: "500",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.65 : 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="7 10 12 15 17 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {busy ? "Zipping…" : label}
    </button>
  );
}
