/**
 * "Tất cả" trong ô chọn số dòng: gửi page_size = -1 để máy chủ trả TOÀN BỘ kết
 * quả khớp bộ lọc trong một trang (backend hiểu số âm là bỏ LIMIT — xem
 * repositories.Page.Normalize). Dùng hằng số này thay vì viết -1 rải rác để chỗ
 * phân trang client (useClientPager) và chỗ phân trang máy chủ hiểu cùng một quy ước.
 *
 * Cảnh báo có chủ đích: bảng lớn (đơn hàng, nhật ký hoạt động) sẽ kéo về mọi dòng
 * — response nặng và bảng render chậm. Đây là lựa chọn của người dùng, không phải
 * mặc định.
 */
export const PAGE_SIZE_ALL = -1

/** Trang đang ở chế độ "Tất cả"? */
export function isAllPageSize(size?: number | null): boolean {
  return typeof size === 'number' && size < 0
}
