// Chặng của batch cho Bảng sản xuất (Nghĩa 27/11: "đọc lại cả dự án xem có những
// trạng thái nào thì cho hết vào để lọc").
//
// batches.status chỉ có 4 giá trị, nhưng phần còn lại của hệ thống gọi batch bằng
// nhiều nhãn hơn: "Đã có file SX", "Đã bàn giao", "Đã đóng", và sau QC thì hàng đi
// theo đơn (Đã đóng gói → Đã bàn giao → Đã gửi đi → Đã giao). API tính sẵn một CHẶNG
// cho mỗi batch, loại trừ nhau (repositories/batch_stage.go bên API — sửa một bên
// thì sửa cả hai), lọc bằng ?stage= và đếm bằng /api/batches/stage-counts.
//
// Nhãn + màu KHÔNG tự đặt ở đây: lấy từ bảng của phần còn lại của hệ thống
// (INTERNAL_STATUS, SELLER_STATUS, PRODUCTION_FILES_READY, TONE) để cùng một chữ
// luôn cùng một màu ở mọi màn.
import type { Batch, InternalStatus } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER, SELLER_STATUS, type BadgeMeta } from './enums'
import { PRODUCTION_FILES_READY } from './batch'
import { TONE } from './statusColors'

export type BatchLifecycleStage =
  | 'FILES_MISSING'
  | 'FILES_READY'
  | 'PRINTED'
  | 'CUT'
  | 'QC_PASSED'
  | 'PACKED'
  | 'HANDED_OFF'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CLOSED'
  | 'NO_ITEMS'

export interface StageMeta extends BadgeMeta {
  /** Một dòng giải thích dưới nhãn trong ô lọc (để trống nếu nhãn đã đủ rõ). */
  note?: string
  /**
   * Chặng đã xong việc: cột xếp MỚI NHẤT trước (?sort=newest) — cột còn việc thì
   * cũ nhất trước để batch đến lượt trước nằm trên cùng.
   */
  done: boolean
}

export const BATCH_LIFECYCLE: Record<BatchLifecycleStage, StageMeta> = {
  FILES_MISSING: { ...INTERNAL_STATUS.PENDING, note: 'chưa đủ link in + cắt', done: false },
  FILES_READY: { ...PRODUCTION_FILES_READY, done: false },
  PRINTED: { ...INTERNAL_STATUS.PRINTED, done: false },
  CUT: { ...INTERNAL_STATUS.CUT, done: false },
  QC_PASSED: { ...INTERNAL_STATUS.QC_PASSED, note: 'còn đơn chưa đóng gói', done: false },
  PACKED: { ...SELLER_STATUS.PACKED, done: false },
  HANDED_OFF: { ...SELLER_STATUS.HANDED_OFF, done: true },
  SHIPPED: { ...SELLER_STATUS.SHIPPED, done: true },
  DELIVERED: { ...SELLER_STATUS.DELIVERED, done: true },
  CLOSED: { label: 'Đã đóng', classes: TONE.cancelled, note: 'huỷ batch / huỷ hết ở QC', done: true },
  NO_ITEMS: { label: 'Đơn đã huỷ hết', classes: TONE.cancelled, note: 'mọi dòng đơn đã huỷ', done: true },
}

/** Thứ tự vòng đời = thứ tự trong ô lọc và thứ tự cột. */
export const BATCH_LIFECYCLE_ORDER: BatchLifecycleStage[] = [
  'FILES_MISSING', 'FILES_READY', 'PRINTED', 'CUT', 'QC_PASSED', 'PACKED',
  'HANDED_OFF', 'SHIPPED', 'DELIVERED', 'CLOSED', 'NO_ITEMS',
]

export const isLifecycleStage = (s: string): s is BatchLifecycleStage =>
  (BATCH_LIFECYCLE_ORDER as string[]).includes(s)

/** Nhãn + màu của một chặng; chặng lạ (API mới hơn web) hiện nguyên mã, màu xám. */
export function stageMeta(s: string): StageMeta {
  return isLifecycleStage(s) ? BATCH_LIFECYCLE[s] : { label: s, classes: TONE.pending, done: true }
}

// ---- Ô Trạng thái <-> URL ----------------------------------------------------
// Giá trị trên URL (?status=) là mã chặng. Link cũ (trước 27/11) gửi trạng thái
// lưu hoặc token của màn Batch: đổi sang đúng tập chặng cùng nghĩa.
const LEGACY: Record<string, BatchLifecycleStage[]> = {
  PENDING: ['FILES_MISSING', 'FILES_READY'],
  HANDED_OVER: ['HANDED_OFF', 'SHIPPED', 'DELIVERED'],
  HANDOVER_PENDING: ['QC_PASSED', 'PACKED'],
}

/** Danh sách từ URL → chặng hợp lệ, bỏ trùng, theo thứ tự vòng đời. */
export function stagesFromQuery(values: string[]): BatchLifecycleStage[] {
  const set = new Set<BatchLifecycleStage>()
  for (const v of values) {
    if (isLifecycleStage(v)) set.add(v)
    else for (const s of LEGACY[v] ?? []) set.add(s)
  }
  return BATCH_LIFECYCLE_ORDER.filter((s) => set.has(s))
}

// ---- Cột của bảng --------------------------------------------------------------

/**
 * Một cột. kind 'status' = cột mặc định theo trạng thái lưu (y như bảng cũ: mọi
 * batch còn việc ở trạng thái đó, ?status=X&open=1); kind 'stage' = cột của một
 * chặng đã chọn (?stage=X).
 */
export interface BoardColumnSpec {
  key: string
  kind: 'status' | 'stage'
  value: string
  sort: 'oldest' | 'newest'
}

/**
 * Cột cần hiện. Không chọn gì (hoặc tick hết — ô chọn nhiều trả mảng rỗng) = hành
 * vi cũ: 4 cột Chờ xử lý / Đã in / Đã cắt / Đã QC, cộng một cột cho mỗi trạng thái
 * lưu lạ mà DB có (`extraStatuses`, từ bảng đếm) để không batch nào bị nuốt mất.
 * Chọn chặng = mỗi chặng một cột, theo thứ tự vòng đời.
 */
export function boardColumns(selected: string[], extraStatuses: string[] = []): BoardColumnSpec[] {
  if (!selected.length) {
    const known = INTERNAL_STATUS_ORDER as string[]
    const statuses = [...known, ...extraStatuses.filter((s) => !known.includes(s))]
    // Đã QC (và trạng thái lạ): phần lớn là batch đã bàn giao — mới nhất trước,
    // "Xem thêm" đi lùi về cũ. Cột còn việc: cũ nhất trước (đến lượt trước).
    return statuses.map((s) => ({
      key: `status:${s}`,
      kind: 'status' as const,
      value: s,
      sort: s === 'PENDING' || s === 'PRINTED' || s === 'CUT' ? ('oldest' as const) : ('newest' as const),
    }))
  }
  return stagesFromQuery(selected).map((s) => ({
    key: `stage:${s}`,
    kind: 'stage' as const,
    value: s,
    sort: BATCH_LIFECYCLE[s].done ? ('newest' as const) : ('oldest' as const),
  }))
}

/** Tham số API riêng của một cột (cộng với bộ lọc chung). */
export function columnParams(col: BoardColumnSpec): { status?: string; stage?: string; open?: boolean; sort: 'oldest' | 'newest' } {
  // Cột mặc định giữ y bảng cũ: bỏ batch đã đóng (?open=1). Cột chặng không cần:
  // chặng loại trừ nhau, batch đã đóng chỉ nằm ở chặng CLOSED.
  return col.kind === 'status'
    ? { status: col.value, open: true, sort: col.sort }
    : { stage: col.value, sort: col.sort }
}

/** Chặng "tự nhiên" của cột mặc định — thẻ ở chặng này không cần chip phụ. */
const NATURAL: Record<InternalStatus, BatchLifecycleStage> = {
  PENDING: 'FILES_MISSING',
  PRINTED: 'PRINTED',
  CUT: 'CUT',
  QC_PASSED: 'QC_PASSED',
}

/**
 * Chip phụ trên thẻ: ở cột mặc định, thẻ mà chặng khác chặng tự nhiên của cột thì
 * nói ra (cột Chờ xử lý: "Đã có file SX"; cột Đã QC: "Đã bàn giao"…). Cột chặng
 * thì tiêu đề cột đã nói rồi — không chip. API cũ chưa trả `stage` thì giữ đúng
 * chip cũ "Đã có file SX".
 */
export function cardStageChip(b: Pick<Batch, 'stage' | 'status' | 'closed_at' | 'links'>, col: BoardColumnSpec): StageMeta | null {
  if (col.kind === 'stage') return null
  let st = b.stage
  if (!st) {
    const ready = b.status === 'PENDING' && !b.closed_at && ['PRINT', 'CUT'].every((k) => b.links?.some((l) => l.kind === k && l.url))
    st = ready ? 'FILES_READY' : undefined
  }
  if (!st || st === NATURAL[col.value as InternalStatus]) return null
  return stageMeta(st)
}

/**
 * Dòng tách số ở đầu cột mặc định: cột đó gồm những chặng nào, bao nhiêu mỗi
 * chặng (vd. Đã QC 1.732 = 1.699 Đã bàn giao + 29 Đã QC + 4 Đơn đã huỷ hết). Bỏ
 * CLOSED — cột mặc định không hiện batch đã đóng. Chỉ hiện khi có từ 2 phần trở lên.
 */
export function columnBreakdown(byStatus: Record<string, Record<string, number>> | undefined, status: string): { stage: string; count: number }[] {
  const m = byStatus?.[status]
  if (!m) return []
  const order = [...BATCH_LIFECYCLE_ORDER, ...Object.keys(m).filter((s) => !isLifecycleStage(s))]
  const parts = order.filter((s) => s !== 'CLOSED' && (m[s] ?? 0) > 0).map((s) => ({ stage: s, count: m[s] }))
  return parts.length > 1 ? parts : []
}

/** Gộp trang "Xem thêm" vào cột: bỏ batch đã có (dữ liệu đổi giữa hai lần tải làm trang trượt). */
export function mergePage<T extends { id: number }>(have: T[], next: T[]): T[] {
  const seen = new Set(have.map((x) => x.id))
  return [...have, ...next.filter((x) => !seen.has(x.id))]
}
