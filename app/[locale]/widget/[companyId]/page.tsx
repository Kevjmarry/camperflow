export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
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

function Unavailable({ name, message }: { name?: string | null; message: string }) {
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
        <div style={{ fontSize: 14, color: "#888" }}>{message}</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WidgetPage({ params }: PageProps) {
  const { companyId, locale } = await params;
  const t = await getTranslations({ locale, namespace: "widget" });

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return <Unavailable message={t("unavailable")} />;
  }

  const supabase = createServiceClient();

  // company_settings holds widget flags, timezone, and header config.
  // companies holds the live brand colours and name (written by the staff Company page).
  const [{ data: rawSettings }, { data: rawCompany }] = await Promise.all([
    supabase
      .from("company_settings")
      .select("company_timezone, widget_public_enabled, widget_vehicle_ids, widget_show_header, widget_header_title, widget_header_subtitle")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("name, primary_color, secondary_color")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  const settings = rawSettings as {
    company_timezone: string | null;
    widget_public_enabled: boolean;
    widget_vehicle_ids: string[] | null;
    widget_show_header: boolean | null;
    widget_header_title: string | null;
    widget_header_subtitle: string | null;
  } | null;

  const companyRow = rawCompany as {
    name: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  } | null;

  if (!settings?.widget_public_enabled) {
    return <Unavailable name={companyRow?.name} message={t("unavailable")} />;
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

  // Brand colours from `companies`; timezone and widget config from `company_settings`.
  const primary    = companyRow?.primary_color   ?? "#368F8B";
  const secondary  = companyRow?.secondary_color ?? "#BC8235";
  const timezone   = settings.company_timezone   ?? "UTC";
  const showHeader = settings.widget_show_header ?? true;
  const headerTitle    = settings.widget_header_title    ?? t("defaultTitle");
  const headerSubtitle = settings.widget_header_subtitle ?? t("defaultSubtitle");

  const formVehicles = vehicles.map(v => ({ id: v.id, name: v.name, registration: v.registration }));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: buildThemeCss(primary, secondary) }} />
      <div style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "20px 16px",
        maxWidth: "960px",
        margin: "0 auto",
        color: "#282828",
        boxSizing: "border-box",
      }}>

        {/* Header — conditionally shown */}
        {showHeader && (
          <div style={{
            marginBottom: 24,
            paddingLeft: 14,
            borderLeft: `3px solid rgb(var(--wt-brand))`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "rgb(var(--wt-text))", lineHeight: 1.2 }}>
              {headerTitle}
            </div>
            {headerSubtitle && (
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                {headerSubtitle}
              </div>
            )}
          </div>
        )}

        {/* Calendar (single vehicle) or Timeline (multiple vehicles) + enquiry form */}
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
          {t("poweredBy")}
        </div>
      </div>
    </>
  );
}
