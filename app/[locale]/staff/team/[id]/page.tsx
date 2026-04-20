"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import StaffMemberEditForm from "@/components/team/StaffMemberEditForm";

interface StaffProfile {
  profile_id: string;
  auth_user_id: string | null;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  role: string;
  can_manage: boolean;
  can_clean: boolean;
  can_mechanical: boolean;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}

interface StaffFormData {
  first_name: string;
  last_name: string;
  name: string;
  role: string;
  can_manage: boolean;
  can_clean: boolean;
  can_mechanical: boolean;
  photo_url: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
}

export default function StaffMemberPage() {
  const t = useTranslations('staffTeamMember');
  const router = useRouter();
  const { id: staffId, locale } = useParams<{ id: string; locale: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [member, setMember] = useState<StaffProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isViewingOwnProfile, setIsViewingOwnProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [formData, setFormData] = useState<StaffFormData>({
    first_name: "",
    last_name: "",
    name: "",
    role: "staff",
    can_manage: false,
    can_clean: false,
    can_mechanical: false,
    photo_url: "",
    phone: "",
    email: "",
    notes: "",
    active: true,
  });

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        setRecoveryLink(null);
        setCopiedLink(false);
        setInviteSuccess(false);
        setInviteError("");

        const supabase = createClient();

        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes?.user) {
          router.replace(`/${locale}/staff/login`);
          return;
        }

        setCurrentUserId(userRes.user.id);

        const { data: currentUserProfile } = await supabase
          .from("staff_profiles")
          .select("company_id, role, can_manage")
          .eq("auth_user_id", userRes.user.id)
          .single();

        if (!currentUserProfile) {
          setError(t('errors.profileNotFound'));
          return;
        }

        setIsAdmin(currentUserProfile.role === "admin" || currentUserProfile.can_manage);
        setCompanyId(currentUserProfile.company_id);

        const { data, error } = await supabase
          .from("staff_profiles")
          .select("profile_id, auth_user_id, company_id, first_name, last_name, name, role, can_manage, can_clean, can_mechanical, photo_url, phone, email, notes, active")
          .eq("profile_id", staffId)
          .eq("company_id", currentUserProfile.company_id)
          .single();

        if (error || !data) {
          setError(t('errors.memberNotFound'));
          return;
        }

        setMember(data as StaffProfile);
        setIsViewingOwnProfile(!!data.auth_user_id && data.auth_user_id === userRes.user.id);

        setFormData({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          name: data.name || "",
          role: data.role || "staff",
          can_manage: data.can_manage || false,
          can_clean: data.can_clean || false,
          can_mechanical: data.can_mechanical || false,
          photo_url: data.photo_url || "",
          phone: data.phone || "",
          email: data.email || "",
          notes: data.notes || "",
          active: data.active ?? true,
        });
      } catch (err: any) {
        setError(err?.message || t('errors.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [staffId, locale, router, t]);

  const refetchMember = async () => {
    if (!companyId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("staff_profiles")
      .select("profile_id, auth_user_id, company_id, first_name, last_name, name, role, can_manage, can_clean, can_mechanical, photo_url, phone, email, notes, active")
      .eq("profile_id", staffId)
      .eq("company_id", companyId)
      .single();
    if (data) setMember(data as StaffProfile);
  };

  const handleInvite = async () => {
    if (!member?.email) return;

    setIsInviting(true);
    setInviteError("");
    setInviteSuccess(false);
    setRecoveryLink(null);
    setCopiedLink(false);

    try {
      const response = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: member.email,
          profile_id: member.profile_id,
          locale,
        }),
      });

      let json: any = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        json = await response.json();
      }

      if (!response.ok) {
        throw new Error(json?.error || `Request failed (${response.status})`);
      }

      if (json?.mode === 'recovery_link') {
        setRecoveryLink(json.action_link);
      } else {
        setInviteSuccess(true);
      }

      await refetchMember();
    } catch (err: any) {
      setInviteError(err?.message || 'Failed to send invite.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!recoveryLink) return;
    try {
      await navigator.clipboard.writeText(recoveryLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // clipboard API unavailable; user can copy manually
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError("");

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('staffId', staffId);

      const response = await fetch('/api/staff/upload-photo', {
        method: 'POST',
        body: fd,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.uploadFailed'));
      }

      setFormData(prev => ({ ...prev, photo_url: data.publicUrl }));
    } catch (err: any) {
      setUploadError(err?.message || t('errors.uploadPhotoFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setSaveError("");
    setRecoveryLink(null);
    setCopiedLink(false);
    setInviteSuccess(false);
    setInviteError("");
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSaveError("");
    setUploadError("");
    if (member) {
      setFormData({
        first_name: member.first_name || "",
        last_name: member.last_name || "",
        name: member.name || "",
        role: member.role || "staff",
        can_manage: member.can_manage || false,
        can_clean: member.can_clean || false,
        can_mechanical: member.can_mechanical || false,
        photo_url: member.photo_url || "",
        phone: member.phone || "",
        email: member.email || "",
        notes: member.notes || "",
        active: member.active ?? true,
      });
    }
  };

  const handleRoleChange = (newRole: string) => {
    setFormData({
      ...formData,
      role: newRole,
      can_manage: newRole === "admin",
    });
  };

  const handleSave = async () => {
    if (!companyId) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const supabase = createClient();

      const firstName = formData.first_name.trim();
      const lastName = formData.last_name.trim();

      if (!firstName || !lastName) {
        setSaveError(t('errors.nameRequired'));
        setIsSaving(false);
        return;
      }

      const canManageValue = formData.role === "admin";
      const fullName = `${firstName} ${lastName}`.trim();

      const { error } = await supabase
        .from("staff_profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          name: fullName,
          role: formData.role,
          can_manage: canManageValue,
          can_clean: formData.can_clean,
          can_mechanical: formData.can_mechanical,
          photo_url: formData.photo_url || null,
          phone: formData.phone || null,
          email: formData.email || null,
          notes: formData.notes || null,
          active: formData.active,
        })
        .eq("profile_id", staffId)
        .eq("company_id", companyId);

      if (error) throw error;

      await refetchMember();
      setIsEditing(false);
    } catch (err: any) {
      setSaveError(err?.message || t('errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (newActiveState: boolean) => {
    if (!companyId) return;

    if (!isAdmin) {
      alert(t('notAllowedToggleActive'));
      return;
    }

    const confirmMessage = newActiveState
      ? t('reactivateConfirm')
      : t('confirmDeactivate');

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsTogglingActive(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("staff_profiles")
        .update({ active: newActiveState })
        .eq("profile_id", staffId)
        .eq("company_id", companyId);

      if (error) throw error;

      const { data } = await supabase
        .from("staff_profiles")
        .select("profile_id, auth_user_id, company_id, first_name, last_name, name, role, can_manage, can_clean, can_mechanical, photo_url, phone, email, notes, active")
        .eq("profile_id", staffId)
        .eq("company_id", companyId)
        .single();

      if (data) {
        setMember(data as StaffProfile);
        setFormData(prev => ({ ...prev, active: data.active }));
      }
    } catch (err: any) {
      const errorMessage = newActiveState
        ? t('reactivateFailed')
        : t('errors.deactivateFailed');
      alert(err?.message || errorMessage);
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId || !member) return;

    if (!isAdmin) {
      alert(t('deleteNotAllowed'));
      return;
    }

    if (isViewingOwnProfile) {
      alert(t('deleteSelfNotAllowed'));
      return;
    }

    if (member.active === true) {
      setDeleteError("You can only delete inactive staff members.");
      return;
    }

    let confirmMessage = t('deleteConfirm');

    if (member.auth_user_id) {
      confirmMessage += "\n\n" + t('deleteConfirmLinked');
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("staff_profiles")
        .delete()
        .eq("profile_id", staffId)
        .eq("company_id", companyId);

      if (error) throw error;

      router.push(`/${locale}/staff/team`);
    } catch (err: any) {
      setDeleteError(err?.message || t('deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeLabel = (m: StaffProfile): string => {
    if (m.can_manage) {
      return t('types.manager');
    }

    const capabilities: string[] = [];
    if (m.can_clean) capabilities.push(t('types.cleaner'));
    if (m.can_mechanical) capabilities.push(t('types.mechanical'));

    if (capabilities.length > 0) {
      return capabilities.join(t('joiner'));
    }

    return "";
  };

  const getDisplayName = (m: StaffProfile): string => {
    const fullName = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
    return t('unnamedStaff');
  };

  const capabilities: string[] = [];
  if (member?.can_clean) capabilities.push(t('capabilities.cleaning'));
  if (member?.can_mechanical) capabilities.push(t('capabilities.mechanical'));

  const displayName = member ? getDisplayName(member) : "";

  const showInviteSection = isAdmin && !isEditing && !!member?.email;

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface page-surface">
        <Link
          href={`/${locale}/staff/team`}
          style={{
            fontSize: "14px",
            color: "rgb(var(--brand))",
            textDecoration: "none",
            marginBottom: "var(--space-4)",
            display: "inline-block",
          }}
        >
          {t('backToTeam')}
        </Link>

        {loading && (
          <div style={{ color: "rgb(var(--muted))" }}>
            {t('loading')}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "var(--space-4)",
              background: "rgb(var(--error) / 0.1)",
              border: "1px solid rgb(var(--error) / 0.3)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--error))",
            }}
          >
            {error}
          </div>
        )}

        {deleteError && (
          <div
            style={{
              padding: "var(--space-4)",
              background: "rgb(var(--error) / 0.1)",
              border: "1px solid rgb(var(--error) / 0.3)",
              borderRadius: "var(--radius)",
              color: "rgb(var(--error))",
              marginTop: "var(--space-4)",
            }}
          >
            {deleteError}
          </div>
        )}

        {!loading && !error && member && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
                {member.photo_url && (
                  <Image
                    src={member.photo_url}
                    alt={displayName}
                    width={72}
                    height={72}
                    style={{
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                )}
                <div>
                  <h1 style={{ fontSize: "28px", color: "rgb(var(--text))" }}>
                    {displayName}
                  </h1>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: 4 }}>
                    <p style={{ color: "rgb(var(--muted))", fontSize: "14px" }}>
                      {t('roleLabel')} {member.role}
                    </p>
                    <span style={{
                      fontSize: "12px",
                      padding: "2px 8px",
                      borderRadius: "var(--radius)",
                      background: member.active ? "rgb(var(--success) / 0.1)" : "rgb(var(--error) / 0.1)",
                      color: member.active ? "rgb(var(--success))" : "rgb(var(--error))",
                    }}>
                      {member.active ? t('statusActive') : t('statusInactive')}
                    </span>
                  </div>
                  {getTypeLabel(member) && (
                    <div style={{
                      fontSize: "13px",
                      color: member.can_manage ? "rgb(var(--accent))" : "rgb(var(--muted))",
                      fontWeight: member.can_manage ? 600 : 400,
                      marginTop: 4,
                    }}>
                      {getTypeLabel(member)}
                    </div>
                  )}
                </div>
              </div>
              {isAdmin && !isEditing && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <button
                    onClick={handleEdit}
                    style={{
                      padding: "8px 16px",
                      background: "rgb(var(--brand))",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {t('edit')}
                  </button>
                  {member.active ? (
                    <button
                      onClick={() => handleToggleActive(false)}
                      disabled={isTogglingActive}
                      style={{
                        padding: "8px 16px",
                        background: "rgb(var(--error) / 0.1)",
                        color: "rgb(var(--error))",
                        border: "1px solid rgb(var(--error) / 0.3)",
                        borderRadius: "var(--radius)",
                        cursor: isTogglingActive ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        opacity: isTogglingActive ? 0.6 : 1,
                      }}
                    >
                      {isTogglingActive ? t('deactivating') : t('deactivate')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleActive(true)}
                      disabled={isTogglingActive}
                      style={{
                        padding: "8px 16px",
                        background: "rgb(var(--success) / 0.1)",
                        color: "rgb(var(--success))",
                        border: "1px solid rgb(var(--success) / 0.3)",
                        borderRadius: "var(--radius)",
                        cursor: isTogglingActive ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        opacity: isTogglingActive ? 0.6 : 1,
                      }}
                    >
                      {isTogglingActive ? t('reactivating') : t('reactivate')}
                    </button>
                  )}
                  {!isViewingOwnProfile && member.active === false && (
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      style={{
                        padding: "8px 16px",
                        background: "rgb(var(--error))",
                        color: "white",
                        border: "none",
                        borderRadius: "var(--radius)",
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        opacity: isDeleting ? 0.6 : 1,
                      }}
                    >
                      {isDeleting ? t('deleting') : t('delete')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {!isEditing && (
              <>
                {capabilities.length > 0 && (
                  <div>
                    <div style={{ fontSize: "14px", marginBottom: 6 }}>
                      {t('capabilitiesLabel')}
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {capabilities.map((cap) => (
                        <span
                          key={cap}
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            borderRadius: 9999,
                            background: "rgb(var(--border))",
                          }}
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isAdmin && (member.phone || member.email) && (
                  <div>
                    <div style={{ fontSize: "14px", marginBottom: 6, fontWeight: 500 }}>
                      {t('contactLabel')}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {member.phone && (
                        <div style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                          {t('phoneLabel')} {member.phone}
                        </div>
                      )}
                      {member.email && (
                        <div style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                          {t('emailLabel')} {member.email}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isAdmin && member.notes && (
                  <div>
                    <div style={{ fontSize: "14px", marginBottom: 6, fontWeight: 500 }}>
                      {t('notesLabel')}
                    </div>
                    <div style={{
                      fontSize: "14px",
                      color: "rgb(var(--text))",
                      whiteSpace: "pre-wrap",
                      padding: "var(--space-3)",
                      background: "rgb(var(--border) / 0.3)",
                      borderRadius: "var(--radius)",
                    }}>
                      {member.notes}
                    </div>
                  </div>
                )}

                {showInviteSection && (
                  <div style={{
                    padding: "var(--space-4)",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: "var(--radius)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>
                      {t('loginAccess.title')}
                    </div>

                    {member.auth_user_id ? (
                      <div style={{ fontSize: "13px", color: "rgb(var(--muted))" }}>
                        {t('loginAccess.loginEnabled')}
                      </div>
                    ) : (
                      <div style={{ fontSize: "13px", color: "rgb(var(--muted))" }}>
                        {t('loginAccess.noLoginYet')}
                      </div>
                    )}

                    {inviteSuccess ? (
                      <div style={{
                        padding: "var(--space-3)",
                        background: "rgb(var(--success) / 0.1)",
                        border: "1px solid rgb(var(--success) / 0.3)",
                        borderRadius: "var(--radius)",
                        color: "rgb(var(--success))",
                        fontSize: "14px",
                      }}>
                        {t('loginAccess.inviteSent')}
                      </div>
                    ) : (
                      <>
                        <div>
                          <button
                            onClick={handleInvite}
                            disabled={isInviting}
                            style={{
                              padding: "8px 16px",
                              background: "rgb(var(--brand))",
                              color: "white",
                              border: "none",
                              borderRadius: "var(--radius)",
                              cursor: isInviting ? "not-allowed" : "pointer",
                              fontSize: "14px",
                              opacity: isInviting ? 0.6 : 1,
                            }}
                          >
                            {isInviting
                              ? t('loginAccess.sending')
                              : member.auth_user_id
                              ? t('loginAccess.resendAccess')
                              : t('loginAccess.enableLogin')}
                          </button>
                        </div>

                        {recoveryLink && (
                          <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "var(--space-2)",
                            padding: "var(--space-3)",
                            background: "rgb(var(--border) / 0.3)",
                            borderRadius: "var(--radius)",
                            border: "1px solid rgb(var(--border))",
                          }}>
                            <div style={{ fontSize: "13px", fontWeight: 500 }}>
                              {t('loginAccess.recoveryLinkTitle')}
                            </div>
                            <code style={{
                              fontSize: "12px",
                              wordBreak: "break-all",
                              color: "rgb(var(--text))",
                              background: "rgb(var(--border) / 0.5)",
                              padding: "var(--space-2)",
                              borderRadius: "var(--radius)",
                              display: "block",
                            }}>
                              {recoveryLink}
                            </code>
                            <button
                              onClick={handleCopyLink}
                              style={{
                                alignSelf: "flex-start",
                                padding: "6px 14px",
                                background: copiedLink ? "rgb(var(--success) / 0.1)" : "rgb(var(--border))",
                                color: copiedLink ? "rgb(var(--success))" : "rgb(var(--text))",
                                border: copiedLink
                                  ? "1px solid rgb(var(--success) / 0.3)"
                                  : "1px solid rgb(var(--border))",
                                borderRadius: "var(--radius)",
                                cursor: "pointer",
                                fontSize: "13px",
                              }}
                            >
                              {copiedLink ? t('loginAccess.copied') : t('loginAccess.copyLink')}
                            </button>
                          </div>
                        )}

                        {inviteError && (
                          <div style={{
                            padding: "var(--space-3)",
                            background: "rgb(var(--error) / 0.1)",
                            border: "1px solid rgb(var(--error) / 0.3)",
                            borderRadius: "var(--radius)",
                            color: "rgb(var(--error))",
                            fontSize: "14px",
                          }}>
                            {inviteError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {isEditing && (
              <StaffMemberEditForm
                formData={formData}
                setFormData={setFormData}
                isSaving={isSaving}
                saveError={saveError}
                isUploading={isUploading}
                uploadError={uploadError}
                onSave={handleSave}
                onCancel={handleCancel}
                onRoleChange={handleRoleChange}
                onFileUpload={handleFileUpload}
              />
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}