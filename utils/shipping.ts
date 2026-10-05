import type { Sku } from '~/types'

// Thông tin vận chuyển THỰC TẾ của một SKU: ô nào SKU không tự khai thì lấy theo
// SKU cha, từng ô một — đúng luật models.EffectiveShipping ở máy chủ. Hai bên
// phải khớp, không thì bảng báo "đủ" mà lúc gửi THE máy chủ lại báo thiếu.

export interface ShippingSpec {
  weight_g: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  declared_value: number | null
  hs_code: string
}

export function effectiveShipping(sku: Sku, parent?: Sku | null): ShippingSpec {
  const pick = (own?: number | null, inherited?: number | null) => (own != null ? own : inherited ?? null)
  return {
    weight_g: pick(sku.ship_weight_g, parent?.ship_weight_g),
    length_cm: pick(sku.ship_length_cm, parent?.ship_length_cm),
    width_cm: pick(sku.ship_width_cm, parent?.ship_width_cm),
    height_cm: pick(sku.ship_height_cm, parent?.ship_height_cm),
    declared_value: pick(sku.declared_value, parent?.declared_value),
    hs_code: sku.hs_code || parent?.hs_code || '',
  }
}

/**
 * Phần XƯỞNG còn phải khai để gửi THE: cân nặng và kích thước hộp. Mã HS và giá
 * trị khai báo là việc bên THE — có mặc định trong Cài đặt → Kết nối THE, SKU
 * chỉ khai khi cần khác — nên không tính là "thiếu" ở đây (khớp
 * ShippingSpec.MissingPhysical ở máy chủ). Rỗng = đủ.
 */
export function missingShipping(s: ShippingSpec): string[] {
  const out: string[] = []
  if (s.weight_g == null) out.push('cân nặng')
  if (s.length_cm == null || s.width_cm == null || s.height_cm == null) out.push('kích thước hộp')
  return out
}

/** "120 g · 20×15×2 cm · $5" — dòng tóm tắt trong bảng SKU. */
export function formatShipping(s: ShippingSpec): string {
  const parts: string[] = []
  if (s.weight_g != null) parts.push(`${s.weight_g} g`)
  if (s.length_cm != null && s.width_cm != null && s.height_cm != null) {
    parts.push(`${s.length_cm}×${s.width_cm}×${s.height_cm} cm`)
  }
  if (s.declared_value != null) parts.push(`$${s.declared_value}`)
  return parts.join(' · ')
}
