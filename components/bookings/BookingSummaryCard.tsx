"use client";

import { getStatusChipStyle } from "@/lib/statusChip";

export type BookingStatus = 'draft' | 'confirmed' | 'blocked' | 'on_rent' | 'completed' | 'cancelled';
export type VehicleStatus = 'ready' | 'preparing' | 'on_rent';

export interface BookingSummaryVehicle {
  id: string;
  name: string;
  registration_plate: string;
  status: VehicleStatus | null;
}

export interface BookingSummaryBooking {
  booking_number: string;
  status: BookingStatus;
  pickup_at: string;
  return_at: string;
  customer_name: string;
}

interface Props {
  booking: BookingSummaryBooking;
  selectedVehicle: BookingSummaryVehicle | null;
  locale: string;
  t: (key: string) => string;
}

export function BookingSummaryCard({ booking, selectedVehicle, locale, t }: Props) {
  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getStatusLabel = (status: BookingStatus) => {
    switch (status) {
      case 'draft':      return t("status.pending");
      case 'confirmed':  return t("status.confirmed");
      case 'blocked':    return t("status.blocked");
      case 'on_rent':    return t("status.onRent");
      case 'completed':  return t("status.completed");
      case 'cancelled':  return t("status.cancelled");
    }
  };

  const getVehicleStatusLabel = (status: VehicleStatus): string => {
    switch (status) {
      case 'ready':     return t("vehicle.status.ready");
      case 'preparing': return t("vehicle.status.preparing");
      case 'on_rent':   return t("vehicle.status.onRent");
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
          {booking.booking_number}
        </h1>
        <span style={getStatusChipStyle(booking.status)}>
          {getStatusLabel(booking.status)}
        </span>
      </div>
      <div style={{
        marginTop: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        color: 'rgb(var(--muted))',
        fontSize: '14px'
      }}>
        <div>
          {t("summary.customer")}:{' '}
          <span style={{ color: 'rgb(var(--text))' }}>{booking.customer_name?.replace(/^(\[\?\]|\?)\s*/, '').trim() || "-"}</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span>{t("summary.vehicle")}:</span>{' '}
          {selectedVehicle ? (
            <span style={{ color: 'rgb(var(--text))' }}>
              {selectedVehicle.name} ({selectedVehicle.registration_plate})
            </span>
          ) : (
            <span style={{ color: 'rgb(var(--text))' }}>{t("vehicle.unassigned")}</span>
          )}
        </div>
        <div>
          {t("summary.pickup")}:{' '}
          <span style={{ color: 'rgb(var(--text))' }}>{formatDate(booking.pickup_at)}</span>
        </div>
        <div>
          {t("summary.return")}:{' '}
          <span style={{ color: 'rgb(var(--text))' }}>{formatDate(booking.return_at)}</span>
        </div>
      </div>
    </div>
  );
}