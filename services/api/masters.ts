import { apiGet, apiPost, apiPut, apiDelete, apiDownload } from '../http'
import type {
  Seller,
  Store,
  Material,
  Sku,
  MaterialImportPreview,
  MaterialDeleteResult,
  SkuDeleteResult,
} from '~/types'
import { PAGE_SIZE_ALL } from '~/utils/pagination'

// ---- Catalog input payloads ------------------------------------------------
export interface MaterialInput {
  code: string
  name: string
  description?: string
  // Định mức: số sản phẩm tối đa 1 đơn vị NVL làm ra. Chỉ OWNER được set (backend
  // guard). Bỏ trống/null = không giới hạn → batch không bị chẻ mẹ–con.
  products_per_unit?: number | null
}

export interface SkuMaterialInput {
  material_id: number
  /** Một sản phẩm ăn bao nhiêu đơn vị NVL (định lượng vật tư). */
  quantity_per_unit?: number
  /**
   * Định mức sản xuất của CẶP (SKU, NVL): một đơn vị NVL ra được bao nhiêu sản
   * phẩm của SKU này — dùng để chia batch. Bỏ field = giữ nguyên định mức đang
   * lưu; 0/null = xoá (cặp rơi về định mức của NVL). Chỉ OWNER đặt được.
   */
  products_per_unit?: number | null
  note?: string
}

// Một dòng của file import định mức: tên NVL + định mức (null = không giới hạn)
// + mô tả (tuỳ chọn). row_number giữ lại số dòng trong file để báo lỗi cho đúng.
export interface MaterialQuotaRowInput {
  material: string
  quota: number | null
  description?: string
  row_number?: number
}

export interface SkuInput {
  code: string
  name: string
  product_name?: string
  description?: string
  is_active?: boolean
  // Optional: a SKU may be created unmapped and get its material(s) later.
  materials?: SkuMaterialInput[]
}

// ---- Sellers ---------------------------------------------------------------
export const sellersApi = {
  // PAGE_SIZE_ALL → fetch the whole list so the Users dropdown & seller tab
  // don't silently drop sellers. Not 200: the API clamps page_size to 200, so
  // row 201+ would vanish without any error.
  list: () => apiGet<Seller[]>('/api/sellers', { page_size: PAGE_SIZE_ALL }),
  get: (id: number | string) => apiGet<Seller>(`/api/sellers/${id}`),
  create: (body: Partial<Seller>) => apiPost<Seller>('/api/sellers', body),
  update: (id: number | string, body: Partial<Seller>) => apiPut<Seller>(`/api/sellers/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/sellers/${id}`),
}

// ---- Stores ----------------------------------------------------------------
export const storesApi = {
  list: (sellerId?: number) => apiGet<Store[]>('/api/stores', sellerId ? { seller_id: sellerId } : undefined),
  get: (id: number | string) => apiGet<Store>(`/api/stores/${id}`),
  create: (body: Partial<Store>) => apiPost<Store>('/api/stores', body),
  update: (id: number | string, body: Partial<Store>) => apiPut<Store>(`/api/stores/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/stores/${id}`),
}

// ---- Định mức theo cặp SKU–NVL (OWNER) --------------------------------------
// Định mức "SP/tấm" của từng cặp là căn cứ chia batch; cặp trống rơi về định mức
// mặc định của NVL, NVL cũng trống thì không giới hạn (cả pool dồn một batch).
// Luồng: xuất file mọi cặp → điền cột Định mức → import lại.
export type PairQuotaAction = 'UPDATE' | 'NOCHANGE'

export interface PairQuotaFileRow {
  row_number?: number
  sku: string
  material: string
  material_code?: string
  quota: number | null
}

export interface PairQuotaItem {
  sku_code: string
  material_code: string
  material_name: string
  mapping_id: number
  current_quota: number | null // định mức riêng đang có của cặp (null = chưa có)
  material_quota: number | null // định mức mặc định của NVL — áp dụng khi cặp chưa có
  quota: number
  action: PairQuotaAction
  row_numbers: number[]
}

export interface PairQuotaRowError {
  row_number: number
  sku: string
  material: string
  error_code: string
  message: string
  row_numbers?: number[]
}

export interface PairQuotaPreview {
  filename: string
  items: PairQuotaItem[]
  errors: PairQuotaRowError[]
  summary: {
    total_rows: number
    updates: number
    unchanged: number
    error_rows: number
    duplicate_rows: number
    blank_rows: number
  }
  applied?: { updated: number }
}

export const pairQuotaApi = {
  exportXlsx: () => apiDownload('/api/materials/pair-quota/export.xlsx', 'dinh-muc-theo-sku.xlsx'),
  previewFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiPost<PairQuotaPreview>('/api/materials/pair-quota/import/preview', fd)
  },
  commit: (rows: PairQuotaFileRow[]) =>
    apiPost<PairQuotaPreview>('/api/materials/pair-quota/import/commit', { rows }),
}

// ---- Materials -------------------------------------------------------------
export const materialsApi = {
  // PAGE_SIZE_ALL → fetch it all so client-side search works.
  list: () => apiGet<Material[]>('/api/materials', { page_size: PAGE_SIZE_ALL }),
  get: (id: number | string) => apiGet<Material>(`/api/materials/${id}`),
  create: (body: MaterialInput) => apiPost<Material>('/api/materials', body),
  update: (id: number | string, body: Partial<MaterialInput>) => apiPut<Material>(`/api/materials/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/materials/${id}`),
  // Xoá nhiều NVL trong MỘT request. Xoá từng id một tốn 1 round-trip + 3 câu SQL
  // mỗi NVL — vài trăm dòng là chờ hàng phút. NVL còn được SKU/batch dùng sẽ nằm
  // trong `skipped` kèm lý do, không bị xoá.
  bulkRemove: (ids: number[]) =>
    apiPost<MaterialDeleteResult>('/api/materials/bulk-delete', { ids }),
  // Import định mức NVL (OWNER-only). File 2 cột: Loại VL + Định mức.
  importPreviewFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiPost<MaterialImportPreview>('/api/materials/import/preview', fd)
  },
  importCommit: (rows: MaterialQuotaRowInput[]) =>
    apiPost<MaterialImportPreview>('/api/materials/import/commit', { rows }),
  downloadQuotaTemplate: () =>
    apiDownload('/api/materials/import/template.xlsx', 'material-quota-template.xlsx'),
}

// ---- SKUs ------------------------------------------------------------------
export const skusApi = {
  // PAGE_SIZE_ALL, not 200: the SKUs and SKU → Material tabs search and page
  // client-side over exactly this list. 200 is also the API's clamp, so once the
  // catalog passed 200 SKUs, SKU #201+ disappeared from the table and the search
  // box ("Chưa có SKU nào") while still existing in the DB.
  list: () => apiGet<Sku[]>('/api/skus', { page_size: PAGE_SIZE_ALL }),
  get: (id: number | string) => apiGet<Sku>(`/api/skus/${id}`),
  create: (body: SkuInput) => apiPost<Sku>('/api/skus', body),
  update: (id: number | string, body: Partial<SkuInput>) => apiPut<Sku>(`/api/skus/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/skus/${id}`),
  // Xoá / ẩn-bật nhiều SKU trong MỘT request (xem materialsApi.bulkRemove). SKU
  // đang có đơn hàng dùng nằm trong `skipped` kèm lý do, không bị xoá.
  bulkRemove: (ids: number[]) => apiPost<SkuDeleteResult>('/api/skus/bulk-delete', { ids }),
  bulkSetActive: (ids: number[], isActive: boolean) =>
    apiPost<{ updated: number }>('/api/skus/bulk-active', { ids, is_active: isActive }),
}
