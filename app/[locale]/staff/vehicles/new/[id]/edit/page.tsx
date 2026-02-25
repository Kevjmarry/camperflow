"use client";

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: "ready" | "preparing" | "on_rent";
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  notes?: string;
  photo_url?: string;
}

export default function EditVehiclePage() {
  const router = useRouter();
  const params = useParams<{ locale: string; id: string }>();
  const locale = params?.locale || "en";
  const id = params?.id;
  const supabase = createClient();

  const [formData, setFormData] = useState({
    name: "",
    registration_plate: "",
    status: "ready" as "ready" | "preparing" | "on_rent",
    make: "",
    model: "",
    year: "",
    vin: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

  useEffect(() => {
    if (authorized && id) {
      fetchVehicle();
    }
  }, [authorized, id]);

  const checkPermissions = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace(`/${locale}/staff/login`);
        return;
      }

      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("role, can_manage")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile) {
        router.replace(`/${locale}/staff/login`);
        return;
      }

      if (profile.role !== "admin" && !profile.can_manage) {
        router.replace(`/${locale}/staff/vehicles`);
        return;
      }

      setAuthorized(true);
    } catch (err) {
      router.replace(`/${locale}/staff/login`);
    }
  };

  const fetchVehicle = async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          setNotFound(true);
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        setFormData({
          name: data.name || "",
          registration_plate: data.registration_plate || "",
          status: data.status || "ready",
          make: data.make || "",
          model: data.model || "",
          year: data.year ? String(data.year) : "",
          vin: data.vin || "",
          notes: data.notes || "",
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load vehicle");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!formData.name.trim()) {
      setError("Vehicle name is required");
      setSaving(false);
      return;
    }

    if (!formData.registration_plate.trim()) {
      setError("Registration plate is required");
      setSaving(false);
      return;
    }

    if (!id) {
      setError("Invalid vehicle ID");
      setSaving(false);
      return;
    }

    try {
      const updateData: any = {
        name: formData.name.trim(),
        registration_plate: formData.registration_plate.trim().toUpperCase(),
        status: formData.status,
      };

      if (formData.make) updateData.make = formData.make.trim();
      if (formData.model) updateData.model = formData.model.trim();
      if (formData.year) updateData.year = parseInt(formData.year);
      if (formData.vin) updateData.vin = formData.vin.trim().toUpperCase();
      if (formData.notes) updateData.notes = formData.notes.trim();

      const { error } = await supabase.from("vehicles").update(updateData).eq("id", id);

      if (error) {
        if (error.code === "23505") {
          setError("A vehicle with this registration plate already exists");
        } else {
          setError(error.message);
        }
        setSaving(false);
        return;
      }

      router.replace(`/${locale}/staff/vehicles`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update vehicle");
      setSaving(false);
    }
  };

  if (!authorized || loading) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>
            Loading...
          </div>
        </div>
      </PageContainer>
    );
  }

  if (notFound) {
    return (
      <PageContainer maxWidth="1400px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              Vehicle not found
            </h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              The vehicle you're looking for doesn't exist or has been deleted.
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

  return (
    <PageContainer maxWidth="1400px">
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
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>Edit vehicle</h1>
            <p style={{ marginTop: "var(--space-2)", color: "rgb(var(--muted))" }}>
              Update vehicle information
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
          >
            <div>
              <label htmlFor="name" className="label">
                Vehicle name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                className="input"
                placeholder="e.g. VW California Ocean"
                value={formData.name}
                onChange={handleChange}
                required
                style={{ width: "100%" }}
              />
              <p className="helper-text">The make and model of the vehicle</p>
            </div>

            <div>
              <label htmlFor="registration_plate" className="label">
                Registration plate
              </label>
              <input
                id="registration_plate"
                name="registration_plate"
                type="text"
                className="input"
                placeholder="e.g. ABC-123"
                value={formData.registration_plate}
                onChange={handleChange}
                required
                style={{ width: "100%" }}
              />
              <p className="helper-text">Vehicle registration number or license plate</p>
            </div>

            <div>
              <label htmlFor="status" className="label">
                Status
              </label>
              <select
                id="status"
                name="status"
                className="input"
                value={formData.status}
                onChange={handleChange}
                style={{ width: "100%" }}
              >
                <option value="ready">Ready</option>
                <option value="preparing">Preparing</option>
                <option value="on_rent">On rent</option>
              </select>
              <p className="helper-text">Current status of the vehicle</p>
            </div>

            <div>
              <label htmlFor="make" className="label">
                Make (optional)
              </label>
              <input
                id="make"
                name="make"
                type="text"
                className="input"
                placeholder="e.g. Volkswagen"
                value={formData.make}
                onChange={handleChange}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="model" className="label">
                Model (optional)
              </label>
              <input
                id="model"
                name="model"
                type="text"
                className="input"
                placeholder="e.g. California Ocean"
                value={formData.model}
                onChange={handleChange}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="year" className="label">
                Year (optional)
              </label>
              <input
                id="year"
                name="year"
                type="number"
                className="input"
                placeholder="e.g. 2023"
                value={formData.year}
                onChange={handleChange}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="vin" className="label">
                VIN (optional)
              </label>
              <input
                id="vin"
                name="vin"
                type="text"
                className="input"
                placeholder="e.g. WVW123456789"
                value={formData.vin}
                onChange={handleChange}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="notes" className="label">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                className="input"
                placeholder="Additional notes about the vehicle"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                style={{ width: "100%" }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "rgb(var(--error) / 0.1)",
                  border: "1px solid rgb(var(--error) / 0.3)",
                  borderRadius: "var(--radius)",
                  color: "rgb(var(--error))",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "var(--space-3)", paddingTop: "var(--space-2)" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{
                  flex: 1,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <Link href={`/${locale}/staff/vehicles`} className="btn btn-secondary" style={{ flex: 1 }}>
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}
