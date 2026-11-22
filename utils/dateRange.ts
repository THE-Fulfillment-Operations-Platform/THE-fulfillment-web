// Bộ lọc "Từ ngày – Đến ngày" có giờ (anh Kiên 21/11): ô ngày trả `yyyy-mm-dd` hoặc
// `yyyy-mm-ddTHH:MM` (giờ máy người dùng). Mọi khoảng ngày gửi API đều là NỬA MỞ
// [from, to): backend lọc `>= from` và `< to`, nhận RFC3339.
//   - date_from / date_to   — màn Đơn hàng (/api/items, nút Xuất theo mẫu import)
//                              và màn Batch (/api/batches): ngày tạo.
//   - handed_over_from / _to — màn Hành trình, nút Xuất Excel, preview Gắn mã.
// Luôn đổi ra RFC3339 theo giờ máy, kể cả khi chỉ chọn ngày: gửi ngày trơn
// `yyyy-mm-dd` thì API cũ đọc là 00:00 UTC (= 07:00 giờ VN) — lệch 7 tiếng.

const HAS_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Giờ máy → RFC3339 UTC không phần nghìn giây (Go time.RFC3339 nhận chắc chắn). */
function toRFC3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const PICKER_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/

/** Giá trị ô ngày (`yyyy-mm-dd` / `yyyy-mm-ddTHH:MM`) → Date giờ máy; dựng từ số, không parse chuỗi. */
function pickerToLocalDate(v: string): Date | null {
  const m = v.match(PICKER_RE)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0))
  // Ngày không có thật (30/02) bị Date tự lăn sang tháng sau: coi là không hợp lệ.
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null
  return d
}

/** Cận dưới (>=): có giờ thì đúng phút đó, ngày trơn thì 00:00 giờ máy. */
export function apiInstantFrom(v: string): string | undefined {
  const d = v ? pickerToLocalDate(v) : null
  return d ? toRFC3339(d) : undefined
}

/**
 * Cận trên (<): có giờ thì ĐẦU PHÚT KẾ TIẾP (trọn phút đã chọn, kể cả giây 59),
 * ngày trơn thì 00:00 NGÀY KẾ TIẾP (trọn ngày). Cộng theo lịch (setMinutes /
 * setDate), không cộng mili giây.
 */
export function apiInstantBefore(v: string): string | undefined {
  const d = v ? pickerToLocalDate(v) : null
  if (!d) return undefined
  if (HAS_TIME.test(v)) d.setMinutes(d.getMinutes() + 1)
  else d.setDate(d.getDate() + 1)
  return toRFC3339(d)
}

/** Chữ hiển thị của giá trị ô ngày: `dd/mm/yyyy` hoặc `dd/mm/yyyy HH:MM` (giờ máy, đúng như đã chọn). */
export function pickerValueLabel(v?: string | null): string {
  const m = v?.match(PICKER_RE)
  if (!m) return v ?? ''
  return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '')
}
