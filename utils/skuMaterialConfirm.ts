// Cửa xác nhận khi đổi NVL của SKU (#6380).
//
// 19/11/2026: SKU WD-PBH-5L-* đang map Basswood 3 ly bị THÊM Basswood 5 ly (3 ly
// vẫn còn) → hệ thống coi là combo 2 tấm → 23 sản phẩm đã cắt trên 3 ly hiện lại
// ở màn Tạo batch của 5 ly và bị gom 8 batch trùng. Từ giờ API trả 409
// SKU_MATERIAL_CHANGE_CONFIRM (kèm chi tiết) khi đổi bộ NVL của SKU còn hàng
// trong xưởng, khi thêm hai NVL cùng loại khác độ dày, hay khi import (chỉ THÊM)
// một NVL khác với NVL SKU đang có. Màn hình hiện hộp xác nhận rồi gửi lại với
// confirm_material_change = true.
import type { MaterialRef, SkuMaterialImpact } from '~/types'
import { ApiError } from '~/utils/api-error'
import { useConfirm } from '~/composables/useConfirm'

export const SKU_MATERIAL_CHANGE_CONFIRM = 'SKU_MATERIAL_CHANGE_CONFIRM'

const HINT = 'Đổi tấm thì xoá NVL cũ, đừng để 2 tấm nếu không phải combo.'

/** Các SKU cần xác nhận nếu `e` là lỗi 409 của cửa này; null nếu là lỗi khác. */
export function materialChangeImpacts(e: unknown): SkuMaterialImpact[] | null {
  if (!(e instanceof ApiError) || e.code !== SKU_MATERIAL_CHANGE_CONFIRM) return null
  const d = e.details as { skus?: SkuMaterialImpact[] } | undefined
  return Array.isArray(d?.skus) ? d.skus : []
}

export function materialNames(refs: MaterialRef[] | undefined): string {
  return (refs ?? []).map((r) => r.name || r.code).join(' + ') || '(không NVL)'
}

/** Từng dòng giải thích cho một SKU (không kèm tên SKU). */
export function impactReasons(imp: SkuMaterialImpact): string[] {
  const out: string[] = []
  if (imp.in_production > 0) {
    const where = (imp.in_production_by ?? [])
      .map((m) => {
        const batches = m.batches.length
          ? ` (${m.batches.join(', ')}${m.more_batches ? ` +${m.more_batches} batch` : ''})`
          : ''
        return `${m.items} trên ${m.material.name || m.material.code}${batches}`
      })
      .join('; ')
    out.push(
      `${imp.in_production} sản phẩm đang trong xưởng đã vào batch: ${where}. ` +
        (imp.grows
          ? 'Thêm NVL lúc này thì chúng bị coi là còn thiếu tấm, HIỆN LẠI ở màn Tạo batch của NVL mới và dễ bị gom trùng.'
          : 'Chúng vẫn làm tiếp trên NVL cũ; muốn làm lại bằng NVL mới thì phải xoá batch cũ.'),
    )
  }
  for (const p of imp.same_family ?? []) {
    out.push(
      `${p.a.name || p.a.code} và ${p.b.name || p.b.code} cùng loại, khác độ dày — để cả hai là combo 2 tấm, gần như chắc là nhầm.`,
    )
  }
  if (imp.kept_not_in_file?.length) {
    out.push(
      `File ghi ${materialNames(imp.added)}, SKU đang dùng ${materialNames(imp.kept_not_in_file)}: import chỉ THÊM nên sau khi áp dụng SKU dùng cả ${materialNames(imp.after)}.`,
    )
  }
  return out
}

/** Dòng tóm tắt cho danh sách trong hộp xác nhận: "SKU X: A → A + B" + lý do. */
export function impactLines(impacts: SkuMaterialImpact[], max = 6): string[] {
  const lines = impacts.slice(0, max).map(
    (imp) =>
      `SKU ${imp.sku_code}: ${materialNames(imp.before)} → ${materialNames(imp.after)}\n` +
      impactReasons(imp)
        .map((r) => `• ${r}`)
        .join('\n'),
  )
  if (impacts.length > max) lines.push(`… và ${impacts.length - max} SKU khác.`)
  return lines
}

/** Cảnh báo mạnh: gần như chắc là nhầm (hai NVL cùng loại, import thành combo
 *  ngoài ý muốn) hoặc hàng đang làm sẽ hiện lại ở hàng chờ gom batch. */
export function isStrongImpact(impacts: SkuMaterialImpact[]): boolean {
  return impacts.some(
    (i) => (i.same_family?.length ?? 0) > 0 || (i.kept_not_in_file?.length ?? 0) > 0 || (i.in_production > 0 && i.grows),
  )
}

/** Hộp xác nhận cho các SKU trong `impacts`. true = người dùng vẫn muốn lưu. */
export function confirmMaterialChange(impacts: SkuMaterialImpact[], action = 'lưu'): Promise<boolean> {
  const strong = isStrongImpact(impacts)
  return useConfirm().confirm({
    title: strong ? 'Đổi NVL này gần như chắc là nhầm' : 'Xác nhận đổi nguyên vật liệu',
    message:
      `${impacts.length > 1 ? `${impacts.length} SKU` : 'SKU này'} cần xem lại trước khi ${action}. ${HINT}`,
    items: impactLines(impacts),
    tone: strong ? 'danger' : 'warning',
    confirmText: `Vẫn ${action}`,
    cancelText: 'Quay lại sửa',
  })
}

/**
 * Chạy `save(false)`; API trả 409 SKU_MATERIAL_CHANGE_CONFIRM thì hiện hộp xác
 * nhận, đồng ý thì chạy lại `save(true)`. Trả null khi người dùng huỷ. Lỗi khác
 * ném ra nguyên vẹn cho chỗ gọi xử lý như cũ.
 */
export async function saveWithMaterialConfirm<T>(
  save: (confirm: boolean) => Promise<T>,
  action = 'lưu',
): Promise<T | null> {
  try {
    return await save(false)
  } catch (e) {
    const impacts = materialChangeImpacts(e)
    if (!impacts) throw e
    if (!(await confirmMaterialChange(impacts, action))) return null
    return await save(true)
  }
}
