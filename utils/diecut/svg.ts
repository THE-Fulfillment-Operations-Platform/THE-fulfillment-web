// File cắt bản SVG — để mở nhanh bằng Corel/Illustrator/trình duyệt mà không cần
// máy CAD. Kích thước ghi bằng mm và viewBox trùng số đo thật, nên mở ra là đúng
// 1:1, không ai phải "scale cho vừa" (bước làm hỏng kích thước hay gặp nhất).

import type { Curve } from './curve'

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()

/**
 * Đường cắt ghi bằng lệnh cong C thật — Corel/Illustrator mở ra là đường cong
 * có nút và tay kéo, không phải chuỗi nét thẳng.
 */
function curveToPath(curve: Curve): string {
  if (!curve.length) return ''
  const [p0] = curve[0]
  const segs = curve.map(
    ([, c1, c2, p3]) => `C ${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p3[0])} ${n(p3[1])}`,
  )
  return `M ${n(p0[0])} ${n(p0[1])} ${segs.join(' ')} Z`
}

export interface SvgInput {
  curves: Curve[]
  holes: { cxMm: number; cyMm: number; rMm: number }[]
  widthMm: number
  heightMm: number
  title: string
}

export function buildCutSvg(input: SvgInput): string {
  const { curves, holes, widthMm, heightMm, title } = input
  const paths = curves.map((c) => `    <path d="${curveToPath(c)}" />`).join('\n')
  const holeEl = holes.length
    ? `\n  <g id="LO-KHOAN" fill="none" stroke="#0000FF" stroke-width="0.1">\n${holes
        .map((h) => `    <circle cx="${n(h.cxMm)}" cy="${n(h.cyMm)}" r="${n(h.rMm)}" />`)
        .join('\n')}\n  </g>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
     width="${n(widthMm)}mm" height="${n(heightMm)}mm"
     viewBox="0 0 ${n(widthMm)} ${n(heightMm)}">
  <title>${escapeXml(title)}</title>
  <g id="DUONG-CAT" fill="none" stroke="#FF0000" stroke-width="0.1" stroke-linejoin="round" stroke-linecap="round">
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
