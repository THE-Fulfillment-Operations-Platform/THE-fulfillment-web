import { apiGet, apiPost, apiPut, apiDelete, apiDownload } from '../http'
import type { Seller, Store, Material, Sku, MaterialImportPreview } from '~/types'

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
  quantity_per_unit?: number
  note?: string
}

// Một dòng của file import định mức: tên NVL + định mức (null = không giới hạn)
// + mô tả (tuỳ chọn).
export interface MaterialQuotaRowInput {
  material: string
  quota: number | null
  description?: string
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
  // page_size=200 → fetch the whole list so the Users dropdown & seller tab
  // don't silently drop sellers past the default page.
  list: () => apiGet<Seller[]>('/api/sellers', { page_size: 200 }),
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
  // page_size=200 → the catalog is small; fetch it all so client-side search works.
  list: () => apiGet<Material[]>('/api/materials', { page_size: 200 }),
  get: (id: number | string) => apiGet<Material>(`/api/materials/${id}`),
  create: (body: MaterialInput) => apiPost<Material>('/api/materials', body),
  update: (id: number | string, body: Partial<MaterialInput>) => apiPut<Material>(`/api/materials/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/materials/${id}`),
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
  list: () => apiGet<Sku[]>('/api/skus', { page_size: 200 }),
  get: (id: number | string) => apiGet<Sku>(`/api/skus/${id}`),
  create: (body: SkuInput) => apiPost<Sku>('/api/skus', body),
  update: (id: number | string, body: Partial<SkuInput>) => apiPut<Sku>(`/api/skus/${id}`, body),
  remove: (id: number | string) => apiDelete<unknown>(`/api/skus/${id}`),
}
