"use client";

import { type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

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

interface StaffMemberEditFormProps {
  formData: StaffFormData;
  setFormData: React.Dispatch<React.SetStateAction<StaffFormData>>;
  isSaving: boolean;
  saveError: string;
  isUploading: boolean;
  uploadError: string;
  onSave: () => void;
  onCancel: () => void;
  onRoleChange: (newRole: string) => void;
  onFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
}

export default function StaffMemberEditForm({
  formData,
  setFormData,
  isSaving,
  saveError,
  isUploading,
  uploadError,
  onSave,
  onCancel,
  onRoleChange,
  onFileUpload,
}: StaffMemberEditFormProps) {
  const t = useTranslations("staffTeamMember");

  return (
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
          {t("fields.firstName")}
        </label>
        <input
          type="text"
          value={formData.first_name}
          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
          required
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
          {t("fields.lastName")}
        </label>
        <input
          type="text"
          value={formData.last_name}
          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          required
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
          {t("fields.role")}
        </label>
        <select
          value={formData.role}
          onChange={(e) => onRoleChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid rgb(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: "14px",
          }}
        >
          <option value="staff">{t("roles.staff")}</option>
          <option value="admin">{t("roles.management")}</option>
        </select>
      </div>

      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", cursor: "not-allowed", opacity: 0.6 }}>
          <input
            type="checkbox"
            checked={formData.can_manage}
            disabled={true}
            style={{ cursor: "not-allowed" }}
          />
          {t("fields.canManage")}
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
          {t("fields.canClean")}
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
          {t("fields.canMechanical")}
        </label>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "14px", marginBottom: 6 }}>
          {t("fields.phone")}
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
          {t("fields.email")}
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
          {t("fields.uploadPhoto")}
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={onFileUpload}
          disabled={isUploading}
          style={{
            fontSize: "14px",
            cursor: isUploading ? "not-allowed" : "pointer",
          }}
        />
        {isUploading && (
          <div style={{ fontSize: "12px", color: "rgb(var(--muted))", marginTop: 4 }}>
            {t("uploading")}
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
          {t("fields.photoUrl")}
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
          {t("fields.notes")}
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

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
        <button
          onClick={onSave}
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
          {isSaving ? t("saving") : t("save")}
        </button>
        <button
          onClick={onCancel}
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
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}