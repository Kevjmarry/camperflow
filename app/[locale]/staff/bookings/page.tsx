"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageContainer from "@/components/PageContainer";
import { createClient } from "@/lib/supabase/client";

interface Booking {
  id: string;
  booking_number?: string;
  status: string;
  pickup_at: string;
  return_at: string;
  vehicle_id: string | null;
  customer_name?: string;
  customer_phone?: string;
  vehicles?: {
    name: string;
  } | null;
  vehicle_name?: string;
}

export default function BookingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("bookings");
  const supabase = createClient();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    checkUserCapabilities();
  }, []);

  useEffect(() => {
    if (canManage !== null) {
      fetchBookings();
    }
  }, [statusFilter, canManage]);

  const checkUserCapabilities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(t("error.notAuthenticated"));
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('can_manage, role')
        .eq('auth_user_id', user.id)
        .single();

      setCanManage(profile?.can_manage ?? false);
      setIsAdmin(profile?.role === 'admin');
    } catch (err: any) {
      setError(err.message || t("error.permissionsFailed"));
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError("");

      if (canManage) {
        let query = supabase
          .from('bookings')
          .select('*, vehicles(name)')
          .order('pickup_at', { ascending: false });

        if (statusFilter === 'pending') {
          query = query.eq('status', 'draft');
        } else if (statusFilter === 'confirmed') {
          query = query.in('status', ['confirmed', 'blocked']);
        } else if (statusFilter === 'on_rent') {
          query = query.eq('status', 'on_rent');
        } else if (statusFilter === 'completed') {
          query = query.eq('status', 'completed');
        } else if (statusFilter === 'cancelled') {
          query = query.eq('status', 'cancelled');
        }

        const { data, error } = await query;

        if (error) throw error;
        setBookings(data || []);
      } else {
        const { data, error } = await supabase.rpc('list_staff_bookings_redacted');

        if (error) throw error;
        
        let filtered = data || [];
        if (statusFilter === 'pending') {
          filtered = filtered.filter((b: Booking) => b.status === 'draft');
        } else if (statusFilter === 'confirmed') {
          filtered = filtered.filter((b: Booking) => ['confirmed', 'blocked'].includes(b.status));
        } else if (statusFilter === 'on_rent') {
          filtered = filtered.filter((b: Booking) => b.status === 'on_rent');
        } else if (statusFilter === 'completed') {
          filtered = filtered.filter((b: Booking) => b.status === 'completed');
        } else if (statusFilter === 'cancelled') {
          filtered = filtered.filter((b: Booking) => b.status === 'cancelled');
        }

        const vehicleIds = [...new Set(filtered.map((b: Booking) => b.vehicle_id).filter(Boolean))];
        if (vehicleIds.length > 0) {
          const { data: vehicles } = await supabase
            .from('vehicles')
            .select('id, name')
            .in('id', vehicleIds);

          const vehicleMap = new Map(vehicles?.map(v => [v.id, v.name]) || []);
          filtered = filtered.map((b: Booking) => ({
            ...b,
            vehicle_name: b.vehicle_id ? vehicleMap.get(b.vehicle_id) : null
          }));
        }
        
        setBookings(filtered);
      }
    } catch (err: any) {
      setError(err.message || t("error.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'rgb(var(--muted))';
      case 'confirmed': return 'rgb(var(--brand))';
      case 'blocked': return 'rgb(var(--error))';
      case 'on_rent': return 'rgb(var(--success))';
      case 'completed': return 'rgb(var(--accent))';
      case 'cancelled': return 'rgb(var(--error))';
      default: return 'rgb(var(--text))';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return t("statusLabels.draft");
      case 'confirmed': return t("statusLabels.confirmed");
      case 'blocked': return t("statusLabels.blocked");
      case 'on_rent': return t("statusLabels.onRent");
      case 'completed': return t("statusLabels.completed");
      case 'cancelled': return t("statusLabels.cancelled");
      default: return status;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(t("date.locale"), {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getVehicleName = (booking: Booking) => {
    if (canManage) {
      return booking.vehicles?.name || <span style={{ color: 'rgb(var(--muted))' }}>{t("unassigned")}</span>;
    } else {
      return booking.vehicle_name || <span style={{ color: 'rgb(var(--muted))' }}>{t("unassigned")}</span>;
    }
  };

  return (
    <PageContainer maxWidth="1200px">
      <div className="surface" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
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
                {t("backToDashboardArrow")}
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
                href={`/${locale}/staff/bookings/new`}
                className="btn btn-primary"
              >
                {t("action.newBooking")}
              </Link>
            )}
          </div>

          <div style={{ 
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid rgb(var(--border))'
          }}>
            <div>
              <label htmlFor="status-filter" style={{ fontSize: '14px', color: 'rgb(var(--muted))', marginRight: 'var(--space-2)' }}>
                {t("filter.statusLabel")}
              </label>
              <select
                id="status-filter"
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: 'auto', minHeight: '36px', padding: 'var(--space-2) var(--space-3)' }}
              >
                <option value="all">{t("filter.all")}</option>
                <option value="pending">{t("filter.pending")}</option>
                <option value="confirmed">{t("filter.confirmed")}</option>
                <option value="on_rent">{t("filter.onRent")}</option>
                <option value="completed">{t("filter.completed")}</option>
                <option value="cancelled">{t("filter.cancelled")}</option>
              </select>
            </div>
          </div>

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

          {loading && (
            <div style={{ 
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              {t("loading")}
            </div>
          )}

          {!loading && !error && bookings.length === 0 && (
            <div style={{ 
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'rgb(var(--muted))'
            }}>
              <p style={{ marginBottom: 'var(--space-4)' }}>
                {t("empty")}{canManage && t("emptyAdminSuffix")}
              </p>
              {canManage && (
                <Link 
                  href={`/${locale}/staff/bookings/new`}
                  className="btn btn-primary"
                >
                  {t("action.newBooking")}
                </Link>
              )}
            </div>
          )}

          {!loading && !error && bookings.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '14px'
              }}>
                <thead>
                  <tr style={{ 
                    borderBottom: '1px solid rgb(var(--border))',
                    textAlign: 'left'
                  }}>
                    {canManage && (
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.bookingNumber")}
                      </th>
                    )}
                    {canManage && (
                      <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                        {t("table.customer")}
                      </th>
                    )}
                    <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {t("table.vehicle")}
                    </th>
                    <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {t("table.pickup")}
                    </th>
                    <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {t("table.return")}
                    </th>
                    <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {t("table.status")}
                    </th>
                    <th style={{ padding: 'var(--space-3)', fontWeight: 600, color: 'rgb(var(--text))' }}>
                      {t("table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr 
                      key={booking.id}
                      style={{ borderBottom: '1px solid rgb(var(--border))' }}
                    >
                      {canManage && (
                        <td style={{ padding: 'var(--space-3)', fontWeight: 500, color: 'rgb(var(--text))' }}>
                          {booking.booking_number}
                        </td>
                      )}
                      {canManage && (
                        <td style={{ padding: 'var(--space-3)' }}>
                          <div style={{ color: 'rgb(var(--text))' }}>{booking.customer_name || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}</div>
                          <div style={{ fontSize: '13px', color: 'rgb(var(--muted))' }}>{booking.customer_phone || <span style={{ color: 'rgb(var(--muted))' }}>{t("placeholder.dash")}</span>}</div>
                        </td>
                      )}
                      <td style={{ padding: 'var(--space-3)', color: 'rgb(var(--text))' }}>
                        {getVehicleName(booking)}
                      </td>
                      <td style={{ padding: 'var(--space-3)', color: 'rgb(var(--text))' }}>
                        {formatDate(booking.pickup_at)}
                      </td>
                      <td style={{ padding: 'var(--space-3)', color: 'rgb(var(--text))' }}>
                        {formatDate(booking.return_at)}
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <div style={{
                          display: 'inline-block',
                          padding: 'var(--space-1) var(--space-2)',
                          borderRadius: 'var(--radius)',
                          background: `${getStatusColor(booking.status)}15`,
                          color: getStatusColor(booking.status),
                          fontSize: '13px',
                          fontWeight: 500
                        }}>
                          {getStatusLabel(booking.status)}
                        </div>
                      </td>
                      <td style={{ padding: 'var(--space-3)' }}>
                        <Link
                          href={`/${locale}/staff/bookings/${booking.id}`}
                          className="btn btn-secondary"
                          style={{
                            padding: 'var(--space-1) var(--space-3)',
                            fontSize: '13px',
                            minHeight: '32px'
                          }}
                        >
                          {isAdmin ? t("action.edit") : t("action.view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}