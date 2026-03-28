/**
 * Shared types for the checklist detail view.
 * All sub-components in this directory import from here.
 */

export type DbIssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueSeverity = 'attention' | 'urgent';

export type ChecklistInstanceType = {
  id: string;
  booking_id: string | null;
  vehicle_id: string | null;
  checklist_type: string;
  status: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  office_contract_signed: boolean | null;
  office_id_verified: boolean | null;
  office_deposit_collected: boolean | null;
  handover_documents_given: boolean | null;
  handover_keys_given: boolean | null;
  return_keys_received: boolean | null;
  return_documents_received: boolean | null;
  return_contract_closed: boolean | null;
  return_deposit_status: string | null;
  bookings: {
    id: string;
    booking_number: string;
    customer_name: string;
    status: string;
  } | null;
  vehicles: {
    id: string;
    name: string;
  } | null;
};

export type ChecklistItemType = {
  id: string;
  template_item_id: string;
  checked: boolean;
  notes: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  issue_flag: boolean | null;
  issue_title: string | null;
  issue_description: string | null;
  issue_severity: DbIssueSeverity | null;
  issue_blocking: boolean | null;
  linked_vehicle_issue_id: string | null;
  template: {
    label: string;
    sort_order: number;
    section: string | null;
    ui_section?: string | null;
    options?: string[] | null;
  };
};

/** A photo already uploaded to Supabase Storage (path + resolved public URL). */
export type StoredEvidencePhoto = { kind: 'stored'; path: string; url: string };
/** A photo selected by the user but not yet uploaded (shown optimistically). */
export type NewEvidencePhoto = { kind: 'new'; file: File };
export type EvidencePhoto = StoredEvidencePhoto | NewEvidencePhoto;

export type FlagDraft = {
  severity: IssueSeverity;
  note: string;
  saving: boolean;
  error: string | null;
  photos: File[];
};

export type SyncError = {
  kind: 'item_update_failed' | 'status_sync_failed';
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  raw: string;
};

export type ReopenHistoryEntry = {
  id: string;
  reopened_at: string;
  reason: string | null;
  snapshot: {
    instance: {
      status: string;
      started_at: string | null;
      started_by: string | null;
      completed_at: string | null;
      completed_by: string | null;
    };
    items: Array<{
      id: string;
      template_item_id: string;
      checked: boolean;
      notes: string | null;
      checked_at: string | null;
      checked_by: string | null;
      issue_flag: boolean | null;
      issue_title: string | null;
      issue_description: string | null;
      issue_severity: DbIssueSeverity | null;
      issue_blocking: boolean | null;
      linked_vehicle_issue_id: string | null;
    }>;
  };
};

export type HandoverField =
  | 'office_contract_signed'
  | 'office_id_verified'
  | 'office_deposit_collected'
  | 'handover_documents_given'
  | 'handover_keys_given';

export type ReturnField =
  | 'return_keys_received'
  | 'return_documents_received'
  | 'return_contract_closed'
  | 'return_deposit_status';

/** Map DB severity → UI severity for badge rendering */
export function dbToUiSeverity(db: DbIssueSeverity | null | undefined): IssueSeverity {
  switch (db) {
    case 'high':
    case 'critical':
      return 'urgent';
    default:
      return 'attention';
  }
}
