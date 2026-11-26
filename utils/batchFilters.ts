// Bộ lọc dùng chung của màn "Batch sản xuất" (/batches) và "Bảng sản xuất"
// (/production): cùng ô, cùng tham số gửi /api/batches, nên gom một chỗ.
//
// Khoảng ngày lọc theo NGÀY TẠO batch (batches.created_at), nửa mở [từ, đến) theo
// giờ máy người dùng (xem utils/dateRange.ts) — "Đến ngày 24/11" gồm cả 24/11.
import { apiInstantFrom, apiInstantBefore } from '~/utils/dateRange'

export interface BatchFilterFields {
  batch_id: string // đúng mã batch (có/không dấu #)
  code: string // mã nội bộ đơn / mã tem item (100047, 100047_1/1)
  store_order: string // mã đơn shop (chứa chuỗi)
  seller_id: string[] // chọn nhiều seller
  material_id: string // chất liệu ('' = tất cả)
  sku: string // SKU (chứa chuỗi) — batch chứa dòng khớp
  priority: string
  date_from: string
  date_to: string
}

/** Tham số API chung (chưa gồm trạng thái / phân trang). Ô trống = không gửi. */
export function batchFilterParams(f: BatchFilterFields) {
  return {
    material_id: f.material_id ? Number(f.material_id) : undefined,
    priority: f.priority || undefined,
    code: f.code.trim() || undefined,
    seller_id: f.seller_id.length ? f.seller_id.join(',') : undefined,
    store_order: f.store_order.trim() || undefined,
    sku: f.sku.trim() || undefined,
    batch: f.batch_id.trim().replace(/^#/, '') || undefined,
    date_from: apiInstantFrom(f.date_from),
    date_to: apiInstantBefore(f.date_to),
  }
}

// ---- Bộ lọc <-> URL (?batch=…&seller_id=3,7…) ----------------------------------
// Khoá URL trùng tên tham số API để dễ đọc; chỉ ghi khoá có giá trị.
const STR_KEYS: [keyof BatchFilterFields, string][] = [
  ['batch_id', 'batch'], ['code', 'code'], ['store_order', 'store_order'], ['sku', 'sku'],
  ['material_id', 'material_id'], ['priority', 'priority'], ['date_from', 'date_from'], ['date_to', 'date_to'],
]
type Q = Record<string, string | null | (string | null)[] | undefined>

function one(v: Q[string]): string {
  const x = Array.isArray(v) ? v[0] : v
  return typeof x === 'string' ? x : ''
}
function list(v: Q[string]): string[] {
  const raw = Array.isArray(v) ? v : [v]
  return Array.from(new Set(raw.flatMap((s) => (typeof s === 'string' ? s.split(',') : [])).map((s) => s.trim()).filter(Boolean)))
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

/** Đọc ô lọc từ query của URL; giá trị sai dạng bị bỏ (không làm hỏng màn). */
export function batchFiltersFromQuery(q: Q): Partial<BatchFilterFields> & { q: string; status: string[] } {
  const out: Record<string, unknown> = {}
  for (const [field, key] of STR_KEYS) {
    const v = one(q[key]).trim()
    if (!v) continue
    if ((field === 'date_from' || field === 'date_to') && !DATE_RE.test(v)) continue
    if (field === 'material_id' && !/^\d+$/.test(v)) continue
    out[field] = v
  }
  const sellers = list(q.seller_id).filter((s) => /^\d+$/.test(s))
  if (sellers.length) out.seller_id = sellers
  return { ...(out as Partial<BatchFilterFields>), q: one(q.q).trim(), status: list(q.status) }
}

/** Ngược lại: ô lọc → query URL (chỉ khoá có giá trị). */
export function batchFiltersToQuery(f: BatchFilterFields & { q?: string; status?: string[] }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, key] of STR_KEYS) {
    const v = String(f[field] ?? '').trim()
    if (v) out[key] = v
  }
  if (f.seller_id.length) out.seller_id = f.seller_id.join(',')
  if (f.status?.length) out.status = f.status.join(',')
  if (f.q?.trim()) out.q = f.q.trim()
  return out
}
