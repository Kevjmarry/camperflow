"use client";

import { useState } from "react";
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
  /** Computed from ops_bookings.operational_status — checklist-driven source of truth. */
  operationalStatus?: string | null;
  /** True when the booking status write failed silently after handover completion. */
  statusSyncFailed?: boolean;
}

export function BookingSummaryCard({ booking, selectedVehicle, locale, t, operationalStatus, statusSyncFailed }: Props) {
  const [syncWarningDismissed, setSyncWarningDismissed] = useState(false);

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

  const effectiveStatus = (operationalStatus as BookingStatus | null) ?? booking.status;
  const statusDiffers = operationalStatus != null && operationalStatus !== booking.status;
  const statusNote = statusDiffers
    ? operationalStatus === 'on_rent'
      ? t('status.basedOnHandover')
      : operationalStatus === 'completed'
      ? t('status.basedOnReturn')
      : null
    : null;

  const showSyncWarning = statusSyncFailed && !syncWarningDismissed;

  return (
    <div>
      {showSyncWarning && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-4)',
          background: 'rgb(var(--warning) / 0.1)',
          border: '1px solid rgb(var(--warning) / 0.35)',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          color: 'rgb(var(--text))',
        }}>
          <span style={{ color: 'rgb(var(--warning))', fontWeight: 600, flexShrink: 0 }}>⚠</span>
          <span style={{ flex: 1 }}>{t('status.syncFailed')}</span>
          <button
            type="button"
            onClick={() => setSyncWarningDismissed(true)}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'rgb(var(--muted))',
              padding: '0 var(--space-1)',
            }}
          >
            {t('status.syncFailedDismiss')}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '28px', color: 'rgb(var(--text))' }}>
          {booking.booking_number}
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '6px' }}>
          <span style={getStatusChipStyle(effectiveStatus)}>
            {getStatusLabel(effectiveStatus)}
          </span>
          {statusNote && (
            <span style={{ fontSize: '11px', color: 'rgb(var(--muted))', lineHeight: 1.3 }}>
              {statusNote}
            </span>
          )}
        </div>
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