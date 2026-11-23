import type { BatchItemRef, OrderItem } from '~/types'

/** Resolve the parent order id from either the flat field or nested order. */
export function itemOrderId(it: OrderItem): number | undefined {
  return it.order_id ?? it.order?.id
}

export function itemStoreOrderId(it: OrderItem): string {
  return it.store_order_id ?? it.order?.store_order_id ?? '—'
}

/** True when this item's StoreOrderID is shared by more than one order (a repeated
 *  store order id worth flagging), as computed by the backend list endpoints. */
export function itemStoreOrderDup(it: OrderItem): boolean {
  return it.store_order_dup ?? it.order?.store_order_dup ?? false
}

/** Dòng đã bị huỷ hẳn: seller tự huỷ, hoặc Ops đã duyệt yêu cầu huỷ.
 *  REQUESTED chưa tính — hàng vẫn đang chạy cho tới khi có người duyệt. */
export function itemCancelled(it: OrderItem): boolean {
  return it.cancellation_status === 'SELLER_CANCELLED' || it.cancellation_status === 'APPROVED'
}

/** Các dòng còn sống của một đơn (bỏ dòng đã huỷ). */
export function liveItems(items?: OrderItem[]): OrderItem[] {
  return (items ?? []).filter((it) => !itemCancelled(it))
}

/** Tổng số sản phẩm thực sự nằm trong kiện — cộng quantity của các dòng còn sống. */
export function liveItemQty(items?: OrderItem[]): number {
  return liveItems(items).reduce((sum, it) => sum + (it.quantity ?? 0), 0)
}

export function itemMaterial(it: OrderItem): string {
  if (it.material_name) return it.material_name
  if (it.material_code) return it.material_code
  const codes = (it.batch_items ?? [])
    .map((b) => b.material_code || b.material?.code)
    .filter(Boolean)
  if (codes.length) return Array.from(new Set(codes)).join(' + ')
  return '—'
}

// ---- Mã batch của sản phẩm (cột Batch màn Đơn hàng, chi tiết đơn, CSV) --------
// Luôn hiện MÃ batch người dùng thấy (batches.code, vd "#102909") — đúng chữ màn
// Batch in. KHÔNG BAO GIỜ ghép "#" + batch_id: id nội bộ 1909 viết thành "#1909"
// trông y một mã batch, khách gõ "1909" ở màn Batch và ra #101909 — một batch khác
// hẳn (Nghĩa 23/11/2026). Thiếu mã thì ghi rõ là id ("id 1909") hoặc "—".

/** Mã batch của một phần sản xuất: batch_code (API từ 23/11) → batch.code (API cũ
 *  vẫn JOIN sẵn batch) → '' khi không có. Không bao giờ dựng từ batch_id. */
export function batchRefCode(b: BatchItemRef): string {
  return b.batch_code || b.batch?.code || ''
}

/** Nhãn hiện cho một phần sản xuất: mã batch, thiếu mã thì "id 1909", không có gì thì "—". */
export function batchRefLabel(b: BatchItemRef): string {
  const code = batchRefCode(b)
  if (code) return code
  const id = b.batch_id ?? b.batch?.id
  return id ? `id ${id}` : '—'
}

/** Một batch chứa sản phẩm, đã gộp các phần trùng batch. `label` để hiện,
 *  `batchId` chỉ để dựng link /batches/:id (route theo id) — không để hiện. */
export interface ItemBatch {
  key: string
  batchId?: number
  code: string
  label: string
  material?: string
  /** Mọi phần của sản phẩm trong batch này đã bị huỷ (QC fail / huỷ batch). */
  scrapped: boolean
}

export function itemBatches(it: OrderItem): ItemBatch[] {
  const byKey = new Map<string, ItemBatch>()
  // Phần còn sống trước, phần đã huỷ sau; cùng loại thì theo thứ tự tạo phần.
  const parts = [...(it.batch_items ?? [])].sort(
    (a, b) => Number(!!a.scrapped_at) - Number(!!b.scrapped_at) || (a.id ?? 0) - (b.id ?? 0),
  )
  parts.forEach((p, i) => {
    const batchId = p.batch_id ?? p.batch?.id
    const code = batchRefCode(p)
    const key = batchId ? `id:${batchId}` : code ? `code:${code}` : `part:${p.id ?? i}`
    const prev = byKey.get(key)
    if (prev) {
      // Một phần còn sống là đủ để batch này không còn là "đã huỷ".
      prev.scrapped = prev.scrapped && !!p.scrapped_at
      return
    }
    byKey.set(key, {
      key,
      batchId,
      code,
      label: batchRefLabel(p),
      material: p.material_code || p.material?.code || undefined,
      scrapped: !!p.scrapped_at,
    })
  })
  return [...byKey.values()]
}

/** Một dòng mô tả đủ mọi batch: tooltip "#102909 (BW3), #102902 (MC2, đã huỷ)";
 *  CSV (withMaterial = false, NVL có cột riêng) "#102909, #102902 (đã huỷ)". */
export function itemBatchesText(it: OrderItem, withMaterial = true): string {
  const list = itemBatches(it)
  if (!list.length) return '—'
  return list
    .map((b) => {
      const notes = [withMaterial ? b.material : '', b.scrapped ? 'đã huỷ' : ''].filter(Boolean).join(', ')
      return notes ? `${b.label} (${notes})` : b.label
    })
    .join(', ')
}

/**
 * Ô "Batch ID" màn Đơn hàng → tham số /api/items (dùng chung cho danh sách và nút
 * "Xuất theo mẫu import"):
 *   - gõ MÃ batch như màn Batch hiện ("#102909" hoặc "102909") → ?batch=102909,
 *     API khớp ĐÚNG mã (không còn khớp chuỗi con: "1909" không ra #101909);
 *   - gõ rõ "id 1909" (hoặc "id:1909", "id#1909") → ?batch_id=1909, lọc theo id
 *     nội bộ như ô này từng làm — cùng chữ cột Batch hiện khi một phần thiếu mã.
 * Ô trống → không lọc.
 */
export function itemBatchFilterParams(raw: string): { batch?: string; batch_id?: number } {
  const v = raw.trim()
  if (!v) return {}
  const byId = /^id\s*[:#]?\s*(\d+)$/i.exec(v)
  if (byId) return { batch_id: Number(byId[1]) }
  const code = v.replace(/^#+/, '').trim()
  return code ? { batch: code } : {}
}
