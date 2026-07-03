import type {
  InternalStatus,
  SellerStatus,
  DesignStatus,
  Priority,
  NoteSeverity,
  NoteStatus,
  Role,
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
