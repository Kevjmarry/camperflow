/**
 * POST /api/staff/vehicles/[id]/sync
 *
 * Triggers an immediate iCal sync for the saved calendar source of a vehicle.
 * Reuses the existing /api/staff/bookings/ical (fetch + parse) and
 * /api/staff/bookings/import (write) endpoints — no duplicate import logic.
 *
 * Also accepts an optional { sync_interval } body field to persist the
 * auto-sync interval setting on the calendar source record.
 *
 * Response:
 *   { created, updated, blocked, errors, syncedAt }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { ImportPreviewRow } from "@/lib/bookings/import/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: vehicleId } = await params;

    // ── auth ────────────────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = (request.headers.get("authorization") ?? "").trim();
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isInternalCronCall =
      cronSecret &&
      cronSecret.length > 0 &&
      authHeader === `Bearer ${cronSecret}`;

    let supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>;
    let companyId: string;

    if (isInternalCronCall) {
      supabase = createServiceClient();

      const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, company_id")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }
      companyId = vehicle.company_id;
    } else {
      supabase = await createClient();

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { data: staffProfile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("company_id, role, can_manage")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError || !staffProfile) {
        return NextResponse.json({ error: "Staff profile not found" }, { status: 403 });
      }

      if (staffProfile.role !== "admin" && !staffProfile.can_manage) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }

      companyId = staffProfile.company_id;
    }

    // ── load vehicle (ownership check) ──────────────────────────────────────
    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, name")
      .eq("id", vehicleId)
      .eq("company_id", companyId)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // ── load calendar source ─────────────────────────────────────────────────
    const { data: calSource, error: calError } = await supabase
      .from("vehicle_calendar_sources")
      .select("ical_url, sync_interval")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    if (calError || !calSource?.ical_url) {
      return NextResponse.json(
        { error: "No iCal URL configured for this vehicle" },
        { status: 400 },
      );
    }

    const icalUrl = calSource.ical_url;

    // Optional: persist a new sync_interval if provided in the body
    let syncInterval: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.sync_interval === "string") {
        syncInterval = body.sync_interval;
      }
    } catch {
      // body is optional
    }

    const origin = new URL(request.url).origin;
    const cookie = request.headers.get("cookie") ?? "";
    const forwardAuth: Record<string, string> = isInternalCronCall
      ? { authorization: `Bearer ${cronSecret as string}` }
      : { cookie };

    const upsertBase = {
      vehicle_id: vehicleId,
      ical_url: icalUrl,
      updated_at: new Date().toISOString(),
      ...(syncInterval !== undefined ? { sync_interval: syncInterval } : {}),
    };

    // ── step 1: fetch + parse iCal via existing endpoint ────────────────────
    const icalRes = await fetch(`${origin}/api/staff/bookings/ical`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardAuth },
      body: JSON.stringify({
        url: icalUrl,
        vehicleReference: vehicle.name,
        vehicleId,
      }),
    });

    if (!icalRes.ok) {
      const errData = await icalRes.json().catch(() => ({}));
      const errMsg = errData?.error ?? `iCal fetch failed (HTTP ${icalRes.status})`;
      await supabase.from("vehicle_calendar_sources").upsert(
        { ...upsertBase, last_synced_at: new Date().toISOString(), last_sync_status: "error", last_sync_error: errMsg },
        { onConflict: "vehicle_id" },
      );
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    const icalData = await icalRes.json();

    // Force every row to be matched to this vehicle (same as the manual iCal flow)
    const rows: ImportPreviewRow[] = (icalData.rows ?? []).map(
      (r: ImportPreviewRow) => ({
        ...r,
        matchedVehicleId: vehicleId,
        matchStatus: "matched" as const,
      }),
    );

    // ── step 2: apply import via existing endpoint ───────────────────────────
    const importRes = await fetch(`${origin}/api/staff/bookings/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardAuth },
      body: JSON.stringify({ rows }),
    });

    const importData = await importRes.json().catch(() => ({}));
    const now = new Date().toISOString();

    if (!importRes.ok) {
      const errMsg = importData?.error ?? `Import failed (HTTP ${importRes.status})`;
      await supabase.from("vehicle_calendar_sources").upsert(
        { ...upsertBase, last_synced_at: now, last_sync_status: "error", last_sync_error: errMsg },
        { onConflict: "vehicle_id" },
      );
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    // ── step 3: persist success status ──────────────────────────────────────
    await supabase.from("vehicle_calendar_sources").upsert(
      { ...upsertBase, last_synced_at: now, last_sync_status: "success", last_sync_error: null },
      { onConflict: "vehicle_id" },
    );

    return NextResponse.json({
      created: importData.created ?? 0,
      updated: importData.updated ?? 0,
      blocked: importData.blocked ?? 0,
      errors: importData.errors ?? [],
      syncedAt: now,
    });
  } catch (err: unknown) {
    console.error("Vehicle sync route error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
