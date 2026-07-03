import { apiGet, apiPatch } from '../http'
import type { OrderItem, ListParams } from '~/types'

export interface ItemListParams extends ListParams {
  sku?: string
  status?: string // = internal_status
  design_status?: string
  batch_id?: number
  seller_id?: number
  store_id?: number
  date_from?: string
  date_to?: string
}

export interface DesignPatch {
  print_file_url?: string
  cut_file_url?: string
  mockup_url?: string
  design_url?: string
  set_ready?: boolean
}

export const itemsApi = {
  list: (params?: ItemListParams) => apiGet<OrderItem[]>('/api/items', params),
  get: (id: number | string) => apiGet<OrderItem>(`/api/items/${id}`),
  patchDesign: (id: number | string, body: DesignPatch) =>
    apiPatch<OrderItem>(`/api/items/${id}/design`, body),
}
