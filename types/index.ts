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
  /** Customer support: looks orders up and attaches tracking numbers. */
  | 'CS'
  | 'SELLER'

/** Internal item / batch status (hidden from sellers). */
export type InternalStatus = 'PENDING' | 'PRINTED' | 'CUT' | 'QC_PASSED'

/**
 * Seller-facing order status. DELIVERED do đồng bộ tracking đặt, không phải do
 * ai bấm ở xưởng — không có bàn nào chứng kiến việc giao hàng.
 */
export type SellerStatus = 'PRODUCTION' | 'PACKED' | 'HANDED_OFF' | 'SHIPPED' | 'DELIVERED'

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

/**
 * Đơn/sản phẩm đang ở đâu tại thời điểm huỷ. Đây là căn cứ duy nhất cho cả hai
 * vế của luật huỷ: seller được huỷ thẳng hay phải chờ duyệt, và có tính tiền
 * khách hay không. Chỉ PRE_PRODUCTION là huỷ miễn phí.
 */
export type CancelStage = '' | 'PRE_PRODUCTION' | 'IN_PRODUCTION' | 'PACKED' | 'SHIPPED'

export type DesignStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'MISSING'

export type Priority = 'NORMAL' | 'HIGH' | 'URGENT'

export type QcResult = 'PASS' | 'FAIL'

export type NoteSeverity = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export type NoteStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED'

export type EntityType = 'ORDER' | 'ORDER_ITEM' | 'BATCH' | 'BATCH_ITEM' | 'PACKAGE' | 'HANDOFF'

export type ImportJobStatus = 'PREVIEW' | 'COMMITTED' | 'FAILED' | 'CANCELLED'

export type PackageStatus = 'OPEN' | 'PACKED'

export type HandoffStatus = 'HANDED_OFF' | 'SHIPPED'

/**
 * Shipment tracking status on an order. Entered by hand at the shipping desk and
 * then kept in step with the parcel by the tracking sync.
 */
export type TrackingStatus =
  | 'NONE'
  | 'PENDING'
  | 'PRE_TRANSIT'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'PICK_UP'
  | 'DELIVERED'
  | 'UNDELIVERED'
  | 'EXCEPTION'
  | 'EXPIRED'
  | 'CANCELLED'

/** One scan in a parcel's journey, mirrored from the tracking provider. */
export interface OrderTrackingEvent {
  id: number
  order_id: number
  tracking_number: string
  /** Parsed scan time — present only when the provider's date string was understood. */
  event_at?: string | null
  /** The provider's own date string; shown as-is because it carries no timezone. */
  raw_date?: string
  location?: string
  description?: string
  status_hint?: string
  created_at: string
}

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
  // Vị trí dòng trong đơn (1-based). Dùng để hiện STT dạng "2.3" và để sắp xếp
  // các dòng của cùng một đơn theo đúng thứ tự.
  line_no?: number
  sku_code: string
  product_name?: string
  variant_code?: string
  quantity: number
  internal_status: InternalStatus
  design_status: DesignStatus
  // Số lần sản phẩm bị QC fail và phải làm lại. >0 nghĩa là lần vào batch này là
  // lần sản xuất thứ (rework_count + 1).
  rework_count?: number
  cancellation_status?: CancellationStatus
  cancellation_requested_at?: string | null
  cancellation_reason?: string
  cancellation_resolution_note?: string
  cancel_stage?: CancelStage
  cancel_billable?: boolean
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
  // Đơn bị huỷ ở khâu nào, và có còn tính tiền khách không. Đã vào sản xuất thì
  // mặc định vẫn tính tiền; Ops/Admin có thể miễn khi duyệt.
  cancel_stage?: CancelStage
  cancel_billable?: boolean
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
  // Tracking: entered at the shipping desk, then synced from 24hTrack.
  tracking_number?: string
  tracking_status?: TrackingStatus
  // tracking_url là link NỘI BỘ tới nhà cung cấp tracking — không bao giờ đi ra
  // màn seller. Cũng không có trường "đơn vị vận chuyển": với seller thì chúng
  // ta là đơn vị vận chuyển, tên hãng chở thật là thông tin nhà cung cấp.
  tracking_url?: string
  tracking_updated_at?: string | null
  // Provider-sync mirror of the latest scan, so a list row can show
  // where the parcel is without loading its whole journey.
  tracking_detail?: string
  tracking_location?: string
  tracking_raw_status?: string
  tracking_delivered_at?: string | null
  tracking_synced_at?: string | null
  tracking_sync_error?: string
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
  // NVL trong catalog mà dòng này sửa (null = tạo mới). Tên NVL không unique nên
  // server chốt theo id, không theo tên.
  material_id: number | null
  current_quota: number | null
  quota: number | null
  current_description: string
  description: string
  action: MaterialImportAction
  row_numbers: number[]
  // Trùng tên với dòng khác trong file nhưng khác định mức/mô tả → là NVL riêng.
  name_variant: boolean
}

export interface MaterialImportRowError {
  row_number: number
  material: string
  error_code: string
  message: string
  // Mọi dòng file gây ra lỗi này (lỗi trùng định mức do ≥2 dòng chọi nhau).
  // Vắng mặt với các lỗi chỉ liên quan đúng 1 dòng.
  row_numbers?: number[]
}

export interface MaterialImportSummary {
  total_rows: number
  new_materials: number
  updates: number
  unchanged: number
  error_rows: number
  // Số dòng bị gộp vì trùng cả 3 cột (Loại VL + Định mức + Mô tả).
  duplicate_rows: number
  // Số NVL trùng tên nhưng khác định mức/mô tả → giữ riêng, không gộp.
  name_variants: number
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

// Một mục bị bỏ qua trong thao tác xoá hàng loạt, kèm lý do server trả về (đang
// được nơi khác tham chiếu, hoặc đã bị xoá trước đó).
export interface BulkDeleteSkip {
  id: number
  code: string
  name: string
  reason: string
}

// Kết quả xoá NVL / SKU hàng loạt: id đã xoá + những cái bị bỏ qua kèm lý do.
export interface MaterialDeleteResult {
  deleted_ids: number[]
  skipped: BulkDeleteSkip[]
}

// Kết quả xoá ghi chú hàng loạt. Không có ràng buộc "đang được dùng" như NVL/SKU
// — note chỉ có thể bị bỏ qua nếu đã bị xoá trước đó.
export interface NoteDeleteResult {
  // Số bản ghi server thực sự xoá — dùng con số này để báo, vì chế độ "tất cả
  // theo bộ lọc" không trả về danh sách id.
  deleted_count: number
  deleted_ids: number[]
  missing_ids: number[]
}

export interface SkuDeleteResult {
  deleted_ids: number[]
  skipped: BulkDeleteSkip[]
}

// One SKU present in the design queue, with how many items it covers — backs the
// SKU filter dropdown so it only lists SKUs that actually have work.
export interface SKUBucket {
  sku_code: string
  sku_name: string
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
  // Batch đã đóng: mọi sản phẩm nó làm ra đều bị huỷ ở QC nên không còn gì để
  // sản xuất — hàng được làm lại ở batch khác. Không phải batch "trống".
  closed_at?: string | null
  close_reason?: string
  // Số phần đã huỷ do QC fail (vẫn thuộc batch này để truy vết).
  scrapped_count?: number
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

// Kết quả QC fail: note đã mở + hệ thống đã làm gì với sản phẩm.
export interface QcFailResult {
  note: Note
  scrapped_batch_item_id?: number
  batch_code?: string
  material_name?: string
  // PRODUCTION = chờ gom vào batch làm lại; DESIGN = chờ sửa file rồi mới batch lại.
  route: 'PRODUCTION' | 'DESIGN'
  attempt: number
}

// ---- Kết quả QC theo đơn -----------------------------------------------------

/** PASSED = đã QC đạt · REWORK = QC fail, đang làm lại · WAITING = chưa tới lượt QC. */
export type QcItemStatus = 'PASSED' | 'REWORK' | 'WAITING'
/** DONE = mọi sản phẩm đã đạt (sẵn sàng đóng gói) · PARTIAL = đạt một phần · NONE = chưa cái nào. */
export type QcOrderStatus = 'DONE' | 'PARTIAL' | 'NONE'

export interface QcResultItem {
  item_id: number
  internal_code: string
  sku_code: string
  product_name?: string
  quantity: number
  internal_status: InternalStatus
  qc_status: QcItemStatus
  rework_count: number
  mockup_url?: string
  last_result?: QcResult
  last_defect?: string
  last_note?: string
  last_checked_at?: string
  last_checked_by?: string
}

export interface QcResultOrder {
  order_id: number
  internal_code: string
  store_order_id: string
  seller_name?: string
  order_date?: string
  daily_seq?: number
  created_at: string
  status: QcOrderStatus
  total_items: number
  passed_items: number
  rework_items: number
  waiting_items: number
  items: QcResultItem[]
  // Nửa sau vòng đời đơn. Màn "Chờ gửi hàng" và "Hành trình đơn hàng" cùng dựng
  // trên endpoint này, nên cần biết đơn đã gửi cho THE chưa và kiện đang ở đâu.
  seller_status?: SellerStatus
  handed_over?: boolean
  tracking_number?: string
  tracking_status?: TrackingStatus
}

export interface QcResultSummary {
  orders: number
  orders_done: number
  orders_partial: number
  orders_none: number
  items_passed: number
  items_waiting: number
  items_rework: number
}

export interface QcResultsPayload {
  orders: QcResultOrder[]
  summary: QcResultSummary
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
  material_description?: string
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
  // Quyền huỷ tính theo tiến độ của CHÍNH dòng này: một sản phẩm chưa động tới
  // trong đơn đã sản xuất một phần vẫn được huỷ thẳng.
  can_cancel?: boolean
  can_request_cancellation?: boolean
  cancel_will_bill?: boolean
  cancel_stage?: CancelStage
  cancel_billable?: boolean
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
  // Đúng một trong hai được bật: huỷ thẳng (chưa sản xuất, không mất tiền) hoặc
  // gửi yêu cầu để vận hành duyệt (đã sản xuất → vẫn tính tiền).
  can_cancel: boolean
  can_request_cancellation: boolean
  // Đơn ĐANG đứng ở đâu, và huỷ từ đây có bị tính tiền không — dùng để cảnh báo
  // trước khi bấm.
  current_stage?: CancelStage
  cancel_will_bill?: boolean
  // Giai đoạn + quyết định tính tiền đã ghi lại của lần huỷ THỰC SỰ xảy ra.
  cancel_stage?: CancelStage
  cancel_billable?: boolean
  // Hồ sơ của lần huỷ đã xảy ra: seller xin gì, vận hành trả lời gì, lúc nào.
  // Seller còn bị tính tiền cho đơn đã huỷ thì phải đọc được lý do trên màn hình.
  cancellation_reason?: string
  cancellation_resolution_note?: string
  cancellation_requested_at?: string | null
  cancellation_resolved_at?: string | null
  item_count: number
  created_at: string
  items?: SellerOrderItem[]
  // Vận chuyển: seller up đơn thì được biết kiện hàng đang ở đâu. Trạng thái chỉ
  // xuất hiện khi thực sự có kiện — backend bỏ hẳn NONE để "chưa có mã vận đơn"
  // không bị hiểu nhầm là một trạng thái vận chuyển.
  tracking_number?: string
  tracking_status?: TrackingStatus
  tracking_detail?: string
  tracking_location?: string
  tracking_updated_at?: string | null
  // Người nhận — dữ liệu do CHÍNH seller up lên nên trả về nguyên vẹn (khác khối
  // tracking ở trên, vốn phải giấu tên đối tác vận chuyển). Backend chỉ gắn khối
  // này vào endpoint CHI TIẾT, không gắn vào list: bảng danh sách không hiện địa
  // chỉ nên gửi kèm 20 lần là phí payload.
  shipping_name?: string
  shipping_address1?: string
  shipping_address2?: string
  shipping_city?: string
  shipping_province?: string
  shipping_zip?: string
  shipping_country?: string
  shipping_phone?: string
  shipping_email?: string
  ioss?: string
  shipping_method?: string
  note?: string
}

/**
 * Một mốc trong lịch sử đơn hàng của seller. `kind` cho biết đọc from/to bằng bộ
 * nhãn nào — REVIEW_STATUS hay SELLER_STATUS — vì hai hệ thống con ghi lịch sử
 * bằng hai bộ enum khác nhau. `actor` là VAI TRÒ, không bao giờ là tên người:
 * seller được biết "phía nào làm", không phải danh tính nhân viên xưởng.
 */
export interface SellerOrderHistoryEvent {
  at: string
  kind: 'review' | 'production'
  from_status?: string
  to_status?: string
  actor: 'seller' | 'ops' | 'system'
  note?: string
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
