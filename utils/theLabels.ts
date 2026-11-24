import { errorMessage } from '~/utils/api-error'

// Tải label của nhiều đơn rồi in bằng iframe ẩn ngay trong trang, mỗi label một
// trang 4×6 inch (100×150mm — khổ label vận chuyển chuẩn của máy in nhiệt).
// Không mở cửa sổ/tab mới: tab ẩn bị Chrome bóp timer/rAF nên việc vẽ PDF đứng.
// Modal hiển thị + gọi in nằm ở composables/useLabelPrint.ts.
//
// THE trả label ở nhiều dạng: PNG (label của THE), PDF hoặc GIF (label của hãng
// chặng cuối). Trình duyệt không in được nhiều PDF trong một lệnh, nên PDF được
// vẽ thành ảnh (pdfjs, 300 dpi — vạch barcode vẫn sắc) rồi tất cả in như ảnh.

const PDF_DPI = 300

async function pdfToImage(blob: Blob): Promise<string> {
  // Bản "legacy" của pdfjs: bản thường (v6) cần trình duyệt có `Iterator` (Chrome ≥ 122),
  // máy kho chạy trình duyệt cũ hơn nên báo "Iterator is not defined" và không in được
  // label PDF (anh Kiên 24/11, đơn 109714). Bản legacy tự kèm polyfill.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default as string
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

export interface LabelImage {
  orderId: number
  code: string
  src: string
}

export interface LabelFailure {
  orderId: number
  code: string
  reason: string
}

export interface LabelPrintResult {
  printed: number
  failed: Array<{ orderId: number; reason: string }>
}

/**
 * Tải label (song song `concurrency` cái một lúc) và đổi thành ảnh. Thứ tự kết quả
 * đúng thứ tự đơn, không phụ thuộc đơn nào tải xong trước. Label lỗi vào `failures`.
 */
export async function loadLabelImages(
  orders: Array<{ id: number; code?: string }>,
  fetchBlob: (orderId: number) => Promise<Blob>,
  concurrency: number,
  onProgress: (done: number) => void,
  isCancelled: () => boolean,
): Promise<{ images: LabelImage[]; failures: LabelFailure[] }> {
  const slots: Array<LabelImage | undefined> = new Array(orders.length)
  const failures: LabelFailure[] = []
  let next = 0
  let done = 0
  async function worker() {
    for (;;) {
      if (isCancelled()) return
      const i = next++
      if (i >= orders.length) return
      const o = orders[i]!
      const code = o.code ?? String(o.id)
      try {
        const blob = await fetchBlob(o.id)
        const type = blob.type || ''
        const src = type.includes('pdf') ? await pdfToImage(blob) : await blobToDataURL(blob)
        slots[i] = { orderId: o.id, code, src }
      } catch (e) {
        failures.push({ orderId: o.id, code, reason: errorMessage(e) })
      }
      done++
      onProgress(done)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, orders.length)) }, worker))
  return { images: slots.filter((x): x is LabelImage => !!x), failures }
}

function pagesHtml(images: LabelImage[], title: string): string {
  const pages = images.map((im) => `<div class="page"><img src="${im.src}" alt="Label ${esc(im.code)}" /></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} (${images.length})</title>
    <style>
      /* Khổ label vận chuyển 4×6 inch. In: khổ giấy 4x6 (100x150) trong driver,
         Lề = Không có, Tỉ lệ 100% / Fit. Ảnh label giữ đúng tỷ lệ, không bị kéo. */
      @page { size: 4in 6in; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .page { width: 4in; height: 6in; display: flex; align-items: center; justify-content: center;
              page-break-after: always; break-after: page; overflow: hidden; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      .page img { max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated; }
    </style></head><body>${pages}</body></html>`
}

const PRINT_FALLBACK_MS = 60_000

/**
 * In ảnh label bằng iframe ẩn trong chính trang. Resolve khi hộp in đã đóng (afterprint,
 * hoặc print() chặn tới lúc đóng, hoặc quá thời gian chờ); iframe được gỡ trước khi resolve.
 * `register` nhận hàm huỷ để người gọi gỡ iframe sớm khi bị thay bằng lượt in mới.
 */
export async function printImagesInIframe(
  images: LabelImage[],
  title: string,
  register?: (cancel: () => void) => void,
): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:4in;height:6in;border:0;opacity:0;pointer-events:none;'
  // Hộp in / iframe lấy mất focus; gỡ iframe xong trả focus về chỗ cũ (ô quét của máy quét).
  const prevFocus = document.activeElement as HTMLElement | null
  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    iframe.remove()
    const cur = document.activeElement
    if (prevFocus?.isConnected && (!cur || cur === document.body)) prevFocus.focus()
  }
  register?.(remove)
  document.body.appendChild(iframe)
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      iframe.srcdoc = pagesHtml(images, title)
    })
    if (removed) return
    const win = iframe.contentWindow!
    const imgs = Array.from(iframe.contentDocument!.images)
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((r) => {
              img.onload = img.onerror = () => r()
            }),
      ),
    )
    if (removed) return
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout>
      const finish = () => {
        clearTimeout(timer)
        win.removeEventListener('afterprint', finish)
        resolve()
      }
      win.addEventListener('afterprint', finish)
      timer = setTimeout(finish, PRINT_FALLBACK_MS)
      win.focus()
      const t0 = Date.now()
      win.print()
      // Chrome: print() chặn tới khi hộp in đóng → xong rồi (afterprint thường tới ngay sau).
      if (Date.now() - t0 > 400) {
        clearTimeout(timer)
        timer = setTimeout(finish, 500)
      }
    })
  } finally {
    remove()
  }
}
