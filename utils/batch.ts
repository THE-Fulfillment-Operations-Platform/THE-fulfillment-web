import type { Batch, BatchLinkKind, InternalStatus } from '~/types'
import { INTERNAL_STATUS, type BadgeMeta } from '~/utils/enums'

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

// ---- Chẻ batch mẹ–con theo SKU và định mức NVL ------------------------------
// Định mức = số sản phẩm một tấm NVL làm ra, TÍNH từ kích thước (xem
// utils/quota.ts). Một batch là một file in + một file cắt của MỘT SKU, nên
// item nhóm theo SKU trước, rồi mỗi SKU chẻ theo định mức của cặp (SKU, NVL).
// Dùng chung ở màn tạo batch (preview) nên số con hiển thị luôn khớp với số
// con backend tạo (planBatchSplitByQuota bên API).

/** Sản phẩm = tổng quantity các item (item không có quantity coi là 1). */
export function productCount<T extends { quantity?: number }>(items: T[]): number {
  return items.reduce((n, it) => n + Math.max(1, Number(it.quantity) || 1), 0)
}

/** Một nhóm item sẽ trở thành 1 batch con. */
export interface BatchSplitGroup<T> {
  items: T[]
  /** Mã SKU của nhóm (mọi item trong nhóm cùng SKU). */
  sku_code: string
  /** Tổng sản phẩm trong nhóm (có thể > định mức nếu 1 item lẻ đã vượt). */
  product_count: number
}

/**
 * Chia danh sách item thành các batch sản xuất, đúng luật backend:
 *   1. Nhóm theo SKU (theo thứ tự xuất hiện). SKU khác nhau — kể cả hai SKU con
 *      cùng SKU cha — không bao giờ chung batch, vì khác kích thước là khác file
 *      cắt. (Khách chốt 24/09/2026: SKU chỉ có vài sản phẩm lẻ vẫn là batch riêng.)
 *   2. Trong mỗi SKU, xếp lần lượt các dòng vào batch tối đa `định mức` sản phẩm.
 *      `quotaFor` trả 0/null = không có định mức → SKU đó là một batch duy nhất.
 *
 * Một dòng tự nó vượt định mức không bị cắt đôi — nó chiếm riêng một batch vượt
 * định mức (tách một dòng đơn sang nhiều batch là quyết định nghiệp vụ chưa chốt).
 */
export function planBatchSplitByQuota<T extends { quantity?: number; sku_code?: string }>(
  items: T[],
  quotaFor: (item: T) => number | null | undefined,
): BatchSplitGroup<T>[] {
  if (!items.length) return []
  const order: string[] = []
  const bySku = new Map<string, T[]>()
  for (const it of items) {
    const key = it.sku_code ?? ''
    if (!bySku.has(key)) {
      order.push(key)
      bySku.set(key, [])
    }
    bySku.get(key)!.push(it)
  }

  const groups: BatchSplitGroup<T>[] = []
  for (const key of order) {
    const lines = bySku.get(key)!
    const quota = Number(quotaFor(lines[0]))
    if (!Number.isFinite(quota) || quota <= 0) {
      groups.push({ items: lines, sku_code: key, product_count: productCount(lines) })
      continue
    }
    let current: T[] = []
    let used = 0
    for (const it of lines) {
      const n = Math.max(1, Number(it.quantity) || 1)
      if (current.length && used + n > quota) {
        groups.push({ items: current, sku_code: key, product_count: used })
        current = []
        used = 0
      }
      current.push(it)
      used += n
    }
    if (current.length) groups.push({ items: current, sku_code: key, product_count: used })
  }
  return groups
}

// ---- Số lượng & NVL của một batch (payload list) ----------------------------

/**
 * Tổng SỐ SẢN PHẨM của batch = cộng SL từng dòng (một item là một dòng, SL có thể
 * >1). Batch mẹ không giữ item (hàng nằm ở các con) nên không tính được từ payload
 * list → null.
 */
export function batchProductTotal(b: Batch): number | null {
  const items = b.items ?? []
  if (!items.length) return null
  return items.reduce((sum, i) => sum + (i.order_item?.quantity ?? 1), 0)
}

/**
 * Số TẤM NVL batch cần. Server tính (Batch.material_units) từ kích thước SKU
 * của từng phần và kích thước tấm — FE không có đủ dữ liệu để tính lại. Batch
 * mẹ = tổng tấm của các con (thiếu thì lấy số con). null = có phần chưa có
 * định mức (thiếu kích thước).
 */
export function batchMaterialUnits(b: Batch): number | null {
  if (b.material_units != null) return b.material_units
  if (b.is_parent) return b.child_count ?? b.child_batches?.length ?? null
  return null
}

export function batchMaterialLabel(b: Batch): string {
  return b.material_name || b.material?.name || b.material_code || ''
}

// ---- Bộ file sản xuất (link in + link cắt) ----------------------------------

/**
 * Link sản xuất batch còn thiếu. Batch phải có đủ CẢ link in lẫn link cắt mới vào
 * sản xuất được — backend chặn chuyển sang Đã in/Đã cắt khi thiếu, và màn chi tiết
 * batch dùng đúng luật này. Batch mẹ không giữ link nên không áp dụng.
 */
export function missingBatchLinks(b: Pick<Batch, 'links' | 'is_parent'>): BatchLinkKind[] {
  if (b.is_parent) return []
  return (['PRINT', 'CUT'] as const).filter((kind) => !b.links?.some((l) => l.kind === kind && l.url))
}

export const PRODUCTION_FILES_READY: BadgeMeta = {
  label: 'Đã có file SX',
  classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
}

/**
 * Nhãn trạng thái để HIỂN THỊ cho batch. Chờ xử lý tách làm hai: chưa ai đụng tới,
 * và "Đã có file SX" — đã đủ link in + cắt, chỉ chờ xưởng làm. Đây là trạng thái
 * SUY RA từ status + link, không lưu database: status thật vẫn là PENDING, nên lọc
 * và đếm theo status ở backend vẫn gộp chung hai loại vào Chờ xử lý.
 */
export function batchStatusBadge(b: Batch): BadgeMeta {
  if (b.status === 'PENDING' && !b.is_parent && !b.closed_at && missingBatchLinks(b).length === 0) {
    return PRODUCTION_FILES_READY
  }
  return INTERNAL_STATUS[b.status] ?? { label: b.status, classes: 'bg-muted text-muted-foreground' }
}
