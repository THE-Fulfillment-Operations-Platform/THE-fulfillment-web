// File cắt bản SVG — để mở nhanh bằng Corel/Illustrator/trình duyệt mà không cần
// máy CAD. Kích thước ghi bằng mm và viewBox trùng số đo thật, nên mở ra là đúng
// 1:1, không ai phải "scale cho vừa" (bước làm hỏng kích thước hay gặp nhất).

import type { Ring } from './contour'

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()

function ringToPath(ring: Ring): string {
  if (!ring.length) return ''
  const head = `M ${n(ring[0][0])} ${n(ring[0][1])}`
  const rest = ring.slice(1).map(([x, y]) => `L ${n(x)} ${n(y)}`)
  return `${head} ${rest.join(' ')} Z`
}

export interface SvgInput {
  rings: Ring[]
  hole?: { cxMm: number; cyMm: number; rMm: number }
  widthMm: number
  heightMm: number
  title: string
}

export function buildCutSvg(input: SvgInput): string {
  const { rings, hole, widthMm, heightMm, title } = input
  const paths = rings.map((r) => `    <path d="${ringToPath(r)}" />`).join('\n')
  const holeEl = hole
    ? `\n  <g id="LO-TREO" fill="none" stroke="#0000FF" stroke-width="0.1">\n    <circle cx="${n(hole.cxMm)}" cy="${n(hole.cyMm)}" r="${n(hole.rMm)}" />\n  </g>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
     width="${n(widthMm)}mm" height="${n(heightMm)}mm"
     viewBox="0 0 ${n(widthMm)} ${n(heightMm)}">
  <title>${escapeXml(title)}</title>
  <g id="DUONG-CAT" fill="none" stroke="#FF0000" stroke-width="0.1">
${paths}
  </g>${holeEl}
</svg>
`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  )
}
