// Đọc file designer đưa lên thành một khung ảnh để dò biên.
//
// Ba đường vào, đúng ba thứ designer thực sự có trong tay:
//   • PNG/JPG/WEBP — ảnh bitmap, đọc thẳng.
//   • PDF          — dựng trang 1 ở độ phân giải in.
//   • AI           — file Illustrator lưu kèm PDF (mặc định của Illustrator) nên
//                    đọc được bằng chính bộ dựng PDF. File AI thuần PostScript
//                    cũ thì chịu, và phải nói thẳng ra chứ không đoán bừa.
//
// PDF/AI còn cho thêm một thứ quý: khổ trang tính bằng point → biết ngay kích
// thước thật bằng mm, không bắt người dùng ngồi gõ lại.

export interface LoadedSource {
  name: string
  canvas: HTMLCanvasElement
  width: number
  height: number
  /** mm trên mỗi điểm ảnh — chỉ PDF/AI mới biết; ảnh bitmap trả null. */
  mmPerPx: number | null
  kind: 'raster' | 'pdf'
  pageCount: number
}

const PDF_EXT = /\.(pdf|ai)$/i

export function isVectorFile(file: File): boolean {
  return PDF_EXT.test(file.name) || file.type === 'application/pdf' || file.type === 'application/postscript'
}

/** Cạnh dài tối đa khi dựng PDF — chặn để không sinh canvas hàng trăm MB. */
const MAX_RENDER_EDGE = 4000

export async function loadSource(file: File, targetDpi = 300): Promise<LoadedSource> {
  if (isVectorFile(file)) return loadPdf(file, targetDpi)
  return loadRaster(file)
}

async function loadRaster(file: File): Promise<LoadedSource> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Không đọc được ảnh này. Hãy lưu lại dạng PNG hoặc JPG rồi thử lại.')
  })
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return {
    name: file.name,
    canvas,
    width: canvas.width,
    height: canvas.height,
    mmPerPx: null,
    kind: 'raster',
    pageCount: 1,
  }
}

async function loadPdf(file: File, targetDpi: number): Promise<LoadedSource> {
  const pdfjs = await import('pdfjs-dist')
  // Vite trả về đường dẫn file worker đã bundle; không có worker thì pdf.js dựng
  // trang ngay trên luồng chính và treo giao diện với file nặng.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const buf = await file.arrayBuffer()
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) })
  const doc = await task.promise.catch(() => {
    throw new Error(
      'Không mở được file này. File .ai chỉ đọc được khi lưu kèm PDF (Illustrator: "Create PDF Compatible File"). Cách chắc ăn: xuất ra PDF hoặc PNG nền trong suốt.',
    )
  })
  const page = await doc.getPage(1)

  // Khổ trang ở tỷ lệ 1 = point (1/72 inch) → ra mm thật.
  const base = page.getViewport({ scale: 1 })
  const widthMm = (base.width / 72) * 25.4
  let scale = targetDpi / 72
  const longest = Math.max(base.width, base.height) * scale
  if (longest > MAX_RENDER_EDGE) scale *= MAX_RENDER_EDGE / longest
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  // Không tô nền: giữ trong suốt để tách hình bằng kênh alpha cho chuẩn.
  await page.render({ canvas, canvasContext: ctx, viewport } as never).promise
  const pageCount = doc.numPages
  // Đóng cả tác vụ tải: chỉ huỷ tài liệu thì worker vẫn giữ nguyên bộ nhớ file.
  await task.destroy()

  return {
    name: file.name,
    canvas,
    width: canvas.width,
    height: canvas.height,
    mmPerPx: widthMm / canvas.width,
    kind: 'pdf',
    pageCount,
  }
}

/**
 * Ảnh làm việc (đã thu nhỏ) để dò biên — kèm tỷ lệ so với ảnh gốc theo từng trục.
 *
 * `stretchY` kéo trục dọc khi người dùng đặt khổ khác tỷ lệ gốc. Kéo NGAY Ở ĐÂY
 * chứ không kéo lúc xuất file: làm vậy thì trong toàn bộ phần tính toán phía sau,
 * một điểm ảnh vẫn là một ô vuông theo milimét — viền 5 mm mới đều bốn phía.
 */
export function workingImage(
  canvas: HTMLCanvasElement,
  maxEdge: number,
  stretchY = 1,
): { image: ImageData; scaleX: number; scaleY: number } {
  const srcW = canvas.width
  const srcH = canvas.height
  const targetH = srcH * stretchY
  const base = Math.min(1, maxEdge / Math.max(srcW, targetH))
  const w = Math.max(1, Math.round(srcW * base))
  const h = Math.max(1, Math.round(targetH * base))
  if (w === srcW && h === srcH) {
    const ctx = canvas.getContext('2d')!
    return { image: ctx.getImageData(0, 0, srcW, srcH), scaleX: 1, scaleY: 1 }
  }
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const sctx = small.getContext('2d')!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(canvas, 0, 0, w, h)
  return { image: sctx.getImageData(0, 0, w, h), scaleX: w / srcW, scaleY: h / srcH }
}
