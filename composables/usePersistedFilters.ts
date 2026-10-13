import type { RouteLocationNormalized } from 'vue-router'

// Bộ lọc của màn danh sách — luật:
//   - Đang ở màn đó: giữ nguyên những gì đã chọn (kể cả F5).
//   - Đi vào chi tiết rồi quay lại (nút Back, link "← Về danh sách"…): vẫn còn.
//   - Rời sang chỗ khác (bấm sidebar sang màn khác, sang tầng khác…): xoá, lần
//     sau vào lại là mặc định "Tất cả".
//
// Mỗi màn lưu một bản trong sessionStorage: { path: '/orders', v: {...bộ lọc} }.
// Bản lưu do plugins/filters-scope.client.ts dọn: sau MỖI lần chuyển trang, bản
// nào mà trang vừa tới nằm ngoài phạm vi của màn đó thì bị xoá (xem inScope).

const PREFIX = 'ffm:filters:'

type Saved = { path: string; v: Record<string, unknown> }

function read(storageKey: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    const saved = raw ? JSON.parse(raw) : null
    return saved && typeof saved.path === 'string' && saved.v && typeof saved.v === 'object' ? saved : null
  } catch {
    return null
  }
}

function write(storageKey: string, saved: Saved) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(saved))
  } catch {
    // sessionStorage bị chặn / đầy: bỏ qua, bộ lọc chỉ không được nhớ.
  }
}

/**
 * Trang `to` có còn thuộc phạm vi của màn danh sách `listPath` không:
 *   - chính màn đó (đổi query, F5);
 *   - trang con của nó (/batches → /batches/new);
 *   - một trang chi tiết bất kỳ = route có tham số (/orders/:id, /batches/:id…),
 *     kể cả chi tiết của màn khác mở từ màn này (Tra cứu CS → /orders/:id).
 * Còn lại (màn khác trên sidebar, Tổng quan, đăng xuất…) là đã rời đi.
 */
function inScope(listPath: string, to: RouteLocationNormalized): boolean {
  return to.path === listPath || to.path.startsWith(listPath + '/') || Object.keys(to.params).length > 0
}

/** Gọi sau mỗi lần chuyển trang (plugins/filters-scope.client.ts). */
export function clearFiltersOutOfScope(to: RouteLocationNormalized) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      // Bản lưu kiểu cũ (không có path) cũng dọn luôn.
      const saved = read(k)
      if (!saved || !inScope(saved.path, to)) sessionStorage.removeItem(k)
    }
  } catch {
    // sessionStorage bị chặn: không có gì để dọn.
  }
}

/**
 * Gọi NGAY sau khi khai báo `reactive` bộ lọc, TRƯỚC khi loader chạy (loader
 * chạy ở onMounted nên khớp chỗ này):
 *
 *   const filters = reactive({ q: '', page: 1, page_size: 20 })
 *   usePersistedFilters('cs', filters)
 *
 * Chỉ khôi phục khoá còn tồn tại và cùng kiểu với giá trị mặc định — đổi cấu
 * trúc bộ lọc ở bản sau thì dữ liệu cũ không làm hỏng màn.
 */
export function usePersistedFilters<T extends object>(key: string, state: T): T {
  const router = useRouter()
  const path = router.currentRoute.value.path
  const storageKey = PREFIX + key

  const saved = read(storageKey)
  if (saved && saved.path === path) {
    const target = state as Record<string, unknown>
    for (const k of Object.keys(target)) {
      if (k in saved.v && typeof saved.v[k] === typeof target[k]) target[k] = saved.v[k]
    }
  }

  watch(
    () => ({ ...state }),
    (v) => {
      // Đã rời màn (trang cũ còn hiện thêm một nhịp trong lúc trang mới dựng):
      // không ghi lại bản vừa bị dọn.
      if (router.currentRoute.value.path !== path) return
      write(storageKey, { path, v: v as Record<string, unknown> })
    },
    { deep: true },
  )
  return state
}
