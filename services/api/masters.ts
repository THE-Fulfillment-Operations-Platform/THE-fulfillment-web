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
  // Kích thước một tấm NVL (mm) — cùng kích thước SKU tạo ra định mức. Phải có
  // cả hai hoặc bỏ trống cả hai. Khi sửa: bỏ field = giữ, gửi 0 cả hai = bỏ.
  length_mm?: number | null
  width_mm?: number | null
}

export interface SkuMaterialInput {
  material_id: number
  /** Một sản phẩm ăn bao nhiêu đơn vị NVL (định lượng vật tư). */
  quantity_per_unit?: number
  /** Định mức khai: sản phẩm / tấm của cặp này. null/0 = chưa khai → ước tính. */
  products_per_unit?: number | null
  note?: string
}

// Một dòng của file import NVL: tên + kích thước tấm (mm, null = ô trống) + mô
// tả (tuỳ chọn). row_number giữ lại số dòng trong file để báo lỗi cho đúng.
export interface MaterialImportRowInput {
  material: string
  length_mm: number | null
  width_mm: number | null
  description?: string
  row_number?: number
}

export interface SkuInput {
  code: string
  name: string
  product_name?: string
  description?: string
  is_active?: boolean
  // Khi sửa: bỏ field = giữ nguyên, gửi 0 = xoá (tách khỏi SKU cha / bỏ kích thước).
  parent_id?: number | null
  length_mm?: number | null
  width_mm?: number | null
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
  // Import kích thước NVL. File: Loại VL + Dài (mm) + Rộng (mm) (+ Mô tả).
  importPreviewFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiPost<MaterialImportPreview>('/api/materials/import/preview', fd)
  },
  importCommit: (rows: MaterialImportRowInput[]) =>
    apiPost<MaterialImportPreview>('/api/materials/import/commit', { rows }),
  downloadImportTemplate: () =>
    apiDownload('/api/materials/import/template.xlsx', 'material-import-template.xlsx'),
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
