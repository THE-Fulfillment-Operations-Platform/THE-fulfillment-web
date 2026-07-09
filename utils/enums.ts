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
  EntityType,
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

// ---- Seller status ---------------------------------------------------------
export const SELLER_STATUS: Record<SellerStatus, BadgeMeta> = {
  PRODUCTION: { label: 'Đang sản xuất', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  PACKED: { label: 'Đã đóng gói', classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  HANDED_OFF: { label: 'Đã bàn giao', classes: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  SHIPPED: { label: 'Đã gửi đi', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
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

// Effective seller-facing badge: show the review status until an order is
// approved, then fall through to the production (seller) status. Sellers never
// see internal print/cut/QC steps.
export function sellerDisplayBadge(o: {
  status: SellerStatus
  review_status: ReviewStatus
  cancellation_status: CancellationStatus
}): { kind: 'seller' | 'review'; value: string } {
  if (o.cancellation_status === 'SELLER_CANCELLED' || o.review_status === 'CANCELLED') {
    return { kind: 'review', value: 'CANCELLED' }
  }
  if (o.review_status === 'REJECTED') return { kind: 'review', value: 'REJECTED' }
  if (o.review_status === 'PENDING_REVIEW' || o.review_status === 'NEEDS_CORRECTION') {
    return { kind: 'review', value: o.review_status }
  }
  return { kind: 'seller', value: o.status }
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
