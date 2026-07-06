import { apiGet, apiPost, apiPatch, apiDownload } from '../http'
import type { Batch, CreateBatchResult, InternalStatus, Priority, ListParams } from '~/types'

export interface BatchListParams extends ListParams {
  material_id?: number
  status?: string
  priority?: string
  date_from?: string
  date_to?: string
}

export interface CreateBatchInput {
  material_id: number
  order_item_ids: number[]
  priority?: Priority
  due_date?: string
  note?: string
}

export const batchesApi = {
  list: (params?: BatchListParams) => apiGet<Batch[]>('/api/batches', params),
  get: (id: number | string) => apiGet<Batch>(`/api/batches/${id}`),
  create: (body: CreateBatchInput) => apiPost<CreateBatchResult>('/api/batches', body),
  setStatus: (id: number | string, status: InternalStatus, note?: string) =>
    apiPatch<Batch>(`/api/batches/${id}/status`, { status, note }),
  // Download the legacy-compatible production template CSV for a batch.
  exportProductionTemplate: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/production-template.csv`,
      `production-${(code ?? String(id)).replace('#', '')}.csv`,
    ),
}
