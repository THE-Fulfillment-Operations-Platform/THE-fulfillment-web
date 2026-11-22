// Bộ lọc "Từ ngày – Đến ngày" có giờ (anh Kiên 21/11): ô ngày trả `yyyy-mm-dd` hoặc
// `yyyy-mm-ddTHH:MM` (giờ máy người dùng). API /api/orders, /api/batches… đọc
// date_from / date_to bằng RFC3339 hoặc `yyyy-mm-dd` (timeQueryPtr) và lọc
// created_at >= from, created_at <= to.

const pad = (n: number) => String(n).padStart(2, '0')
const HAS_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Giờ máy → RFC3339 UTC không phần nghìn giây (Go time.RFC3339 nhận chắc chắn). */
function toRFC3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** "Từ": có giờ thì gửi đúng phút đó; chỉ có ngày thì gửi ngày (đầu ngày). */
export function apiDateFrom(v: string): string | undefined {
  if (!v) return undefined
  if (HAS_TIME.test(v)) return toRFC3339(new Date(v + ':00'))
  return v
}

/**
 * "Đến": có giờ thì tính trọn phút đó (tới giây 59); chỉ có ngày thì tính trọn
 * ngày — gửi đầu ngày hôm sau, neo trưa để đổi ngày không trượt múi giờ.
 */
export function apiDateTo(v: string): string | undefined {
  if (!v) return undefined
  if (HAS_TIME.test(v)) return toRFC3339(new Date(v + ':59'))
  const dt = new Date(v.slice(0, 10) + 'T12:00:00')
  dt.setDate(dt.getDate() + 1)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

// ---- Mốc thời điểm cho API lọc NỬA MỞ [from, to) ------------------------------
// Dùng cho handed_over_from / handed_over_to (màn Hành trình, nút Xuất Excel,
// preview Gắn mã từ Excel): backend lọc `>= from` và `< to`. Khác apiDateFrom /
// apiDateTo ở chỗ ngày trơn CŨNG đổi ra RFC3339 theo giờ máy — backend đọc
// `yyyy-mm-dd` là 00:00 UTC (= 07:00 giờ VN), gửi ngày trơn là lệch 7 tiếng.
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
