export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import WidgetClient from "@/components/widget/WidgetClient";
import type { WidgetVehicle, WidgetBookingSlot, WidgetBlockSlot } from "@/components/widget/WidgetTimeline";

interface PageProps {
  params: Promise<{ locale: string; companyId: string }>;
}

interface VehicleRow { id: string; name: string; registration: string; }
interface BookingRow { vehicle_id: string; pickup_at: string; return_at: string; }
interface BlockRow  { vehicle_id: string; start_at: string; end_at: string; }

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "54 143 139";
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}

function darken(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return `#${[parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    .map(c => clamp(c + amt).toString(16).padStart(2, "0"))
    .join("")}`;
}

// Builds CSS variables for the widget including all tokens used by WidgetTimeline
// (prefixed --wt-* to avoid collisions with any host-page CSS variables).
function buildThemeCss(primary: string, secondary: string): string {
  return `
    :root {
      --wt-brand: ${hexToRgb(primary)};
      --wt-brand-hover: ${hexToRgb(darken(primary, -15))};
      --wt-brand-secondary: ${hexToRgb(secondary)};
      --wt-muted: 128 128 128;
      --wt-text: 40 40 40;
      --wt-surface: 255 255 255;
      --wt-border: 220 220 220;
    }
  `;
}

// ── Unavailable state ─────────────────────────────────────────────────────────

function Unavailable({ name }: { name?: string | null }) {
  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "200px",
      padding: "32px",
      textAlign: "center",
    }}>
      <div>
        {name && <div style={{ fontWeight: 600, marginBottom: 8, color: "#333", fontSize: 16 }}>{name}</div>}
        <div style={{ fontSize: 14, color: "#888" }}>Availability widget is not currently available.</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WidgetPage({ params }: PageProps) {
  const { companyId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return <Unavailable />;
  }

  const supabase = createServiceClient();

  const { data: rawSettings } = await supabase
    .from("company_settings")
    .select("name, logo_url, primary_color, secondary_color, company_timezone, widget_public_enabled, widget_vehicle_ids")
    .eq("id", companyId)
    .maybeSingle();

  const settings = rawSettings as {
    name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    company_timezone: string | null;
    widget_public_enabled: boolean;
    widget_vehicle_ids: string[] | null;
  } | null;

  if (!settings?.widget_public_enabled) {
    return <Unavailable name={settings?.name} />;
  }

  // Load vehicles
  let vQuery = supabase
    .from("vehicles")
    .select("id, name, registration")
    .eq("company_id", companyId)
    .order("name");

  if (settings.widget_vehicle_ids?.length) {
    vQuery = vQuery.in("id", settings.widget_vehicle_ids);
  }

  const { data: vehicleRows } = await vQuery;
  const vehicles: VehicleRow[] = (vehicleRows ?? []) as VehicleRow[];
  const vehicleIds = vehicles.map(v => v.id);

  // Date window (90 days forward from today)
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 90 * 86_400_000);

  const [{ data: bookingRows }, { data: blockRows }] = vehicleIds.length
    ? await Promise.all([
        supabase
          .from("bookings")
          .select("vehicle_id, pickup_at, return_at")
          .in("vehicle_id", vehicleIds)
          .not("status", "eq", "cancelled")
          .not("return_at", "is", null)
          .gte("return_at", now.toISOString())
          .lte("pickup_at", windowEnd.toISOString()),
        supabase
          .from("vehicle_blocks")
          .select("vehicle_id, start_at, end_at")
          .eq("company_id", companyId)
          .in("vehicle_id", vehicleIds)
          .gte("end_at", now.toISOString())
          .lte("start_at", windowEnd.toISOString()),
      ])
    : [{ data: [] as BookingRow[] }, { data: [] as BlockRow[] }];

  const tlVehicles: WidgetVehicle[] = vehicles.map(v => ({ id: v.id, name: v.name }));

  const tlBookings: WidgetBookingSlot[] = (bookingRows ?? []).map((b) => ({
    vehicleId: (b as BookingRow).vehicle_id,
    pickupAt:  (b as BookingRow).pickup_at,
    returnAt:  (b as BookingRow).return_at,
  }));

  const tlBlocks: WidgetBlockSlot[] = (blockRows ?? []).map((bl) => ({
    vehicleId: (bl as BlockRow).vehicle_id,
    startAt:   (bl as BlockRow).start_at,
    endAt:     (bl as BlockRow).end_at,
  }));

  const primary      = settings.primary_color ?? "#368F8B";
  const secondary    = settings.secondary_color ?? "#BC8235";
  const companyName  = settings.name ?? "";
  const logoUrl      = settings.logo_url ?? null;
  const timezone     = settings.company_timezone ?? "UTC";

  // Vehicles for the enquiry form (includes registration for display)
  const formVehicles = vehicles.map(v => ({ id: v.id, name: v.name, registration: v.registration }));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: buildThemeCss(primary, secondary) }} />
      <div style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "16px",
        maxWidth: "960px",
        margin: "0 auto",
        color: "#282828",
        boxSizing: "border-box",
      }}>

        {/* Company header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: `2px solid rgb(var(--wt-brand-secondary))`,
        }}>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName} style={{ height: 32, objectFit: "contain", flexShrink: 0 }} />
          )}
          <div>
            {companyName && <div style={{ fontWeight: 700, fontSize: 15 }}>{companyName}</div>}
            <div style={{ fontSize: 12, color: "#888", marginTop: companyName ? 2 : 0 }}>
              Vehicle Availability
            </div>
          </div>
        </div>

        {/* Timeline legend */}
        <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, border: "1px solid #ddd", background: "#fff", flexShrink: 0 }} />
            Available
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              background: `rgb(var(--wt-brand) / 0.65)`,
              border: `1px solid rgb(var(--wt-brand) / 0.90)`,
            }} />
            Booked
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: "rgb(220 38 38 / 0.20)", border: "1px solid rgb(220 38 38 / 0.55)" }} />
            Unavailable
          </div>
        </div>

        {/* Timeline + enquiry section (client wrapper manages shared prefill state) */}
        <WidgetClient
          tlVehicles={tlVehicles}
          tlBookings={tlBookings}
          tlBlocks={tlBlocks}
          companyTimezone={timezone}
          companyId={companyId}
          formVehicles={formVehicles}
          primaryColor={primary}
        />

        {/* Footer */}
        <div style={{
          marginTop: 28,
          paddingTop: 12,
          borderTop: "1px solid #e5e5e5",
          fontSize: 11,
          color: "#bbb",
          textAlign: "center",
        }}>
          Powered by CamperFlow
        </div>
      </div>
    </>
  );
}
