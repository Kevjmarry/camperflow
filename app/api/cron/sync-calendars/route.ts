/**
 * GET /api/cron/sync-calendars
 *
 * Hourly Vercel cron job. Iterates every vehicle that has an iCal calendar URL
 * configured and triggers a sync for each by calling the existing per-vehicle
 * sync endpoint — no logic is duplicated here.
 *
 * Secured via CRON_SECRET (set in Vercel environment variables). Vercel
 * automatically forwards this as "Authorization: Bearer <secret>" when invoking
 * cron routes.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — enough for many vehicles

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = (request.headers.get("authorization") ?? "").trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all vehicles that have an iCal URL configured
  const { data: sources, error } = await supabase
    .from("vehicle_calendar_sources")
    .select("vehicle_id")
    .not("ical_url", "is", null)
    .neq("ical_url", "");

  if (error) {
    console.error("sync-calendars cron: failed to fetch calendar sources", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!sources || sources.length === 0) {
    return NextResponse.json({ success: true, synced: 0 });
  }

  const results: { vehicleId: string; ok: boolean; error?: string }[] = [];

  for (const source of sources) {
    try {
      const appBase =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.APP_URL ??
        "https://app.camperflow.io";
      const syncUrl = new URL(
        `/api/staff/vehicles/${source.vehicle_id}/sync`,
        appBase,
      );
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`.trim(),
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        results.push({ vehicleId: source.vehicle_id, ok: true });
      } else {
        const responseText = await res.text().catch(() => "");
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(responseText); } catch { /* not JSON */ }
        results.push({
          vehicleId: source.vehicle_id,
          ok: false,
          error: (data?.error as string) ?? `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      results.push({
        vehicleId: source.vehicle_id,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error("sync-calendars cron: some vehicles failed to sync", failed);
  }

  return NextResponse.json({
    success: true,
    synced: results.filter((r) => r.ok).length,
    failed: failed.length,
    results,
  });
}
