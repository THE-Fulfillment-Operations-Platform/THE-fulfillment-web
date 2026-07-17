import { apiGet, apiPost } from '../http'
import type { Handoff } from '~/types'

export interface HandoffInput {
  order_id?: number
  package_id?: number
  box_type?: string
  weight_grams?: number
  length_cm?: number
  width_cm?: number
  height_cm?: number
  packing_note?: string
  photo_url?: string
  note?: string
}

export interface ShipHandoffInput {
  carrier: string
  tracking_number: string
  label_url?: string
}

export const handoffsApi = {
  list: (params?: { page?: number; page_size?: number }) => apiGet<Handoff[]>('/api/handoffs', params),
  create: (body: HandoffInput) => apiPost<Handoff>('/api/handoffs', body),
  // Mark a handed-off package as dispatched — the final leg that moves an order
  // to SHIPPED and records the carrier + tracking the seller can follow.
  //
  // Backend contract (to be implemented server-side; the data model in
  // types/Handoff already carries carrier/tracking_number/label_url/status):
  //   POST /api/handoffs/:id/ship  { carrier, tracking_number, label_url? }
  //   → transitions status HANDED_OFF → SHIPPED and returns the updated Handoff.
  markShipped: (id: number | string, body: ShipHandoffInput) =>
    apiPost<Handoff>(`/api/handoffs/${id}/ship`, body),
}
