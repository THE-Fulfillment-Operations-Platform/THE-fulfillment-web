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
  mockup_url?: string
  engrave_text?: string
  print_file_url?: string
  cut_file_url?: string
  design_url?: string
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
  exists: boolean
  material_names: string[]
  status: MasterSkuStatus
  row_count: number
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
  creator_name?: string
  created_by?: string
  item_count?: number
  created_at?: string
  items?: BatchItem[]
}

export interface CreateBatchResult {
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
  quantity?: number
  material_name?: string
  qc_description?: string
  image_code?: string
  engrave_text?: string
  design_url?: string
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
  sku_code: string
  product_name?: string
  variant_code?: string
  quantity: number
  mockup_url?: string
}

export interface SellerOrder {
  id: number
  internal_code: string
  store_order_id: string
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
