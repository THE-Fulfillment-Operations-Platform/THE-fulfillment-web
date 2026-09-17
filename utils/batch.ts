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

/** Ước chung lớn nhất — dùng để rút gọn phân số chiếm dụng. */
function gcd(a: number, b: number): number {
  while (b) {
    ;[a, b] = [b, a % b]
  }
  return a
}

/**
 * Chia danh sách item thành các nhóm, mỗi nhóm vừa trong MỘT đơn vị NVL.
 *
 * Định mức nằm ở cặp (SKU, NVL) chứ không ở NVL: cùng một tấm mica ra 10 khay
 * nhỏ nhưng chỉ 4 khay to. Vì thế một nhóm KHÔNG phải "tối đa N sản phẩm" —
 * mỗi sản phẩm chiếm 1/định mức của một tấm, và nhóm đầy khi tổng chiếm dụng
 * chạm đúng một tấm. `quotaFor` trả 0/null nghĩa là item đó không có định mức
 * (không chiếm chỗ).
 *
 * Tổng chiếm dụng cộng bằng PHÂN SỐ NGUYÊN (num/den, rút gọn) chứ không bằng
 * số thực: đúng ở biên là chỗ quyết định chẻ hay không, mà 1/10 + 1/10 trong
 * float đã là 0.30000000000000004 — sai một chút ở đó là đẻ ra một batch thừa.
 * Giữ nguyên logic của backend (planBatchSplitByQuota) để preview và số batch
 * thật luôn khớp.
 *
 * Một item tự nó vượt định mức không bị cắt đôi — nó chiếm riêng một nhóm vượt
 * định mức (tách một dòng đơn sang nhiều batch là quyết định nghiệp vụ chưa chốt).
 */
export function planBatchSplitByQuota<T extends { quantity?: number }>(
  items: T[],
  quotaFor: (item: T) => number | null | undefined,
): BatchSplitGroup<T>[] {
  if (!items.length) return []
  const groups: BatchSplitGroup<T>[] = []
  let current: T[] = []
  let count = 0 // số sản phẩm trong nhóm (chỉ để hiển thị)
  // Chiếm dụng đã dùng của nhóm hiện tại, dạng phân số num/den.
  let num = 0
  let den = 1

  for (const it of items) {
    const q = Math.max(1, Number(it.quantity) || 1)
    const quota = Number(quotaFor(it))
    // Chiếm dụng của item: q/quota; không có định mức → 0.
    const sNum = Number.isFinite(quota) && quota > 0 ? q : 0
    const sDen = Number.isFinite(quota) && quota > 0 ? quota : 1

    // num/den + sNum/sDen
    let nextNum = num * sDen + sNum * den
    let nextDen = den * sDen
    const g = gcd(Math.abs(nextNum), Math.abs(nextDen)) || 1
    nextNum /= g
    nextDen /= g

    // Mở nhóm mới khi nhóm hiện tại đã có item và item này không còn vừa.
    if (current.length && nextNum > nextDen) {
      groups.push({ items: current, product_count: count })
      current = []
      count = 0
      const g2 = gcd(sNum, sDen) || 1
      nextNum = sNum / g2
      nextDen = sDen / g2
    }
    current.push(it)
    count += q
    num = nextNum
    den = nextDen
  }
  if (current.length) groups.push({ items: current, product_count: count })
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
 * Số ĐƠN VỊ NVL cần cho batch theo định mức (products_per_unit của material):
 * batch thường = ceil(SP / định mức); batch mẹ = số batch con (mỗi con tối đa một
 * đơn vị). NVL chưa khai định mức thì chịu → null.
 */
export function batchMaterialUnits(b: Batch): number | null {
  if (b.is_parent) return b.child_count ?? b.child_batches?.length ?? null
  const quota = b.material?.products_per_unit
  const sp = batchProductTotal(b)
  if (!quota || !sp) return null
  return Math.ceil(sp / quota)
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
