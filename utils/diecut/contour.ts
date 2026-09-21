// Dò đường đồng mức (marching squares) trên trường khoảng cách có dấu.
//
// Vì dò trên trường LIÊN TỤC chứ không phải trên ảnh nhị phân, điểm cắt được nội
// suy tuyến tính trong từng ô lưới: đường ra mượt ở mức dưới một điểm ảnh, không
// bị răng cưa bậc thang như khi đồ theo biên điểm ảnh. Đây là lý do file cắt
// không cần "bo tròn" giả tạo về sau.

export type Point = [number, number]
export type Ring = Point[]

// Bảng 16 trường hợp: mỗi ô lưới cho 0, 1 hoặc 2 đoạn thẳng, ghi theo cạnh
// (0 = cạnh trên, 1 = phải, 2 = dưới, 3 = trái). Hướng đi quy ước sao cho phần
// "ở trong" (giá trị < mức) luôn nằm bên trái đoạn.
const CASES: number[][][] = [
  [], // 0000
  [[3, 0]], // 0001
  [[0, 1]], // 0010
  [[3, 1]], // 0011
  [[1, 2]], // 0100
  [], // 0101 — nhập nhằng, xử lý riêng
  [[0, 2]], // 0110
  [[3, 2]], // 0111
  [[2, 3]], // 1000
  [[2, 0]], // 1001
  [], // 1010 — nhập nhằng, xử lý riêng
  [[2, 1]], // 1011
  [[1, 3]], // 1100
  [[1, 0]], // 1101
  [[0, 3]], // 1110
  [], // 1111
]

/**
 * Trích mọi đường đồng mức khép kín ở mức `level`.
 * Trả về các vòng theo toạ độ điểm ảnh (gốc ở tâm điểm ảnh (0,0)).
 */
export function isoContours(
  field: Float32Array,
  w: number,
  h: number,
  level: number,
): Ring[] {
  const at = (x: number, y: number): number => {
    // Kẹp ra ngoài biên bằng giá trị mép + khoảng cách tới mép: coi như ngoài ảnh
    // toàn là nền, nhờ vậy hình chạm mép ảnh vẫn khép kín được đường cắt.
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y
    const pad = Math.abs(x - cx) + Math.abs(y - cy)
    return field[cy * w + cx] + pad
  }

  // Nội suy điểm cắt trên một cạnh. Tính từ hai đỉnh theo thứ tự cố định nên hai
  // ô chung cạnh luôn ra ĐÚNG một điểm giống nhau — điều kiện để khâu vòng được.
  const lerp = (x0: number, y0: number, x1: number, y1: number): Point => {
    const v0 = at(x0, y0)
    const v1 = at(x1, y1)
    let t = (level - v0) / (v1 - v0)
    if (!Number.isFinite(t)) t = 0.5
    t = t < 0 ? 0 : t > 1 ? 1 : t
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
  }

  const edgePoint = (x: number, y: number, edge: number): Point => {
    switch (edge) {
      case 0:
        return lerp(x, y, x + 1, y) // cạnh trên
      case 1:
        return lerp(x + 1, y, x + 1, y + 1) // cạnh phải
      case 2:
        return lerp(x, y + 1, x + 1, y + 1) // cạnh dưới
      default:
        return lerp(x, y, x, y + 1) // cạnh trái
    }
  }

  const key = (p: Point) => `${Math.round(p[0] * 4096)},${Math.round(p[1] * 4096)}`
  const next = new Map<string, { from: Point; to: Point }[]>()
  const addSegment = (a: Point, b: Point) => {
    const k = key(a)
    const list = next.get(k)
    if (list) list.push({ from: a, to: b })
    else next.set(k, [{ from: a, to: b }])
  }

  // Quét cả vành ngoài ảnh một ô để hình chạm mép vẫn khép vòng.
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const v0 = at(x, y) < level ? 1 : 0
      const v1 = at(x + 1, y) < level ? 2 : 0
      const v2 = at(x + 1, y + 1) < level ? 4 : 0
      const v3 = at(x, y + 1) < level ? 8 : 0
      const idx = v0 | v1 | v2 | v3
      let segs = CASES[idx]
      if (idx === 5 || idx === 10) {
        // Yên ngựa: lấy giá trị tâm ô quyết định nối kiểu nào, tránh nối chéo sai.
        const center = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4
        const centerInside = center < level
        if (idx === 5) segs = centerInside ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]]
        else segs = centerInside ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]]
      }
      for (const [ea, eb] of segs) addSegment(edgePoint(x, y, ea), edgePoint(x, y, eb))
    }
  }

  // Khâu các đoạn thành vòng kín: đi từ một đoạn chưa dùng, mỗi lần nhảy sang
  // đoạn bắt đầu tại điểm vừa kết thúc.
  const used = new Set<{ from: Point; to: Point }>()
  const rings: Ring[] = []
  for (const list of next.values()) {
    for (const seg of list) {
      if (used.has(seg)) continue
      const ring: Ring = [seg.from]
      let cur = seg
      // Giới hạn cứng: dữ liệu hỏng thì thà ra vòng cụt còn hơn treo trình duyệt.
      for (let guard = 0; guard < 4_000_000; guard++) {
        used.add(cur)
        ring.push(cur.to)
        const cands = next.get(key(cur.to))
        const nxt = cands?.find((s) => !used.has(s))
        if (!nxt) break
        cur = nxt
      }
      if (ring.length > 3) rings.push(ring)
    }
  }
  return rings
}

/** Diện tích có dấu (âm/dương theo chiều quay) — dùng để phân biệt vòng ngoài với lỗ. */
export function signedArea(ring: Ring): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return a / 2
}

export function perimeter(ring: Ring): number {
  let p = 0
  for (let i = 1; i < ring.length; i++) {
    p += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1])
  }
  return p
}

export function ringBounds(rings: Ring[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rings) {
    for (const [x, y] of r) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { x0, y0, x1, y1 }
}
