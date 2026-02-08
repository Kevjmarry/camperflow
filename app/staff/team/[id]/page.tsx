"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PageContainer from "../../../../components/PageContainer";
import { createClient } from "../../../../lib/supabase/client";

interface StaffProfile {
  id: string;
  auth_user_id: string;
  company_id: string;
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

interface FormData {
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
  const supabase = createClient();
  const params = useParams();
  const staffId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [member, setMember] = useState<StaffProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [formData, setFormData] = useState<FormData>({
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

        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes?.user) {
          setError("Not authenticated");
          return;
        }

        // Check if current user is admin using auth_user_id
        const { data: currentUserProfile } = await supabase
          .from("staff_profiles")
          .select("role")
          .eq("auth_user_id", userRes.user.id)
          .single();

        if (currentUserProfile) {
          setIsAdmin(currentUserProfile.role === "admin");
        }

        // Fetch staff member details
        const { data, error } = await supabase
          .from("staff_profiles")
          .select("id, auth_user_id, company_id, name, role, can_manage, can_clean, can_mechanical, photo_url, phone, email, notes, active")
          .eq("id", staffId)
          .single();

        if (error) throw error;

        setMember(data as StaffProfile);
        
        // Initialize form data
        setFormData({
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
        setError(err?.message || "Failed to load staff member");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [supabase, staffId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('staffId', staffId);

      const response = await fetch('/api/staff/upload-photo', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setFormData(prev => ({ ...prev, photo_url: data.publicUrl }));
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload photo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setSaveError("");
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSaveError("");
    setUploadError("");
    // Reset form to current member values
    if (member) {
      setFormData({
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
    setIsSaving(true);
    setSaveError("");

    try {
      const canManageValue = formData.role === "admin";

      const { error } = await supabase
        .from("staff_profiles")
        .update({
          name: formData.name || null,
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
        .eq("id", staffId);

      if (error) throw error;

      // Refresh member data
      const { data } = await supabase
        .from("staff_profiles")
        .select("id, auth_user_id, company_id, name, role, can_manage, can_clean, can_mechanical, photo_url, phone, email, notes, active")
        .eq("id", staffId)
        .single();

      if (data) {
        setMember(data as StaffProfile);
      }

      setIsEditing(false);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Deactivate this staff member? They will no longer appear as active.")) {
      return;
    }

    setIsDeactivating(true);

    try {
      const { error } = await supabase
        .from("staff_profiles")
        .update({ active: false })
        .eq("id", staffId);

      if (error) throw error;

      // Refresh member data
      const { data } = await supabase
        .from("staff_profiles")
        .select("id, auth_user_id, company_id, name, role, can_manage, can_clean, can_mechanical, photo_url, phone, email, notes, active")
        .eq("id", staffId)
        .single();

      if (data) {
        setMember(data as StaffProfile);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to deactivate staff member");
    } finally {
      setIsDeactivating(false);
    }
  };

  const getTypeLabel = (m: StaffProfile): string => {
    if (m.can_manage) {
      return "Manager";
    }
    
    const capabilities: string[] = [];
    if (m.can_clean) capabilities.push("Cleaner");
    if (m.can_mechanical) capabilities.push("Mechanical");
    
    if (capabilities.length > 0) {
      return capabilities.join(" + ");
    }
    
    return "";
  };

  const capabilities: string[] = [];
  if (member?.can_clean) capabilities.push("Cleaning");
  if (member?.can_mechanical) capabilities.push("Mechanical");

  return (
    <PageContainer maxWidth="700px">
      <div className="surface" style={{ padding: "var(--space-8)" }}>
        <Link
          href="/staff/team"
          style={{
            fontSize: "14px",
            color: "rgb(var(--brand))",
            textDecoration: "none",
            marginBottom: "var(--space-4)",
            display: "inline-block",
          }}
        >
          ← Back to staff team
        </Link>

        {loading && (
          <div style={{ color: "rgb(var(--muted))" }}>
            Loading staff member…
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

        {!loading && !error && member && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
                {member.photo_url && (
                  <Image
                    src={member.photo_url}
                    alt={member.name || "Staff photo"}
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
                    {member.name || member.role}
                  </h1>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: 4 }}>
                    <p style={{ color: "rgb(var(--muted))", fontSize: "14px" }}>
                      Role: {member.role}
                    </p>
                    {!member.active && (
                      <span style={{
                        fontSize: "12px",
                        padding: "2px 8px",
                        borderRadius: "var(--radius)",
                        background: "rgb(var(--error) / 0.1)",
                        color: "rgb(var(--error))",
                      }}>
                        Inactive
                      </span>
                    )}
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
                    Edit
                  </button>
                  {member.active && (
                    <button
                      onClick={handleDeactivate}
                      disabled={isDeactivating}
                      style={{
                        padding: "8px 16px",
                        background: "rgb(var(--error) / 0.1)",
                        color: "rgb(var(--error))",
                        border: "1px solid rgb(var(--error) / 0.3)",
                        borderRadius: "var(--radius)",
                        cursor: isDeactivating ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        opacity: isDeactivating ? 0.6 : 1,
                      }}
                    >
                      {isDeactivating ? "Deactivating..." : "Deactivate staff"}
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
                      Capabilities
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
                      Contact
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {member.phone && (
                        <div style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                          Phone: {member.phone}
                        </div>
                      )}
                      {member.email && (
                        <div style={{ fontSize: "14px", color: "rgb(var(--text))" }}>
                          Email: {member.email}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isAdmin && member.notes && (
                  <div>
                    <div style={{ fontSize: "14px", marginBottom: 6, fontWeight: 500 }}>
                      Notes
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
              </>
            )}

            {isEditing && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {saveError && (
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
                    {saveError}
                  </div>
                )}

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                    }}
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Management</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Photo URL
                  </label>
                  <input
                    type="text"
                    value={formData.photo_url}
                    onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Upload Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    style={{
                      fontSize: "14px",
                      cursor: isUploading ? "not-allowed" : "pointer",
                    }}
                  />
                  {isUploading && (
                    <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginTop: 4 }}>
                      Uploading…
                    </div>
                  )}
                  {uploadError && (
                    <div style={{ fontSize: "12px", color: "rgb(var(--error))", marginTop: 4 }}>
                      {uploadError}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Phone
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: "14px",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      style={{ cursor: "pointer" }}
                    />
                    Active
                  </label>
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", cursor: "not-allowed", opacity: 0.6 }}>
                    <input
                      type="checkbox"
                      checked={formData.can_manage}
                      disabled={true}
                      style={{ cursor: "not-allowed" }}
                    />
                    Can manage (auto-set by role)
                  </label>
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.can_clean}
                      onChange={(e) => setFormData({ ...formData, can_clean: e.target.checked })}
                      style={{ cursor: "pointer" }}
                    />
                    Can clean
                  </label>
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.can_mechanical}
                      onChange={(e) => setFormData({ ...formData, can_mechanical: e.target.checked })}
                      style={{ cursor: "pointer" }}
                    />
                    Can mechanical
                  </label>
                </div>

                <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{
                      padding: "10px 20px",
                      background: "rgb(var(--brand))",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius)",
                      cursor: isSaving ? "not-allowed" : "pointer",
                      fontSize: "14px",
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    style={{
                      padding: "10px 20px",
                      background: "rgb(var(--border))",
                      color: "rgb(var(--text))",
                      border: "none",
                      borderRadius: "var(--radius)",
                      cursor: isSaving ? "not-allowed" : "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}