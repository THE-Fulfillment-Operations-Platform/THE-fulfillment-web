import { apiGet, apiPost } from '../http'
import type { PackingResult } from '~/types'

export interface PackingScanInput {
  order_id?: number
  code?: string
  item_id?: number
}

export const packingApi = {
  scan: (input: PackingScanInput) => apiPost<PackingResult>('/api/packing/scan', input),
  orderPackage: (orderId: number | string) =>
    apiGet<PackingResult>(`/api/packing/order/${orderId}`),
}
