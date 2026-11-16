// Tiện ích hiển thị cho chat nội bộ.
import { APP_TZ } from '~/utils/format'

export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500',
  'bg-teal-500', 'bg-indigo-500', 'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-600',
]
export function avatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length]
}

function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: APP_TZ })
}

/** Giờ ngắn cho danh sách cuộc: "14:05" hôm nay, "T3" trong tuần, "12/11" xa hơn. */
export function listTime(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (dayKey(d) === dayKey(new Date(now))) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: APP_TZ })
  }
  if (now - d.getTime() < 6 * 86400_000) {
    return d.toLocaleDateString('vi-VN', { weekday: 'short', timeZone: APP_TZ })
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: APP_TZ })
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: APP_TZ })
}

/** Nhãn ngăn ngày trong luồng tin. */
export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const k = dayKey(d)
  if (k === dayKey(new Date(now))) return 'Hôm nay'
  if (k === dayKey(new Date(now - 86400_000))) return 'Hôm qua'
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: APP_TZ })
}

export function sameDay(a: string, b: string): boolean {
  return dayKey(new Date(a)) === dayKey(new Date(b))
}

/** Bỏ dấu tiếng Việt + chữ thường, để lọc tên. */
export function foldVi(s: string): string {
  return (s || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
}
