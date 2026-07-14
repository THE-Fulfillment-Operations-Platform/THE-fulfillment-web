import { apiGet, apiPost, apiDownload } from '../http'
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
  // Direct cancel of a pending-review order (whole order, every product in it).
  cancel: (id: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${id}/cancel`, { reason }),
  // Request cancellation of an approved (not-yet-in-production) order (whole order).
  requestCancellation: (id: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${id}/cancellation-request`, { reason }),
  // Direct cancel of a single product inside a still-cancellable (import/review)
  // order. Leaves the other products untouched. Returns the refreshed order so
  // the UI reflects the item's new state (and any knock-on order-level change).
  cancelItem: (orderId: number | string, itemId: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${orderId}/items/${itemId}/cancel`, { reason }),
  // Request cancellation of a single product in an approved/in-production order;
  // ops must approve before it is actually removed.
  requestItemCancellation: (orderId: number | string, itemId: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${orderId}/items/${itemId}/cancellation-request`, { reason }),
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
  // Download the order-import template as a real .xlsx (columns split cleanly in
  // Excel on any locale, unlike a comma CSV that opened crammed into one column).
  downloadTemplate: () =>
    apiDownload('/api/seller/orders/import/template.xlsx', 'order-import-template.xlsx'),
}
