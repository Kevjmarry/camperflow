// app/[locale]/staff/vehicles/[id]/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  notes: string | null;
  photo_url: string | null;
  status: "ready" | "preparing" | "on_rent";
}

const isValidUUID = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export default function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    if (!isValidUUID(id)) {
      router.replace(`/${locale}/staff/vehicles`);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError("");
        setNotFound(false);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace(`/${locale}/staff/login`);
          return;
        }

        const { data: profile } = await supabase
          .from("staff_profiles")
          .select("role, can_manage")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        setCanManage(profile ? profile.role === "admin" || profile.can_manage === true : false);

        const { data: vehicleData, error: vehicleError } = await supabase
          .from("vehicles")
          .select(
            "id, name, registration_plate, make, model, year, vin, notes, photo_url, status"
          )
          .eq("id", id)
          .single();

        if (vehicleError) {
          if (vehicleError.code === "PGRST116") {
            setNotFound(true);
            return;
          }
          setError(vehicleError.message || "Failed to load vehicle");
          return;
        }

        setVehicle(vehicleData as Vehicle);
      } catch (err: any) {
        setError(err?.message || "Failed to load vehicle");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [id, locale, router, supabase]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ready":
        return "Ready";
      case "preparing":
        return "Preparing";
      case "on_rent":
        return "On rent";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "rgb(var(--success))";
      case "preparing":
        return "rgb(var(--warning))";
      case "on_rent":
        return "rgb(var(--brand))";
      default:
        return "rgb(var(--text))";
    }
  };

  if (notFound) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              Vehicle not found
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              The vehicle you&apos;re looking for doesn&apos;t exist or has been deleted.
            </p>
            <Link
              href={`/${locale}/staff/vehicles`}
              className="btn btn-primary"
              style={{ marginTop: "var(--space-6)" }}
            >
              Back to vehicles
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>
            Loading vehicle...
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !vehicle) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <Link
                href={`/${locale}/staff/vehicles`}
                style={{
                  fontSize: "14px",
                  color: "rgb(var(--brand))",
                  textDecoration: "none",
                  marginBottom: "var(--space-2)",
                  display: "inline-block",
                }}
              >
                ← Back to vehicles
              </Link>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                Vehicle details
              </h1>
            </div>

            <div
              style={{
                padding: "var(--space-4)",
                background: "rgb(var(--error) / 0.1)",
                border: "1px solid rgb(var(--error) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--error))",
                fontSize: "14px",
              }}
            >
              {error || "Failed to load vehicle"}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="900px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <Link
                href={`/${locale}/staff/vehicles`}
                style={{
                  fontSize: "14px",
                  color: "rgb(var(--brand))",
                  textDecoration: "none",
                  marginBottom: "var(--space-2)",
                  display: "inline-block",
                }}
              >
                ← Back to vehicles
              </Link>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                  {vehicle.name}
                </h1>
                <span
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius)",
                    background: `${getStatusColor(vehicle.status)}15`,
                    color: getStatusColor(vehicle.status),
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {getStatusLabel(vehicle.status)}
                </span>
              </div>

              <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
                {vehicle.registration_plate}
              </p>
            </div>

            {canManage && (
              <Link href={`/${locale}/staff/vehicles/${vehicle.id}/edit`} className="btn btn-primary">
                Edit
              </Link>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: "var(--space-6)",
            }}
          >
            <div className="surface" style={{ padding: "var(--space-6)" }}>
              <div style={{ fontSize: "14px", color: "rgb(var(--muted))", marginBottom: "var(--space-2)" }}>
                Photo
              </div>

              {vehicle.photo_url ? (
                <img
                  src={vehicle.photo_url}
                  alt={vehicle.name}
                  style={{
                    width: "100%",
                    height: 240,
                    objectFit: "cover",
                    borderRadius: "var(--radius)",
                    border: "1px solid rgb(var(--border))",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 240,
                    borderRadius: "var(--radius)",
                    border: "1px solid rgb(var(--border))",
                    background: "rgb(var(--muted) / 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgb(var(--muted))",
                    fontSize: "14px",
                  }}
                >
                  No photo
                </div>
              )}
            </div>

            <div className="surface" style={{ padding: "var(--space-6)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                <Field label="Make" value={vehicle.make || "—"} />
                <Field label="Model" value={vehicle.model || "—"} />
                <Field label="Year" value={vehicle.year ? String(vehicle.year) : "—"} />
                <Field label="VIN" value={vehicle.vin || "—"} />
              </div>
            </div>
          </div>

          <div className="surface" style={{ padding: "var(--space-6)" }}>
            <div style={{ fontSize: "14px", color: "rgb(var(--muted))", marginBottom: "var(--space-2)" }}>
              Notes
            </div>
            <div style={{ color: "rgb(var(--text))", whiteSpace: "pre-wrap", fontSize: "14px" }}>
              {vehicle.notes && vehicle.notes.trim().length > 0 ? vehicle.notes : "No notes"}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", color: "rgb(var(--text))", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}