"use client";

import { use, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import PageContainer from "@/components/PageContainer";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  notes: string | null;
  status: "ready" | "preparing" | "on_rent";
  photo_url: string | null;
}

export default function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id: vehicleId, locale } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations("staffVehicleEdit");

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    registration_plate: "",
    make: "",
    model: "",
    year: "",
    vin: "",
    notes: "",
    status: "ready" as "ready" | "preparing" | "on_rent",
    photo_url: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError(t("notAuthenticated"));
          setLoading(false);
          setTimeout(() => router.replace(`/${locale}/staff/login`), 1500);
          return;
        }

        const { data: profile } = await supabase
          .from("staff_profiles")
          .select("role, can_manage")
          .eq("auth_user_id", user.id)
          .single();

        if (!profile || (profile.role !== "admin" && !profile.can_manage)) {
          setError(t("notAllowed"));
          setLoading(false);
          setTimeout(() => router.replace(`/${locale}/staff/vehicles`), 1500);
          return;
        }

        const { data: vehicleData, error: vehicleError } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", vehicleId)
          .single();

        if (vehicleError) {
          if (vehicleError.code === "PGRST116") {
            setError(t("vehicleNotFound"));
          } else {
            setError(t("loadFailed"));
          }
          setLoading(false);
          return;
        }

        setVehicle(vehicleData);
        setFormData({
          name: vehicleData.name || "",
          registration_plate: vehicleData.registration_plate || "",
          make: vehicleData.make || "",
          model: vehicleData.model || "",
          year: vehicleData.year?.toString() || "",
          vin: vehicleData.vin || "",
          notes: vehicleData.notes || "",
          status: vehicleData.status || "ready",
          photo_url: vehicleData.photo_url || "",
        });
      } catch (err) {
        setError(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [vehicleId, locale, router, supabase, t]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("vehicles")
        .update({
          name: formData.name,
          registration_plate: formData.registration_plate,
          make: formData.make || null,
          model: formData.model || null,
          year: formData.year ? parseInt(formData.year) : null,
          vin: formData.vin || null,
          notes: formData.notes || null,
          status: formData.status,
          photo_url: formData.photo_url || null,
        })
        .eq("id", vehicleId);

      if (updateError) throw updateError;

      router.push(`/${locale}/staff/vehicles`);
      router.refresh();
    } catch (err) {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirmDelete"))) return;

    setDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicleId);

      if (deleteError) throw deleteError;

      router.push(`/${locale}/staff/vehicles`);
      router.refresh();
    } catch (err) {
      setError(t("deleteFailed"));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="700px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div style={{ textAlign: "center", color: "rgb(var(--muted))" }}>
            {t("loading")}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !vehicle) {
    return (
      <PageContainer maxWidth="700px">
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
                {t("backToVehicles")}
              </Link>
              <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                {t("title")}
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
              {error}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="700px">
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
              {t("backToVehicles")}
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("title")}
            </h1>
          </div>

          {error && (
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
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div>
              <label
                htmlFor="name"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "rgb(var(--text))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("nameLabel")}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder={t("namePlaceholder")}
                required
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "14px",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: "var(--radius)",
                  background: "rgb(var(--background))",
                  color: "rgb(var(--text))",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="registration_plate"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "rgb(var(--text))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("registrationPlateLabel")}
              </label>
              <input
                id="registration_plate"
                name="registration_plate"
                type="text"
                value={formData.registration_plate}
                onChange={handleChange}
                placeholder={t("registrationPlatePlaceholder")}
                required
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "14px",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: "var(--radius)",
                  background: "rgb(var(--background))",
                  color: "rgb(var(--text))",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <div>
                <label
                  htmlFor="make"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "rgb(var(--text))",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  {t("makeLabel")}
                </label>
                <input
                  id="make"
                  name="make"
                  type="text"
                  value={formData.make}
                  onChange={handleChange}
                  placeholder={t("makePlaceholder")}
                  style={{
                    width: "100%",
                    padding: "var(--space-3)",
                    fontSize: "14px",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                    background: "rgb(var(--background))",
                    color: "rgb(var(--text))",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="model"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "rgb(var(--text))",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  {t("modelLabel")}
                </label>
                <input
                  id="model"
                  name="model"
                  type="text"
                  value={formData.model}
                  onChange={handleChange}
                  placeholder={t("modelPlaceholder")}
                  style={{
                    width: "100%",
                    padding: "var(--space-3)",
                    fontSize: "14px",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                    background: "rgb(var(--background))",
                    color: "rgb(var(--text))",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <div>
                <label
                  htmlFor="year"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "rgb(var(--text))",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  {t("yearLabel")}
                </label>
                <input
                  id="year"
                  name="year"
                  type="number"
                  value={formData.year}
                  onChange={handleChange}
                  placeholder={t("yearPlaceholder")}
                  style={{
                    width: "100%",
                    padding: "var(--space-3)",
                    fontSize: "14px",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                    background: "rgb(var(--background))",
                    color: "rgb(var(--text))",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="status"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "rgb(var(--text))",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  {t("statusLabel")}
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  style={{
                    width: "100%",
                    padding: "var(--space-3)",
                    fontSize: "14px",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                    background: "rgb(var(--background))",
                    color: "rgb(var(--text))",
                  }}
                >
                  <option value="ready">{t("statusReady")}</option>
                  <option value="preparing">{t("statusPreparing")}</option>
                  <option value="on_rent">{t("statusOnRent")}</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="vin"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "rgb(var(--text))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("vinLabel")}
              </label>
              <input
                id="vin"
                name="vin"
                type="text"
                value={formData.vin}
                onChange={handleChange}
                placeholder={t("vinPlaceholder")}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "14px",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: "var(--radius)",
                  background: "rgb(var(--background))",
                  color: "rgb(var(--text))",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="notes"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "rgb(var(--text))",
                  marginBottom: "var(--space-2)",
                }}
              >
                {t("notesLabel")}
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder={t("notesPlaceholder")}
                rows={4}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "14px",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: "var(--radius)",
                  background: "rgb(var(--background))",
                  color: "rgb(var(--text))",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
              <button
                type="submit"
                disabled={saving || deleting}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  opacity: saving || deleting ? 0.6 : 1,
                  cursor: saving || deleting ? "not-allowed" : "pointer",
                }}
              >
                {saving ? t("saving") : t("saveButton")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  fontSize: "14px",
                  fontWeight: 500,
                  border: "1px solid rgb(var(--error))",
                  borderRadius: "var(--radius)",
                  background: "transparent",
                  color: "rgb(var(--error))",
                  cursor: saving || deleting ? "not-allowed" : "pointer",
                  opacity: saving || deleting ? 0.6 : 1,
                }}
              >
                {deleting ? t("deleting") : t("deleteButton")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}