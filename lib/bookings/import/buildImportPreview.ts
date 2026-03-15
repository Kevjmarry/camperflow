import { parseCsvRows } from "@/lib/bookings/import/parseCsvRows";
import { normalizeBookingmoodCsvRow } from "@/lib/bookings/import/normalizeBookingmoodCsvRow";
import {
  ImportSourceType,
  ImportPreviewRow,
  NormalizedImportBooking,
} from "@/lib/bookings/import/types";

const REQUIRED_FIELDS: (keyof NormalizedImportBooking)[] = [
  "sourceBookingId",
  "pickupAt",
  "returnAt",
  "vehicleReference",
];

export function buildImportPreview(
  text: string,
  sourceType: ImportSourceType
): ImportPreviewRow[] {
  if (sourceType === "bookingmood_csv") {
    const rows = parseCsvRows(text);

    return rows.map((row, index) => {
      const rowNumber = index + 2;

      try {
        const normalized = normalizeBookingmoodCsvRow(row);

        // Blocked periods import into vehicle_blocks, not bookings
        if (normalized.bookingType === "blocked_period") {
          // Still require a vehicle reference and date range
          if (!normalized.vehicleReference || !normalized.pickupAt || !normalized.returnAt) {
            return {
              rowNumber,
              rawPayload: row,
              normalized,
              matchStatus: "unmatched",
              matchedVehicleId: null,
              matchedBookingId: null,
              actionType: "error",
              errorMessage: "Blocked period is missing vehicle reference or date range.",
            };
          }
          return {
            rowNumber,
            rawPayload: row,
            normalized,
            matchStatus: "unmatched",
            matchedVehicleId: null,
            matchedBookingId: null,
            actionType: "block",
          };
        }

        const missingField = REQUIRED_FIELDS.find(
          (field) => !normalized[field]
        );
        if (missingField) {
          return {
            rowNumber,
            rawPayload: row,
            normalized: null,
            matchStatus: "unmatched",
            matchedVehicleId: null,
            matchedBookingId: null,
            actionType: "error",
            errorMessage: `Missing required field: ${missingField}`,
          };
        }

        // For real booking rows, a missing customer name is a data error
        if (!normalized.customerName?.trim()) {
          return {
            rowNumber,
            rawPayload: row,
            normalized,
            matchStatus: "unmatched",
            matchedVehicleId: null,
            matchedBookingId: null,
            actionType: "error",
            errorMessage:
              "Missing customer name. This row looks like a booking, but no guest/contact name was found in the source data. Fix the booking in the source system, then export and import again.",
          };
        }

        return {
          rowNumber,
          rawPayload: row,
          normalized,
          matchStatus: "unmatched",
          matchedVehicleId: null,
          matchedBookingId: null,
          actionType: "create",
        };
      } catch (err) {
        return {
          rowNumber,
          rawPayload: row,
          normalized: null,
          matchStatus: "unmatched",
          matchedVehicleId: null,
          matchedBookingId: null,
          actionType: "error",
          errorMessage:
            err instanceof Error ? err.message : "Failed to normalize row",
        };
      }
    });
  }

  return [];
}
