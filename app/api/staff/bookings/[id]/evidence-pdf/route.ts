import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = 'checklist-evidence';

const PAGE_W = 595;   // A4 points width
const PAGE_H = 842;   // A4 points height
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLOR_TEXT    = rgb(0.10, 0.10, 0.10);
const COLOR_MUTED   = rgb(0.45, 0.45, 0.45);
const COLOR_DIVIDER = rgb(0.85, 0.85, 0.85);
const COLOR_LABEL_BG = rgb(0.96, 0.96, 0.97);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a Unix-ms timestamp from a storage filename like `1713456789000_abc.jpg`. */
function parsePhotoTimestamp(storagePath: string): string | null {
  try {
    const filename = storagePath.split('/').pop() ?? '';
    const ts = parseInt(filename.split('_')[0], 10);
    if (!Number.isFinite(ts) || ts < 1_000_000_000_000) return null;
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

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

/** Return a new array of paths sorted chronologically by filename timestamp. */
function sortPathsByTimestamp(paths: string[]): string[] {
  return [...paths].sort((a, b) => photoSortKey(a) - photoSortKey(b));
}

/** Format an ISO timestamp for display. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Fetch an image URL and return its ArrayBuffer, or null on failure. */
async function fetchImageBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// ── Cursor / page management ──────────────────────────────────────────────────

interface DrawCtx {
  doc: PDFDocument;
  page: ReturnType<PDFDocument['addPage']>;
  y: number;
  fontRegular: Awaited<ReturnType<PDFDocument['embedFont']>>;
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>;
}

/** Ensure there is at least `needed` points of vertical space left; add a new page if not. */
function ensureSpace(ctx: DrawCtx, needed: number): DrawCtx {
  if (ctx.y - needed >= MARGIN) return ctx;
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  return { ...ctx, page, y: PAGE_H - MARGIN };
}

/** Draw a single line of text and advance the cursor. */
function drawText(
  ctx: DrawCtx,
  text: string,
  opts: {
    size?: number;
    font?: 'regular' | 'bold';
    color?: ReturnType<typeof rgb>;
    indent?: number;
    lineGap?: number;
  } = {},
): DrawCtx {
  const size    = opts.size ?? 10;
  const font    = opts.font === 'bold' ? ctx.fontBold : ctx.fontRegular;
  const color   = opts.color ?? COLOR_TEXT;
  const indent  = opts.indent ?? 0;
  const lineGap = opts.lineGap ?? 4;

  let updated = ensureSpace(ctx, size + lineGap);
  updated.page.drawText(text, {
    x: MARGIN + indent,
    y: updated.y - size,
    size,
    font,
    color,
    maxWidth: CONTENT_W - indent,
  });
  return { ...updated, y: updated.y - size - lineGap };
}

/** Draw a horizontal rule. */
function drawRule(ctx: DrawCtx, gapBefore = 6, gapAfter = 6): DrawCtx {
  let updated = ensureSpace(ctx, 2 + gapBefore + gapAfter);
  updated.y -= gapBefore;
  updated.page.drawLine({
    start: { x: MARGIN, y: updated.y },
    end:   { x: PAGE_W - MARGIN, y: updated.y },
    thickness: 0.5,
    color: COLOR_DIVIDER,
  });
  return { ...updated, y: updated.y - gapAfter };
}

/** Draw a section heading with a coloured label background. */
function drawSectionHeading(ctx: DrawCtx, label: string): DrawCtx {
  let updated = ensureSpace(ctx, 22);
  updated.y -= 4;

  // Background pill
  updated.page.drawRectangle({
    x: MARGIN,
    y: updated.y - 16,
    width: CONTENT_W,
    height: 20,
    color: COLOR_LABEL_BG,
    borderColor: COLOR_DIVIDER,
    borderWidth: 0.5,
  });

  updated.page.drawText(label, {
    x: MARGIN + 8,
    y: updated.y - 12,
    size: 9,
    font: updated.fontBold,
    color: COLOR_TEXT,
  });

  return { ...updated, y: updated.y - 16 - 8 };
}

/** Embed and draw a photo, returning the updated cursor. */
async function drawPhoto(
  ctx: DrawCtx,
  buffer: ArrayBuffer,
  caption: string,
): Promise<DrawCtx> {
  let updated = ctx;

  // Attempt to embed as JPEG, fall back to PNG
  let image;
  try {
    image = await updated.doc.embedJpg(buffer);
  } catch {
    try {
      image = await updated.doc.embedPng(buffer);
    } catch {
      // Unreadable image — skip silently
      return updated;
    }
  }

  const MAX_W = CONTENT_W;
  const MAX_H = 280;

  const scale = Math.min(MAX_W / image.width, MAX_H / image.height, 1);
  const drawW = image.width  * scale;
  const drawH = image.height * scale;

  // Caption text above the image
  updated = ensureSpace(updated, drawH + 30);
  updated = drawText(updated, caption, { size: 8, color: COLOR_MUTED, lineGap: 4 });

  updated = ensureSpace(updated, drawH + 6);
  updated.page.drawImage(image, {
    x: MARGIN,
    y: updated.y - drawH,
    width:  drawW,
    height: drawH,
  });
  return { ...updated, y: updated.y - drawH - 10 };
}

// ── Evidence section renderer ─────────────────────────────────────────────────

interface PhotoPaths {
  general?: string[];
  damage?:  string[];
  id?:      string[];
}

const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  damage:  'Damage',
  id:      'ID Documents',
};

async function drawEvidenceSection(
  ctx: DrawCtx,
  sectionTitle: string,
  photos: PhotoPaths,
  publicBaseUrl: string,
): Promise<DrawCtx> {
  const groups = (['general', 'damage', 'id'] as const).filter(
    (g) => (photos[g] ?? []).length > 0,
  );

  if (groups.length === 0) {
    ctx = drawSectionHeading(ctx, sectionTitle);
    ctx = drawText(ctx, 'No evidence photos recorded.', { color: COLOR_MUTED, size: 9, lineGap: 8 });
    return ctx;
  }

  ctx = drawSectionHeading(ctx, sectionTitle);

  for (const group of groups) {
    const paths = sortPathsByTimestamp(photos[group] ?? []);

    ctx = drawText(ctx, GROUP_LABELS[group] ?? group, {
      font: 'bold', size: 9, lineGap: 3,
    });

    for (let i = 0; i < paths.length; i++) {
      const storagePath = paths[i];
      const photoUrl = `${publicBaseUrl}/${storagePath}`;
      const ts = parsePhotoTimestamp(storagePath);
      const caption = `Photo ${i + 1} of ${paths.length}${ts ? ` · ${ts}` : ''}`;

      const buffer = await fetchImageBuffer(photoUrl);
      if (buffer) {
        ctx = await drawPhoto(ctx, buffer, caption);
      } else {
        ctx = drawText(ctx, `${caption} — could not load image`, {
          size: 8, color: COLOR_MUTED, lineGap: 4,
        });
      }
    }

    ctx = { ...ctx, y: ctx.y - 8 };
  }

  return ctx;
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
      .select(`
        id,
        booking_number,
        customer_name,
        pickup_at,
        return_at,
        staff_metadata,
        vehicle_id,
        vehicles ( name, registration_plate )
      `)
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

    // ── Build PDF ───────────────────────────────────────────────────────────

    const doc = await PDFDocument.create();
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);

    let ctx: DrawCtx = {
      doc,
      page: doc.addPage([PAGE_W, PAGE_H]),
      y: PAGE_H - MARGIN,
      fontRegular,
      fontBold,
    };

    // ── Cover / booking details ─────────────────────────────────────────────

    // Title
    ctx = drawText(ctx, 'Evidence Report', { size: 22, font: 'bold', lineGap: 6 });
    ctx = drawText(ctx, `Booking ${booking.booking_number}`, {
      size: 13, font: 'bold', color: COLOR_MUTED, lineGap: 14,
    });

    ctx = drawRule(ctx, 0, 10);

    // Booking meta grid
    const vehicle = booking.vehicles as unknown as { name: string; registration_plate: string } | null;
    const vehicleLabel = vehicle
      ? `${vehicle.name} (${vehicle.registration_plate})`
      : 'Unassigned';

    const fields: [string, string][] = [
      ['Customer',  booking.customer_name || '—'],
      ['Vehicle',   vehicleLabel],
      ['Pickup',    formatDate(booking.pickup_at)],
      ['Return',    formatDate(booking.return_at)],
    ];

    for (const [label, value] of fields) {
      // Label + value on same line: draw label, then value offset
      const labelW = fontBold.widthOfTextAtSize(`${label}: `, 10);
      ctx = ensureSpace(ctx, 14);
      ctx.page.drawText(`${label}: `, {
        x: MARGIN,
        y: ctx.y - 10,
        size: 10,
        font: fontBold,
        color: COLOR_TEXT,
      });
      ctx.page.drawText(value, {
        x: MARGIN + labelW,
        y: ctx.y - 10,
        size: 10,
        font: fontRegular,
        color: COLOR_TEXT,
        maxWidth: CONTENT_W - labelW,
      });
      ctx = { ...ctx, y: ctx.y - 14 };
    }

    ctx = drawRule(ctx, 14, 14);

    // ── Handover evidence ───────────────────────────────────────────────────
    ctx = await drawEvidenceSection(ctx, 'Handover Evidence', handoverPhotos, publicBaseUrl);

    ctx = { ...ctx, y: ctx.y - 10 };

    // ── Return evidence ─────────────────────────────────────────────────────
    ctx = await drawEvidenceSection(ctx, 'Return Evidence', returnPhotos, publicBaseUrl);

    // ── Footer on every page ────────────────────────────────────────────────
    const pages = doc.getPages();
    const totalPages = pages.length;
    const generated = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    for (let i = 0; i < totalPages; i++) {
      const pg = pages[i];
      const footerY = MARGIN - 16;
      pg.drawText(`Generated ${generated}`, {
        x: MARGIN,
        y: footerY,
        size: 7,
        font: fontRegular,
        color: COLOR_MUTED,
      });
      pg.drawText(`Page ${i + 1} of ${totalPages}`, {
        x: PAGE_W - MARGIN - 60,
        y: footerY,
        size: 7,
        font: fontRegular,
        color: COLOR_MUTED,
      });
    }

    // ── Serialise + stream ──────────────────────────────────────────────────
    const pdfBytes = await doc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="booking-evidence-${bookingId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[evidence-pdf]', err);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
