// Single source of truth for default company ID
// This UUID must match the default company row in the companies table
// Run: SELECT id FROM public.companies WHERE name = 'Default Company';
export const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

// Helper to get default company ID
// In v1: returns hardcoded default company
// In v2: could fetch from user context, organization settings, or JWT claims
export function getDefaultCompanyId(): string {
  return DEFAULT_COMPANY_ID;
}

// Validate company_id format (basic UUID check)
export function isValidCompanyId(companyId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(companyId);
}