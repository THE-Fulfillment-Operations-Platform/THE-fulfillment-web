// Tiện ích hiển thị cho chat nội bộ.
import { APP_TZ } from '~/utils/format'
import type { ChatConversation, ChatMessage, ChatRef } from '~/types/chat'

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

// ---------------- đợt 2 (#5453) ----------------
/** Tên hiện của cuộc: tên nhóm, hoặc tên người bên kia. */
export function convTitle(c: ChatConversation | undefined | null): string {
  if (!c) return ''
  if (c.kind === 'group') return c.title || 'Nhóm'
  return c.peer?.full_name || 'Cuộc trò chuyện'
}

/** Đoạn của một tin: chữ thường, link mã đơn/batch, hoặc link web. */
export type MsgSegment =
  | { t: 'text'; v: string }
  | { t: 'ref'; v: string; to: string; kind: 'order' | 'batch' }
  | { t: 'url'; v: string; href: string }

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g

function refPath(r: ChatRef): string {
  return r.kind === 'batch' ? `/batches/${r.id}` : `/orders/${r.id}`
}

function isCodeChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}_/#\-.=&?]/u.test(ch)
}

/**
 * Tách tin thành đoạn để hiện: mã đơn / batch có thật (API đã dò, nằm trong
 * refs) thành link mở đơn/batch; link http(s) thành link mở tab mới. Không dùng
 * v-html — mỗi đoạn là chữ thuần, không có đường chèn mã.
 */
export function messageSegments(body: string, refs: ChatRef[] | undefined): MsgSegment[] {
  const marks: { start: number; end: number; seg: MsgSegment }[] = []
  for (const m of body.matchAll(URL_RE)) {
    marks.push({ start: m.index!, end: m.index! + m[0].length, seg: { t: 'url', v: m[0], href: m[0] } })
  }
  const inUrl = (i: number) => marks.some((k) => i >= k.start && i < k.end)
  // Mã dài trước để "106788_1/2" không bị "106788" chiếm mất.
  const sorted = [...(refs || [])].sort((a, b) => b.code.length - a.code.length)
  for (const r of sorted) {
    let from = 0
    for (;;) {
      const i = body.indexOf(r.code, from)
      if (i < 0) break
      from = i + r.code.length
      const end = i + r.code.length
      if (inUrl(i) || marks.some((k) => i < k.end && end > k.start)) continue
      const before = i > 0 ? body[i - 1] : undefined
      const after = body[end]
      if (isCodeChar(before)) continue
      if (after === '.') {
        // Chấm cuối câu ("đơn 106788.") vẫn là mã; chấm nối chữ/số thì không.
        if (/[\p{L}\p{N}]/u.test(body[end + 1] || '')) continue
      } else if (isCodeChar(after)) continue
      marks.push({ start: i, end, seg: { t: 'ref', v: r.code, to: refPath(r), kind: r.kind } })
    }
  }
  marks.sort((a, b) => a.start - b.start)
  const out: MsgSegment[] = []
  let at = 0
  for (const k of marks) {
    if (k.start < at) continue
    if (k.start > at) out.push({ t: 'text', v: body.slice(at, k.start) })
    out.push(k.seg)
    at = k.end
  }
  if (at < body.length) out.push({ t: 'text', v: body.slice(at) })
  return out
}

/** Cỡ file dễ đọc: "820 KB", "3,4 MB". */
export function fileSize(n: number): string {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}

/** "Đang hoạt động" / "Hoạt động 5 phút trước" / "Hoạt động 3 giờ trước" / "Hoạt động 12/11". */
export function presenceLabel(online: boolean, lastSeen: string | undefined, now = Date.now()): string {
  if (online) return 'Đang hoạt động'
  if (!lastSeen) return ''
  const t = Date.parse(lastSeen)
  if (Number.isNaN(t)) return ''
  const min = Math.max(1, Math.round((now - t) / 60_000))
  if (min < 60) return `Hoạt động ${min} phút trước`
  const h = Math.round(min / 60)
  if (h < 24) return `Hoạt động ${h} giờ trước`
  const d = Math.round(h / 24)
  if (d < 7) return `Hoạt động ${d} ngày trước`
  return `Hoạt động ${new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: APP_TZ })}`
}

/** Câu xem trước tin cuối trong danh sách cuộc. */
export function messagePreview(m: ChatMessage | null | undefined, me: number, isGroup: boolean): string {
  if (!m) return 'Bắt đầu trò chuyện'
  if (m.recalled_at) return m.sender_id === me ? 'Bạn đã thu hồi một tin nhắn' : 'Tin nhắn đã được thu hồi'
  if (m.kind === 'system') return m.body
  let text = (m.body || '').replace(/\s+/g, ' ')
  const atts = m.attachments || []
  if (!text && atts.length) {
    text = atts.every((a) => a.is_image) ? (atts.length > 1 ? `📷 ${atts.length} ảnh` : '📷 Ảnh') : `📎 ${atts[0].name}`
  }
  if (m.sender_id === me) return `Bạn: ${text}`
  if (isGroup && m.sender_name) return `${m.sender_name.split(' ').slice(-1)[0]}: ${text}`
  return text
}
