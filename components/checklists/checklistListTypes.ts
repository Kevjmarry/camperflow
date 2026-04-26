export type ChecklistScope = 'all' | 'booking' | 'vehicle';
export type ChecklistStatus = 'all' | 'not_started' | 'in_progress' | 'completed';

export interface ChecklistItem {
  id: string;
  booking_id: string;
  name: string;
  type: string;
  template_name?: string;
  status: string;
  booking_number: string;
  customer_name: string;
  vehicle_name: string;
  vehicle_plate: string;
  pickup_at?: string;
  return_at?: string;
  created_at: string;
}

export interface IssueItem {
  id: string;
  checklist_instance_id: string;
  name: string;
  severity: string;
  status: string;
  booking_number: string;
  vehicle_name: string;
  vehicle_plate: string;
  created_at: string;
}

/** Label helpers passed as a bag of functions so sub-components stay i18n-free. */
export interface ChecklistLabels {
  typeLabel: (type: string) => string;
  statusLabel: (s: string) => string;
  severityLabel: (s: string) => string;
  fmtDate: (iso: string) => string;
  bookingRef: (num: string) => string;
}