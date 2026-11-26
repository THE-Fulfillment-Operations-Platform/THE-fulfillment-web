import { materialsApi, sellersApi } from '~/services/api'
import type { Material, Seller } from '~/types'
import { PRIORITY, PRIORITY_OPTIONS } from '~/utils/enums'

/**
 * Danh sách chọn của bộ lọc batch (Chất liệu, Seller, Ưu tiên) — dùng chung cho
 * màn Batch và Bảng sản xuất. Tải lúc mount; hỏng thì ô lọc chỉ trống, màn vẫn chạy.
 * Giá trị là CHUỖI (usePersistedFilters / URL chỉ khôi phục khi cùng kiểu).
 */
export function useBatchFilterOptions() {
  const materials = ref<Material[]>([])
  const sellers = ref<Seller[]>([])

  onMounted(async () => {
    try {
      const { data: rows } = await sellersApi.list()
      sellers.value = rows ?? []
    } catch {
      /* Bộ lọc seller là phụ trợ: hỏng thì danh sách batch vẫn phải hiện. */
    }
  })
  onMounted(async () => {
    try {
      const { data: m } = await materialsApi.list()
      materials.value = m ?? []
    } catch {
      /* materials filter optional */
    }
  })

  const materialOptions = computed(() => [
    { value: '', label: 'Tất cả' },
    ...materials.value.map((m) => ({ value: String(m.id), label: m.name })),
  ])
  const sellerOptions = computed(() =>
    sellers.value.map((s) => ({ value: String(s.id), label: s.name || s.code, sublabel: s.name && s.code && s.name !== s.code ? s.code : undefined })),
  )
  const priorityOptions = [
    { value: '', label: 'Tất cả' },
    ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: PRIORITY[p].label })),
  ]
  return { materialOptions, sellerOptions, priorityOptions }
}
