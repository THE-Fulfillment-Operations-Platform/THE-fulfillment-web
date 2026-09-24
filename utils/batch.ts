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

// ---- Chẻ batch mẹ–con theo nhóm SKU cha và định mức -------------------------
// Luật khách chốt 24/09/2026 (bản sao của planBatchSplitByQuota bên API, để
// màn tạo batch xem trước đúng số con server sẽ tạo):
//   1. Nhóm theo SKU CHA (SKU không có cha = nhóm của chính nó). Khác nhóm không
//      bao giờ chung batch — khác dòng sản phẩm là khác file in/cắt.
//   2. Trong nhóm, xếp theo SKU (theo thứ tự xuất hiện) để sản phẩm cùng SKU
//      chiếm tấm trước.
//   3. Tấm đầy theo MỨC CHIẾM DỤNG: mỗi sản phẩm chiếm 1/định mức tấm; SKU hết
//      hàng mà tấm còn chỗ thì SKU anh em (cùng cha) nhét thêm — A 20/40 còn nửa
//      tấm, nhét được 10 B nếu B 20/tấm. Dòng không còn vừa thì mở batch mới.
//      Cộng bằng phân số nguyên, không dùng float (1/3+1/3+1/3 phải đúng 1).
//   4. SKU không có định mức (quotaFor 0/null) không đo được → batch riêng.
// Dòng tự nó vượt định mức không bị cắt đôi — nó chiếm riêng một batch.

/** Sản phẩm = tổng quantity các item (item không có quantity coi là 1). */
export function productCount<T extends { quantity?: number }>(items: T[]): number {
  return items.reduce((n, it) => n + Math.max(1, Number(it.quantity) || 1), 0)
}

/** Một nhóm item sẽ trở thành 1 batch con. */
export interface BatchSplitGroup<T> {
  items: T[]
  /** Các mã SKU trong nhóm, theo thứ tự xếp vào. */
  sku_codes: string[]
  /** Tổng sản phẩm trong nhóm (có thể > định mức nếu 1 item lẻ đã vượt). */
  product_count: number
}

/** Ước chung lớn nhất — dùng để rút gọn phân số chiếm dụng. */
function gcd(a: number, b: number): number {
  while (b) {
    ;[a, b] = [b, a % b]
  }
  return a
}

type SplitItem = { quantity?: number; sku_code?: string; sku?: { id?: number; parent_id?: number | null } | null }

export function planBatchSplitByQuota<T extends SplitItem>(
  items: T[],
  quotaFor: (item: T) => number | null | undefined,
): BatchSplitGroup<T>[] {
  if (!items.length) return []
  const skuKey = (it: T) => it.sku_code ?? (it.sku?.id != null ? `#${it.sku.id}` : '')
  const familyKey = (it: T) => (it.sku?.parent_id != null ? `parent:${it.sku.parent_id}` : `sku:${skuKey(it)}`)

  // Nhóm theo thứ tự xuất hiện; trong nhóm, SKU theo thứ tự xuất hiện.
  const familyOrder: string[] = []
  const families = new Map<string, string[]>()
  const lines = new Map<string, T[]>()
  for (const it of items) {
    const f = familyKey(it)
    const k = skuKey(it)
    if (!lines.has(k)) {
      if (!families.has(f)) {
        familyOrder.push(f)
        families.set(f, [])
      }
      families.get(f)!.push(k)
      lines.set(k, [])
    }
    lines.get(k)!.push(it)
  }

  const groups: BatchSplitGroup<T>[] = []
  for (const f of familyOrder) {
    let current: T[] = []
    let num = 0 // chiếm dụng của nhóm hiện tại, phân số num/den
    let den = 1
    const flush = () => {
      if (current.length) {
        groups.push({ items: current, sku_codes: distinctCodes(current), product_count: productCount(current) })
        current = []
        num = 0
        den = 1
      }
    }
    for (const k of families.get(f)!) {
      const skuLines = lines.get(k)!
      const quota = Number(quotaFor(skuLines[0]))
      if (!Number.isFinite(quota) || quota <= 0) {
        // Không đo được trên tấm: batch riêng, ngoài tấm đang xếp.
        flush()
        groups.push({ items: skuLines, sku_codes: distinctCodes(skuLines), product_count: productCount(skuLines) })
        continue
      }
      for (const it of skuLines) {
        const q = Math.max(1, Number(it.quantity) || 1)
        // num/den + q/quota
        let nextNum = num * quota + q * den
        let nextDen = den * quota
        const g = gcd(nextNum, nextDen) || 1
        nextNum /= g
        nextDen /= g
        if (current.length && nextNum > nextDen) {
          flush()
          const g2 = gcd(q, quota) || 1
          nextNum = q / g2
          nextDen = quota / g2
        }
        current.push(it)
        num = nextNum
        den = nextDen
      }
    }
    flush()
  }
  return groups
}

function distinctCodes<T extends SplitItem>(items: T[]): string[] {
  const out: string[] = []
  for (const it of items) {
    const c = it.sku_code ?? ''
    if (c && !out.includes(c)) out.push(c)
  }
  return out
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
