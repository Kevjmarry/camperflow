"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import BackLink from "@/components/staff/BackLink";
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
  enableLogin: boolean;
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
    enableLogin: false,
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [overLimit, setOverLimit] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

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

        const { data: companyData } = await supabase
          .from("companies")
          .select("over_limit")
          .eq("id", profile.company_id)
          .single();
        if (companyData?.over_limit) setOverLimit(true);

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
      setPhotoWarning(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoWarning(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setPhotoWarning(null);

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setSubmitError(t("errors.nameRequired"));
      return;
    }

    if (formData.enableLogin && !formData.email.trim()) {
      setSubmitError(t("errors.emailRequiredForLogin"));
      return;
    }

    if (formData.enableLogin && !formData.email.includes("@")) {
      setSubmitError(t("errors.invalidEmail"));
      return;
    }

    if (!staffProfile?.company_id) {
      setSubmitError(t("errors.noCompany"));
      return;
    }

    if (overLimit) {
      setSubmitError(t("errors.overLimit"));
      return;
    }

    // Compute once here; used throughout the try block below
    const normalizedEmail = formData.email.trim().toLowerCase();

    setSubmitting(true);
    setLimitReached(false);

    try {
      // Duplicate email check — inside try so Supabase errors surface properly
      if (formData.enableLogin && normalizedEmail) {
        const { data: existing, error: lookupError } = await supabase
          .from("staff_profiles")
          .select("profile_id, auth_user_id")
          .eq("company_id", staffProfile.company_id)
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (lookupError) {
          throw lookupError;
        }

        if (existing) {
          if (existing.auth_user_id !== null) {
            setSubmitError(t("errors.duplicateEmail"));
            setSubmitting(false);
            return;
          }
          // Profile exists but invite never completed — go to that profile to retry
          router.push(`/${locale}/staff/team/${existing.profile_id}`);
          return;
        }
      }

      const { data: limitData } = await supabase
        .from("companies")
        .select("included_staff, purchased_extra_staff")
        .eq("id", staffProfile!.company_id)
        .single();

      if (limitData) {
        const { count: staffCount } = await supabase
          .from("staff_profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", staffProfile!.company_id)
          .eq("active", true);

        const staffLimit = (limitData.included_staff ?? 0) + (limitData.purchased_extra_staff ?? 0);
        if (staffLimit > 0 && (staffCount ?? 0) >= staffLimit) {
          setLimitReached(true);
          setSubmitError(t("errors.staffLimitReached"));
          setSubmitting(false);
          return;
        }
      }

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
          email: normalizedEmail || null,
          notes: formData.notes.trim() || null,
          active: true,
        })
        .select("profile_id")
        .single();

      if (insertError) {
        throw insertError;
      }

      // Non-blocking photo upload
      if (photoFile && newMember?.profile_id) {
        try {
          const uploadFormData = new FormData();
          uploadFormData.append("file", photoFile);
          uploadFormData.append("staffId", String(newMember.profile_id));

          const uploadRes = await fetch("/api/staff/upload-photo", {
            method: "POST",
            body: uploadFormData,
          });

          if (!uploadRes.ok) {
            const bodyText = await uploadRes.text();
            throw new Error(
              bodyText
                ? `Photo upload failed: ${uploadRes.status} ${uploadRes.statusText} ${bodyText}`
                : t("errors.photoUploadFailed")
            );
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
        } catch (photoErr) {
          console.error("Photo upload error (non-fatal):", photoErr);
          setPhotoWarning(t("errors.photoUploadWarning"));
          // Continue — do not re-throw
        }
      }

      // Send invite if enableLogin is true
      if (formData.enableLogin && newMember?.profile_id) {
        const inviteRes = await fetch("/api/staff/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            profile_id: newMember.profile_id,
            locale,
          }),
        });

        if (!inviteRes.ok) {
          let errorData: { error?: string } = {};
          try {
            errorData = await inviteRes.json();
          } catch {
            // non-JSON response body (502, gateway timeout, etc.)
          }
          // Roll back the profile we just created so this email is free to retry
          const { error: deleteErr } = await supabase
            .from("staff_profiles")
            .delete()
            .eq("profile_id", newMember.profile_id);
          if (deleteErr) {
            console.error("Profile rollback after failed invite:", deleteErr);
          }
          throw new Error(errorData.error || t("errors.inviteFailed"));
        }
      }

      router.push(`/${locale}/staff/team`);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error("Error creating team member:", errorMessage, err);
      if (
        errorMessage.toLowerCase().includes("already been registered") ||
        errorMessage.toLowerCase().includes("already registered")
      ) {
        setSubmitError(
          "This email address is already registered. Check Supabase Auth users, or use the existing team member instead of creating a new one."
        );
      } else {
        setSubmitError(errorMessage);
      }
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
        <BackLink href={`/${locale}/staff/team`}>{t("backToTeam")}</BackLink>
        <div className="surface page-surface">
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
        </div>
      </PageContainer>
    );
  }

  if (!isAllowed) {
    return (
      <PageContainer maxWidth="800px">
        <BackLink href={`/${locale}/staff/team`}>{t("backToTeam")}</BackLink>
        <div className="surface page-surface">
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
            }}
          >
            {t("accessDenied.message")}
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="800px">
      <BackLink href={`/${locale}/staff/team`}>{t("backToTeam")}</BackLink>
      <div className="surface page-surface">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          <div>
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

          {overLimit && (
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                background: "rgb(var(--warning) / 0.1)",
                border: "1px solid rgb(var(--warning) / 0.3)",
                borderRadius: "var(--radius)",
                color: "rgb(var(--warning))",
                fontSize: "14px",
              }}
            >
              {t("errors.overLimit")}{" "}
              <Link href={`/${locale}/staff/settings/billing`} style={{ color: "inherit", textDecoration: "underline" }}>{t("errors.upgradePlan")}</Link>
            </div>
          )}

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
                  {limitReached && (
                    <> <Link href={`/${locale}/staff/settings/billing`} style={{ color: "inherit", textDecoration: "underline" }}>{t("errors.upgradePlan")}</Link></>
                  )}
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
                  {t("form.email")}{formData.enableLogin && " *"}
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
                  required={formData.enableLogin}
                />
              </div>

              <div
                style={{
                  padding: "var(--space-4)",
                  background: "rgb(var(--surface))",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.enableLogin}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        enableLogin: e.target.checked,
                      })
                    }
                    disabled={submitting}
                    style={{
                      cursor: submitting ? "not-allowed" : "pointer",
                      marginTop: "2px",
                    }}
                  />
                  <div>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "rgb(var(--text))",
                        display: "block",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      {t("form.enableLogin")}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "rgb(var(--muted))",
                      }}
                    >
                      {t("form.enableLoginDescription")}
                    </span>
                  </div>
                </label>
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
                  ref={photoInputRef}
                  type="file"
                  id="photo"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={submitting}
                  style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={submitting}
                  className="btn btn-secondary"
                  style={{ fontSize: "14px", cursor: submitting ? "not-allowed" : "pointer" }}
                >
                  {t("form.chooseFile")}
                </button>
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
                        display: "block",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={submitting}
                      style={{
                        marginTop: "var(--space-2)",
                        fontSize: "13px",
                        color: "rgb(var(--error))",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: submitting ? "not-allowed" : "pointer",
                        opacity: submitting ? 0.5 : 1,
                      }}
                    >
                      {t("form.removePhoto")}
                    </button>
                  </div>
                )}
                {photoWarning && (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      padding: "var(--space-2) var(--space-3)",
                      background: "rgb(var(--warning) / 0.1)",
                      border: "1px solid rgb(var(--warning) / 0.3)",
                      borderRadius: "var(--radius)",
                      color: "rgb(var(--warning))",
                      fontSize: "13px",
                    }}
                  >
                    {photoWarning}
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
                  disabled={submitting || overLimit}
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