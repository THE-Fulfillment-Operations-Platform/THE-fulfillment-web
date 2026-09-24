import type { Material, Sku } from '~/types'

// Định mức sản xuất của cặp (SKU, NVL) = số sản phẩm một tấm NVL làm ra.
//
// Nguồn, theo thứ tự (khách chốt 24/09/2026):
//   1. KHAI — sku.materials[].products_per_unit của đúng NVL đó: số từ file
//      layout thật của xưởng. Luôn thắng.
//   2. ƯỚC TÍNH — xếp hộp bao D×R lên tấm theo lưới, lấy chiều tốt hơn:
//      ⌊L/l⌋·⌊W/w⌋ hoặc ⌊L/w⌋·⌊W/l⌋. Chia diện tích (luật 18/09) cho số cao hơn
//      thực tế (600×800 với 127×127: diện tích nói 29, xếp thật 24) nên bỏ.
//   3. Không có gì → 0: không định mức, SKU đó không chẻ.
// Bản sao của models.ProductionQuotaSource ở backend, để màn tạo batch xem
// trước được cách chẻ đúng như server sẽ chẻ.

export type QuotaSource = 'declared' | 'estimated' | 'none'

type Sized = { length_mm?: number | null; width_mm?: number | null }
type SkuLike = Sized & Partial<Pick<Sku, 'materials'>>
type MaterialLike = Sized & Partial<Pick<Material, 'id'>>

/** Kích thước tính bằng phần trăm mm, số nguyên — 0 khi chưa khai. */
function cells(v?: number | null): number {
  return v != null && v > 0 ? Math.round(v * 100) : 0
}

/** Định mức KHAI của cặp, hoặc 0. */
export function declaredQuota(sku?: SkuLike | null, materialId?: number | null): number {
  if (!sku || !materialId) return 0
  const m = sku.materials?.find((x) => x.material_id === materialId)
  const q = Number(m?.products_per_unit ?? 0)
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 0
}

/**
 * Định mức ƯỚC TÍNH từ kích thước (xếp lưới). 0 = một trong hai bên chưa khai.
 * Sản phẩm to hơn tấm → 1 chứ không phải 0 (0 sẽ bị hiểu là không giới hạn).
 */
export function estimatedQuota(sku?: Sized | null, material?: Sized | null): number {
  if (!sku || !material) return 0
  const L = cells(material.length_mm)
  const W = cells(material.width_mm)
  const l = cells(sku.length_mm)
  const w = cells(sku.width_mm)
  if (!L || !W || !l || !w) return 0
  const upright = Math.floor(L / l) * Math.floor(W / w)
  const rotated = Math.floor(L / w) * Math.floor(W / l)
  return Math.max(1, upright, rotated)
}

/** Định mức dùng thật + nguồn của nó. */
export function quotaInfo(sku?: SkuLike | null, material?: MaterialLike | null): { quota: number; source: QuotaSource } {
  const declared = declaredQuota(sku, material?.id)
  if (declared) return { quota: declared, source: 'declared' }
  const est = estimatedQuota(sku, material)
  return est ? { quota: est, source: 'estimated' } : { quota: 0, source: 'none' }
}

/** Định mức dùng thật (khai, không thì ước tính), 0 = không có. */
export function productionQuota(sku?: SkuLike | null, material?: MaterialLike | null): number {
  return quotaInfo(sku, material).quota
}

/** "40/tấm" khi khai, "~24/tấm" khi ước tính, "" khi không có. */
export function quotaLabel(info: { quota: number; source: QuotaSource }): string {
  if (!info.quota) return ''
  return `${info.source === 'estimated' ? '~' : ''}${info.quota}/tấm`
}

export const QUOTA_TITLE: Record<QuotaSource, string> = {
  declared: 'Định mức khai: sản phẩm / tấm, từ file layout của xưởng',
  estimated: 'Ước tính theo kích thước (xếp lưới D×R lên tấm) — chưa khai định mức cho cặp này',
  none: '',
}
