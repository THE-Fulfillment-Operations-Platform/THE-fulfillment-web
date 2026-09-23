// Từ đường đồng mức dày đặc (một điểm mỗi điểm ảnh) ra ĐƯỜNG CONG thật.
//
// Trước đây đường cắt là đa giác làm gọn bằng Douglas–Peucker: sai số 0,08 mm
// thì mắt không thấy, nhưng trên cung bán kính 20 mm mỗi đoạn dài ~3,6 mm và
// gãy góc ~10° ở mỗi đỉnh — nhìn phát biết là "nét thẳng nối nhau". Ở đây thay
// bằng fit Bézier bậc ba liên tục tiếp tuyến (G1) theo thuật toán Schneider
// (Graphics Gems 1990): mỗi khúc cong là một đường cong đúng nghĩa, chỉ gãy ở
// những góc THẬT của hình (phát hiện riêng), sai số vẫn đo được bằng mm.
//
// Thứ tự: dedupe → resample đều theo chiều dài → tìm góc thật (trên dữ liệu
// thô) → làm mịn Gauss cỡ một điểm ảnh, ghim góc → fit từng khúc giữa hai góc,
// gộp lại khúc nào gộp được → (cho DXF) chia đường cong thành đoạn thẳng mịn
// tới mức không thấy góc gãy.
//
// Sai số fit KHÔNG được nhỏ hơn cỡ nửa điểm ảnh: mép hình trong mặt nạ nhị phân
// chỉ biết chính xác tới ±0,5 điểm ảnh, đo được đường đồng mức lệch tới 0,46 px
// so với hình tròn thật. Ép fit sát hơn thế là bắt đường cong đuổi theo nhiễu
// lưới — ra hàng chục khúc gợn sóng thay vì một đường tròn. Trong hành lang
// ±nửa điểm ảnh mọi đường đều "đúng" như nhau, và đường trơn nhất là đường tốt.

import type { Point, Ring } from './contour'

/** Bézier bậc ba: [điểm đầu, tay đầu, tay cuối, điểm cuối]. */
export type Cubic = [Point, Point, Point, Point]
/** Đường kín gồm các khúc Bézier nối tiếp: điểm cuối khúc này là điểm đầu khúc sau. */
export type Curve = Cubic[]

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Point, k: number): Point => [a[0] * k, a[1] * k]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0]
const len = (a: Point) => Math.hypot(a[0], a[1])
const dist2 = (a: Point, b: Point) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
function normalize(a: Point): Point {
  const l = len(a)
  return l > 0 ? [a[0] / l, a[1] / l] : [1, 0]
}
/** Góc không dấu giữa hai vectơ, radian. */
function angleBetween(a: Point, b: Point): number {
  return Math.abs(Math.atan2(cross(a, b), dot(a, b)))
}

/** Bỏ điểm trùng/gần trùng (dưới `eps`) và điểm cuối lặp lại điểm đầu. */
export function dedupe(ring: Ring, eps: number): Ring {
  const out: Ring = []
  for (const p of ring) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push(p)
  }
  while (out.length > 1) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps) out.pop()
    else break
  }
  return out
}

/**
 * Lấy mẫu lại vòng kín cho các điểm cách đều `step` theo chiều dài cung.
 * Marching squares cho điểm cách nhau 0…1,4 điểm ảnh tuỳ ô — đều lại thì phép
 * làm mịn và phép đo góc phía sau mới có nghĩa như nhau ở mọi chỗ.
 */
export function resampleClosed(ring: Ring, step: number): Ring {
  const n = ring.length
  if (n < 3 || step <= 0) return ring
  const segLen = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    segLen[i] = Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1])
    total += segLen[i]
  }
  if (total <= 0) return ring
  const count = Math.max(8, Math.round(total / step))
  const d = total / count
  const out: Ring = []
  let seg = 0
  let segStart = 0
  for (let k = 0; k < count; k++) {
    const target = k * d
    while (seg < n - 1 && segStart + segLen[seg] < target) {
      segStart += segLen[seg]
      seg++
    }
    const t = segLen[seg] > 0 ? Math.min(1, Math.max(0, (target - segStart) / segLen[seg])) : 0
    const a = ring[seg]
    const b = ring[(seg + 1) % n]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

function gaussKernel(sigma: number): { weights: number[]; radius: number } {
  const radius = Math.ceil(sigma * 3)
  const weights: number[] = []
  let sum = 0
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma))
    weights.push(w)
    sum += w
  }
  return { weights: weights.map((w) => w / sum), radius }
}

/**
 * Làm mịn Gauss trên vòng kín, `sigma` tính bằng số mẫu. Có `corners` thì làm
 * mịn từng khúc giữa hai góc với phản xạ gương qua góc: góc đứng yên tuyệt đối
 * và hai cạnh kề vẫn thẳng tới tận góc — không bị "ăn" tròn góc như làm mịn tuột.
 */
export function smoothClosed(ring: Ring, sigma: number, corners: number[] = []): Ring {
  const n = ring.length
  if (sigma <= 0) return ring
  const { weights, radius } = gaussKernel(sigma)
  if (n < radius * 2 + 3) return ring
  if (!corners.length) {
    const out: Ring = new Array(n)
    for (let i = 0; i < n; i++) {
      let x = 0
      let y = 0
      for (let k = -radius; k <= radius; k++) {
        const p = ring[(i + k + n) % n]
        const w = weights[k + radius]
        x += p[0] * w
        y += p[1] * w
      }
      out[i] = [x, y]
    }
    return out
  }
  const out: Ring = ring.slice()
  const cs = [...corners].sort((a, b) => a - b)
  for (let k = 0; k < cs.length; k++) {
    const c0 = cs[k]
    const c1 = cs[(k + 1) % cs.length]
    const count = cs.length === 1 ? n : (((c1 - c0) % n) + n) % n
    if (count < 2) continue
    const seg: Ring = []
    for (let i = 0; i <= count; i++) seg.push(ring[(c0 + i) % n])
    // Điểm ngoài khúc lấy bằng phản xạ qua điểm đầu/cuối.
    const at = (i: number): Point => {
      if (i < 0) return sub(mul(seg[0], 2), seg[Math.min(-i, count)])
      if (i > count) return sub(mul(seg[count], 2), seg[Math.max(0, 2 * count - i)])
      return seg[i]
    }
    for (let i = 1; i < count; i++) {
      let x = 0
      let y = 0
      for (let j = -radius; j <= radius; j++) {
        const p = at(i + j)
        const w = weights[j + radius]
        x += p[0] * w
        y += p[1] * w
      }
      out[(c0 + i) % n] = [x, y]
    }
  }
  return out
}

/**
 * Chỉ số các GÓC THẬT trên vòng kín: chỗ hướng đi đổi hơn `minAngle` (radian)
 * trong khoảng ±`span` mẫu, và là cực đại cục bộ. Đây là chỗ duy nhất đường
 * cong được phép gãy — góc vuông của một tấm biển phải ra góc vuông, không bo.
 */
export function findCorners(ring: Ring, span: number, minAngle: number): number[] {
  const n = ring.length
  if (n < span * 4 + 4) return []
  const ang = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = sub(ring[i], ring[(i - span + n) % n])
    const b = sub(ring[(i + span) % n], ring[i])
    ang[i] = angleBetween(a, b)
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (ang[i] < minAngle) continue
    let isMax = true
    for (let k = -span; k <= span && isMax; k++) {
      if (k !== 0 && ang[(i + k + n) % n] > ang[i]) isMax = false
    }
    if (isMax) out.push(i)
  }
  return out
}

/**
 * Ghim từng góc về GIAO ĐIỂM của hai cạnh kề: mẫu gần góc nhất có thể lệch tới
 * nửa bước lấy mẫu so với đỉnh thật, đủ để góc vuông của tấm biển ra 86°. Hai
 * cạnh ước lượng bằng bình phương tối thiểu trên `span` mẫu mỗi bên (bỏ 2 mẫu
 * sát góc). Giao điểm quá xa mẫu gốc (cạnh cong, không phải góc) thì để nguyên.
 */
export function snapCorners(ring: Ring, corners: number[], span: number, step: number): Ring {
  const n = ring.length
  if (!corners.length || n < span * 2 + 4) return ring
  const out = ring.slice()
  const at = (i: number) => ring[((i % n) + n) % n]
  // Đường thẳng qua các mẫu i0..i1 (theo vòng): điểm trung bình + hướng chính.
  const lineOf = (i0: number, i1: number): { p: Point; d: Point } => {
    let mx = 0
    let my = 0
    let cnt = 0
    for (let i = i0; i <= i1; i++) {
      mx += at(i)[0]
      my += at(i)[1]
      cnt++
    }
    mx /= cnt
    my /= cnt
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (let i = i0; i <= i1; i++) {
      const dx = at(i)[0] - mx
      const dy = at(i)[1] - my
      sxx += dx * dx
      sxy += dx * dy
      syy += dy * dy
    }
    // Vectơ riêng của ma trận hiệp phương sai ứng với trị riêng lớn nhất.
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    return { p: [mx, my], d: [Math.cos(theta), Math.sin(theta)] }
  }
  for (const c of corners) {
    const a = lineOf(c - span, c - 2)
    const b = lineOf(c + 2, c + span)
    const den = cross(a.d, b.d)
    if (Math.abs(den) < 1e-6) continue // hai cạnh gần song song: không phải góc thật
    const t = cross(sub(b.p, a.p), b.d) / den
    const x: Point = add(a.p, mul(a.d, t))
    if (Math.hypot(x[0] - at(c)[0], x[1] - at(c)[1]) <= step * 1.5) out[((c % n) + n) % n] = x
  }
  return out
}

// --- Fit Bézier (Schneider) ---------------------------------------------------

export function cubicPoint(b: Cubic, t: number): Point {
  const mt = 1 - t
  const a0 = mt * mt * mt
  const a1 = 3 * mt * mt * t
  const a2 = 3 * mt * t * t
  const a3 = t * t * t
  return [
    b[0][0] * a0 + b[1][0] * a1 + b[2][0] * a2 + b[3][0] * a3,
    b[0][1] * a0 + b[1][1] * a1 + b[2][1] * a2 + b[3][1] * a3,
  ]
}

/** Đạo hàm bậc nhất tại t. */
function cubicTangent(b: Cubic, t: number): Point {
  const mt = 1 - t
  const q0 = sub(b[1], b[0])
  const q1 = sub(b[2], b[1])
  const q2 = sub(b[3], b[2])
  return mul(add(add(mul(q0, mt * mt), mul(q1, 2 * mt * t)), mul(q2, t * t)), 3)
}

/** Đạo hàm bậc hai tại t. */
function cubicSecond(b: Cubic, t: number): Point {
  const q0 = sub(b[1], b[0])
  const q1 = sub(b[2], b[1])
  const q2 = sub(b[3], b[2])
  return mul(add(mul(sub(q1, q0), 1 - t), mul(sub(q2, q1), t)), 6)
}

/** Khúc thẳng viết dưới dạng Bézier (tay đặt ở 1/3 và 2/3). */
function lineCubic(a: Point, b: Point): Cubic {
  const d = sub(b, a)
  return [a, add(a, mul(d, 1 / 3)), add(a, mul(d, 2 / 3)), b]
}

/** Tham số hoá theo chiều dài dây cung, chuẩn về [0, 1]. */
function chordParams(d: Ring): Float64Array {
  const u = new Float64Array(d.length)
  for (let i = 1; i < d.length; i++) u[i] = u[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1])
  const total = u[d.length - 1]
  if (total > 0) for (let i = 1; i < d.length; i++) u[i] /= total
  return u
}

/**
 * Bình phương tối thiểu: với tham số u đã cho, tìm độ dài hai tay Bézier dọc
 * theo hai tiếp tuyến bắt buộc t1 (ở điểm đầu) và t2 (ở điểm cuối, hướng NGƯỢC
 * vào trong khúc) sao cho đường cong sát các điểm nhất.
 */
function generateBezier(d: Ring, u: Float64Array, t1: Point, t2: Point): Cubic {
  const first = d[0]
  const last = d[d.length - 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < d.length; i++) {
    const t = u[i]
    const mt = 1 - t
    const b0 = mt * mt * mt
    const b1 = 3 * mt * mt * t
    const b2 = 3 * mt * t * t
    const b3 = t * t * t
    const a0 = mul(t1, b1)
    const a1 = mul(t2, b2)
    c00 += dot(a0, a0)
    c01 += dot(a0, a1)
    c11 += dot(a1, a1)
    const tmp = sub(d[i], add(mul(first, b0 + b1), mul(last, b2 + b3)))
    x0 += dot(a0, tmp)
    x1 += dot(a1, tmp)
  }
  const det = c00 * c11 - c01 * c01
  let alphaL = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0
  let alphaR = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0
  const segLength = Math.hypot(last[0] - first[0], last[1] - first[1])
  const epsilon = 1e-6 * segLength
  if (alphaL < epsilon || alphaR < epsilon || !Number.isFinite(alphaL) || !Number.isFinite(alphaR)) {
    // Hệ suy biến (điểm quá ít hoặc gần thẳng hàng): đặt tay theo Wu–Barsky.
    alphaL = alphaR = segLength / 3
  }
  return [first, add(first, mul(t1, alphaL)), add(last, mul(t2, alphaR)), last]
}

/** Sai số lớn nhất (bình phương) giữa các điểm và đường cong tại tham số của chúng. */
function maxError(d: Ring, bez: Cubic, u: Float64Array): { err: number; split: number } {
  let err = 0
  let split = d.length >> 1
  for (let i = 1; i < d.length - 1; i++) {
    const e = dist2(cubicPoint(bez, u[i]), d[i])
    if (e > err) {
      err = e
      split = i
    }
  }
  return { err, split }
}

/** Một bước Newton–Raphson kéo từng tham số về chân đường vuông góc. */
function reparameterize(d: Ring, bez: Cubic, u: Float64Array): Float64Array | null {
  const out = new Float64Array(u.length)
  for (let i = 0; i < d.length; i++) {
    const t = u[i]
    const q = cubicPoint(bez, t)
    const q1 = cubicTangent(bez, t)
    const q2 = cubicSecond(bez, t)
    const diff = sub(q, d[i])
    const num = dot(diff, q1)
    const den = dot(q1, q1) + dot(diff, q2)
    const nt = den === 0 ? t : t - num / den
    out[i] = Math.min(1, Math.max(0, nt))
    // Tham số phải tăng dần, không thì đường cong "gập" và fit không còn nghĩa.
    if (i > 0 && out[i] < out[i - 1]) return null
  }
  return out
}

interface Piece {
  bez: Cubic
  /** Khoảng chỉ số điểm mà khúc này phủ (trong mảng điểm của khúc hở). */
  i0: number
  i1: number
  t1: Point
  t2: Point
}

/** Fit một cubic qua d[i0..i1] với tiếp tuyến ép; trả null nếu không đạt sai số. */
function tryFit(d: Ring, i0: number, i1: number, t1: Point, t2: Point, tol2: number): { bez: Cubic; err: number; split: number } | null {
  const pts = d.slice(i0, i1 + 1)
  let u = chordParams(pts)
  let bez = generateBezier(pts, u, t1, t2)
  let { err, split } = maxError(pts, bez, u)
  for (let iter = 0; iter < 4 && err > tol2 && err < tol2 * 16; iter++) {
    const nu = reparameterize(pts, bez, u)
    if (!nu) break
    u = nu
    bez = generateBezier(pts, u, t1, t2)
    ;({ err, split } = maxError(pts, bez, u))
  }
  return err <= tol2 ? { bez, err, split: i0 + split } : null
}

/**
 * Fit đệ quy d[i0..i1] với tiếp tuyến ép ở hai đầu. Không đạt sai số thì bổ đôi
 * tại điểm lệch nhất và fit hai nửa với tiếp tuyến chung ở chỗ bổ — nhờ vậy hai
 * khúc nối nhau trơn (G1).
 */
function fitRange(d: Ring, i0: number, i1: number, t1: Point, t2: Point, tol2: number, span: number, out: Piece[], depth: number): void {
  const n = i1 - i0 + 1
  if (n < 2) return
  if (n === 2) {
    const dist = Math.hypot(d[i1][0] - d[i0][0], d[i1][1] - d[i0][1]) / 3
    out.push({ bez: [d[i0], add(d[i0], mul(t1, dist)), add(d[i1], mul(t2, dist)), d[i1]], i0, i1, t1, t2 })
    return
  }
  if (depth > 48) {
    // Dữ liệu quá nhiễu để hội tụ: thà ra đoạn thẳng còn hơn treo.
    for (let i = i0 + 1; i <= i1; i++) {
      const t = normalize(sub(d[i], d[i - 1]))
      out.push({ bez: lineCubic(d[i - 1], d[i]), i0: i - 1, i1: i, t1: t, t2: mul(t, -1) })
    }
    return
  }
  const fit = tryFit(d, i0, i1, t1, t2, tol2)
  if (fit) {
    out.push({ bez: fit.bez, i0, i1, t1, t2 })
    return
  }
  // Điểm bổ lấy từ lần fit thô (không tính lại tham số) là đủ để chia.
  const pts = d.slice(i0, i1 + 1)
  const u = chordParams(pts)
  let { split } = maxError(pts, generateBezier(pts, u, t1, t2), u)
  split = i0 + Math.min(n - 2, Math.max(1, split))
  const m = Math.min(span, split - i0, i1 - split)
  const center = normalize(sub(d[split - m], d[split + m]))
  fitRange(d, i0, split, t1, center, tol2, span, out, depth + 1)
  fitRange(d, split, i1, mul(center, -1), t2, tol2, span, out, depth + 1)
}

/**
 * Gộp khúc: đệ quy bổ đôi hay để lại khúc lẻ tẻ (một khúc 1 mm kẹp giữa hai
 * khúc 20 mm). Thử fit lại hai khúc kề nhau thành một với tiếp tuyến ngoài cùng
 * giữ nguyên — đạt sai số thì gộp, G1 với hàng xóm không đổi.
 */
function mergePieces(d: Ring, pieces: Piece[], tol2: number): Piece[] {
  const out: Piece[] = []
  let cur = pieces[0]
  for (let k = 1; k < pieces.length; k++) {
    const next = pieces[k]
    const fit = tryFit(d, cur.i0, next.i1, cur.t1, next.t2, tol2)
    if (fit) cur = { bez: fit.bez, i0: cur.i0, i1: next.i1, t1: cur.t1, t2: next.t2 }
    else {
      out.push(cur)
      cur = next
    }
  }
  out.push(cur)
  return out
}

/** Fit một khúc hở trọn vẹn: đệ quy rồi gộp. */
function fitOpen(d: Ring, t1: Point, t2: Point, tol2: number, span: number): Cubic[] {
  const pieces: Piece[] = []
  fitRange(d, 0, d.length - 1, t1, t2, tol2, span, pieces, 0)
  if (!pieces.length) return []
  return mergePieces(d, pieces, tol2).map((p) => p.bez)
}

/**
 * Fit vòng kín thành chuỗi Bézier. `corners` là chỉ số các góc thật (từ
 * findCorners): tại đó đường được phép gãy; mọi chỗ khác nối trơn. `tol` tính
 * bằng đơn vị của điểm (mm), `span` = số mẫu dùng để ước lượng tiếp tuyến.
 */
export function fitClosedCurve(ring: Ring, tol: number, corners: number[], span: number): Curve {
  const n = ring.length
  const out: Curve = []
  if (n < 3) return out
  const tol2 = tol * tol
  const at = (i: number) => ring[((i % n) + n) % n]
  if (n < 8) {
    for (let i = 0; i < n; i++) out.push(lineCubic(at(i), at(i + 1)))
    return out
  }
  const m = Math.max(1, Math.min(span, n >> 2))
  // Tiếp tuyến tại một điểm nằm giữa khúc, lấy đối xứng hai bên.
  const central = (i: number) => normalize(sub(at(i + m), at(i - m)))
  // Cắt vòng thành các khúc hở tại góc; không có góc thì bổ đôi tại hai điểm
  // đối nhau và ép tiếp tuyến chung — vòng khép lại vẫn trơn ở chỗ nối.
  const cuts = corners.length ? [...corners].sort((a, b) => a - b) : [0, n >> 1]
  for (let k = 0; k < cuts.length; k++) {
    const c0 = cuts[k]
    const c1 = cuts[(k + 1) % cuts.length]
    let count = (((c1 - c0) % n) + n) % n
    if (count === 0) count = n // một góc duy nhất: khúc đi trọn vòng về lại chính nó
    const seg: Ring = []
    for (let i = 0; i <= count; i++) seg.push(at(c0 + i))
    let t1: Point
    let t2: Point
    if (corners.length) {
      const mm = Math.min(m, count)
      t1 = normalize(sub(seg[mm], seg[0]))
      t2 = normalize(sub(seg[count - mm], seg[count]))
    } else {
      t1 = central(c0)
      t2 = mul(central(c1), -1)
    }
    out.push(...fitOpen(seg, t1, t2, tol2, m))
  }
  return out
}

/**
 * Chia đường cong thành đoạn thẳng cho file DXF R12 (bản này không có thực thể
 * cong). Hai điều kiện cùng lúc: dây cung lệch đường cong không quá `tol` mm VÀ
 * hướng đổi không quá `maxAngle` mỗi đỉnh — điều kiện thứ hai là thứ làm mắt
 * không còn thấy góc gãy, dù dây cung có ngắn hay dài.
 */
export function flattenCurve(curve: Curve, tol: number, maxAngle: number): Ring {
  const out: Ring = []
  for (const b of curve) {
    // Wang: sai số dây cung ≤ 0,75·max|Δ²P| / n²  →  n = √(0,75·dd / tol)
    const dd = Math.max(
      len(add(sub(b[0], mul(b[1], 2)), b[2])),
      len(add(sub(b[1], mul(b[2], 2)), b[3])),
    )
    const n1 = Math.ceil(Math.sqrt((0.75 * dd) / Math.max(1e-6, tol)))
    // Tổng góc đổi hướng, lấy mẫu 5 tiếp tuyến để không bỏ sót khúc uốn chữ S.
    let turn = 0
    let prev = cubicTangent(b, 0)
    for (let k = 1; k <= 4; k++) {
      const cur = cubicTangent(b, k / 4)
      turn += angleBetween(prev, cur)
      prev = cur
    }
    const n2 = Math.ceil(turn / Math.max(1e-6, maxAngle))
    const n = Math.min(400, Math.max(1, n1, n2))
    for (let k = 0; k < n; k++) out.push(k === 0 ? b[0] : cubicPoint(b, k / n))
  }
  return dedupe(out, 1e-6)
}

export interface FitOptions {
  /** Bước lấy mẫu lại, mm (= một điểm ảnh của ảnh làm việc). */
  stepMm: number
  /** Sai số fit người dùng đặt, mm — sàn thật là MIN_TOL_PX điểm ảnh. */
  tolMm: number
  /** Nửa cửa sổ đo góc / ước lượng tiếp tuyến, mm. */
  cornerSpanMm: number
  /** Góc nhỏ nhất coi là góc thật, radian. */
  cornerAngle: number
}

/** Sàn sai số fit, tính bằng điểm ảnh của ảnh làm việc (xem đầu file). */
export const MIN_TOL_PX = 0.65
/** Làm mịn trước khi fit, tính bằng mẫu (= điểm ảnh): xoá răng cưa lưới, giữ chi tiết ≥ 1 mm. */
const SMOOTH_SIGMA = 1.5

/** Sai số fit thật sự dùng, mm. */
function effectiveTolMm(tolMm: number, stepMm: number): number {
  return Math.max(tolMm, MIN_TOL_PX * stepMm)
}

/** Cả chuỗi: đường đồng mức thô → đường cong trơn. */
export function fitRing(raw: Ring, o: FitOptions): Curve {
  const step = Math.max(1e-6, o.stepMm)
  let pts = dedupe(raw, step / 100)
  pts = resampleClosed(pts, step)
  // Cửa sổ đo góc phải rộng hơn bán kính làm mịn, nếu không góc vuông đo ra
  // chỉ còn ~70° vì hai đầu cửa sổ còn nằm trong vùng bị bo.
  const span = Math.max(Math.ceil(SMOOTH_SIGMA * 3) + 2, Math.round(o.cornerSpanMm / step))
  const corners = findCorners(pts, span, o.cornerAngle)
  pts = snapCorners(pts, corners, span, step)
  pts = smoothClosed(pts, SMOOTH_SIGMA, corners)
  return fitClosedCurve(pts, effectiveTolMm(o.tolMm, step), corners, span)
}
