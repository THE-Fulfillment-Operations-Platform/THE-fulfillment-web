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

export const handoffsApi = {
  list: () => apiGet<Handoff[]>('/api/handoffs'),
  create: (body: HandoffInput) => apiPost<Handoff>('/api/handoffs', body),
}
