import type { Sku } from '~/types'

/**
 * Id của các SKU đang là SKU cha (có ít nhất một SKU con trong danh sách).
 * SKU cha chỉ để gom nhóm — không sản xuất trực tiếp, NVL nằm ở từng SKU con —
 * nên không được tính là "chưa map NVL".
 */
export function parentSkuIds(skus: Sku[]): Set<number> {
  const ids = new Set(skus.map((s) => s.id))
  const out = new Set<number>()
  for (const s of skus) {
    if (s.parent_id != null && ids.has(s.parent_id)) out.add(s.parent_id)
  }
  return out
}
