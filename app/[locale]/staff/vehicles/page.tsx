// app/[locale]/staff/vehicles/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";
import { getStatusChipStyle } from "@/lib/statusChip";

interface Vehicle {
  id: string;
  name: string;
  registration_plate: string;
  photo_url: string | null;
  status: 'ready' | 'preparing' | 'on_rent';
  created_at: string;
  updated_at: string;
}

export default function VehiclesPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("staffVehicles");
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    checkUserCapabilities();
  }, []);

  useEffect(() => {
    if (canManage !== null) {
      fetchVehicles();
    }
  }, [canManage]);

  const checkUserCapabilities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(t("errors.notAuthenticated"));
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('role, can_manage')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      setCanManage(profile ? (profile.role === 'admin' || profile.can_manage === true) : false);
    } catch (err: any) {
      setError(err.message || t("errors.failedCheckPermissions"));
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      setVehicles(data || []);
    } catch (err: any) {
      setError(err.message || t("errors.failedLoadVehicles"));
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready':
        return t("status.ready");
      case 'preparing':
        return t("status.preparing");
      case 'on_rent':
        return t("status.onRent");
      default:
        return status;
    }
  };

  return (
    <PageContainer maxWidth="1400px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-4)'
          }}>
            <div>
              <Link 
                href={`/${locale}/staff`}
                style={{
                  fontSize: '14px',
                  color: 'rgb(var(--brand))',
                  textDecoration: 'none',
                  marginBottom: 'var(--space-2)',
                  display: 'inline-block'
                }}
              >
                {t("navigation.backToDashboard")}
              </Link>
              <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
                {t("title")}
              </h1>
              <p style={{ marginTop: 'var(--space-2)', color: 'rgb(var(--muted))' }}>
                {t("subtitle")}
              </p>
            </div>
            {canManage && (
              <Link 
                href={`/${locale}/staff/vehicles/new`}
                className="btn btn-primary"
              >
                {t("actions.addVehicle")}
              </Link>
            )}
          </div>

          {/* Error State */}
          {error && (
            <div style={{ 
              padding: 'var(--space-4)',
              background: 'rgb(var(--error) / 0.1)',
              border: '1px solid rgb(var(--error) / 0.3)',
              borderRadius: 'var(--radius)',
              color: 'rgb(var(--error))',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div style={{ 
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              {t("loading")}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && vehicles.length === 0 && (
            <div style={{ 
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              <p style={{ marginBottom: 'var(--space-4)' }}>
                {t("empty.noVehicles")}{canManage && t("empty.addFirstVehicle")}
              </p>
              {canManage && (
                <Link 
                  href={`/${locale}/staff/vehicles/new`}
                  className="btn btn-primary"
                >
                  {t("actions.addVehicle")}
                </Link>
              )}
            </div>
          )}

          {/* Vehicles List */}
          {!loading && !error && vehicles.length > 0 && (
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)'
            }}>
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="surface"
                  style={{
                    padding: 'var(--space-4)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: '200px' }}>
                    {/* Vehicle Photo/Placeholder */}
                    {vehicle.photo_url ? (
                      <img
                        src={vehicle.photo_url}
                        alt={vehicle.name}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius)',
                          objectFit: 'cover',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius)',
                          background: 'rgb(var(--muted) / 0.2)',
                          border: '1px solid rgb(var(--border))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgb(var(--muted))"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      </div>
                    )}
                    
                    {/* Vehicle Details */}
                    <div style={{ flex: 1 }}>
                      <h3 style={{ 
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'rgb(var(--text))',
                        marginBottom: 'var(--space-1)'
                      }}>
                        {vehicle.name}
                      </h3>
                      <p style={{ 
                        fontSize: '14px',
                        color: 'rgb(var(--muted))'
                      }}>
                        {vehicle.registration_plate}
                      </p>
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap'
                  }}>
                    <span style={getStatusChipStyle(vehicle.status)}>
                      {getStatusLabel(vehicle.status)}
                    </span>
                    
                    <Link
                      href={canManage ? `/${locale}/staff/vehicles/${vehicle.id}/edit` : `/${locale}/staff/vehicles/${vehicle.id}`}
                      className="btn btn-secondary"
                      style={{
                        padding: 'var(--space-2) var(--space-4)',
                        fontSize: '14px',
                        minHeight: '36px'
                      }}
                    >
                      {canManage ? t("buttons.edit") : t("buttons.view")}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}