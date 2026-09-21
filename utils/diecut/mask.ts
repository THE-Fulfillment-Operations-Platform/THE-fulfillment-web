// Tách "phần hình" ra khỏi nền — bước đầu và cũng là bước dễ sai nhất của công
// cụ die-cut: đường cắt chỉ đúng khi mặt nạ đúng.
//
// Hai chế độ, tương ứng hai kiểu file designer thực sự đưa lên:
//   • alpha  — PNG/PDF/AI đã trong suốt: lấy thẳng kênh alpha. Chính xác nhất.
//   • flood  — ảnh nền trắng/1 màu phẳng: loang từ 4 mép vào. Loang từ MÉP chứ
//              không phải "xoá mọi điểm ảnh trắng", nên mảng trắng nằm lọt trong
//              hình (mắt, răng, tuyết) vẫn được giữ lại như một phần sản phẩm.

export type MaskMode = 'alpha' | 'flood'

export interface MaskOptions {
  mode: MaskMode
  /** alpha: ngưỡng coi là đặc (0–255). */
  alphaThreshold: number
  /** flood: dung sai màu nền (0–160), khoảng cách màu tối đa so với màu mép. */
  floodTolerance: number
}

export interface MaskResult {
  mask: Uint8Array
  /** Số mảnh vụn đã bỏ và số lỗ kín nhỏ đã lấp — để báo lại cho người dùng. */
  removedSpecks: number
  filledHoles: number
  /** Khung bao khít của phần hình, theo điểm ảnh của ảnh làm việc. */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null
}

/** Mặt nạ thô từ kênh alpha. */
function maskFromAlpha(data: Uint8ClampedArray, n: number, threshold: number): Uint8Array {
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] >= threshold ? 1 : 0
  return mask
}

/**
 * Mặt nạ bằng cách loang nền từ 4 mép. Màu nền lấy theo màu hay gặp nhất trên
 * viền ảnh (trung vị thô), nên ảnh nền kem/xám nhạt vẫn chạy, không chỉ nền trắng.
 */
function maskFromFlood(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number,
  alphaThreshold: number,
): Uint8Array {
  const n = w * h
  // Màu nền = trung bình các điểm ở viền, bỏ qua điểm trong suốt.
  let sr = 0
  let sg = 0
  let sb = 0
  let cnt = 0
  const sampleEdge = (i: number) => {
    if (data[i * 4 + 3] < alphaThreshold) return
    sr += data[i * 4]
    sg += data[i * 4 + 1]
    sb += data[i * 4 + 2]
    cnt++
  }
  for (let x = 0; x < w; x++) {
    sampleEdge(x)
    sampleEdge((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    sampleEdge(y * w)
    sampleEdge(y * w + w - 1)
  }
  const br = cnt ? sr / cnt : 255
  const bg = cnt ? sg / cnt : 255
  const bb = cnt ? sb / cnt : 255
  const tol2 = tolerance * tolerance * 3 // so sánh theo tổng bình phương 3 kênh

  const isBg = (i: number) => {
    if (data[i * 4 + 3] < alphaThreshold) return true // trong suốt cũng là nền
    const dr = data[i * 4] - br
    const dg = data[i * 4 + 1] - bg
    const db = data[i * 4 + 2] - bb
    return dr * dr + dg * dg + db * db <= tol2
  }

  const bgFlag = new Uint8Array(n)
  const stack = new Int32Array(n)
  let sp = 0
  const push = (i: number) => {
    if (!bgFlag[i] && isBg(i)) {
      bgFlag[i] = 1
      stack[sp++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (sp > 0) {
    const i = stack[--sp]
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }

  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = bgFlag[i] ? 0 : 1
  return mask
}

/**
 * Gán nhãn các vùng liên thông của `value` và trả về kích thước từng vùng.
 * 8-liên-thông cho phần hình, 4-liên-thông cho nền — cặp bù nhau chuẩn trong xử
 * lý ảnh nhị phân, tránh nghịch lý "hai đường chéo vừa cắt nhau vừa không".
 */
export function labelComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  value: 0 | 1,
  diagonal: boolean,
): { labels: Int32Array; sizes: number[]; touchesBorder: boolean[] } {
  const n = w * h
  const labels = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  const touchesBorder: boolean[] = []
  const stack = new Int32Array(n)

  for (let start = 0; start < n; start++) {
    if (mask[start] !== value || labels[start] !== -1) continue
    const id = sizes.length
    let size = 0
    let border = false
    let sp = 0
    labels[start] = id
    stack[sp++] = start
    while (sp > 0) {
      const i = stack[--sp]
      size++
      const x = i % w
      const y = (i / w) | 0
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (!diagonal && dx !== 0 && dy !== 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (mask[j] === value && labels[j] === -1) {
            labels[j] = id
            stack[sp++] = j
          }
        }
      }
    }
    sizes.push(size)
    touchesBorder.push(border)
  }
  return { labels, sizes, touchesBorder }
}

/**
 * Dựng mặt nạ đã làm sạch.
 *
 * `minSpeckPx` bỏ mảnh vụn (bụi scan, chữ ký mờ, viền JPEG) — thứ mà máy cắt sẽ
 * ngoan ngoãn cắt thành rác nếu không ai dọn. `minHolePx` lấp các lỗ kín tí hon:
 * bài học từ bộ hộp đèn Noel — khe giữa hai tán cây vô tình khép lại thành lỗ
 * 3 mm², laser cắt ra chỉ là một vết cháy.
 */
export function buildMask(
  img: ImageData,
  opts: MaskOptions,
  minSpeckPx: number,
  minHolePx: number,
): MaskResult {
  const { width: w, height: h, data } = img
  const n = w * h
  const mask =
    opts.mode === 'alpha'
      ? maskFromAlpha(data, n, opts.alphaThreshold)
      : maskFromFlood(data, w, h, opts.floodTolerance, opts.alphaThreshold)

  let removedSpecks = 0
  if (minSpeckPx > 0) {
    const { labels, sizes } = labelComponents(mask, w, h, 1, true)
    const drop = sizes.map((s) => s < minSpeckPx)
    for (let i = 0; i < n; i++) {
      const l = labels[i]
      if (l >= 0 && drop[l]) mask[i] = 0
    }
    removedSpecks = drop.filter(Boolean).length
  }

  let filledHoles = 0
  if (minHolePx > 0) {
    // Lỗ = vùng nền KHÔNG chạm mép ảnh. Vùng nền chạm mép là nền thật, giữ nguyên.
    const { labels, sizes, touchesBorder } = labelComponents(mask, w, h, 0, false)
    const fill = sizes.map((s, i) => !touchesBorder[i] && s < minHolePx)
    for (let i = 0; i < n; i++) {
      const l = labels[i]
      if (l >= 0 && fill[l]) mask[i] = 1
    }
    filledHoles = fill.filter(Boolean).length
  }

  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return {
    mask,
    removedSpecks,
    filledHoles,
    bbox: x1 >= x0 && y1 >= y0 ? { x0, y0, x1, y1 } : null,
  }
}

/**
 * Dò chỗ mảnh dễ gãy. Cách đo: "gọt" hình vào `erodePx` mỗi bên rồi đếm lại số
 * mảnh rời. Gọt nửa bề dày tối thiểu mà hình vỡ ra nhiều mảnh hơn nghĩa là có cổ
 * thắt sẽ đứt; mảnh biến mất nghĩa là có chi tiết mỏng hơn ngưỡng, cắt ra sẽ gãy.
 *
 * Đây là phép ĐO trên hình thật, không phải ước lượng bằng mắt — cùng một ý với
 * cổng tự kiểm của mấy bộ DXF đã gửi xưởng.
 */
export function thinPartCheck(
  sdf: Float32Array,
  w: number,
  h: number,
  erodePx: number,
): { partsBefore: number; partsAfter: number; areaRatio: number } {
  const full = new Uint8Array(w * h)
  const eroded = new Uint8Array(w * h)
  let fullArea = 0
  let erodedArea = 0
  for (let i = 0; i < w * h; i++) {
    if (sdf[i] < 0) {
      full[i] = 1
      fullArea++
    }
    if (sdf[i] < -erodePx) {
      eroded[i] = 1
      erodedArea++
    }
  }
  // Chỉ đếm mảnh đủ lớn, nếu không thì mỗi hạt nhiễu 1 điểm ảnh cũng thành "mảnh".
  const minPx = Math.max(4, Math.round(erodePx * erodePx))
  const before = labelComponents(full, w, h, 1, true).sizes.filter((s) => s >= minPx).length
  const after = labelComponents(eroded, w, h, 1, true).sizes.filter((s) => s >= minPx).length
  return {
    partsBefore: before,
    partsAfter: after,
    areaRatio: fullArea ? erodedArea / fullArea : 0,
  }
}
