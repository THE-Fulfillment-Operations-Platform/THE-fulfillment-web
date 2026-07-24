// Business timezone. Dates are formatted in this zone (not the viewer's browser
// zone) so a created-at / order-date never drifts by a day between UTC storage and
// a machine in another timezone — the "STT trong ngày" calendar day must match the
// server's business day. Mirrors DB_TIMEZONE on the backend.
export const APP_TZ = 'Asia/Ho_Chi_Minh'

/** Format an RFC3339 timestamp for display (business timezone). Returns '—' when empty/invalid. */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TZ,
  })
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: APP_TZ,
  })
}

/** Relative-ish short timestamp used in dense tables (business timezone). */
export function formatShort(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TZ,
  })
}

/** Validate a URL string for "Open mockup" style links. */
export function isValidUrl(value?: string | null): boolean {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Turn a shareable image URL into one that actually renders inside <img>. Google
// Drive "share" links (…/file/d/ID/view, open?id=ID, uc?id=ID) serve an HTML
// viewer page, not the raw image, so <img> shows a broken icon — rewrite them to
// the public thumbnail endpoint. Any other URL passes through unchanged.
export function toDisplayImageUrl(value?: string | null): string {
  if (!value) return ''
  const m = value.match(/\/file\/d\/([\w-]+)/) || value.match(/[?&]id=([\w-]+)/)
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : value
}

export function pluralVi(count: number, noun: string): string {
  return `${count} ${noun}`
}
