import type {
  InternalStatus,
  SellerStatus,
  DesignStatus,
  Priority,
  NoteSeverity,
  NoteStatus,
  Role,
  ReviewStatus,
  CancellationStatus,
  CancelStage,
  EntityType,
  TrackingStatus,
} from '~/types'

export interface BadgeMeta {
  label: string
  // Tailwind classes for a flat soft-minimal badge (soft tint fill + text, no ring).
  classes: string
}

// ---- Internal status (Pending / Đã in / Đã cắt / Đã QC) --------------------
export const INTERNAL_STATUS: Record<InternalStatus, BadgeMeta> = {
  PENDING: { label: 'Chờ xử lý', classes: 'bg-muted text-muted-foreground' },
  PRINTED: { label: 'Đã in', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  CUT: { label: 'Đã cắt', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  QC_PASSED: { label: 'Đã QC', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

export const INTERNAL_STATUS_ORDER: InternalStatus[] = ['PENDING', 'PRINTED', 'CUT', 'QC_PASSED']

// Chặng do BẢNG SẢN XUẤT đặt (theo từng NVL/batch). Không có QC_PASSED: QC là
// cổng cấp sản phẩm, chỉ thực hiện 1 lần ở trạm QC khi mọi NVL đã sản xuất xong;
// batch chỉ lên QC_PASSED nhờ roll-up từ item đã QC, không bấm tay trên board.
export const PRODUCTION_STATUS_ORDER: InternalStatus[] = ['PENDING', 'PRINTED', 'CUT']

// ---- Seller status ---------------------------------------------------------
export const SELLER_STATUS: Record<SellerStatus, BadgeMeta> = {
  PRODUCTION: { label: 'Đang sản xuất', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  PACKED: { label: 'Đã đóng gói', classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  HANDED_OFF: { label: 'Đã bàn giao', classes: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  SHIPPED: { label: 'Đã gửi đi', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  // Chặng cuối, do đồng bộ tracking đặt. Trước đây không có nó nên đơn đã giao
  // xong vẫn đứng ở "Đã bàn giao" cạnh một badge tracking ghi "Đã giao".
  DELIVERED: { label: 'Đã giao', classes: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
}

// ---- Review (intake) status ------------------------------------------------
export const REVIEW_STATUS: Record<ReviewStatus, BadgeMeta> = {
  PENDING_REVIEW: { label: 'Chờ duyệt', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  NEEDS_CORRECTION: { label: 'Cần chỉnh sửa', classes: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  APPROVED: { label: 'Đã duyệt', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  REJECTED: { label: 'Từ chối', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
  CANCELLED: { label: 'Đã huỷ', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
}

export const REVIEW_STATUS_OPTIONS = ['PENDING_REVIEW', 'NEEDS_CORRECTION'] as const

// ---- Cancellation status ---------------------------------------------------
export const CANCELLATION_STATUS: Record<CancellationStatus, BadgeMeta> = {
  NONE: { label: '—', classes: 'bg-muted text-muted-foreground' },
  SELLER_CANCELLED: { label: 'Seller huỷ', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
  REQUESTED: { label: 'Chờ xử lý huỷ', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  APPROVED: { label: 'Đồng ý huỷ', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  REJECTED: { label: 'Từ chối huỷ', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
}

// ---- Cancellation stage ----------------------------------------------------
// Đơn bị huỷ ở khâu nào. Nhãn này luôn đi kèm câu trả lời "có tính tiền không":
// từ lúc vào sản xuất là đã tốn NVL và công máy nên vẫn tính tiền khách.
export const CANCEL_STAGE: Record<Exclude<CancelStage, ''>, BadgeMeta> = {
  PRE_PRODUCTION: { label: 'Chưa sản xuất', classes: 'bg-muted text-muted-foreground' },
  IN_PRODUCTION: { label: 'Đang sản xuất', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  PACKED: { label: 'Đã đóng gói', classes: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  SHIPPED: { label: 'Đã gửi đi', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
}

export function cancelStageLabel(stage?: CancelStage): string {
  if (!stage) return '—'
  return CANCEL_STAGE[stage]?.label ?? stage
}

// ---- Design status ---------------------------------------------------------
export const DESIGN_STATUS: Record<DesignStatus, BadgeMeta> = {
  PENDING: { label: 'Chờ design', classes: 'bg-muted text-muted-foreground' },
  IN_PROGRESS: { label: 'Đang design', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  READY: { label: 'Sẵn sàng', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  MISSING: { label: 'Thiếu file', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
}

// ---- Priority --------------------------------------------------------------
export const PRIORITY: Record<Priority, BadgeMeta> = {
  NORMAL: { label: 'Bình thường', classes: 'bg-muted text-muted-foreground' },
  HIGH: { label: 'Cao', classes: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  URGENT: { label: 'Khẩn cấp', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
}

// ---- Note severity ---------------------------------------------------------
export const NOTE_SEVERITY: Record<NoteSeverity, BadgeMeta> = {
  LOW: { label: 'Thấp', classes: 'bg-muted text-muted-foreground' },
  NORMAL: { label: 'Bình thường', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  HIGH: { label: 'Cao', classes: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  CRITICAL: { label: 'Nghiêm trọng', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
}

// ---- Note status -----------------------------------------------------------
export const NOTE_STATUS: Record<NoteStatus, BadgeMeta> = {
  OPEN: { label: 'Đang mở', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
  IN_PROGRESS: { label: 'Đang xử lý', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  WAITING: { label: 'Chờ', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  RESOLVED: { label: 'Đã xử lý', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

// ---- Tracking status -------------------------------------------------------
export const TRACKING_STATUS: Record<TrackingStatus, BadgeMeta> = {
  NONE: { label: 'Chưa có', classes: 'bg-muted text-muted-foreground' },
  PENDING: { label: 'Chờ lấy hàng', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  PRE_TRANSIT: { label: 'Chuẩn bị vận chuyển', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  IN_TRANSIT: { label: 'Đang vận chuyển', classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  OUT_FOR_DELIVERY: { label: 'Đang giao', classes: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  PICK_UP: { label: 'Chờ nhận tại bưu cục', classes: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' },
  DELIVERED: { label: 'Đã giao', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  UNDELIVERED: { label: 'Giao không thành công', classes: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  EXCEPTION: { label: 'Sự cố', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
  EXPIRED: { label: 'Hết hạn theo dõi', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
  CANCELLED: { label: 'Đã huỷ vận chuyển', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
}

export const TRACKING_STATUS_OPTIONS: { value: TrackingStatus; label: string }[] = (
  Object.keys(TRACKING_STATUS) as TrackingStatus[]
).map((k) => ({ value: k, label: TRACKING_STATUS[k].label }))

// ---- Roles -----------------------------------------------------------------
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Chủ sở hữu',
  ADMIN: 'Quản trị viên',
  OPS: 'Vận hành (Ops)',
  DESIGNER: 'Designer',
  PRODUCTION: 'Sản xuất',
  QC: 'QC',
  PACKING: 'Đóng gói',
  SHIPPING: 'Vận chuyển',
  CS: 'CSKH (hỗ trợ khách)',
  SELLER: 'Seller',
}

// ---- Generic helpers -------------------------------------------------------
export function badgeFrom<T extends string>(
  map: Record<T, BadgeMeta>,
  value: T | undefined | null,
): BadgeMeta {
  if (value && map[value]) return map[value]
  return { label: value ?? '—', classes: 'bg-muted text-muted-foreground' }
}

/**
 * Kiện hàng đã rời xưởng sang hãng vận chuyển chưa — ranh giới giữa hai nửa vòng
 * đời đơn. Trước ngưỡng này chưa có kiện nào để tra hành trình.
 *
 * Là một hàm chứ không phải so sánh tại chỗ vì có 5 màn cùng hỏi câu này; khi
 * thêm DELIVERED, mọi chỗ viết `=== 'HANDED_OFF' || === 'SHIPPED'` đều âm thầm
 * trả về false cho đơn đã giao. Đây là bản song sinh của `SellerStatus.HandedOver()`
 * bên Go — sửa một bên thì sửa cả hai.
 */
export const HANDED_OVER_STATUSES: SellerStatus[] = ['HANDED_OFF', 'SHIPPED', 'DELIVERED']

export function isHandedOver(s?: SellerStatus | null): boolean {
  return !!s && HANDED_OVER_STATUSES.includes(s)
}

export type StatusKind = 'review' | 'internal' | 'seller' | 'tracking'
export interface StatusBadgeRef {
  kind: StatusKind
  value: string
}

/**
 * Trạng thái hiện hành của đơn. HAI bảng từ vựng ở giai đoạn 1, hợp nhất thành
 * MỘT ở giai đoạn 2 — đúng mô hình nghiệp vụ, không phải một trạng thái duy nhất.
 *
 *   Giai đoạn 1 — hàng còn ở xưởng. Hai quyền đọc bằng hai bảng từ vựng:
 *     · nội bộ : Chưa in → Đã in → Đã cắt → Đã QC → Đã đóng gói → Đã bàn giao → Đã gửi đi
 *     · seller : Đang sản xuất ──────────────────→ Đã đóng gói → Đã bàn giao → Đã gửi đi
 *     Seller KHÔNG BAO GIỜ thấy in/cắt/QC. Hai nhánh cùng kết thúc ở "Đã gửi đi".
 *
 *   Giai đoạn 2 — hàng đã sang hãng vận chuyển. Một bảng từ vựng CHUNG:
 *     Đang vận chuyển → Đang giao → Đã giao … mọi quyền đọc y hệt nhau.
 *
 * Trước đây mỗi màn tự chọn cột để hiện nên bốn màn có bốn luật khác nhau, và
 * chi tiết đơn nội bộ thì không có luật nào — nó đọc thẳng `seller_status`, nên
 * header ghi "Đã gửi đi" trong khi khối vận chuyển ngay dưới ghi "Đang vận
 * chuyển": một sự việc kể bằng hai cột, đọc ra như hai trạng thái mâu thuẫn.
 *
 * `internalStatus` là thứ phân biệt người xem: màn nội bộ truyền vào (cấp item
 * thì truyền của chính item, cấp đơn thì truyền orderInternalStatus()), màn
 * seller không truyền. Nó chỉ được dùng khi đơn CÒN đang sản xuất — qua khỏi đó
 * thì đóng gói/bàn giao đã đi xa hơn mọi khâu in-cắt-QC, hiện "Đã QC" cho một
 * đơn đã đóng gói là nói lùi.
 */
export function orderStatusBadge(
  o: {
    review_status?: ReviewStatus | null
    seller_status?: SellerStatus | null
    cancellation_status?: CancellationStatus | null
    tracking_status?: TrackingStatus | null
  },
  internalStatus?: InternalStatus | null,
): StatusBadgeRef {
  if (o.cancellation_status === 'SELLER_CANCELLED' || o.review_status === 'CANCELLED') {
    return { kind: 'review', value: 'CANCELLED' }
  }
  if (o.review_status && o.review_status !== 'APPROVED') {
    return { kind: 'review', value: o.review_status }
  }
  // ---- Giai đoạn 2: hãng vận chuyển đã cầm hàng và đã quét ----
  if (isHandedOver(o.seller_status)) {
    // NONE là chỗ trống của hệ thống, không phải một trạng thái vận chuyển — đơn
    // vừa bàn giao mà hãng chưa quét lần nào thì vẫn còn ở cuối giai đoạn 1.
    if (o.tracking_status && o.tracking_status !== 'NONE') {
      return { kind: 'tracking', value: o.tracking_status }
    }
    return { kind: 'seller', value: o.seller_status as SellerStatus }
  }
  // ---- Giai đoạn 1 ----
  if (internalStatus && o.seller_status === 'PRODUCTION') {
    return { kind: 'internal', value: internalStatus }
  }
  return { kind: 'seller', value: (o.seller_status ?? 'PRODUCTION') as SellerStatus }
}

/**
 * Khâu sản xuất của cả ĐƠN = khâu CHẬM NHẤT trong các sản phẩm còn sống của nó.
 * Đơn chỉ "Đã cắt" khi mọi sản phẩm đều đã cắt; một dòng còn chờ in thì cả đơn
 * vẫn đang chờ in. Cùng quy tắc với cách backend cuộn trạng thái item lên từ các
 * phần batch (deriveItemStatusFromBatchItems).
 *
 * Chỉ dùng cho màn nội bộ. Trả null khi đơn không kèm danh sách sản phẩm, để
 * orderStatusBadge rơi về từ vựng seller thay vì bịa ra một khâu.
 */
export function orderInternalStatus(
  items?: { internal_status?: InternalStatus | null }[] | null,
): InternalStatus | null {
  if (!items || items.length === 0) return null
  let min: InternalStatus | null = null
  for (const it of items) {
    const s = it.internal_status
    if (!s) continue
    if (min === null || INTERNAL_STATUS_ORDER.indexOf(s) < INTERNAL_STATUS_ORDER.indexOf(min)) {
      min = s
    }
  }
  return min
}

/**
 * Bản dành cho màn seller. `SellerOrder` đặt tên cột là `status` chứ không phải
 * `seller_status`, nên đây chỉ là lớp đổi tên — luật thì dùng chung với nội bộ,
 * để seller và vận hành không bao giờ đọc ra hai trạng thái khác nhau về cùng
 * một đơn.
 */
export function sellerDisplayBadge(o: {
  status: SellerStatus
  review_status: ReviewStatus
  cancellation_status: CancellationStatus
  tracking_status?: TrackingStatus | null
}): StatusBadgeRef {
  return orderStatusBadge({
    review_status: o.review_status,
    seller_status: o.status,
    cancellation_status: o.cancellation_status,
    tracking_status: o.tracking_status,
  })
}

export const PRIORITY_OPTIONS = ['NORMAL', 'HIGH', 'URGENT'] as const
export const NOTE_SEVERITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const
export const NOTE_STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED'] as const
export const ENTITY_TYPE_OPTIONS = [
  'ORDER',
  'ORDER_ITEM',
  'BATCH',
  'BATCH_ITEM',
  'PACKAGE',
  'HANDOFF',
] as const

// Plain-Vietnamese labels for the note "attach to" entity types — the raw codes
// (ORDER_ITEM, BATCH_ITEM, HANDOFF…) mean nothing to workshop staff.
export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  ORDER: 'Đơn hàng',
  ORDER_ITEM: 'Sản phẩm trong đơn',
  BATCH: 'Batch sản xuất',
  BATCH_ITEM: 'Sản phẩm trong batch',
  PACKAGE: 'Kiện hàng',
  HANDOFF: 'Bàn giao',
}
// Safe lookup for display: falls back to the raw value if it's an unknown/legacy code.
export const entityTypeLabel = (t?: string | null): string =>
  (t && ENTITY_TYPE_LABEL[t as EntityType]) || t || ''

// QC defect codes + plain-Vietnamese labels. Single source of truth shared by the
// QC "Ghi nhận lỗi" dialog (dropdown) and note/dashboard displays — a note's
// reason_code IS the QC defect code, so it must read the same everywhere instead
// of surfacing the raw PRINT_WRONG / CUT_WRONG on the notes screen.
export const DEFECT_CODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'PRINT_WRONG', label: 'In sai / lệch màu' },
  { value: 'CUT_WRONG', label: 'Cắt sai / mẻ cạnh' },
  { value: 'ENGRAVE_WRONG', label: 'Khắc sai nội dung' },
  { value: 'MATERIAL_DEFECT', label: 'Lỗi vật liệu' },
  { value: 'WRONG_MOCKUP', label: 'Không khớp mockup' },
  { value: 'OTHER', label: 'Lỗi khác' },
]
export const DEFECT_CODE_LABEL: Record<string, string> = Object.fromEntries(
  DEFECT_CODE_OPTIONS.map((o) => [o.value, o.label]),
)
// Display helper for a note reason_code; unknown/custom codes fall back to raw.
export const reasonCodeLabel = (code?: string | null): string =>
  (code && DEFECT_CODE_LABEL[code]) || code || ''
