export interface WhatsAppPlaceholders {
  customer_name?: string
  vehicle_name?: string
  pickup_date?: string
  return_date?: string
  guest_link?: string
  booking_code?: string
  map_link?: string
  company_phone?: string
  arrival_instructions?: string
  parking_instructions?: string
  deposit_instructions?: string
  handover_duration?: string
}

export function replaceTemplatePlaceholders(
  template: string,
  values: WhatsAppPlaceholders,
): string {
  return template
    .replace(/\{customer_name\}/g, values.customer_name ?? '')
    .replace(/\{vehicle_name\}/g, values.vehicle_name ?? '')
    .replace(/\{pickup_date\}/g, values.pickup_date ?? '')
    .replace(/\{return_date\}/g, values.return_date ?? '')
    .replace(/\{guest_link\}/g, values.guest_link ?? '')
    .replace(/\{booking_code\}/g, values.booking_code ?? '')
    .replace(/\{map_link\}/g, values.map_link ?? '')
    .replace(/\{company_phone\}/g, values.company_phone ?? '')
    .replace(/\{arrival_instructions\}/g, values.arrival_instructions ?? '')
    .replace(/\{parking_instructions\}/g, values.parking_instructions ?? '')
    .replace(/\{deposit_instructions\}/g, values.deposit_instructions ?? '')
    .replace(/\{handover_duration\}/g, values.handover_duration ?? '')
}
