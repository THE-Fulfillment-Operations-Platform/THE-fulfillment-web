// Ghi DXF R12 (AC1009) ASCII bằng tay — đúng quy ước đã dùng khi gửi xưởng:
//   • R12 phải dùng POLYLINE/VERTEX/SEQEND, KHÔNG phải LWPOLYLINE (bản R12 không
//     biết LWPOLYLINE; máy cũ mở ra là file trống).
//   • Kết thúc dòng bằng CRLF.
//   • Đơn vị mm, trục Y hướng LÊN (ngược ảnh) nên phải lật toạ độ.
// Viết thẳng, không thư viện: máy laser/CNC nào cũng đọc được, và không phụ
// thuộc một gói npm cho thứ sẽ đi vào sản xuất.

import type { Ring } from './contour'

export interface DxfCircle {
  cx: number
  cy: number
  r: number
  layer: string
}

export interface DxfInput {
  /** Các vòng kín, toạ độ mm, gốc trên-trái, Y hướng xuống (như trên màn hình). */
  rings: Ring[]
  circles: DxfCircle[]
  /** Khổ tổng, mm — dùng để lật trục Y và ghi EXTMIN/EXTMAX. */
  widthMm: number
  heightMm: number
  layer: string
}

const num = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3)

function pair(code: number, value: string | number): string {
  return `${code}\r\n${value}\r\n`
}

export function buildDxf(input: DxfInput): string {
  const { rings, circles, widthMm, heightMm, layer } = input
  const flipY = (y: number) => heightMm - y

  let out = ''
  // HEADER — khai báo phiên bản và đơn vị mm để phần mềm không tự đoán inch.
  out += pair(0, 'SECTION') + pair(2, 'HEADER')
  out += pair(9, '$ACADVER') + pair(1, 'AC1009')
  out += pair(9, '$INSUNITS') + pair(70, 4)
  out += pair(9, '$EXTMIN') + pair(10, num(0)) + pair(20, num(0)) + pair(30, num(0))
  out += pair(9, '$EXTMAX') + pair(10, num(widthMm)) + pair(20, num(heightMm)) + pair(30, num(0))
  out += pair(0, 'ENDSEC')

  // TABLES — khai báo lớp. Đường cắt màu đỏ (1), lỗ khoan màu xanh (5): xưởng
  // nhìn phát biết đâu là biên ngoài, đâu là lỗ.
  const layers = [
    { name: layer, color: 1 },
    ...Array.from(new Set(circles.map((c) => c.layer))).map((name) => ({ name, color: 5 })),
  ].filter((l, i, arr) => arr.findIndex((x) => x.name === l.name) === i)
  out += pair(0, 'SECTION') + pair(2, 'TABLES')
  out += pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, layers.length)
  for (const l of layers) {
    out += pair(0, 'LAYER') + pair(2, l.name) + pair(70, 0) + pair(62, l.color) + pair(6, 'CONTINUOUS')
  }
  out += pair(0, 'ENDTAB') + pair(0, 'ENDSEC')

  // ENTITIES
  out += pair(0, 'SECTION') + pair(2, 'ENTITIES')
  for (const ring of rings) {
    if (ring.length < 3) continue
    out += pair(0, 'POLYLINE') + pair(8, layer) + pair(66, 1) + pair(70, 1) // 70=1: khép kín
    out += pair(10, num(0)) + pair(20, num(0)) + pair(30, num(0))
    for (const [x, y] of ring) {
      out += pair(0, 'VERTEX') + pair(8, layer)
      out += pair(10, num(x)) + pair(20, num(flipY(y))) + pair(30, num(0))
    }
    out += pair(0, 'SEQEND') + pair(8, layer)
  }
  for (const c of circles) {
    out += pair(0, 'CIRCLE') + pair(8, c.layer)
    out += pair(10, num(c.cx)) + pair(20, num(flipY(c.cy))) + pair(30, num(0)) + pair(40, num(c.r))
  }
  out += pair(0, 'ENDSEC') + pair(0, 'EOF')
  return out
}

/**
 * Đọc ngược file vừa ghi để đối chiếu — luật cũ từ những bộ DXF gửi xưởng: file
 * sai cấu trúc trông vẫn "có vẻ ổn" cho tới khi máy mở ra trống trơn. Đếm thực
 * thể và kiểm khung bao, chứ không chỉ kiểm file có chữ EOF.
 */
export function verifyDxf(
  text: string,
  expect: { rings: number; circles: number; widthMm: number; heightMm: number },
): string[] {
  const problems: string[] = []
  const lines = text.split('\r\n')
  if (text.includes('\n') && !text.includes('\r\n')) problems.push('DXF không kết thúc dòng bằng CRLF')
  if (!text.endsWith('EOF\r\n')) problems.push('DXF thiếu EOF ở cuối file')
  if (text.includes('LWPOLYLINE')) problems.push('DXF R12 không được dùng LWPOLYLINE')

  let polylines = 0
  let circles = 0
  let vertices = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim()
    const value = lines[i + 1]
    if (code === '0' && value === 'POLYLINE') polylines++
    if (code === '0' && value === 'CIRCLE') circles++
    if (code === '0' && value === 'VERTEX') vertices++
    if (code === '10' || code === '20') {
      const v = Number(value)
      if (Number.isFinite(v)) {
        if (code === '10') {
          if (v < minX) minX = v
          if (v > maxX) maxX = v
        } else {
          if (v < minY) minY = v
          if (v > maxY) maxY = v
        }
      }
    }
  }
  if (polylines !== expect.rings) problems.push(`DXF có ${polylines} đường, chờ ${expect.rings}`)
  if (circles !== expect.circles) problems.push(`DXF có ${circles} lỗ, chờ ${expect.circles}`)
  if (polylines > 0 && vertices < 3) problems.push('DXF có đường nhưng không có đỉnh')
  const tol = 0.5
  if (Number.isFinite(maxX) && maxX - minX > expect.widthMm + tol) {
    problems.push(`Khổ ngang trong DXF (${(maxX - minX).toFixed(1)} mm) vượt kích thước đặt`)
  }
  if (Number.isFinite(maxY) && maxY - minY > expect.heightMm + tol) {
    problems.push(`Khổ dọc trong DXF (${(maxY - minY).toFixed(1)} mm) vượt kích thước đặt`)
  }
  return problems
}
