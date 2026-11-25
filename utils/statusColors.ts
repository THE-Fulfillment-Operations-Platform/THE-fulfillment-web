// Nguồn DUY NHẤT cho màu nhãn trạng thái (v2). Mỗi tông là một nền ĐẶC, hue tách xa
// nhau: ΔE2000 giữa mọi cặp >= 25 (kiểm bằng scripts/check-status-colors.mjs).
// Chữ là trắng hoặc đen tuỳ nền, tương phản >= 4.5:1. Dùng y nguyên ở cả sáng và tối
// (nền đặc nên không cần biến thể dark:). Các bảng trạng thái chỉ CHỌN tông, không
// tự viết class màu. Class viết nguyên văn để Tailwind JIT thấy.
export type Tone = 'pending' | 'files' | 'printed' | 'cut' | 'qc' | 'packed' | 'handed' | 'shipped' | 'delivered' | 'review' | 'fix' | 'rejected' | 'cancelled'

export const TONE: Record<Tone, string> = {
  // xám: chờ / mới / hết hạn
  pending: 'bg-stone-500 text-white ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // tím: đã có file / thiết kế sẵn sàng
  files: 'bg-violet-400 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // xanh da trời: đang làm (đã in, đang sản xuất, đang gom)
  printed: 'bg-sky-500 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // cam: đã cắt / cần chú ý
  cut: 'bg-orange-500 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // vàng: đã QC / chờ xử lý giữa chừng
  qc: 'bg-yellow-400 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // xanh ngọc: đã đóng gói
  packed: 'bg-teal-300 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // đỏ tía: đã bàn giao
  handed: 'bg-green-600 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // nâu đen: đã gửi đi / đang vận chuyển
  shipped: 'bg-stone-900 text-white ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // lục đậm: xong / đã giao
  delivered: 'bg-green-900 text-white ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // hồng nhạt: chờ duyệt
  review: 'bg-rose-300 text-black ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // lục chanh: cần chỉnh sửa
  fix: 'bg-blue-800 text-white ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // đỏ đặc: lỗi / từ chối / sự cố
  rejected: 'bg-red-800 text-white ring-1 ring-inset ring-black/10 dark:ring-white/25',
  // viền đỏ nền trắng: đã huỷ (khác nhãn đỏ đặc của lỗi / từ chối)
  cancelled: 'bg-white text-red-700 ring-1 ring-inset ring-red-500',
}
