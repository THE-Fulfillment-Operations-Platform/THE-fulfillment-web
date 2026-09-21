// Điều phối: từ ảnh + thông số → hình học file cắt tính bằng mm, kèm cảnh báo.
//
// Chia làm HAI bước có nhớ đệm, vì chúng khác nhau về giá:
//   analyze()  — tách nền + trường khoảng cách. Nặng (vài trăm ms), chỉ chạy lại
//                khi đổi cách tách nền hoặc đổi ảnh.
//   geometry() — dò đường ở mức viền. Nhẹ, chạy lại mỗi lần kéo thanh "viền cắt"
//                nên kéo tới đâu thấy tới đó.

import { buildMask, padImage, thinPartCheck, type MaskMode } from './mask'
import { signedDistanceField } from './edt'
import { isoContours, signedArea, perimeter, ringBounds, type Ring } from './contour'
import { chaikin, simplifyRing, dedupe } from './simplify'

export interface HoleSpec {
  /** 0 = mép trái khung cắt, 1 = mép phải. */
  xRatio: number
  /** 0 = mép trên khung cắt, 1 = mép dưới. */
  yRatio: number
}

export interface DiecutSettings {
  mode: MaskMode
  alphaThreshold: number
  floodTolerance: number
  /** Bề ngang phần HÌNH (chưa tính viền cắt), mm. */
  artworkWidthMm: number
  /**
   * Chiều cao phần HÌNH, mm. Khoá tỷ lệ thì số này đi theo bề ngang; bỏ khoá thì
   * gõ tự do và hình bị kéo giãn — công cụ sẽ nói rõ kéo bao nhiêu phần trăm.
   */
  artworkHeightMm: number
  lockAspect: boolean
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
  /**
   * Các lỗ khoan. Toạ độ ghi theo TỶ LỆ khung cắt (0–1) chứ không theo mm: đổi
   * kích thước sản phẩm hay đổi viền cắt thì lỗ vẫn nằm đúng chỗ tương đối,
   * không văng ra ngoài.
   */
  holes: HoleSpec[]
  /** Đường kính dùng chung cho mọi lỗ, mm. */
  holeDiameterMm: number
  /** Vật liệu chừa lại từ mép cắt tới mép lỗ khi đặt lỗ treo trên đỉnh, mm. */
  holeMarginMm: number
  bleedMm: number
  printDpi: number
}

export const DEFAULT_SETTINGS: DiecutSettings = {
  mode: 'alpha',
  alphaThreshold: 16,
  floodTolerance: 28,
  artworkWidthMm: 100,
  artworkHeightMm: 100,
  lockAspect: true,
  offsetMm: 5,
  simplifyMm: 0.08,
  despeckleMm2: 1,
  fillHolesMm2: 3,
  thinWarnMm: 2,
  holes: [],
  holeDiameterMm: 3,
  holeMarginMm: 3,
  bleedMm: 0,
  printDpi: 300,
}

export interface Analysis {
  mask: Uint8Array
  sdf: Float32Array
  /** Khổ ảnh ĐÃ chèn lề. */
  width: number
  height: number
  /** Lề trống đã chèn mỗi bên, tính bằng điểm ảnh của ảnh làm việc. */
  pad: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  removedSpecks: number
  filledHoles: number
  /**
   * Tỷ lệ ảnh làm việc so với ảnh gốc, tách riêng hai trục: khi người dùng bỏ
   * khoá tỷ lệ, ảnh làm việc được kéo trước cho vuông milimét, nhờ vậy mọi phép
   * đo phía sau vẫn đẳng hướng — viền 5 mm là 5 mm ở cả bốn phía.
   */
  scaleX: number
  scaleY: number
}

export interface DiecutGeometry {
  /** Đường cắt, mm, gốc (0,0) ở góc trên-trái khung cắt, Y hướng xuống. */
  rings: Ring[]
  widthMm: number
  heightMm: number
  /** Vị trí phần hình trong khung cắt, mm. */
  artwork: { xMm: number; yMm: number; widthMm: number; heightMm: number }
  holes: { cxMm: number; cyMm: number; rMm: number; clearanceMm: number }[]
  stats: {
    dpi: number
    perimeterMm: number
    ringCount: number
    droppedRings: number
    removedSpecks: number
    filledHoles: number
    pointCount: number
    /** Lệch bao nhiêu phần trăm so với tỷ lệ gốc của ảnh (dương = kéo cao). */
    stretchPct: number
  }
  warnings: string[]
  notes: string[]
}

/** Cạnh dài tối đa của ảnh làm việc. Đủ mịn cho đường cắt, đủ nhẹ để kéo mượt. */
export const WORK_MAX_EDGE = 1600

/**
 * Lề trống cần chèn quanh ảnh để đường cắt có chỗ vòng ra ngoài. Cộng dư 10 mm
 * so với viền đang đặt: kéo thanh viền trong khoảng đó thì không phải tách nền
 * lại, mà vẫn đủ chỗ cho đường cắt.
 */
export function requiredPadPx(s: DiecutSettings, imgWidth: number): number {
  const pxPerMm = Math.max(1, imgWidth) / Math.max(1, s.artworkWidthMm)
  const pad = Math.ceil((Math.abs(s.offsetMm) + 10) * pxPerMm) + 8
  // Chặn trên: ảnh lề quá dày chỉ tốn bộ nhớ chứ không thêm gì.
  return Math.min(pad, Math.round(imgWidth))
}

export function analyze(
  img: ImageData,
  settings: DiecutSettings,
  scaleX: number,
  scaleY: number,
): Analysis | null {
  // Ngưỡng vụn/lỗ tính theo ảnh GỐC (chưa chèn lề), nếu không thì thêm lề là
  // đổi luôn ý nghĩa của mấy con số mm² người dùng đặt.
  const mmPerPxGuess = settings.artworkWidthMm / Math.max(1, img.width)
  const minSpeckPx = Math.round(settings.despeckleMm2 / (mmPerPxGuess * mmPerPxGuess))
  const minHolePx = Math.round(settings.fillHolesMm2 / (mmPerPxGuess * mmPerPxGuess))
  const pad = requiredPadPx(settings, img.width)
  const padded = padImage(img, pad)
  const res = buildMask(
    padded,
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
    sdf: signedDistanceField(res.mask, padded.width, padded.height),
    width: padded.width,
    height: padded.height,
    pad,
    bbox: res.bbox,
    removedSpecks: res.removedSpecks,
    filledHoles: res.filledHoles,
    scaleX,
    scaleY,
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

  // Lỗ khoan: toạ độ tỷ lệ → mm, rồi ĐO khoảng hở thật tới mép cắt bằng trường
  // khoảng cách. Không tin con số người dùng gõ: chỗ hình vát nhọn, lỗ "cách mép
  // trên 3 mm" vẫn có thể chỉ còn 1 mm vật liệu ở hai bên.
  const r = s.holeDiameterMm / 2
  const holes = s.holes.map((h) => {
    const cx = Math.min(Math.max(h.xRatio, 0), 1) * widthMm
    const cy = Math.min(Math.max(h.yRatio, 0), 1) * heightMm
    const px = (cx + b.x0) / mmPerPx + a.bbox.x0 - 0.5
    const py = (cy + b.y0) / mmPerPx + a.bbox.y0 - 0.5
    const sdfAt = sampleField(a.sdf, a.width, a.height, px, py)
    return { cxMm: cx, cyMm: cy, rMm: r, clearanceMm: (level - sdfAt) * mmPerPx - r }
  })
  const tight = holes
    .map((h, i) => ({ i, c: h.clearanceMm }))
    .filter((h) => h.c < 1.5)
    .sort((x, y) => x.c - y.c)
  if (tight.length) {
    const worst = tight[0]
    warnings.push(
      tight.length === 1
        ? `Lỗ ${worst.i + 1} chỉ còn ${worst.c.toFixed(1)} mm vật liệu tới mép cắt — dễ bục. Dời lỗ vào trong, thu nhỏ đường kính hoặc tăng viền cắt.`
        : `${tight.length} lỗ nằm quá sát mép cắt (ít nhất là lỗ ${worst.i + 1}, còn ${worst.c.toFixed(1)} mm) — dễ bục khi treo hoặc bắt vít.`,
    )
  }

  // Độ nét: DPI thật của ảnh gốc ở khổ đang đặt, lấy trục xấu hơn.
  const srcPxX = bboxW / (a.scaleX || 1)
  const srcPxY = bboxH / (a.scaleY || 1)
  const dpi = Math.min(srcPxX / s.artworkWidthMm, srcPxY / Math.max(0.001, artwork.heightMm)) * 25.4

  // Kéo giãn: tỷ lệ gốc suy ngược từ số điểm ảnh của ảnh GỐC (điểm ảnh gốc luôn
  // vuông), so với tỷ lệ khổ đang đặt.
  const naturalRatio = srcPxY / Math.max(0.001, srcPxX)
  const targetRatio = artwork.heightMm / Math.max(0.001, artwork.widthMm)
  const stretchPct = (targetRatio / Math.max(0.001, naturalRatio) - 1) * 100
  if (Math.abs(stretchPct) >= 1) {
    warnings.push(
      `Hình bị kéo ${stretchPct > 0 ? 'cao' : 'bẹt'} ${Math.abs(stretchPct).toFixed(1)}% so với tỷ lệ gốc — chữ và hoạ tiết tròn sẽ méo. Bật khoá tỷ lệ nếu không cố ý.`,
    )
  }
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
    holes,
    stats: {
      dpi,
      perimeterMm: shifted.reduce((sum, r) => sum + perimeter(r), 0),
      ringCount: shifted.length,
      droppedRings: dropped,
      removedSpecks: a.removedSpecks,
      filledHoles: a.filledHoles,
      pointCount: shifted.reduce((sum, r) => sum + r.length, 0),
      stretchPct,
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
