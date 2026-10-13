import { clearFiltersOutOfScope } from '~/composables/usePersistedFilters'

// Bộ lọc màn danh sách chỉ sống trong lúc người dùng còn ở màn đó hoặc đi xem chi
// tiết của nó: sau mỗi lần chuyển trang, dọn bản lưu của những màn đã rời đi (xem
// composables/usePersistedFilters.ts). Chạy cả ở lần tải trang đầu — gõ thẳng URL
// màn khác hay F5 ở màn khác cũng tính là đã rời.
export default defineNuxtPlugin(() => {
  useRouter().afterEach((to, _from, failure) => {
    if (!failure) clearFiltersOutOfScope(to)
  })
})
