"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageContainer from "../../../components/PageContainer";
import { createClient } from "../../../lib/supabase/client";
import { useTheme } from "../../../contexts/ThemeContext";

export default function CompanySettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { company, loading: themeLoading, refreshCompany } = useTheme();

  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    primary_color: "#368F8B",
    secondary_color: "#BC8235",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const loadStaffProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('staff_profiles')
          .select('role, can_manage')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        
        if (profile) {
          setIsAdmin(profile.role === 'admin' || profile.can_manage === true);
        }
      }
    };

    loadStaffProfile();
  }, [supabase]);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name,
        logo_url: company.logo_url || "",
        primary_color: company.primary_color,
        secondary_color: company.secondary_color,
      });
      setLogoPreview(company.logo_url);
      setLoading(false);
    } else if (!themeLoading) {
      setLoading(false);
      setError("Company settings could not be loaded. Please refresh.");
    }
  }, [company, themeLoading]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (PNG, JPG, or SVG)');
        return;
      }
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo file must be less than 2MB');
        return;
      }

      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile || !company) return null;

    try {
      setUploadingLogo(true);
      
      // Generate unique filename
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${company.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('company-logos')
        .upload(filePath, logoFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err: any) {
      console.error('Logo upload error:', err);
      setError(err.message || 'Failed to upload logo');
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);

    // Basic validation
    if (!formData.name.trim()) {
      setError("Company name is required");
      setSaving(false);
      return;
    }

    console.log("Company details being submitted:", formData);

    try {
      let finalLogoUrl = formData.logo_url;

      // Upload new logo if selected
      if (logoFile) {
        const uploadedUrl = await uploadLogo();
        if (uploadedUrl) {
          finalLogoUrl = uploadedUrl;
        } else {
          setSaving(false);
          return; // Error already set in uploadLogo
        }
      }

      // Update company settings
      const { error } = await supabase
        .from('companies')
        .update({
          name: formData.name.trim(),
          logo_url: finalLogoUrl || null,
          primary_color: formData.primary_color,
          secondary_color: formData.secondary_color,
        })
        .eq('id', company?.id);

      if (error) {
        throw error;
      }

      // Refresh theme context
      await refreshCompany();
      
      setSuccess(true);
      setLogoFile(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || "Failed to save company settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="900px">
        <div className="surface" style={{ padding: 'var(--space-8)' }}>
          <div style={{ textAlign: 'center', color: 'rgb(var(--muted))' }}>
            Loading company settings...
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="900px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {/* Header */}
          <div>
            <Link 
              href="/staff"
              style={{
                fontSize: '14px',
                color: 'rgb(var(--brand))',
                textDecoration: 'none',
                marginBottom: 'var(--space-2)',
                display: 'inline-block'
              }}
            >
              ← Back to dashboard
            </Link>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
              Company Settings
            </h1>
            <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
              {isAdmin ? 'Customize your company branding and appearance' : 'View company branding and appearance'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-8)' 
          }}>
            {/* Company Name */}
            <div>
              <h2 style={{ fontSize: '20px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                Company Information
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="name" className="label">
                    Company name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    className="input"
                    placeholder="Your company name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled={!isAdmin}
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                </div>
              </div>
            </div>

            {/* Logo Upload */}
            <div>
              <h2 style={{ fontSize: '20px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                Company Logo
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {logoPreview && (
                  <div style={{
                    width: '200px',
                    height: '80px',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--space-3)',
                    background: 'rgb(var(--surface))'
                  }}>
                    <img 
                      src={logoPreview} 
                      alt="Logo preview" 
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
                {isAdmin && (
                  <div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      onChange={handleLogoChange}
                      style={{ display: 'none' }}
                      id="logo-upload"
                    />
                    <label htmlFor="logo-upload" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                      {logoPreview ? 'Change logo' : 'Upload logo'}
                    </label>
                    <p className="helper-text" style={{ marginTop: 'var(--space-2)' }}>
                      PNG, JPG, or SVG. Max 2MB. Recommended: 200x80px
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Colors */}
            <div>
              <h2 style={{ fontSize: '20px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                Brand Colors
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                {/* Primary Color */}
                <div>
                  <label htmlFor="primary_color" className="label">
                    Primary color
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                    <input
                      type="color"
                      id="primary_color"
                      name="primary_color"
                      value={formData.primary_color}
                      onChange={handleChange}
                      disabled={!isAdmin}
                      style={{ 
                        width: '60px', 
                        height: '44px', 
                        border: '1px solid rgb(var(--border))',
                        borderRadius: 'var(--radius)',
                        cursor: isAdmin ? 'pointer' : 'not-allowed'
                      }}
                    />
                    <input
                      type="text"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                      className="input"
                      disabled={!isAdmin}
                      style={{ flex: 1 }}
                      placeholder="#368F8B"
                    />
                  </div>
                  <p className="helper-text">Used for buttons and links</p>
                </div>

                {/* Secondary Color */}
                <div>
                  <label htmlFor="secondary_color" className="label">
                    Secondary color
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                    <input
                      type="color"
                      id="secondary_color"
                      name="secondary_color"
                      value={formData.secondary_color}
                      onChange={handleChange}
                      disabled={!isAdmin}
                      style={{ 
                        width: '60px', 
                        height: '44px', 
                        border: '1px solid rgb(var(--border))',
                        borderRadius: 'var(--radius)',
                        cursor: isAdmin ? 'pointer' : 'not-allowed'
                      }}
                    />
                    <input
                      type="text"
                      value={formData.secondary_color}
                      onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                      className="input"
                      disabled={!isAdmin}
                      style={{ flex: 1 }}
                      placeholder="#BC8235"
                    />
                  </div>
                  <p className="helper-text">Used for accents and highlights</p>
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div>
              <h2 style={{ fontSize: '20px', marginBottom: 'var(--space-4)', color: 'rgb(var(--text))' }}>
                Preview
              </h2>
              <div className="surface" style={{ padding: 'var(--space-6)' }}>
                {/* Header Preview */}
                <div style={{
                  background: 'white',
                  border: '1px solid rgb(var(--border))',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius)',
                  marginBottom: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)'
                }}>
                  {logoPreview && (
                    <img src={logoPreview} alt="Logo" style={{ height: '32px', maxWidth: '120px', objectFit: 'contain' }} />
                  )}
                  <span style={{ color: 'rgb(var(--text))', fontWeight: 600 }}>
                    {formData.name || 'Your Company'}
                  </span>
                </div>

                {/* Buttons Preview */}
                <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <div style={{
                    padding: 'var(--space-3) var(--space-6)',
                    background: formData.primary_color,
                    color: 'white',
                    borderRadius: 'var(--radius)',
                    fontWeight: 500,
                    fontSize: '15px'
                  }}>
                    Primary Button
                  </div>
                  <div style={{
                    padding: 'var(--space-3) var(--space-6)',
                    background: 'white',
                    color: formData.primary_color,
                    border: `1px solid ${formData.primary_color}`,
                    borderRadius: 'var(--radius)',
                    fontWeight: 500,
                    fontSize: '15px'
                  }}>
                    Secondary Button
                  </div>
                </div>

                {/* Status Badges Preview */}
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: `${formData.primary_color}15`,
                    color: formData.primary_color,
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    fontWeight: 500
                  }}>
                    On rent
                  </div>
                  <div style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: `${formData.secondary_color}15`,
                    color: formData.secondary_color,
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    fontWeight: 500
                  }}>
                    Needs cleaning
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div style={{ 
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--error) / 0.1)',
                border: '1px solid rgb(var(--error) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--error))',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{ 
                padding: 'var(--space-3) var(--space-4)',
                background: 'rgb(var(--success) / 0.1)',
                border: '1px solid rgb(var(--success) / 0.3)',
                borderRadius: 'var(--radius)',
                color: 'rgb(var(--success))',
                fontSize: '14px'
              }}>
                Company settings saved successfully!
              </div>
            )}

            {/* Save Button - Only show for admin */}
            {isAdmin && (
              <div style={{ 
                display: 'flex',
                gap: 'var(--space-3)',
                paddingTop: 'var(--space-2)'
              }}>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={saving || uploadingLogo}
                  style={{ 
                    opacity: (saving || uploadingLogo) ? 0.6 : 1,
                    cursor: (saving || uploadingLogo) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : uploadingLogo ? 'Uploading logo...' : 'Save changes'}
                </button>
                <Link 
                  href="/staff"
                  className="btn btn-secondary"
                >
                  Cancel
                </Link>
              </div>
            )}
          </form>
        </div>
      </div>
    </PageContainer>
  );
}