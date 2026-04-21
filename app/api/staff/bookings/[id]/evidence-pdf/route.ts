import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

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
const COLOR_ACCENT  = rgb(0.13, 0.13, 0.47);

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

type PhotoEntry = string | { path: string; rotation?: number };

function entryPath(e: PhotoEntry): string {
  return typeof e === 'string' ? e : e.path;
}
function entryRotation(e: PhotoEntry): number {
  return typeof e === 'string' ? 0 : (e.rotation ?? 0);
}

/** Return a new array of entries sorted chronologically by filename timestamp. */
function sortEntriesByTimestamp(entries: PhotoEntry[]): PhotoEntry[] {
  return [...entries].sort((a, b) => photoSortKey(entryPath(a)) - photoSortKey(entryPath(b)));
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

// ── Company info ──────────────────────────────────────────────────────────────

interface CompanyInfo {
  name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  registrationId: string | null;
  logoBuffer: ArrayBuffer | null;
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
  let updated = ensureSpace(ctx, 26);
  updated.y -= 6;

  updated.page.drawRectangle({
    x: MARGIN,
    y: updated.y - 18,
    width: CONTENT_W,
    height: 22,
    color: COLOR_LABEL_BG,
    borderColor: COLOR_DIVIDER,
    borderWidth: 0.5,
  });

  updated.page.drawText(label, {
    x: MARGIN + 8,
    y: updated.y - 13,
    size: 10,
    font: updated.fontBold,
    color: COLOR_ACCENT,
  });

  return { ...updated, y: updated.y - 18 - 10 };
}

/** Draw a key/value row — label bold, value regular, on the same line. */
function drawKeyValue(ctx: DrawCtx, label: string, value: string): DrawCtx {
  const labelW = ctx.fontBold.widthOfTextAtSize(`${label}: `, 10);
  let updated  = ensureSpace(ctx, 16);
  updated.page.drawText(`${label}: `, {
    x: MARGIN, y: updated.y - 10,
    size: 10, font: updated.fontBold, color: COLOR_TEXT,
  });
  updated.page.drawText(value, {
    x: MARGIN + labelW, y: updated.y - 10,
    size: 10, font: updated.fontRegular, color: COLOR_TEXT,
    maxWidth: CONTENT_W - labelW,
  });
  return { ...updated, y: updated.y - 16 };
}

/** Embed and draw a photo (with optional CW rotation), returning the updated cursor. */
async function drawPhoto(
  ctx: DrawCtx,
  buffer: ArrayBuffer,
  caption: string,
  rotation: number = 0,
): Promise<DrawCtx> {
  let updated = ctx;

  let image;
  try {
    image = await updated.doc.embedJpg(buffer);
  } catch {
    try {
      image = await updated.doc.embedPng(buffer);
    } catch {
      return updated;
    }
  }

  const MAX_W = CONTENT_W;
  const MAX_H = 280;
  const isTransposed = rotation === 90 || rotation === 270;

  const scale = isTransposed
    ? Math.min(MAX_W / image.height, MAX_H / image.width, 1)
    : Math.min(MAX_W / image.width,  MAX_H / image.height, 1);

  const drawW = image.width  * scale;
  const drawH = image.height * scale;
  const visualH = isTransposed ? drawW : drawH;

  updated = ensureSpace(updated, visualH + 30);
  updated = drawText(updated, caption, { size: 8, color: COLOR_MUTED, lineGap: 4 });
  updated = ensureSpace(updated, visualH + 6);

  let imgX: number;
  let imgY: number;
  let pdfDeg: number;

  switch (rotation) {
    case 90:
      imgX   = MARGIN;
      imgY   = updated.y;
      pdfDeg = 270;
      break;
    case 180:
      imgX   = MARGIN + drawW;
      imgY   = updated.y;
      pdfDeg = 180;
      break;
    case 270:
      imgX   = MARGIN + drawH;
      imgY   = updated.y - drawW;
      pdfDeg = 90;
      break;
    default:
      imgX   = MARGIN;
      imgY   = updated.y - drawH;
      pdfDeg = 0;
  }

  updated.page.drawImage(image, {
    x: imgX,
    y: imgY,
    width:  drawW,
    height: drawH,
    rotate: degrees(pdfDeg),
  });
  return { ...updated, y: updated.y - visualH - 10 };
}

// ── Company header ────────────────────────────────────────────────────────────

async function drawCompanyHeader(ctx: DrawCtx, info: CompanyInfo): Promise<DrawCtx> {
  const LOGO_SIZE = 48;
  let logoDrawn = false;

  // Embed + draw logo if available
  if (info.logoBuffer) {
    try {
      let logoImage;
      try {
        logoImage = await ctx.doc.embedPng(info.logoBuffer);
      } catch {
        logoImage = await ctx.doc.embedJpg(info.logoBuffer);
      }
      const scale = Math.min(LOGO_SIZE / logoImage.width, LOGO_SIZE / logoImage.height, 1);
      const lw = logoImage.width  * scale;
      const lh = logoImage.height * scale;
      ctx.page.drawImage(logoImage, {
        x: MARGIN,
        y: ctx.y - lh,
        width: lw,
        height: lh,
      });
      logoDrawn = true;
    } catch {
      // Logo embed failed — continue without it
    }
  }

  const TEXT_X    = logoDrawn ? MARGIN + LOGO_SIZE + 12 : MARGIN;
  const maxTextW  = CONTENT_W - (logoDrawn ? LOGO_SIZE + 12 : 0);
  let   lineY     = ctx.y - 14;

  // Company name
  if (info.name) {
    ctx.page.drawText(info.name, {
      x: TEXT_X, y: lineY,
      size: 14, font: ctx.fontBold, color: COLOR_ACCENT,
    });
    lineY -= 16;
  }

  // Address / registration as secondary identity line
  if (info.address) {
    ctx.page.drawText(info.address, {
      x: TEXT_X, y: lineY,
      size: 9, font: ctx.fontRegular, color: COLOR_MUTED,
      maxWidth: maxTextW,
    });
    lineY -= 13;
  } else if (info.registrationId) {
    ctx.page.drawText(`Reg: ${info.registrationId}`, {
      x: TEXT_X, y: lineY,
      size: 9, font: ctx.fontRegular, color: COLOR_MUTED,
    });
    lineY -= 13;
  }

  // Contact line — only include non-null values
  const contactParts = [info.phone, info.email].filter(Boolean);
  if (contactParts.length > 0) {
    ctx.page.drawText(contactParts.join('  ·  '), {
      x: TEXT_X, y: lineY,
      size: 8, font: ctx.fontRegular, color: COLOR_MUTED,
      maxWidth: maxTextW,
    });
    lineY -= 11;
  }

  const headerH = Math.max(LOGO_SIZE, ctx.y - lineY);
  ctx = { ...ctx, y: ctx.y - headerH };
  ctx = drawRule(ctx, 8, 10);
  return ctx;
}

// ── Evidence section renderer ─────────────────────────────────────────────────

interface PhotoPaths {
  general?: PhotoEntry[];
  damage?:  PhotoEntry[];
  id?:      PhotoEntry[];
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
  evidenceType: string,
): Promise<DrawCtx> {
  const groups = (['general', 'damage'] as const).filter(
    (g) => (photos[g] ?? []).length > 0,
  );

  if (groups.length === 0) {
    ctx = drawSectionHeading(ctx, sectionTitle);
    ctx = drawText(ctx, 'No evidence photos recorded.', { color: COLOR_MUTED, size: 9, lineGap: 8 });
    return ctx;
  }

  ctx = drawSectionHeading(ctx, sectionTitle);

  for (const group of groups) {
    const entries = sortEntriesByTimestamp(photos[group] ?? []);

    ctx = drawText(ctx, GROUP_LABELS[group] ?? group, {
      font: 'bold', size: 9, lineGap: 3,
    });

    for (let i = 0; i < entries.length; i++) {
      const entry       = entries[i];
      const storagePath = entryPath(entry);
      const rotation    = entryRotation(entry);
      const photoUrl    = `${publicBaseUrl}/${storagePath}`;
      const ts          = parsePhotoTimestamp(storagePath);
      const caption     = [
        `Photo ${i + 1} of ${entries.length}`,
        ts ? ts : null,
        evidenceType,
      ].filter(Boolean).join(' · ');

      const buffer = await fetchImageBuffer(photoUrl);
      if (buffer) {
        ctx = await drawPhoto(ctx, buffer, caption, rotation);
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
        notes,
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

    // Fetch checklist instances for this booking (handover + return)
    const { data: checklistInstances } = await supabase
      .from('checklist_instances')
      .select('checklist_type, completed_at, completed_by, started_at, started_by')
      .eq('booking_id', bookingId)
      .in('checklist_type', ['handover', 'return']);

    // Resolve unique completed_by UIDs and look up staff emails
    const completedByUids = [
      ...new Set(
        (checklistInstances ?? [])
          .map((i) => i.completed_by)
          .filter(Boolean) as string[],
      ),
    ];
    let staffEmails: Record<string, string> = {};
    if (completedByUids.length > 0) {
      const { data: staffProfiles } = await supabase
        .from('staff_profiles')
        .select('auth_user_id, email')
        .in('auth_user_id', completedByUids);
      for (const p of staffProfiles ?? []) {
        if (p.auth_user_id) staffEmails[p.auth_user_id] = p.email ?? p.auth_user_id;
      }
    }

    const handoverInstance = checklistInstances?.find((i) => i.checklist_type === 'handover');
    const returnInstance   = checklistInstances?.find((i) => i.checklist_type === 'return');

    const staffMeta       = (booking.staff_metadata ?? {}) as Record<string, unknown>;
    const handoverPhotos  = (staffMeta.handover_evidence_photos ?? {}) as PhotoPaths;
    const returnPhotos    = (staffMeta.return_evidence_photos   ?? {}) as PhotoPaths;
    const handoverVD      = (staffMeta.handover_vehicle_data    ?? {}) as Record<string, string>;
    const returnVD        = (staffMeta.return_vehicle_data      ?? {}) as Record<string, string>;

    const vehicle = booking.vehicles as unknown as { name: string; registration_plate: string } | null;

    // Supabase Storage public base URL for the evidence bucket
    const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const publicBaseUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}`;

    // Load company details from the same sources used by the Company settings page
    const [{ data: companyRow }, { data: companySettings }] = await Promise.all([
      supabase
        .from('companies')
        .select('name, logo_url, email, address, registration_id')
        .eq('id', profile.company_id)
        .maybeSingle(),
      supabase
        .from('company_settings')
        .select('contact_phone')
        .eq('id', profile.company_id)
        .maybeSingle(),
    ]);

    const logoUrl    = (companyRow as any)?.logo_url as string | null | undefined;
    const logoBuffer = logoUrl ? await fetchImageBuffer(logoUrl) : null;

    const companyInfo: CompanyInfo = {
      name:           (companyRow as any)?.name           || null,
      address:        (companyRow as any)?.address        || null,
      email:          (companyRow as any)?.email          || null,
      phone:          (companySettings as any)?.contact_phone || null,
      registrationId: (companyRow as any)?.registration_id || null,
      logoBuffer,
    };

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

    // ── Company header ──────────────────────────────────────────────────────
    ctx = await drawCompanyHeader(ctx, companyInfo);

    // ── Report title ────────────────────────────────────────────────────────
    ctx = drawText(ctx, 'Evidence Report', { size: 20, font: 'bold', lineGap: 4 });
    ctx = drawText(ctx, `Booking ${booking.booking_number}`, {
      size: 11, font: 'bold', color: COLOR_MUTED, lineGap: 12,
    });

    ctx = drawRule(ctx, 0, 10);

    // ── Booking information block ───────────────────────────────────────────
    ctx = drawSectionHeading(ctx, 'Booking Information');

    const vehicleLabel = vehicle
      ? vehicle.name
      : 'Unassigned';
    const registrationLabel = vehicle?.registration_plate ?? '—';

    ctx = drawKeyValue(ctx, 'Booking reference', booking.booking_number ?? '—');
    ctx = drawKeyValue(ctx, 'Customer name',     booking.customer_name  || '—');
    ctx = drawKeyValue(ctx, 'Vehicle',           vehicleLabel);
    ctx = drawKeyValue(ctx, 'Registration',      registrationLabel);
    ctx = drawKeyValue(ctx, 'Pickup',            formatDate(booking.pickup_at));
    ctx = drawKeyValue(ctx, 'Return',            formatDate(booking.return_at));

    // ── Checklist confirmation metadata ────────────────────────────────────
    const hasChecklistMeta =
      handoverInstance?.completed_at || returnInstance?.completed_at;

    if (hasChecklistMeta) {
      ctx = { ...ctx, y: ctx.y - 6 };
      ctx = drawSectionHeading(ctx, 'Checklist Completion');

      if (handoverInstance?.completed_at) {
        ctx = drawKeyValue(ctx, 'Handover completed', formatDate(handoverInstance.completed_at));
        const staffName = handoverInstance.completed_by
          ? (staffEmails[handoverInstance.completed_by] ?? handoverInstance.completed_by)
          : null;
        if (staffName) ctx = drawKeyValue(ctx, 'Completed by', staffName);
      }

      if (returnInstance?.completed_at) {
        ctx = drawKeyValue(ctx, 'Return completed', formatDate(returnInstance.completed_at));
        const staffName = returnInstance.completed_by
          ? (staffEmails[returnInstance.completed_by] ?? returnInstance.completed_by)
          : null;
        if (staffName) ctx = drawKeyValue(ctx, 'Completed by', staffName);
      }
    }

    // ── Odometer section ────────────────────────────────────────────────────
    const odometerPickup = handoverVD.km?.trim() || null;
    const odometerReturn = returnVD.km?.trim()   || null;

    if (odometerPickup || odometerReturn) {
      ctx = { ...ctx, y: ctx.y - 6 };
      ctx = drawSectionHeading(ctx, 'Odometer');

      if (odometerPickup) ctx = drawKeyValue(ctx, 'Odometer at pickup', `${odometerPickup} km`);
      if (odometerReturn) ctx = drawKeyValue(ctx, 'Odometer at return', `${odometerReturn} km`);

      if (odometerPickup && odometerReturn) {
        const pickup = parseFloat(odometerPickup);
        const ret    = parseFloat(odometerReturn);
        if (!isNaN(pickup) && !isNaN(ret) && ret >= pickup) {
          ctx = drawKeyValue(ctx, 'Distance driven', `${(ret - pickup).toFixed(0)} km`);
        }
      }
    }

    // ── Observed notes section ──────────────────────────────────────────────
    const bookingNotes = (booking as any).notes?.trim() || null;
    if (bookingNotes) {
      ctx = { ...ctx, y: ctx.y - 6 };
      ctx = drawSectionHeading(ctx, 'Observed Notes');
      ctx = drawText(ctx, bookingNotes, { size: 9, color: COLOR_TEXT, lineGap: 5 });
    }

    ctx = drawRule(ctx, 14, 14);

    // ── Handover evidence ───────────────────────────────────────────────────
    ctx = await drawEvidenceSection(ctx, 'Handover Evidence', handoverPhotos, publicBaseUrl, 'Handover');

    ctx = { ...ctx, y: ctx.y - 10 };

    // ── Return evidence ─────────────────────────────────────────────────────
    ctx = await drawEvidenceSection(ctx, 'Return Evidence', returnPhotos, publicBaseUrl, 'Return');

    // ── Footer on every page ────────────────────────────────────────────────
    const pages = doc.getPages();
    const totalPages = pages.length;
    const generated = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    for (let i = 0; i < totalPages; i++) {
      const pg      = pages[i];
      const footerY = MARGIN - 16;

      // Left: branding
      const companyLabel = companyInfo.name ? `${companyInfo.name} – ` : '';
      pg.drawText(`${companyLabel}Evidence Report  ·  Generated by CamperFlow  ·  ${generated}`, {
        x: MARGIN,
        y: footerY,
        size: 7,
        font: fontRegular,
        color: COLOR_MUTED,
      });

      // Right: page number
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
