// Làm gọn đường cắt. Marching squares cho ra hàng chục nghìn điểm — máy laser
// đọc được nhưng file nặng, Corel mở ì, và mỗi điểm thừa là một lần máy ghìm tốc
// độ. Hai bước, đúng thứ tự:
//   1. Chaikin làm mượt góc răng cưa còn sót ở mức điểm ảnh.
//   2. Douglas–Peucker bỏ điểm thừa với sai số tối đa tính bằng mm.
// Sai số luôn ĐO ĐƯỢC (đặt theo mm), không phải "mượt vừa mắt".

import type { Ring } from './contour'

/** Cắt góc kiểu Chaikin trên vòng kín. Mỗi vòng lặp nhân đôi số điểm. */
export function chaikin(ring: Ring, iterations: number): Ring {
  let pts = ring
  for (let it = 0; it < iterations; it++) {
    const out: Ring = []
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[(i + 1) % n]
      out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25])
      out.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    pts = out
  }
  return pts
}

function rdpRange(pts: Ring, first: number, last: number, eps: number, keep: boolean[]): void {
  if (last <= first + 1) return
  const [ax, ay] = pts[first]
  const [bx, by] = pts[last]
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  let maxDist = -1
  let maxIdx = -1
  for (let i = first + 1; i < last; i++) {
    const [px, py] = pts[i]
    const dist =
      len === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }
  if (maxDist > eps && maxIdx > 0) {
    keep[maxIdx] = true
    rdpRange(pts, first, maxIdx, eps, keep)
    rdpRange(pts, maxIdx, last, eps, keep)
  }
}

/** Douglas–Peucker cho vòng kín: neo hai điểm đối nhau rồi rút gọn hai nửa. */
export function simplifyRing(ring: Ring, eps: number): Ring {
  const n = ring.length
  if (n < 8 || eps <= 0) return ring
  const keep = new Array<boolean>(n).fill(false)
  const half = n >> 1
  keep[0] = true
  keep[half] = true
  rdpRange(ring, 0, half, eps, keep)
  rdpRange(ring, half, n - 1, eps, keep)
  keep[n - 1] = true
  const out: Ring = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i])
  return out.length >= 3 ? out : ring
}

/** Bỏ điểm trùng/gần trùng (dưới `eps`) để file cắt không có đoạn dài 0. */
export function dedupe(ring: Ring, eps: number): Ring {
  const out: Ring = []
  for (const p of ring) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push(p)
  }
  // Vòng kín: điểm cuối trùng điểm đầu thì bỏ, phần mềm sẽ tự khép.
  while (out.length > 1) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps) out.pop()
    else break
  }
  return out
}
