import { carrierApi } from '~/services/api'
import { errorMessage } from '~/utils/api-error'

// In label THE của nhiều đơn trong MỘT cửa sổ in, mỗi label một trang 4×6 inch
// (100×150mm — khổ label vận chuyển chuẩn của máy in nhiệt).
//
// THE trả label ở nhiều dạng: PNG (label của THE), PDF hoặc GIF (label của hãng
// chặng cuối). Trình duyệt không in được nhiều PDF trong một lệnh, nên PDF được
// vẽ thành ảnh (pdfjs, 300 dpi — vạch barcode vẫn sắc) rồi tất cả in như ảnh.

const PDF_DPI = 300

async function pdfToImage(blob: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: PDF_DPI / 72 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport } as never).promise
    return canvas.toDataURL('image/png')
  } finally {
    await task.destroy()
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export interface LabelPrintResult {
  printed: number
  failed: Array<{ orderId: number; reason: string }>
}

/**
 * Mở cửa sổ in label cho các đơn. Phải gọi TRỰC TIẾP trong handler của cú bấm
 * (trước mọi await) để trình duyệt không chặn popup.
 */
export async function printTHELabels(orders: Array<{ id: number; code?: string }>): Promise<LabelPrintResult> {
  const result: LabelPrintResult = { printed: 0, failed: [] }
  const w = window.open('', '_blank')
  if (!w) throw new Error('Trình duyệt chặn cửa sổ in. Hãy cho phép popup rồi thử lại.')
  w.document.write('<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif;padding:24px">Đang tải label…</body>')

  const pages: string[] = []
  for (const o of orders) {
    try {
      const blob = await carrierApi.labelBlob(o.id)
      const type = blob.type || ''
      const src = type.includes('pdf') ? await pdfToImage(blob) : await blobToDataURL(blob)
      pages.push(`<div class="page"><img src="${src}" alt="Label ${esc(o.code ?? String(o.id))}" /></div>`)
      result.printed++
    } catch (e) {
      result.failed.push({ orderId: o.id, reason: errorMessage(e) })
    }
  }
  if (!pages.length) {
    w.document.body.innerHTML = `<p>Không tải được label nào.</p>${result.failed
      .map((f) => `<p>Đơn ${f.orderId}: ${esc(f.reason)}</p>`)
      .join('')}`
    return result
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label THE (${pages.length})</title>
    <style>
      /* Khổ label vận chuyển 4×6 inch. In: khổ giấy 4x6 (100x150) trong driver,
         Lề = Không có, Tỉ lệ 100% / Fit. Ảnh label giữ đúng tỷ lệ, không bị kéo. */
      @page { size: 4in 6in; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .page { width: 4in; height: 6in; display: flex; align-items: center; justify-content: center;
              page-break-after: always; break-after: page; overflow: hidden; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      .page img { max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated; }
      @media screen { body { background: #eee; } .page { background: #fff; margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
    </style></head><body>${pages.join('')}
    <script>window.onload = function () { setTimeout(function () { window.print() }, 150) }<\/script>
    </body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
  return result
}
