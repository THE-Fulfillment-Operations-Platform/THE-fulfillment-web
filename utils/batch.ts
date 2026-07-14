import type { Batch, InternalStatus } from '~/types'

const DAY_MS = 24 * 60 * 60 * 1000

type BatchDue = { due_date?: string; status?: InternalStatus }

/**
 * A batch is overdue when its due date has fully passed and it hasn't finished
 * QC yet (QC_PASSED = done, nothing left to be late for). We flag it only after
 * the whole due day has elapsed so a batch due "today" isn't marked late at
 * 00:01 — matching how staff read a deadline.
 */
export function isBatchOverdue(b: BatchDue): boolean {
  if (!b.due_date || b.status === 'QC_PASSED') return false
  const due = Date.parse(b.due_date)
  if (!Number.isFinite(due)) return false
  return Date.now() >= due + DAY_MS
}

/** Whole days a batch is past due (0 when not overdue / no due date). */
export function overdueDays(b: BatchDue): number {
  if (!b.due_date) return 0
  const due = Date.parse(b.due_date)
  if (!Number.isFinite(due)) return 0
  return Math.max(0, Math.floor((Date.now() - due) / DAY_MS))
}

/** Count of overdue batches in a list — used for the list-header summary. */
export function overdueCount(batches: Batch[]): number {
  return batches.reduce((n, b) => n + (isBatchOverdue(b) ? 1 : 0), 0)
}

// ---- Chẻ batch mẹ–con theo định mức NVL ------------------------------------
// Định mức (Material.products_per_unit) = số sản phẩm tối đa 1 đơn vị NVL làm ra.
// Khi tổng sản phẩm của các item được chọn vượt định mức, batch bị chẻ thành
// nhiều batch con, mỗi con ≤ định mức. Dùng chung ở màn tạo batch (preview) nên
// số con hiển thị luôn khớp với số con backend tạo.

/** Sản phẩm = tổng quantity các item (item không có quantity coi là 1). */
export function productCount<T extends { quantity?: number }>(items: T[]): number {
  return items.reduce((n, it) => n + Math.max(1, Number(it.quantity) || 1), 0)
}

/** Một nhóm item sẽ trở thành 1 batch con. */
export interface BatchSplitGroup<T> {
  items: T[]
  /** Tổng sản phẩm trong nhóm (có thể > cap nếu 1 item lẻ đã vượt định mức). */
  product_count: number
}

/**
 * Chia danh sách item thành các nhóm theo định mức `cap`, theo nguyên tắc:
 *  - Đếm theo sản phẩm (Σ quantity), KHÔNG cắt đôi một item — một item luôn nằm
 *    trọn trong một nhóm. Vì vậy một item lẻ có quantity > cap sẽ chiếm riêng một
 *    nhóm vượt định mức (không thể chia nhỏ hơn).
 *  - cap rỗng/≤0 → không giới hạn → trả đúng 1 nhóm (batch phẳng như cũ).
 * Greedy fill: nhồi vào nhóm hiện tại đến khi thêm item kế sẽ vượt cap thì mở
 * nhóm mới. Giữ nguyên thứ tự item đầu vào.
 */
export function planBatchSplit<T extends { quantity?: number }>(
  items: T[],
  cap?: number | null,
): BatchSplitGroup<T>[] {
  if (!items.length) return []
  const limit = Number(cap)
  if (!Number.isFinite(limit) || limit <= 0) {
    return [{ items: [...items], product_count: productCount(items) }]
  }
  const groups: BatchSplitGroup<T>[] = []
  let current: T[] = []
  let count = 0
  for (const it of items) {
    const q = Math.max(1, Number(it.quantity) || 1)
    // Mở nhóm mới khi nhóm hiện tại đã có item và thêm item này sẽ vượt định mức.
    if (current.length && count + q > limit) {
      groups.push({ items: current, product_count: count })
      current = []
      count = 0
    }
    current.push(it)
    count += q
  }
  if (current.length) groups.push({ items: current, product_count: count })
  return groups
}
