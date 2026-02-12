"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface StaffProfile {
  company_id: string;
  role: string;
  can_manage: boolean;
}

interface FormData {
  first_name: string;
  last_name: string;
  role: "staff" | "admin";
  can_clean: boolean;
  can_mechanical: boolean;
  phone: string;
  email: string;
  notes: string;
}

const getErrorMessage = (err: any): string => {
  if (err.message) return err.message;
  if (err.error_description) return err.error_description;
  if (err.details) return err.details;
  if (err.hint) return err.hint;
  if (err.code) return err.code;
  return JSON.stringify(err);
};

export default function NewTeamMemberPage() {
  const t = useTranslations("staffTeamNew");

  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);

  const [formData, setFormData] = useState<FormData>({
    first_name: "",
    last_name: "",
    role: "staff",
    can_clean: false,
    can_mechanical: false,
    phone: "",
    email: "",
    notes: "",
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push(`/${locale}/staff/login`);
          return;
        }

        const { data: profile } = await supabase
          .from("staff_profiles")
          .select("company_id, role, can_manage")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!profile) {
          setError(t("errors.profileNotFound"));
          setLoading(false);
          return;
        }

        setStaffProfile(profile);
        setLoading(false);
      } catch (err) {
        console.error("Permission check error:", err);
        setError(t("errors.profileNotFound"));
        setLoading(false);
      }
    }

    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAllowed =
    staffProfile?.role === "admin" || staffProfile?.can_manage === true;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setSubmitError(t("errors.nameRequired"));
      return;
    }

    if (!staffProfile?.company_id) {
      setSubmitError(t("errors.noCompany"));
      return;
    }

    setSubmitting(true);

    try {
      const name = `${formData.first_name.trim()} ${formData.last_name.trim()}`;
      const can_manage = formData.role === "admin";

      const { data: newMember, error: insertError } = await supabase
        .from("staff_profiles")
        .insert({
          company_id: staffProfile.company_id,
          name,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          role: formData.role,
          can_manage,
          can_clean: formData.can_clean,
          can_mechanical: formData.can_mechanical,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          notes: formData.notes.trim() || null,
          active: true,
        })
        .select("profile_id")
        .single();

      if (insertError) {
        throw insertError;
      }

      if (photoFile && newMember?.profile_id) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", photoFile);
        uploadFormData.append("staffId", String(newMember.profile_id));

        const uploadRes = await fetch("/api/staff/upload-photo", {
          method: "POST",
          body: uploadFormData,
        });

        if (!uploadRes.ok) {
          const bodyText = await uploadRes.text();
          if (bodyText) {
            throw new Error(`Photo upload failed: ${uploadRes.status} ${uploadRes.statusText} ${bodyText}`);
          } else {
            throw new Error(t("errors.photoUploadFailed"));
          }
        }

        const { publicUrl } = await uploadRes.json();

        if (!publicUrl) {
          throw new Error(t("errors.photoUploadFailed"));
        }

        const { error: updateError } = await supabase
          .from("staff_profiles")
          .update({ photo_url: publicUrl })
          .eq("profile_id", newMember.profile_id);

        if (updateError) {
          throw updateError;
        }
      }

      router.push(`/${locale}/staff/team`);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error("Error creating team member:", errorMessage, err);
      setSubmitError(errorMessage);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="800px">
        <div
          className="surface"
          style={{ padding: "var(--space-8)", textAlign: "center" }}
        >
          <p style={{ color: "rgb(var(--muted))" }}>
            {t("checkingPermissions")}
          </p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              background: "rgb(var(--error) / 0.1)",
              border: "1px solid rgb(var(--error) / 0.3)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--error))",
              fontSize: "14px",
              marginBottom: "var(--space-4)",
            }}
          >
            {error}
          </div>
          <Link
            href={`/${locale}/staff/team`}
            style={{
              fontSize: "14px",
              color: "rgb(var(--brand))",
              textDecoration: "none",
            }}
          >
            {t("backToTeam")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (!isAllowed) {
    return (
      <PageContainer maxWidth="800px">
        <div className="surface" style={{ padding: "var(--space-8)" }}>
          <h1
            style={{
              fontSize: "28px",
              color: "rgb(var(--text))",
              marginBottom: "var(--space-4)",
            }}
          >
            {t("accessDenied.title")}
          </h1>
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              background: "rgb(var(--warning) / 0.1)",
              border: "1px solid rgb(var(--warning) / 0.3)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--warning))",
              fontSize: "14px",
              marginBottom: "var(--space-4)",
            }}
          >
            {t("accessDenied.message")}
          </div>
          <Link href={`/${locale}/staff/team`} className="btn btn-secondary">
            {t("backToTeam")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="800px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          <div>
            <Link
              href={`/${locale}/staff/team`}
              style={{
                fontSize: "14px",
                color: "rgb(var(--brand))",
                textDecoration: "none",
                marginBottom: "var(--space-2)",
                display: "inline-block",
              }}
            >
              {t("backToTeam")}
            </Link>
            <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
              {t("title")}
            </h1>
            <p
              style={{
                marginTop: "var(--space-2)",
                color: "rgb(var(--muted))",
              }}
            >
              {t("subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-5)",
              }}
            >
              {submitError && (
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
                  {submitError}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--space-4)",
                }}
              >
                <div>
                  <label
                    htmlFor="first_name"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 500,
                      marginBottom: "var(--space-2)",
                      color: "rgb(var(--text))",
                    }}
                  >
                    {t("form.firstName")} *
                  </label>
                  <input
                    type="text"
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    required
                    className="input"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label
                    htmlFor="last_name"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 500,
                      marginBottom: "var(--space-2)",
                      color: "rgb(var(--text))",
                    }}
                  >
                    {t("form.lastName")} *
                  </label>
                  <input
                    type="text"
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    required
                    className="input"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="role"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "var(--space-2)",
                    color: "rgb(var(--text))",
                  }}
                >
                  {t("form.role")} *
                </label>
                <select
                  id="role"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as "staff" | "admin",
                    })
                  }
                  className="input"
                  disabled={submitting}
                  style={{ cursor: submitting ? "not-allowed" : "pointer" }}
                >
                  <option value="staff">{t("form.roleStaff")}</option>
                  <option value="admin">{t("form.roleAdmin")}</option>
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "rgb(var(--text))",
                  }}
                >
                  {t("form.capabilities")}
                </p>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.can_clean}
                    onChange={(e) =>
                      setFormData({ ...formData, can_clean: e.target.checked })
                    }
                    disabled={submitting}
                    style={{ cursor: submitting ? "not-allowed" : "pointer" }}
                  />
                  <span style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                    {t("form.canClean")}
                  </span>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.can_mechanical}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        can_mechanical: e.target.checked,
                      })
                    }
                    disabled={submitting}
                    style={{ cursor: submitting ? "not-allowed" : "pointer" }}
                  />
                  <span style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                    {t("form.canMechanical")}
                  </span>
                </label>
              </div>

              <div>
                <label
                  htmlFor="phone"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "var(--space-2)",
                    color: "rgb(var(--text))",
                  }}
                >
                  {t("form.phone")}
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="input"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "var(--space-2)",
                    color: "rgb(var(--text))",
                  }}
                >
                  {t("form.email")}
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="input"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="photo"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "var(--space-2)",
                    color: "rgb(var(--text))",
                  }}
                >
                  {t("form.photo")}
                </label>
                <input
                  type="file"
                  id="photo"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={submitting}
                  style={{
                    display: "block",
                    fontSize: "14px",
                    color: "rgb(var(--text))",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                />
                {photoPreview && (
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <img
                      src={photoPreview}
                      alt="Preview"
                      style={{
                        width: "120px",
                        height: "120px",
                        objectFit: "cover",
                        borderRadius: "var(--radius)",
                        border: "1px solid rgb(var(--border))",
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="notes"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 500,
                    marginBottom: "var(--space-2)",
                    color: "rgb(var(--text))",
                  }}
                >
                  {t("form.notes")}
                </label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={4}
                  className="input"
                  disabled={submitting}
                  style={{ resize: "vertical" }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  paddingTop: "var(--space-4)",
                }}
              >
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? t("form.saving") : t("form.save")}
                </button>
                <Link
                  href={`/${locale}/staff/team`}
                  className="btn btn-secondary"
                  style={{
                    pointerEvents: submitting ? "none" : "auto",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  {t("form.cancel")}
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}