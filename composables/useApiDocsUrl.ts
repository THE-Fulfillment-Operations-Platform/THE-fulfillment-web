// Địa chỉ trang tài liệu kết nối API (Open API) cho đối tác.
//
// Trang do API phục vụ, nằm dưới /api vì proxy chỉ chuyển tiếp /api/* sang API,
// nên link ghép từ địa chỉ API chứ không phải địa chỉ web. Trên prod apiBaseUrl
// rỗng (cùng tên miền) → link tương đối /api/open/docs.
export function useApiDocsUrl() {
  return computed(() => {
    const base = String(useRuntimeConfig().public.apiBaseUrl ?? '').replace(/\/+$/, '')
    return `${base}/api/open/docs`
  })
}
