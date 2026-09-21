// Điều phối: từ ảnh + thông số → hình học file cắt tính bằng mm, kèm cảnh báo.
//
// Chia làm HAI bước có nhớ đệm, vì chúng khác nhau về giá:
//   analyze()  — tách nền + trường khoảng cách. Nặng (vài trăm ms), chỉ chạy lại
//                khi đổi cách tách nền hoặc đổi ảnh.
//   geometry() — dò đường ở mức viền. Nhẹ, chạy lại mỗi lần kéo thanh "viền cắt"
//                nên kéo tới đâu thấy tới đó.

import { buildMask, thinPartCheck, type MaskMode } from './mask'
import { signedDistanceField } from './edt'
import { isoContours, signedArea, perimeter, ringBounds, type Ring } from './contour'
import { chaikin, simplifyRing, dedupe } from './simplify'

export interface DiecutSettings {
  mode: MaskMode
  alphaThreshold: number
  floodTolerance: number
  /** Bề ngang phần HÌNH (chưa tính viền cắt), mm. */
  artworkWidthMm: number
  /** Viền cắt cộng ra ngoài hình, mm. 0 = cắt sát mép hình. */
  offsetMm: number
  /** Sai số cho phép khi làm gọn đường cắt, mm. */
  simplifyMm: number
  /** Bỏ mảnh vụn nhỏ hơn, mm². */
  despeckleMm2: number
  /** Lấp lỗ kín nhỏ hơn, mm². */
  fillHolesMm2: number
  /** Cảnh báo khi có chỗ mảnh hơn, mm. */
  thinWarnMm: number
  hole: {
    enabled: boolean
    diameterMm: number
    /** Vật liệu còn lại từ mép cắt tới mép lỗ, mm. */
    marginMm: number
    /** Vị trí ngang trong khung cắt, 0 = trái, 1 = phải. */
    xRatio: number
  }
  bleedMm: number
  printDpi: number
}

export const DEFAULT_SETTINGS: DiecutSettings = {
  mode: 'alpha',
  alphaThreshold: 16,
  floodTolerance: 28,
  artworkWidthMm: 100,
  offsetMm: 3,
  simplifyMm: 0.08,
  despeckleMm2: 1,
  fillHolesMm2: 3,
  thinWarnMm: 2,
  hole: { enabled: false, diameterMm: 3, marginMm: 3, xRatio: 0.5 },
  bleedMm: 0,
  printDpi: 300,
}

export interface Analysis {
  mask: Uint8Array
  sdf: Float32Array
  width: number
  height: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  removedSpecks: number
  filledHoles: number
  /** Tỷ lệ ảnh làm việc so với ảnh gốc (≤ 1). */
  workScale: number
}

export interface DiecutGeometry {
  /** Đường cắt, mm, gốc (0,0) ở góc trên-trái khung cắt, Y hướng xuống. */
  rings: Ring[]
  widthMm: number
  heightMm: number
  /** Vị trí phần hình trong khung cắt, mm. */
  artwork: { xMm: number; yMm: number; widthMm: number; heightMm: number }
  hole: { cxMm: number; cyMm: number; rMm: number; clearanceMm: number } | null
  stats: {
    dpi: number
    perimeterMm: number
    ringCount: number
    droppedRings: number
    removedSpecks: number
    filledHoles: number
    pointCount: number
  }
  warnings: string[]
  notes: string[]
}

/** Cạnh dài tối đa của ảnh làm việc. Đủ mịn cho đường cắt, đủ nhẹ để kéo mượt. */
export const WORK_MAX_EDGE = 1600

export function analyze(img: ImageData, settings: DiecutSettings, workScale: number): Analysis | null {
  const mmPerPxGuess = settings.artworkWidthMm / Math.max(1, img.width)
  const minSpeckPx = Math.round(settings.despeckleMm2 / (mmPerPxGuess * mmPerPxGuess))
  const minHolePx = Math.round(settings.fillHolesMm2 / (mmPerPxGuess * mmPerPxGuess))
  const res = buildMask(
    img,
    {
      mode: settings.mode,
      alphaThreshold: settings.alphaThreshold,
      floodTolerance: settings.floodTolerance,
    },
    minSpeckPx,
    minHolePx,
  )
  if (!res.bbox) return null
  return {
    mask: res.mask,
    sdf: signedDistanceField(res.mask, img.width, img.height),
    width: img.width,
    height: img.height,
    bbox: res.bbox,
    removedSpecks: res.removedSpecks,
    filledHoles: res.filledHoles,
    workScale,
  }
}

export function buildGeometry(a: Analysis, s: DiecutSettings): DiecutGeometry | null {
  const bboxW = a.bbox.x1 - a.bbox.x0 + 1
  const bboxH = a.bbox.y1 - a.bbox.y0 + 1
  const mmPerPx = s.artworkWidthMm / bboxW
  // Trường đã quy về khoảng cách thật tới mép (xem signedDistanceField), nên mức
  // đồng mức chính là viền cắt — âm thì cắt lẹm vào trong hình.
  const level = s.offsetMm / mmPerPx

  const raw = isoContours(a.sdf, a.width, a.height, level)
  if (!raw.length) return null

  // Đổi sang mm, gốc đặt tạm ở mép ngoài khung bao phần hình (nên phần hình
  // chiếm đúng 0 … artworkWidthMm).
  const toMm = (r: Ring): Ring =>
    r.map(
      ([x, y]) =>
        [(x - a.bbox.x0 + 0.5) * mmPerPx, (y - a.bbox.y0 + 0.5) * mmPerPx] as [number, number],
    )

  const minRingMm2 = Math.max(s.despeckleMm2, s.fillHolesMm2)
  let dropped = 0
  const rings: Ring[] = []
  for (const r of raw) {
    let ring = toMm(r)
    if (Math.abs(signedArea(ring)) < minRingMm2) {
      dropped++
      continue
    }
    // Mượt trước, gọn sau: Chaikin xoá răng cưa mức điểm ảnh, rồi Douglas–Peucker
    // bỏ điểm thừa trong sai số mm đã đặt.
    ring = chaikin(ring, 1)
    ring = simplifyRing(ring, s.simplifyMm)
    ring = dedupe(ring, s.simplifyMm / 4)
    if (ring.length >= 3) rings.push(ring)
    else dropped++
  }
  if (!rings.length) return null

  // Dời gốc về góc trên-trái của khung CẮT (file in và file cắt dùng chung gốc
  // này, nên chồng hai file lên nhau là khớp tuyệt đối).
  const b = ringBounds(rings)
  const shifted = rings.map((r) => r.map(([x, y]) => [x - b.x0, y - b.y0] as [number, number]))
  const widthMm = b.x1 - b.x0
  const heightMm = b.y1 - b.y0
  const artwork = {
    xMm: -b.x0,
    yMm: -b.y0,
    widthMm: s.artworkWidthMm,
    heightMm: bboxH * mmPerPx,
  }

  const warnings: string[] = []
  const notes: string[] = []

  // Lỗ treo: đặt theo tỷ lệ ngang, cách mép trên của đường cắt một khoảng vật liệu.
  let hole: DiecutGeometry['hole'] = null
  if (s.hole.enabled) {
    const r = s.hole.diameterMm / 2
    const cx = Math.min(Math.max(s.hole.xRatio, 0), 1) * widthMm
    // Mép trên của đường cắt tại đúng cột x đó, không phải mép trên cả khung —
    // hình vai xuôi thì lỗ vẫn nằm trong vật liệu.
    const topAt = topEdgeAt(shifted, cx)
    const cy = (topAt ?? 0) + s.hole.marginMm + r

    // Khoảng hở THẬT từ mép lỗ tới mép cắt, đo bằng trường khoảng cách chứ không
    // lấy theo con số người dùng gõ: ở chỗ hình vát nhọn, "cách mép trên 3 mm"
    // vẫn có thể chỉ còn 1 mm vật liệu ở hai bên.
    const px = (cx + b.x0) / mmPerPx + a.bbox.x0 - 0.5
    const py = (cy + b.y0) / mmPerPx + a.bbox.y0 - 0.5
    const sdfAt = sampleField(a.sdf, a.width, a.height, px, py)
    const clearanceMm = (level - sdfAt) * mmPerPx - r
    hole = { cxMm: cx, cyMm: cy, rMm: r, clearanceMm }
    if (clearanceMm < 1.5) {
      warnings.push(
        `Lỗ treo chỉ còn ${clearanceMm.toFixed(1)} mm vật liệu tới mép cắt — treo lên dễ bục. Hạ lỗ xuống, thu nhỏ đường kính hoặc tăng viền cắt.`,
      )
    }
  }

  // Độ nét: DPI thật của ảnh gốc ở khổ đang đặt.
  const srcArtworkPx = bboxW / (a.workScale || 1)
  const dpi = (srcArtworkPx / s.artworkWidthMm) * 25.4
  if (dpi < 150) {
    warnings.push(
      `Ảnh chỉ đạt ${Math.round(dpi)} DPI ở khổ ${s.artworkWidthMm} mm — in ra sẽ vỡ nét. Cần ảnh lớn hơn hoặc giảm kích thước.`,
    )
  } else if (dpi < 250) {
    notes.push(`Độ nét ${Math.round(dpi)} DPI — chấp nhận được, chuẩn in là 300 DPI.`)
  }

  // Chỗ mảnh dễ gãy.
  const thin = thinPartCheck(a.sdf, a.width, a.height, s.thinWarnMm / 2 / mmPerPx)
  if (thin.partsAfter > thin.partsBefore) {
    warnings.push(
      `Có chỗ thắt mảnh hơn ${s.thinWarnMm} mm — cắt xong dễ đứt rời. Tăng viền cắt hoặc sửa hình chỗ đó.`,
    )
  } else if (thin.partsAfter < thin.partsBefore) {
    warnings.push(
      `Có chi tiết mỏng hơn ${s.thinWarnMm} mm sẽ gãy khi cắt. Bỏ chi tiết đó hoặc phóng to sản phẩm.`,
    )
  }

  if (a.removedSpecks) notes.push(`Đã bỏ ${a.removedSpecks} mảnh vụn nhỏ hơn ${s.despeckleMm2} mm².`)
  if (a.filledHoles) notes.push(`Đã lấp ${a.filledHoles} lỗ kín nhỏ hơn ${s.fillHolesMm2} mm².`)
  if (dropped) notes.push(`Đã bỏ ${dropped} đường cắt vụn.`)

  return {
    rings: shifted,
    widthMm,
    heightMm,
    artwork,
    hole,
    stats: {
      dpi,
      perimeterMm: shifted.reduce((sum, r) => sum + perimeter(r), 0),
      ringCount: shifted.length,
      droppedRings: dropped,
      removedSpecks: a.removedSpecks,
      filledHoles: a.filledHoles,
      pointCount: shifted.reduce((sum, r) => sum + r.length, 0),
    },
    warnings,
    notes,
  }
}

/** Y nhỏ nhất của đường cắt tại cột x (mm) — mép trên thật, theo dáng hình. */
export function topEdgeAt(rings: Ring[], x: number): number | null {
  let best: number | null = null
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i]
      const [x1, y1] = ring[(i + 1) % ring.length]
      if ((x0 - x) * (x1 - x) > 0) continue // đoạn không bắc qua cột x
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0)
      const y = y0 + (y1 - y0) * t
      if (best === null || y < best) best = y
    }
  }
  return best
}

/** Nội suy song tuyến tính trường khoảng cách tại toạ độ lẻ. */
function sampleField(field: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(Math.max(x, 0), w - 1.001)
  const cy = Math.min(Math.max(y, 0), h - 1.001)
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const fx = cx - x0
  const fy = cy - y0
  const v00 = field[y0 * w + x0]
  const v10 = field[y0 * w + x0 + 1]
  const v01 = field[(y0 + 1) * w + x0]
  const v11 = field[(y0 + 1) * w + x0 + 1]
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
}
