import type { Material, Sku } from '~/types'

// Định mức sản xuất = ⌊diện tích tấm NVL / diện tích sản phẩm⌋ (khách chốt
// 18/09/2026). Không ai nhập số này — nó ra từ kích thước SKU và kích thước
// tấm NVL. Bản sao của models.ProductionQuota ở backend, để màn tạo batch
// preview được cách chẻ đúng như server sẽ chẻ.

type Sized = Pick<Sku, 'length_mm' | 'width_mm'> | Pick<Material, 'length_mm' | 'width_mm'>

/** Kích thước tính bằng phần trăm mm, số nguyên — 0 khi chưa khai. */
function cells(v?: number | null): number {
  return v != null && v > 0 ? Math.round(v * 100) : 0
}

/**
 * Số sản phẩm của `sku` mà MỘT tấm `material` làm ra: ⌊S_tấm / S_sp⌋.
 * 0 = chưa có định mức (một trong hai bên chưa khai kích thước) — batch không
 * chẻ. Sản phẩm to hơn tấm → 1 chứ không phải 0 (0 sẽ bị hiểu là không giới hạn).
 * Chia bằng số nguyên (phần trăm mm) như backend, để ở biên "vừa đúng một tấm"
 * không bị số thực làm lệch.
 */
export function productionQuota(sku?: Sized | null, material?: Sized | null): number {
  if (!sku || !material) return 0
  const sheet = cells(material.length_mm) * cells(material.width_mm)
  const product = cells(sku.length_mm) * cells(sku.width_mm)
  if (!sheet || !product) return 0
  return Math.max(1, Math.floor(sheet / product))
}
