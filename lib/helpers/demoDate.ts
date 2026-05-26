const DEMO_COMPANY_ID = 'aa8c5a35-8c06-4dee-8c13-7b3523f549d2'

// For the demo company only, ops-page "today" is frozen to DEMO_FROZEN_DATE
// (set as YYYY-MM-DD via the DEMO_FROZEN_DATE env var). This keeps the
// Operations page visually fresh regardless of wall-clock date — the data
// never ages overnight. All real companies are unaffected.
//
// Usage: const today = getDemoToday(companyId)
// Then derive todayStr, todayStart, todayEnd etc. from `today` instead of new Date().
export function getDemoToday(companyId: string): Date {
  if (companyId !== DEMO_COMPANY_ID) return new Date()
  const envDate = process.env.DEMO_FROZEN_DATE
  if (envDate) {
    // Slice to YYYY-MM-DD so this handles both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ssZ'.
    // Use noon UTC to avoid midnight boundary edge cases when callers
    // derive todayStart (00:00) and todayEnd (23:59) from this base.
    const d = new Date(`${envDate.slice(0, 10)}T12:00:00.000Z`)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}
