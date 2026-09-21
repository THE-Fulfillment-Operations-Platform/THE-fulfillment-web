// Dựng file in và ảnh xem trước.
//
// Nguyên tắc xuyên suốt: file in và file cắt dùng CHUNG một gốc toạ độ và chung
// khổ (khung cắt). Chồng hai file lên nhau là khớp — xưởng không phải căn tay,
// và lỗi "in lệch so với đường cắt" biến mất ngay từ khâu sinh file.

import type { Analysis, DiecutGeometry, DiecutSettings } from './pipeline'

/** Mặt nạ (độ phân giải làm việc) dựng thành canvas để cắt nền ảnh in. */
function maskCanvas(a: Analysis): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = a.width
  c.height = a.height
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(a.width, a.height)
  for (let i = 0; i < a.width * a.height; i++) {
    const on = a.mask[i] ? 255 : 0
    img.data[i * 4] = 0
    img.data[i * 4 + 1] = 0
    img.data[i * 4 + 2] = 0
    img.data[i * 4 + 3] = on
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * File in: phần hình đã tách nền, đặt đúng vị trí trong khung cắt, ở DPI đã chọn.
 * Nền để trong suốt — máy in UV/RIP cần biết chỗ nào không có mực, chứ không phải
 * một mảng trắng in đè lên vân gỗ.
 */
export function renderPrintCanvas(
  source: HTMLCanvasElement,
  a: Analysis,
  g: DiecutGeometry,
  s: DiecutSettings,
): HTMLCanvasElement {
  const pxPerMm = s.printDpi / 25.4
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(g.widthMm * pxPerMm))
  out.height = Math.max(1, Math.round(g.heightMm * pxPerMm))
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'

  // Vùng phần hình trên ảnh GỐC: mặt nạ tính ở ảnh thu nhỏ (và có thể đã kéo một
  // trục) nên quy đổi riêng từng trục, sau khi trừ lề trống chèn lúc phân tích.
  const kx = a.scaleX || 1
  const ky = a.scaleY || 1
  const sx = (a.bbox.x0 - a.pad - 0.5) / kx
  const sy = (a.bbox.y0 - a.pad - 0.5) / ky
  const sw = (a.bbox.x1 - a.bbox.x0 + 1) / kx
  const sh = (a.bbox.y1 - a.bbox.y0 + 1) / ky

  const dx = g.artwork.xMm * pxPerMm
  const dy = g.artwork.yMm * pxPerMm
  const dw = g.artwork.widthMm * pxPerMm
  const dh = g.artwork.heightMm * pxPerMm

  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)

  // Cắt theo mặt nạ đã dọn: bỏ nền, bỏ luôn mảnh vụn đã loại ở bước dò biên, để
  // thứ in ra đúng bằng thứ được cắt.
  const mc = maskCanvas(a)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mc, a.bbox.x0 - 0.5, a.bbox.y0 - 0.5, a.bbox.x1 - a.bbox.x0 + 1, a.bbox.y1 - a.bbox.y0 + 1, dx, dy, dw, dh)
  ctx.globalCompositeOperation = 'source-over'

  if (s.bleedMm > 0) {
    // Tràn lề: kéo màu mép ra ngoài để nếu máy cắt lệch vài phần mười mm thì vẫn
    // là màu sản phẩm, không hở nền. Vẽ các bản sao dịch ra xung quanh và chèn
    // XUỐNG DƯỚI ảnh gốc, nên phần hình chính không bị nhoè.
    const bleedPx = s.bleedMm * pxPerMm
    const copy = document.createElement('canvas')
    copy.width = out.width
    copy.height = out.height
    copy.getContext('2d')!.drawImage(out, 0, 0)
    ctx.globalCompositeOperation = 'destination-over'
    const rings = Math.max(1, Math.ceil(bleedPx / 2))
    for (let r = 1; r <= rings; r++) {
      const dist = (bleedPx * r) / rings
      for (let i = 0; i < 16; i++) {
        const ang = (Math.PI * 2 * i) / 16
        ctx.drawImage(copy, Math.cos(ang) * dist, Math.sin(ang) * dist)
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  return out
}

export interface PreviewOptions {
  /** Vẽ ô ca-rô nền (màn hình) hay nền trắng (file xuất). */
  checkerboard: boolean
  showCut: boolean
  showPrint: boolean
  caption?: string
  /** Lề trống quanh khổ cắt, mm. Không có lề thì đường cắt nằm đúng trên mép
   *  khung và bị viền khung che mất một nửa nét. */
  marginMm?: number
}

/** Lề xem trước mặc định: đủ để nhìn rõ đường cắt ở mọi khổ. */
export function previewMarginMm(g: DiecutGeometry): number {
  return Math.max(2, Math.min(12, Math.max(g.widthMm, g.heightMm) * 0.04))
}

/**
 * Vẽ bản xem trước: file in + đường cắt chồng lên nhau. Dùng chung cho màn hình
 * và cho ảnh PNG trong gói giao xưởng — một hàm, nên thứ nhìn thấy trên máy đúng
 * bằng thứ nằm trong file.
 */
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  print: HTMLCanvasElement | null,
  g: DiecutGeometry,
  pxPerMm: number,
  opts: PreviewOptions,
): void {
  const w = g.widthMm * pxPerMm
  const h = g.heightMm * pxPerMm
  const margin = (opts.marginMm ?? 0) * pxPerMm
  const totalW = w + margin * 2
  const totalH = h + margin * 2

  if (opts.checkerboard) {
    const cell = 8
    for (let y = 0; y < totalH; y += cell) {
      for (let x = 0; x < totalW; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) | 0) % 2 ? '#e9eaee' : '#fafbfc'
        ctx.fillRect(x, y, cell, cell)
      }
    }
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, totalW, totalH)
  }

  ctx.save()
  ctx.translate(margin, margin)

  if (opts.showPrint && print) ctx.drawImage(print, 0, 0, w, h)

  if (opts.showCut) {
    ctx.lineWidth = Math.max(1, pxPerMm * 0.25)
    ctx.strokeStyle = '#e11d48'
    for (const ring of g.rings) {
      ctx.beginPath()
      ring.forEach(([x, y], i) => {
        const px = x * pxPerMm
        const py = y * pxPerMm
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.stroke()
    }
    // Lỗ khoan: đỏ cảnh báo khi còn quá ít vật liệu tới mép cắt, xanh khi ổn —
    // nhìn phát biết lỗ nào phải dời, không phải đọc chữ.
    for (const h of g.holes) {
      ctx.strokeStyle = h.clearanceMm < 1.5 ? '#f59e0b' : '#2563eb'
      ctx.beginPath()
      ctx.arc(h.cxMm * pxPerMm, h.cyMm * pxPerMm, h.rMm * pxPerMm, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.restore()

  if (opts.caption) {
    const pad = Math.max(6, pxPerMm * 2)
    ctx.font = `${Math.max(11, Math.round(pxPerMm * 3.2))}px ui-sans-serif, system-ui, sans-serif`
    const metrics = ctx.measureText(opts.caption)
    const boxH = Math.max(16, pxPerMm * 5)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
    ctx.fillRect(pad / 2, totalH - boxH - pad / 2, metrics.width + pad, boxH)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(opts.caption, pad, totalH - boxH / 2 - pad / 2)
  }
}

/** Ảnh xem trước để kèm trong gói file — mắt người soi, không phải máy đọc. */
export function renderPreviewCanvas(
  print: HTMLCanvasElement | null,
  g: DiecutGeometry,
  caption: string,
  maxEdge = 1600,
): HTMLCanvasElement {
  const marginMm = previewMarginMm(g)
  const pxPerMm = Math.min(8, maxEdge / (Math.max(g.widthMm, g.heightMm) + marginMm * 2))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round((g.widthMm + marginMm * 2) * pxPerMm))
  c.height = Math.max(1, Math.round((g.heightMm + marginMm * 2) * pxPerMm))
  const ctx = c.getContext('2d')!
  drawPreview(ctx, print, g, pxPerMm, {
    checkerboard: false,
    showCut: true,
    showPrint: true,
    caption,
    marginMm,
  })
  return c
}

export function canvasToBytes(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Không dựng được ảnh từ canvas'))
        return
      }
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
    }, type)
  })
}
