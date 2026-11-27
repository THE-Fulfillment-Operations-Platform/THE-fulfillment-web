import { batchesApi, materialsApi, sellersApi } from '~/services/api'
import type { BatchFacet, BatchFilterOptions } from '~/services/api'
import { PRIORITY, PRIORITY_OPTIONS } from '~/utils/enums'

/**
 * Danh sách chọn của bộ lọc batch (Chất liệu, Seller, Ưu tiên) — dùng chung cho
 * màn Batch và Bảng sản xuất. Giá trị là CHUỖI (usePersistedFilters / URL chỉ khôi
 * phục khi cùng kiểu).
 *
 * Lấy từ CHÍNH các batch (GET /api/batches/filter-options, 27/11), không từ danh
 * mục: mỗi lựa chọn kèm số batch có nó; NVL / seller đã xoá mềm mà còn batch vẫn
 * lọc được ("đã xoá"); hai NVL trùng tên (prod có hai "Basswood 5 ly") phân biệt
 * bằng mã ở dòng phụ. API cũ chưa có đường này thì rơi về danh mục như trước. Hỏng
 * cả hai thì ô lọc chỉ trống, màn vẫn chạy.
 */
export function useBatchFilterOptions() {
  const facets = ref<BatchFilterOptions | null>(null)
  const fallbackMaterials = ref<BatchFacet[]>([])
  const fallbackSellers = ref<BatchFacet[]>([])

  onMounted(async () => {
    try {
      const { data } = await batchesApi.filterOptions()
      facets.value = data
      return
    } catch {
      /* API cũ: dùng danh mục bên dưới. */
    }
    const toFacet = (x: { id: number; code?: string; name?: string }): BatchFacet => ({
      id: x.id, code: x.code ?? '', name: x.name ?? '', deleted: false, count: -1,
    })
    try {
      const { data: rows } = await sellersApi.list()
      fallbackSellers.value = (rows ?? []).map(toFacet)
    } catch {
      /* Bộ lọc seller là phụ trợ: hỏng thì danh sách batch vẫn phải hiện. */
    }
    try {
      const { data: m } = await materialsApi.list()
      fallbackMaterials.value = (m ?? []).map(toFacet)
    } catch {
      /* materials filter optional */
    }
  })

  const hint = (n: number) => (n >= 0 ? n.toLocaleString('vi-VN') : undefined)
  // Dòng phụ: mã (khi khác tên) + "đã xoá". Mã luôn được tìm trong ô tìm.
  const sub = (f: BatchFacet) => [f.code && f.code !== f.name ? f.code : '', f.deleted ? 'đã xoá' : ''].filter(Boolean).join(' · ') || undefined

  const materialOptions = computed(() => [
    { value: '', label: 'Tất cả' },
    ...(facets.value?.materials ?? fallbackMaterials.value).map((m) => ({
      value: String(m.id),
      label: m.name || m.code,
      sublabel: sub(m),
      hint: hint(m.count),
    })),
  ])
  const sellerOptions = computed(() =>
    (facets.value?.sellers ?? fallbackSellers.value).map((s) => ({
      value: String(s.id),
      label: s.name || s.code,
      sublabel: sub(s),
      hint: hint(s.count),
    })),
  )
  // Đủ 3 mức của hệ thống (kể cả mức chưa có batch nào), cộng mức lạ nếu DB có.
  const priorityOptions = computed(() => {
    const counts = new Map((facets.value?.priorities ?? []).map((p) => [p.value, p.count]))
    const known = PRIORITY_OPTIONS as readonly string[]
    const extra = [...counts.keys()].filter((v) => v && !known.includes(v))
    return [
      { value: '', label: 'Tất cả' },
      ...[...known, ...extra].map((p) => ({
        value: p,
        label: PRIORITY[p as keyof typeof PRIORITY]?.label ?? p,
        hint: facets.value ? hint(counts.get(p) ?? 0) : undefined,
      })),
    ]
  })
  return { materialOptions, sellerOptions, priorityOptions }
}
