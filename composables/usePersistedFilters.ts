const PREFIX = 'ffm:filters:'

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // sessionStorage bị chặn / đầy: bỏ qua, bộ lọc chỉ không được nhớ.
  }
}

/**
 * Nhớ bộ lọc của một màn danh sách để bấm vào chi tiết rồi Back vẫn còn nguyên
 * lọc, tìm kiếm, trang, số dòng — không phải lọc lại từ đầu.
 *
 * Gọi NGAY sau khi khai báo `reactive` bộ lọc, TRƯỚC khi loader chạy (loader
 * chạy ở onMounted nên khớp chỗ này):
 *
 *   const filters = reactive({ q: '', page: 1, page_size: 20 })
 *   usePersistedFilters('cs', filters)
 *
 * Lưu theo tab trình duyệt (sessionStorage) nên đóng tab là về mặc định. Chỉ khôi
 * phục khoá còn tồn tại và cùng kiểu với giá trị mặc định — đổi cấu trúc bộ lọc ở
 * bản sau thì dữ liệu cũ không làm hỏng màn.
 */
export function usePersistedFilters<T extends object>(key: string, state: T): T {
  const saved = read(key)
  if (saved) {
    const target = state as Record<string, unknown>
    for (const k of Object.keys(target)) {
      if (k in saved && typeof saved[k] === typeof target[k]) target[k] = saved[k]
    }
  }
  watch(
    () => ({ ...state }),
    (v) => write(key, v),
    { deep: true },
  )
  return state
}

/** Bản cho một `ref` đơn lẻ (ô tìm kiếm trong các tab master data). */
export function usePersistedRef<T extends string | number | boolean>(key: string, r: Ref<T>): Ref<T> {
  const saved = read(key)
  if (saved && typeof saved.v === typeof r.value) r.value = saved.v as T
  watch(r, (v) => write(key, { v }))
  return r
}
