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
  // Download the legacy-compatible production template as a real .xlsx workbook
  // (columns split cleanly in Excel on any locale, unlike a comma CSV).
  exportProductionTemplate: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/production-template.xlsx`,
      `production-${(code ?? String(id)).replace('#', '')}.xlsx`,
    ),
  // Download all asset files for the batch as a ZIP bundle.
  downloadAssetsZip: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/assets.zip`,
      `batch-${(code ?? String(id)).replace('#', '')}-assets.zip`,
    ),
}
