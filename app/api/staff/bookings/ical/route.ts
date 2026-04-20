/**
 * POST /api/staff/bookings/ical
 *
 * iCal ingestion foundation.
 *
 * Accepts an iCal feed URL, fetches it server-side, parses all VEVENTs, and
 * normalises them into ImportPreviewRow[] — the same shape the existing
 * /api/staff/bookings/import route consumes for writing to the database.
 *
 * This route is intentionally read-only / preview-only. Actual DB writes go
 * through the existing import route once the staff has reviewed and vehicle-
 * matched the preview rows.
 *
 * Request body:
 *   {
 *     url:              string   — the iCal feed URL (http / https only)
 *     vehicleReference: string   — human name used for vehicle matching later
 *     vehicleId?:       string   — if already known, pre-fills matchedVehicleId
 *   }
 *
 * Response:
 *   {
 *     rows:       ImportPreviewRow[]
 *     eventCount: number   — total VEVENTs found (including skipped ones)
 *     sourceUrl:  string
 *   }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { parseICalEvents } from "@/lib/bookings/import/parseICalEvents";
import { normalizeICalEvent } from "@/lib/bookings/import/normalizeICalEvent";
import type { ImportPreviewRow } from "@/lib/bookings/import/types";

// ── constants ─────────────────────────────────────────────────────────────────

/** Maximum size of a fetched iCal feed (2 MB). Prevents memory abuse. */
const MAX_FEED_BYTES = 2 * 1024 * 1024;

/** Fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 15_000;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Validate that the URL is http/https and structurally valid. */
function validateFeedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

/** Fetch an iCal feed with a timeout and a size cap. */
async function fetchICalFeed(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        // Identify ourselves to iCal-serving platforms
        "User-Agent": "CamperFlow-iCal-Sync/1.0",
        Accept: "text/calendar, */*",
      },
      // Next.js: never cache iCal fetches — always fresh
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Feed responded with HTTP ${response.status}`);
    }

    // Stream with a size cap to avoid pulling huge files into memory
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_FEED_BYTES) {
        reader.cancel();
        throw new Error(
          `Feed exceeds the ${MAX_FEED_BYTES / 1024 / 1024} MB limit`
        );
      }
      chunks.push(value);
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8").decode(merged);
  } finally {
    clearTimeout(timer);
  }
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── auth ──────────────────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization") ?? "";
    const isInternalCronCall =
      cronSecret && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;

    if (!isInternalCronCall) {
      const supabase = await createClient();
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
    }

    // ── request body ──────────────────────────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const rawUrl: unknown = body.url;
    const vehicleReference: string =
      typeof body.vehicleReference === "string" ? body.vehicleReference.trim() : "";
    const vehicleId: string | null =
      typeof body.vehicleId === "string" && body.vehicleId.trim()
        ? body.vehicleId.trim()
        : null;

    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const feedUrl = validateFeedUrl(rawUrl.trim());
    if (!feedUrl) {
      return NextResponse.json(
        { error: "url must be a valid http or https URL" },
        { status: 400 }
      );
    }

    // ── fetch feed ────────────────────────────────────────────────────────────
    let icsText: string;
    try {
      icsText = await fetchICalFeed(feedUrl);
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error ? fetchErr.message : "Failed to fetch feed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // ── parse ─────────────────────────────────────────────────────────────────
    const rawEvents = parseICalEvents(icsText);
    const eventCount = rawEvents.length;

    // ── normalise → ImportPreviewRow[] ────────────────────────────────────────
    // Pass vehicleReference directly (may be "" in multi_vehicle mode).
    // normalizeICalEvent will derive a per-event reference from LOCATION when
    // vehicleReference is empty — which is how Bookingmood multi-calendar feeds
    // carry the unit/product name. The old hostname fallback is intentionally
    // removed; a bare hostname is not a useful vehicle reference.

    const rows: ImportPreviewRow[] = rawEvents.map((event, index) => {
      const rowNumber = index + 1;

      try {
        const normalized = normalizeICalEvent(event, vehicleReference);

        // Skip CANCELLED events — they represent removed bookings and should
        // not be created or updated unless the caller explicitly handles them.
        if (normalized.externalStatus === "CANCELLED") {
          return {
            rowNumber,
            rawPayload: normalized.rawMetadata,
            normalized,
            matchStatus: "unmatched",
            matchedVehicleId: null,
            matchedBookingId: null,
            actionType: "skip",
            actionReason: "External status is CANCELLED",
          };
        }

        // Blocked periods require at least a date range and an ID
        if (normalized.bookingType === "blocked_period") {
          if (!normalized.sourceBookingId || !normalized.pickupAt || !normalized.returnAt) {
            return {
              rowNumber,
              rawPayload: normalized.rawMetadata,
              normalized,
              matchStatus: "unmatched",
              matchedVehicleId: null,
              matchedBookingId: null,
              actionType: "error",
              errorMessage: "Blocked period is missing UID or date range.",
            };
          }
          return {
            rowNumber,
            rawPayload: normalized.rawMetadata,
            normalized,
            matchStatus: vehicleId ? "matched" : "unmatched",
            matchedVehicleId: vehicleId,
            matchedBookingId: null,
            actionType: "block",
          };
        }

        // Regular booking — require UID and date range; customer name is
        // optional at preview stage (iCal feeds rarely include PII).
        if (!normalized.sourceBookingId || !normalized.pickupAt || !normalized.returnAt) {
          return {
            rowNumber,
            rawPayload: normalized.rawMetadata,
            normalized,
            matchStatus: "unmatched",
            matchedVehicleId: null,
            matchedBookingId: null,
            actionType: "error",
            errorMessage: "Event is missing UID or date range.",
          };
        }

        return {
          rowNumber,
          rawPayload: normalized.rawMetadata,
          normalized,
          matchStatus: vehicleId ? "matched" : "unmatched",
          matchedVehicleId: vehicleId,
          matchedBookingId: null,
          actionType: "create",
        };
      } catch (err) {
        return {
          rowNumber,
          rawPayload: {},
          normalized: null,
          matchStatus: "unmatched",
          matchedVehicleId: null,
          matchedBookingId: null,
          actionType: "error",
          errorMessage:
            err instanceof Error ? err.message : "Failed to normalise event",
        };
      }
    });

    return NextResponse.json({ rows, eventCount, sourceUrl: feedUrl.toString() });
  } catch (err: unknown) {
    console.error("iCal ingestion route error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
