// ============================================================================
// Domain types — derived from the BGDecor Fulfillment Backend Handoff Report.
// Enum values are the exact strings the API returns/accepts.
// ============================================================================

// ---- Roles & enums ---------------------------------------------------------

export type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'OPS'
  | 'DESIGNER'
  | 'PRODUCTION'
  | 'QC'
  | 'PACKING'
  | 'SHIPPING'
  | 'SELLER'

/** Internal item / batch status (hidden from sellers). */
export type InternalStatus = 'PENDING' | 'PRINTED' | 'CUT' | 'QC_PASSED'

/** Seller-facing order status. */
export type SellerStatus = 'PRODUCTION' | 'PACKED' | 'HANDED_OFF' | 'SHIPPED'

/** Operational intake (review) status — orthogonal to production status. */
export type ReviewStatus =
  | 'PENDING_REVIEW'
  | 'NEEDS_CORRECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

/** Cancellation lifecycle on an order. */
export type CancellationStatus =
  | 'NONE'
  | 'SELLER_CANCELLED'
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'

export type DesignStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'MISSING'

export type Priority = 'NORMAL' | 'HIGH' | 'URGENT'

export type QcResult = 'PASS' | 'FAIL'

export type NoteSeverity = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export type NoteStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED'

export type EntityType = 'ORDER' | 'ORDER_ITEM' | 'BATCH' | 'BATCH_ITEM' | 'PACKAGE' | 'HANDOFF'

export type ImportJobStatus = 'PREVIEW' | 'COMMITTED' | 'FAILED' | 'CANCELLED'

export type PackageStatus = 'OPEN' | 'PACKED'

export type HandoffStatus = 'HANDED_OFF' | 'SHIPPED'

/** Shipment tracking status on an order (manual entry today, provider-sync later). */
export type TrackingStatus =
  | 'NONE'
  | 'PENDING'
  | 'PRE_TRANSIT'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'UNDELIVERED'
  | 'EXCEPTION'
  | 'EXPIRED'
  | 'CANCELLED'

/** Which physical side of a product a design belongs to. */
export type DesignSide = 'SINGLE' | 'FRONT' | 'BACK'

/** Kind of production link attached to a whole batch. */
export type BatchLinkKind = 'PRINT' | 'CUT'

// ---- API envelope ----------------------------------------------------------

export interface ApiMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface ApiErrorPayload {
  code: string
  message: string
  details?: string
}

export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  meta?: ApiMeta
  error?: ApiErrorPayload
}

// ---- Auth & users ----------------------------------------------------------

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  seller_id?: number | null
  is_active: boolean
}

export interface LoginResponse {
  token: string
  expires_at: string
  user: User
}

// ---- Master data -----------------------------------------------------------

export interface StoreRef {
  id: number
  name: string
  platform: string
}

export interface Seller {
  id: number
  code: string
  name: string
  contact_email?: string
  contact_phone?: string
  status?: string
  note?: string
  stores?: StoreRef[]
}

export interface Store {
  id: number
  seller_id: number
  name: string
  platform: string
  external_ref?: string
}

export interface Material {
  id: number
  code: string
  name: string
  description?: string
  // Định mức sản xuất: số sản phẩm tối đa 1 đơn vị NVL (1 tấm/1 lô) làm ra được.
  // Khi tạo batch mà tổng sản phẩm vượt con số này, hệ thống chẻ batch thành
  // nhiều batch con (xem Batch.parent_batch_id). null/0/undefined = không giới hạn.
  products_per_unit?: number | null
}

export interface SkuMaterial {
  material_id: number
  quantity_per_unit: number
  note?: string
  material?: Material
}

export interface Sku {
  id: number
  code: string
  name: string
  product_name?: string
  description?: string
  is_active?: boolean
  is_combo?: boolean
  materials?: SkuMaterial[]
}

// ---- Orders & items --------------------------------------------------------

export interface BatchItemRef {
  batch_item_id?: number
  batch_id?: number
  batch_code?: string
  material_code?: string
  material?: Material
  status?: InternalStatus
  batch?: Batch
}

export interface OrderItem {
  id: number
  internal_code: string
  sku_code: string
  product_name?: string
  variant_code?: string
  quantity: number
  internal_status: InternalStatus
  design_status: DesignStatus
  cancellation_status?: CancellationStatus
  cancellation_requested_at?: string | null
  cancellation_reason?: string
  cancellation_resolution_note?: string
  mockup_url?: string
  engrave_text?: string
  print_file_url?: string
  cut_file_url?: string
  design_url?: string
  back_design_url?: string
  // Production-ready fields (legacy production-template columns).
  image_code?: string
  qc_description?: string
  production_sequence?: number
  production_file_name?: string
  material_code?: string
  material_name?: string
  // Flat order references some list endpoints include alongside the item.
  order_id?: number
  order_code?: string
  store_order_id?: string
  store_order_dup?: boolean
  store_name?: string
  batch_items?: BatchItemRef[]
  sku?: Sku
  order?: Order
  assets?: Record<string, unknown>
}

export interface Order {
  id: number
  internal_code: string
  store_order_id: string
  seller_id: number
  store_name?: string
  account?: string
  shipping_method?: string
  seller_status: SellerStatus
  review_status?: ReviewStatus
  reviewed_by_id?: number | null
  reviewed_at?: string | null
  review_note?: string
  cancellation_status?: CancellationStatus
  cancellation_requested_at?: string | null
  cancellation_reason?: string
  cancellation_resolved_at?: string | null
  cancellation_resolution_note?: string
  shipping_name?: string
  shipping_address1?: string
  shipping_address2?: string
  shipping_city?: string
  shipping_zip?: string
  shipping_province?: string
  shipping_country?: string
  shipping_phone?: string
  shipping_email?: string
  ioss?: string
  note?: string
  // Computed by list endpoints: true when this StoreOrderID is shared by more than
  // one order for the same seller (a repeated store order id, not just many items).
  store_order_dup?: boolean
  // "STT trong ngày": stable per-day order number assigned at creation (business tz).
  order_date?: string
  daily_seq?: number
  // Tracking (manual entry today; provider sync later).
  tracking_number?: string
  tracking_status?: TrackingStatus
  tracking_carrier?: string
  tracking_url?: string
  tracking_updated_at?: string | null
  created_at: string
  items?: OrderItem[]
  seller?: Seller
}

// ---- Import ----------------------------------------------------------------

export interface ImportRow {
  StoreOrderID: string
  Account?: string
  StoreName?: string
  ShippingMethod?: string
  Quantity?: number | string
  ProductName?: string
  VariantCode?: string
  SKU?: string
  'Mã ảnh'?: string
  Design?: string
  'Front Design'?: string
  'Back Design'?: string
  Mockup?: string
  EngraveText?: string
  ShippingName?: string
  ShippingAddress1?: string
  ShippingAddress2?: string
  ShippingCity?: string
  ShippingZip?: string
  ShippingProvince?: string
  ShippingCountry?: string
  ShippingPhone?: string
  ShippingEmail?: string
  IOSS?: string
  Note?: string
}

export interface ImportError {
  row_number: number
  store_order_id?: string
  sku?: string
  field?: string
  error_code: string
  message: string
  suggestion?: string
}

export interface ImportPreview {
  import_job_id: number
  status: ImportJobStatus
  total_rows: number
  order_count: number
  valid_rows: number
  error_rows: number
  created_count?: number
  errors?: ImportError[]
  // Non-blocking heads-up rows (e.g. a StoreOrderID that already exists). These
  // rows ARE imported — the UI highlights them so staff can double-check a possible
  // duplicate with the customer — and never gate the commit.
  warnings?: ImportError[]
}

export interface ImportCommitResult {
  preview?: ImportPreview
  commit?: ImportPreview
}

export interface ImportJob {
  id: number
  status: ImportJobStatus
  filename?: string
  total_rows?: number
  order_count?: number
  valid_rows?: number
  error_rows?: number
  created_count?: number
  created_at?: string
  errors?: ImportError[]
}

// ---- Master-data (legacy Excel) import -------------------------------------

export type MasterSkuStatus = 'OK' | 'NEEDS_REVIEW' | 'MISSING_MATERIAL'

export interface MasterImportMaterialPlan {
  code: string
  name: string
  exists: boolean
}

export interface MasterImportSkuPlan {
  code: string
  name: string
  product_name?: string // tên sản phẩm đọc được (từ cột "Tên sản phẩm"); đại diện = tên đầu
  product_names?: string[] // tất cả tên khác nhau của SKU này (1 spec có thể gắn nhiều sản phẩm)
  exists: boolean
  material_names: string[]
  status: MasterSkuStatus
  row_count: number
  is_combo: boolean // built from ≥2 materials (BOM)
}

export interface MasterImportMappingPlan {
  sku_code: string
  material_code: string
  material_name: string
  exists: boolean
}

export interface MasterImportRowError {
  row_number: number
  sku?: string
  material?: string
  error_code: string
  message: string
}

export interface MasterImportSummary {
  total_rows: number
  new_materials: number
  new_skus: number
  new_mappings: number
  review_count: number
  missing_count: number
  error_rows: number
}

export interface MasterImportApplied {
  materials_created: number
  skus_created: number
  mappings_created: number
}

export interface MasterImportPreview {
  import_job_id: number
  status: ImportJobStatus
  filename?: string
  materials: MasterImportMaterialPlan[]
  skus: MasterImportSkuPlan[]
  mappings: MasterImportMappingPlan[]
  errors: MasterImportRowError[]
  summary: MasterImportSummary
  applied?: MasterImportApplied
}

// ---- Material quota import (Loại VL + Định mức) ----------------------------

export type MaterialImportAction = 'CREATE' | 'UPDATE' | 'NOCHANGE'

export interface MaterialImportItem {
  name: string
  code: string
  exists: boolean
  current_quota: number | null
  quota: number | null
  current_description: string
  description: string
  action: MaterialImportAction
  row_numbers: number[]
}

export interface MaterialImportRowError {
  row_number: number
  material: string
  error_code: string
  message: string
}

export interface MaterialImportSummary {
  total_rows: number
  new_materials: number
  updates: number
  unchanged: number
  error_rows: number
}

export interface MaterialImportApplied {
  created: number
  updated: number
}

export interface MaterialImportPreview {
  filename?: string
  items: MaterialImportItem[]
  errors: MaterialImportRowError[]
  summary: MaterialImportSummary
  applied?: MaterialImportApplied
}

export interface MasterImportJob {
  id: number
  filename?: string
  source?: string
  status: ImportJobStatus
  total_rows?: number
  new_materials?: number
  new_skus?: number
  new_mappings?: number
  review_count?: number
  missing_count?: number
  error_rows?: number
  materials_created?: number
  skus_created?: number
  mappings_created?: number
  created_at?: string
}

// ---- Design queue ----------------------------------------------------------

export interface MaterialBucket {
  material_id: number
  material_code: string
  material_name: string
  item_count: number
}

// ---- Batches ---------------------------------------------------------------

export interface BatchItem {
  id: number
  order_item_id?: number
  item_code?: string
  order_code?: string
  store_order_id?: string
  sku_code?: string
  product_name?: string
  mockup_url?: string
  print_file_url?: string
  cut_file_url?: string
  status: InternalStatus
  material_id?: number
  material?: Material
  // The full order item is preloaded by the batch-detail endpoint and carries
  // the production-ready fields shown in the production table / CSV export.
  order_item?: OrderItem
}

export interface Batch {
  id: number
  code: string
  material_id: number
  material_code?: string
  material_name?: string
  material?: Material
  status: InternalStatus
  priority?: Priority
  due_date?: string
  note?: string
  created_by_id?: number
  created_by?: User | null
  item_count?: number
  created_at?: string
  items?: BatchItem[]
  // ---- Batch mẹ–con (chẻ theo định mức NVL) ----
  // Một batch "mẹ" gom nhiều batch "con"; mỗi con chứa tối đa `products_per_unit`
  // sản phẩm của NVL. Batch phẳng (không chẻ) để trống toàn bộ các trường này.
  is_parent?: boolean
  // Set trên batch CON, trỏ về id batch mẹ. null/undefined = batch mẹ hoặc batch phẳng.
  parent_batch_id?: number | null
  // Thứ tự batch con trong mẹ (1..k) — dùng đặt hậu tố mã & sắp xếp hiển thị.
  sequence?: number
  // Số batch con (chỉ có ý nghĩa trên batch mẹ). Backend có thể trả kèm để list
  // hiển thị "Mẹ (k con)" mà không cần preload cả cây.
  child_count?: number
  // Danh sách batch con (batch mẹ preload ở endpoint chi tiết).
  child_batches?: Batch[]
  // Print/Cut links attached to the whole batch (entered once, shared by designs).
  links?: BatchLink[]
}

export interface BatchLink {
  id: number
  batch_id: number
  kind: BatchLinkKind
  url: string
  updated_by_id?: number | null
  updated_by?: User | null
  link_updated_at?: string
}

export interface CreateBatchResult {
  // Khi NVL có định mức và tổng sản phẩm vượt định mức, `batch` là batch MẸ và
  // `batch.child_batches` chứa các con. Ngược lại `batch` là batch phẳng như cũ.
  batch: Batch
  skipped_item_ids: number[]
}

// ---- QC --------------------------------------------------------------------

export interface QcScanBatch {
  batch_item_id: number
  batch_code: string
  material_code: string
  status: InternalStatus
}

export interface QcScanResult {
  item_id: number
  item_code: string
  order_code: string
  store_order_id: string
  sku_code: string
  product_name: string
  variant_code?: string
  quantity?: number
  material_name?: string
  qc_description?: string
  sku_description?: string
  sku_product_name?: string
  image_code?: string
  engrave_text?: string
  design_url?: string
  back_design_url?: string
  mockup_url: string
  print_file_url?: string
  cut_file_url?: string
  internal_status: InternalStatus
  batches: QcScanBatch[]
}

// ---- Packing ---------------------------------------------------------------

export interface PackingLine {
  order_item_id: number
  item_code: string
  sku_code: string
  expected: number
  scanned: number
}

export interface PackingResult {
  package_id: number
  package_code: string
  order_id: number
  order_code: string
  fully_packed: boolean
  status?: PackageStatus
  lines: PackingLine[]
}

// ---- Handoffs --------------------------------------------------------------

export interface Handoff {
  id: number
  code: string
  order_id?: number
  package_id?: number
  carrier: string
  status: HandoffStatus
  tracking_number?: string
  label_url?: string
  box_type?: string
  weight_grams?: number
  handed_off_at?: string
  created_at?: string
}

// ---- Notes -----------------------------------------------------------------

export interface Note {
  id: number
  title: string
  body?: string
  reason_code?: string
  severity: NoteSeverity
  status: NoteStatus
  is_required_attention: boolean
  entity_type?: EntityType
  entity_id?: number
  owner_role?: Role
  due_date?: string
  created_at?: string
  updated_at?: string
}

// ---- Seller view -----------------------------------------------------------

export interface SellerOrderItem {
  // Line-item id the backend assigns (same value as the internal OrderItem.id).
  // Required to target a single product for per-item cancellation — SKU/name are
  // not unique within an order (an order can hold the same SKU several times).
  id?: number
  // Some backend serializers expose the FK-style name instead of `id`.
  // Accept it during the API transition, but the UI still requires one of the
  // two values before it offers a per-item cancellation action.
  item_id?: number
  sku_code: string
  product_name?: string
  variant_code?: string
  quantity: number
  mockup_url?: string
  // Per-item cancellation state. Absent/NONE = active. SELLER_CANCELLED/APPROVED
  // = the product was removed from the order; REQUESTED = a removal is waiting on
  // ops to approve. Mirrors the order-level cancellation lifecycle.
  cancellation_status?: CancellationStatus
}

export interface SellerOrder {
  id: number
  internal_code: string
  store_order_id: string
  store_order_dup?: boolean
  store_name?: string
  status: SellerStatus
  review_status: ReviewStatus
  cancellation_status: CancellationStatus
  review_note?: string
  can_cancel: boolean
  can_request_cancellation: boolean
  item_count: number
  created_at: string
  items?: SellerOrderItem[]
}

// ---- Order review (intake) -------------------------------------------------

export interface ReviewIssue {
  item_id?: number
  item_code?: string
  sku_code?: string
  field: string
  severity: 'BLOCKER' | 'WARNING'
  code: string
  message: string
}

export interface ReviewOrderDetail {
  order: Order
  issues: ReviewIssue[]
}

// ---- Audit -----------------------------------------------------------------

export interface AuditLog {
  action: string
  actor_email: string
  summary: string
  entity_type?: string
  entity_id?: number
  created_at: string
}

// ---- Generic list params ---------------------------------------------------

export interface ListParams {
  page?: number
  page_size?: number
  [key: string]: string | number | boolean | undefined
}

export interface ListResult<T> {
  data: T[]
  meta?: ApiMeta
}
