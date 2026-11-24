import { carrierApi } from '~/services/api'
import { loadLabelImages, printImagesInIframe } from '~/utils/theLabels'
import type { LabelFailure, LabelImage, LabelPrintResult } from '~/utils/theLabels'

// In label bằng MODAL ngay trong trang (component LabelPrintHost gắn một lần ở app.vue).
// Mở modal ngay → "Đang tải label… n/N" → hiện ảnh label → tự mở hộp in bằng iframe ẩn.
// Không window.open: tab mới làm tab FFM bị ẩn, Chrome bóp timer/rAF nên vẽ PDF đứng.

export interface LabelPrintOptions {
  /** In xong (hộp in đóng) mà mọi label đều tải được thì tự đóng modal. Dùng cho Quét in label. */
  autoClose?: boolean
  /** Gọi mỗi lần modal đóng (kể cả bị thay bằng lượt mới thì KHÔNG gọi) — vd trả focus về ô quét. */
  onClosed?: () => void
}

type Phase = 'loading' | 'ready' | 'printing' | 'done'

interface State {
  open: boolean
  title: string
  phase: Phase
  total: number
  loaded: number
  images: LabelImage[]
  failures: LabelFailure[]
}

const EXTERNAL_FETCH_CONCURRENCY = 4
type Order = { id: number; code?: string }

export function useLabelPrint() {
  const state = useState<State>('label-print', () => ({
    open: false, title: 'Label', phase: 'done', total: 0, loaded: 0, images: [], failures: [],
  }))
  return {
    state,
    printTHELabels: (orders: Order[], opts?: LabelPrintOptions) =>
      labelPrintRun(state.value, orders, carrierApi.labelBlob, 'Label THE', 1, opts),
    printExternalLabels: (orders: Order[], opts?: LabelPrintOptions) =>
      labelPrintRun(state.value, orders, carrierApi.externalLabelBlob, 'Label ngoài', EXTERNAL_FETCH_CONCURRENCY, opts),
    reprint: () => labelPrintAgain(state.value),
    close: () => labelPrintClose(state.value),
  }
}

// Trạng thái không cần phản ứng, một modal dùng chung nên để cấp module.
let jobId = 0
let cancelIframe: (() => void) | undefined
let currentOpts: LabelPrintOptions | undefined

function dropIframe() {
  cancelIframe?.()
  cancelIframe = undefined
}

function labelPrintClose(st: State) {
  if (!st.open) return
  jobId++ // huỷ việc đang tải / chờ in
  dropIframe()
  st.open = false
  const cb = currentOpts?.onClosed
  currentOpts = undefined
  cb?.()
}

async function labelPrintRun(
  st: State,
  orders: Order[],
  fetchBlob: (orderId: number) => Promise<Blob>,
  title: string,
  concurrency: number,
  opts?: LabelPrintOptions,
): Promise<LabelPrintResult> {
  const my = ++jobId
  dropIframe()
  currentOpts = opts // lượt mới thay lượt cũ: onClosed của lượt cũ bỏ
  Object.assign(st, { open: true, title, phase: 'loading' as Phase, total: orders.length, loaded: 0, images: [], failures: [] })

  const { images, failures } = await loadLabelImages(
    orders, fetchBlob, concurrency, (n) => { if (my === jobId) st.loaded = n }, () => my !== jobId,
  )
  const result: LabelPrintResult = {
    printed: images.length,
    failed: failures.map((f) => ({ orderId: f.orderId, reason: orders.length > 1 || concurrency > 1 ? `${f.code}: ${f.reason}` : f.reason })),
  }
  if (my !== jobId) return result // bị đóng hoặc thay bằng lượt mới

  st.images = images
  st.failures = failures
  if (!images.length) {
    st.phase = 'done'
    return result
  }
  st.phase = 'ready'
  void doPrint(st, my) // không chặn người gọi: hộp in có thể treo luồng tới khi đóng
  return result
}

async function doPrint(st: State, my: number) {
  await nextTick() // cho modal vẽ ảnh trước khi hộp in chiếm luồng
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  if (my !== jobId) return
  st.phase = 'printing'
  try {
    await printImagesInIframe(st.images, st.title, (cancel) => { cancelIframe = cancel })
  } catch (e) {
    console.error('Lỗi in label', e)
  }
  if (my !== jobId) return
  st.phase = 'done'
  if (currentOpts?.autoClose && !st.failures.length) labelPrintClose(st)
}

function labelPrintAgain(st: State) {
  if (!st.images.length || st.phase === 'printing' || st.phase === 'loading') return
  const my = ++jobId
  dropIframe()
  st.phase = 'ready'
  void doPrint(st, my)
}
