import { apiGet, apiPost, apiPatch, apiDownload } from '../http'
import type { Batch, BatchLink, BatchLinkKind, CreateBatchResult, InternalStatus, Priority, ListParams } from '~/types'

export interface BatchListParams extends ListParams {
  material_id?: number
  status?: string
  priority?: string
  date_from?: string
  date_to?: string
  // Lọc batch con của 1 batch mẹ. Mặc định danh sách chỉ trả batch mẹ + batch
  // phẳng (ẩn con) để không rối; truyền id mẹ để lấy riêng các con của nó.
  parent_batch_id?: number
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
  // Attach/replace the batch's print or cut link (entered once, shared by designs).
  setLink: (id: number | string, kind: BatchLinkKind, url: string) =>
    apiPatch<BatchLink>(`/api/batches/${id}/links`, { kind, url }),
  // Download the legacy-compatible production template as a real .xlsx workbook
  // (columns split cleanly in Excel on any locale, unlike a comma CSV).
  exportProductionTemplate: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/production-template.xlsx`,
      `production-${(code ?? String(id)).replace('#', '')}.xlsx`,
    ),
  // Download all asset files for the batch as a ZIP bundle (design+mockup+print+cut).
  downloadAssetsZip: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/assets.zip`,
      `batch-${(code ?? String(id)).replace('#', '')}-assets.zip`,
    ),
  // Download ONLY the original design files (front/back, no mockup) named
  // STT_SKU_QUANTITY[_SIDE].EXT, bundled as Batch_<code>.zip.
  downloadDesignZip: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/assets.zip?assets=design`,
      `Batch_${(code ?? String(id)).replace('#', '')}.zip`,
    ),
}
