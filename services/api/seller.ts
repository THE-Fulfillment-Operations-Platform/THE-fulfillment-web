import { apiGet, apiPost } from '../http'
import type { SellerOrder, ImportPreview, ImportJob, ImportRow, ListParams } from '~/types'

export interface SellerOrderListParams extends ListParams {
  status?: string
  store_order_id?: string
  date_from?: string
  date_to?: string
}

// Seller-facing endpoints. The backend sanitises these — no internal status leaks.
export const sellerViewApi = {
  orders: (params?: SellerOrderListParams) => apiGet<SellerOrder[]>('/api/seller/orders', params),
  order: (id: number | string) => apiGet<SellerOrder>(`/api/seller/orders/${id}`),
  // Direct cancel of a pending-review order.
  cancel: (id: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${id}/cancel`, { reason }),
  // Request cancellation of an approved (not-yet-in-production) order.
  requestCancellation: (id: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${id}/cancellation-request`, { reason }),
}

// Seller self-upload. seller_id is forced server-side to the logged-in seller,
// so these never carry a seller_id. Imported orders land in "Chờ duyệt".
export const sellerImportApi = {
  // Preview from pasted CSV rows (no commit yet).
  preview: (rows: ImportRow[], filename?: string) =>
    apiPost<ImportPreview>('/api/seller/orders/import', { commit: false, filename, rows }),
  // Preview by uploading a CSV/XLSX file (backend parses it).
  previewFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('commit', 'false')
    return apiPost<ImportPreview>('/api/seller/orders/import', fd)
  },
  // Commit a previously previewed job (ownership checked server-side).
  commitJob: (importJobId: number) =>
    apiPost<ImportJob>('/api/seller/orders/import/commit', { import_job_id: importJobId }),
}
