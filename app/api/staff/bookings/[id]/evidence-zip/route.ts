import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = 'checklist-evidence';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the raw ms timestamp from a filename, or Infinity so un-timestamped
 *  photos sort to the end rather than the front. */
function photoSortKey(storagePath: string): number {
  try {
    const filename = storagePath.split('/').pop() ?? '';
    const ts = parseInt(filename.split('_')[0], 10);
    return Number.isFinite(ts) && ts >= 1_000_000_000_000 ? ts : Infinity;
  } catch {
    return Infinity;
  }
}

/** Return a new array of entries sorted chronologically by filename timestamp. */
function sortEntriesByTimestamp(entries: PhotoEntry[]): PhotoEntry[] {
  return [...entries].sort((a, b) => photoSortKey(entryPath(a)) - photoSortKey(entryPath(b)));
}

/** Fetch an image URL and return its Uint8Array, or null on failure. */
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PhotoEntry = string | { path: string; rotation?: number };

function entryPath(e: PhotoEntry): string {
  return typeof e === 'string' ? e : e.path;
}

interface PhotoPaths {
  general?: PhotoEntry[];
  damage?:  PhotoEntry[];
  id?:      PhotoEntry[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: bookingId } = await params;
    const supabase = await createClient();

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Staff profile + company scope
    const { data: profile, error: profileError } = await supabase
      .from('staff_profiles')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch booking (company-scoped)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, staff_metadata')
      .eq('id', bookingId)
      .eq('company_id', profile.company_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const staffMeta = (booking.staff_metadata ?? {}) as Record<string, unknown>;
    const handoverPhotos = (staffMeta.handover_evidence_photos ?? {}) as PhotoPaths;
    const returnPhotos   = (staffMeta.return_evidence_photos   ?? {}) as PhotoPaths;

    // Supabase Storage public base URL for the evidence bucket
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const publicBaseUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}`;

    // ── Build ZIP ───────────────────────────────────────────────────────────

    const zipRoot = `booking-evidence-${bookingId}`;

    // Collect all fetch tasks: { zipPath, url }
    const tasks: { zipPath: string; url: string; filename: string }[] = [];

    const sections: Array<{ prefix: string; photos: PhotoPaths }> = [
      { prefix: 'handover', photos: handoverPhotos },
      { prefix: 'return',   photos: returnPhotos   },
    ];

    const groups = ['general', 'damage', 'id'] as const;

    for (const { prefix, photos } of sections) {
      for (const group of groups) {
        const entries = sortEntriesByTimestamp(photos[group] ?? []);
        for (const entry of entries) {
          const storagePath = entryPath(entry);
          const filename    = storagePath.split('/').pop() ?? storagePath;
          const zipPath     = `${zipRoot}/${prefix}/${group}/${filename}`;
          const url         = `${publicBaseUrl}/${storagePath}`;
          tasks.push({ zipPath, url, filename });
        }
      }
    }

    // Fetch all images in parallel, skip failures
    const results = await Promise.all(
      tasks.map(async (task) => {
        const bytes = await fetchImageBytes(task.url);
        return { zipPath: task.zipPath, bytes };
      }),
    );

    // Assemble ZIP file map
    const fileMap: Record<string, Uint8Array> = {};

    for (const { zipPath, bytes } of results) {
      if (bytes) {
        fileMap[zipPath] = bytes;
      }
    }

    // If no photos at all, include a placeholder so the ZIP isn't empty
    if (Object.keys(fileMap).length === 0) {
      fileMap[`${zipRoot}/no-photos.txt`] = strToU8('No evidence photos found for this booking.');
    }

    const zipBytes = Buffer.from(zipSync(fileMap, { level: 0 })); // level 0 = store (images already compressed)

    return new NextResponse(zipBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="booking-evidence-${bookingId}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[evidence-zip]', err);
    return NextResponse.json({ error: 'Failed to generate ZIP' }, { status: 500 });
  }
}
