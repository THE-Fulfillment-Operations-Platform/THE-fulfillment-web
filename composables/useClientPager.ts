import type { ApiMeta } from '~/types'
import { isAllPageSize } from '~/utils/pagination'

/**
 * Phân trang phía client cho các bảng đã tải sẵn toàn bộ danh sách (master data:
 * NVL, SKU, mapping, seller — mỗi màn vài trăm dòng).
 *
 * Trả ra `meta` đúng dạng ApiMeta nên dùng thẳng được với <UiPagination>, kể cả ô
 * chọn số dòng — giao diện giống hệt các màn phân trang phía server.
 *
 *   const { paged, meta, pageSize, setPage, setPageSize } = useClientPager(() => filtered.value)
 *
 * Truyền getter của danh sách ĐANG HIỂN THỊ (sau khi lọc/tìm kiếm): danh sách co
 * lại thì trang hiện tại tự kẹp về trang cuối còn hợp lệ, không rơi vào trang trắng.
 */
export function useClientPager<T>(rows: () => T[], initialSize = 20) {
  const page = ref(1)
  const pageSize = ref(initialSize)

  const total = computed(() => rows().length)
  // "Tất cả" (page_size âm) = một trang duy nhất chứa hết. Nếu vẫn chia theo
  // pageSize âm thì totalPages ra số âm và slice() bên dưới trả mảng rỗng.
  const showAll = computed(() => isAllPageSize(pageSize.value))
  const totalPages = computed(() =>
    showAll.value ? 1 : Math.max(1, Math.ceil(total.value / pageSize.value)),
  )

  watch([total, pageSize], () => {
    if (page.value > totalPages.value) page.value = totalPages.value
  })

  const paged = computed(() => {
    if (showAll.value) return rows()
    const start = (page.value - 1) * pageSize.value
    return rows().slice(start, start + pageSize.value)
  })

  const meta = computed<ApiMeta>(() => ({
    page: page.value,
    page_size: pageSize.value,
    total: total.value,
    total_pages: totalPages.value,
  }))

  function setPage(p: number) {
    page.value = p
  }
  // Đổi số dòng thì về trang 1 — trang đang xem có thể không còn ở kích thước mới.
  function setPageSize(size: number) {
    pageSize.value = size
    page.value = 1
  }

  return { page, pageSize, paged, meta, setPage, setPageSize }
}
