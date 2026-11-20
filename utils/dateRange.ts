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
