export type ImportSourceType =
  | "bookingmood_csv"
  | "bookingmood_json"
  | "generic_csv"
  | "generic_json"
  | "ical";

export type ImportJobStatus =
  | "uploaded"
  | "parsed"
  | "processed"
  | "failed";

export type ImportRowMatchStatus =
  | "matched"
  | "unmatched"
  | "ambiguous";

export type ImportRowActionType =
  | "create"
  | "update"
  | "block"
  | "skip"
  | "error";

export type ImportRowResultStatus =
  | "pending"
  | "processed"
  | "failed";

export type NormalizedImportBookingType =
  | "booking"
  | "blocked_period";

export interface NormalizedImportBooking {
  sourceType: ImportSourceType;
  sourceBookingId: string;
  sourceReference?: string;
  bookingType: NormalizedImportBookingType;
  /** Human-readable label for blocked periods (e.g. "Maintenance", "Staff hold"). */
  label?: string;
  externalStatus?: string;
  vehicleReference: string;
  pickupAt: string;
  returnAt: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalPrice?: number;
  currency?: string;
  notes?: string;
  rawMetadata: Record<string, unknown>;
}

export interface ImportPreviewRow {
  rowNumber: number;
  rawPayload: Record<string, unknown>;
  normalized: NormalizedImportBooking | null;
  matchStatus: ImportRowMatchStatus;
  matchedVehicleId: string | null;
  matchedBookingId: string | null;
  actionType: ImportRowActionType;
  actionReason?: string;
  errorMessage?: string;
}
