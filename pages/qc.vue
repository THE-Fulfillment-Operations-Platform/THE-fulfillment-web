<script setup lang="ts">
import { basketsApi, qcApi } from '~/services/api'
import type { Basket, BasketForOrder, QcScanResult, QcOrderScan, QcResultItem } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { refreshActionCounts } from '~/composables/useActionCounts'
import { errorMessage } from '~/utils/api-error'
import { isValidUrl, toDisplayImageUrl } from '~/utils/format'
import { useToastStore } from '~/stores/toast'
import { DEFECT_CODE_OPTIONS, INTERNAL_STATUS } from '~/utils/enums'
import { printBasketLabel } from '~/utils/basketLabel'

// Scan-driven QC station (Wireframe: Scan QC). The operator scans an item code,
// the screen pulls the canonical mockup + engrave text, and PASS advances the
// item to QC_PASSED while FAIL logs a defect note for follow-up.
// QC is a product-level gate: one check per finished product (a product may span
// several per-material batches). PASS marks the whole product QC-passed at once,
// and is only allowed once every material part has been produced.
//
// Hai cách vào trạm:
//   - quét MÃ ĐƠN (vd 102431) → màn "đơn": đơn có bao nhiêu sản phẩm, cái nào đã
//     QC / đang chờ / làm lại. Bấm vào từng sản phẩm để đối chiếu mockup và PASS/FAIL;
//     xong thì quay về đơn để làm sản phẩm tiếp theo.
//   - quét MÃ ITEM (có dấu _ hoặc /, vd 102431_1/2) → mở thẳng sản phẩm đó như trước.
const toast = useToastStore()
const auth = useAuthStore()

const code = ref('')
const scanInput = ref<HTMLInputElement | null>(null)
const scanning = ref(false)
const result = ref<QcScanResult | null>(null)
// Đơn đang QC (quét mã đơn). Có giá trị khi đang xem đơn HOẶC đang mở một sản phẩm
// của đơn đó (result != null) — sản phẩm xong thì quay về đây.
const order = ref<QcOrderScan | null>(null)
const scanError = ref<string | null>(null)

// Item đã QC PASS rồi → chặn quét/PASS lại để không ghi trùng bản ghi QC.
const alreadyQC = computed(() => result.value?.internal_status === 'QC_PASSED')

// Tên sản phẩm hiển thị lấy từ SKU trong master data — dòng đơn không còn giữ
// bản sao tên riêng (template mới của khách bỏ cột tên sản phẩm).
const productName = computed(() => result.value?.sku_product_name || '')

// QC là cổng cấp SẢN PHẨM, làm 1 lần: một sản phẩm có thể gồm nhiều NVL (mỗi NVL
// một batch). PASS/FAIL áp cho cả sản phẩm. Chỉ QC được khi MỌI phần NVL đã đạt
// 'Đã cắt' (CUT) — phần mới in (PRINTED) hay còn Chờ xử lý (PENDING) thì chưa xong.
// Ghi chú của đơn: đơn "lạ" (khách dặn riêng, khác thường) được CS/design ghi ở đây.
// Hiện thành banner to và bắt bấm "Đã đọc" trước khi PASS, để QC không soi đơn đó
// như đơn thường. Reset mỗi lần quét (xem watch(result) bên dưới).
const orderNote = computed(() => result.value?.order_note?.trim() || '')
const noteAcked = ref(false)
const mustAckNote = computed(() => !!orderNote.value && !noteAcked.value)

const READY_STATUSES =['CUT', 'QC_PASSED']
const parts = computed(() => result.value?.batches ?? [])
const notReadyParts = computed(() => parts.value.filter((b) => !READY_STATUSES.includes(b.status)))
const notProducedYet = computed(() => notReadyParts.value.length > 0)

// Mockup preview. The picture is the one thing at this station that used to make
// the operator wait: mockups live on the seller's Google Drive, and loading one
// straight from there costs two handshakes, a redirect and however long Drive
// takes to render a thumbnail of a file that may be tens of megabytes — seconds,
// for a heavy one. So the API now caches a screen-sized copy and hands us a
// signed URL to it, and that is what we render.
//
// Three sources, tried in order, because QC must never be stopped by our own
// cache: our thumbnail → the origin (share links rewritten to something an <img>
// can actually display) → a clean "can't show this" panel. A thumbnail that
// 404s (an unshared link, a PSD the server cannot decode) silently falls through
// to exactly the behaviour this screen had before the cache existed.
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl as string
const thumbFailed = ref(false)
const mockupError = ref(false)

const mockupSrc = computed(() => {
  const thumb = result.value?.mockup_thumb_url
  if (thumb && !thumbFailed.value) return `${apiBaseUrl}${thumb}`
  return toDisplayImageUrl(result.value?.mockup_url)
})

function onMockupError() {
  // First failure with a thumbnail in play means "retry against the origin",
  // not "give up" — re-rendering with a new src is what triggers that retry.
  if (result.value?.mockup_thumb_url && !thumbFailed.value) {
    thumbFailed.value = true
    return
  }
  mockupError.value = true
}

// Reset per scan, keyed on the result object rather than the URL: scanning two
// items that happen to share a mockup must still clear a previous failure.
watch(result, (r) => {
  noteAcked.value = false
  mockupError.value = false
  thumbFailed.value = false
  void loadBasketInfo(r)
})

// ---- Giỏ chờ ------------------------------------------------------------------
// Đơn nhiều sản phẩm làm xong lệch nhau: sản phẩm QC đạt trước nằm ở giỏ chờ đánh
// số, đợi các sản phẩm sau. Mở một sản phẩm là hỏi luôn đơn của nó đang ở giỏ nào
// (hoặc có cần giỏ không) — hỏi song song với lúc ảnh mockup đang tải, không chặn quét.
const basketInfo = ref<BasketForOrder | null>(null)
let basketReq = 0
async function loadBasketInfo(r: QcScanResult | null) {
  const req = ++basketReq
  basketInfo.value = null
  if (!r?.order_id) return
  try {
    const { data } = await basketsApi.forOrder(r.order_id)
    if (req === basketReq) basketInfo.value = data
  } catch {
    // Không tra được giỏ thì trạm QC vẫn chạy như trước — chỉ thiếu dòng báo giỏ.
  }
}
const itemBasket = computed(() => basketInfo.value?.basket ?? null)
// Sau khi PASS sản phẩm đang mở, đơn còn bao nhiêu sản phẩm chưa QC đạt.
const remainingAfterPass = computed(() => {
  const b = basketInfo.value
  if (!b) return 0
  return Math.max(0, b.total_items - b.passed_items - (alreadyQC.value ? 0 : 1))
})
// Sản phẩm CUỐI của đơn nhiều sản phẩm: PASS xong là giỏ đủ, đi nhặt giỏ.
const isLastOfOrder = computed(() => !!basketInfo.value && basketInfo.value.total_items > 1 && !alreadyQC.value && remainingAfterPass.value === 0)
// Đơn cần giỏ ngay bây giờ: nhiều sản phẩm, chưa có giỏ, PASS xong vẫn còn thiếu.
const needsBasket = computed(() => !!basketInfo.value?.needs_basket && remainingAfterPass.value > 0)

const basketDialog = ref(false)
const basketDialogMode = ref<'created' | 'existing' | 'full'>('created')
const dialogBasket = ref<Basket | null>(null)
function showBasket(b: Basket, mode: 'created' | 'existing' | 'full') {
  dialogBasket.value = b
  basketDialogMode.value = mode
  basketDialog.value = true
}

const creatingBasket = ref(false)
async function createBasket(orderId: number) {
  if (creatingBasket.value) return
  creatingBasket.value = true
  try {
    const { data } = await basketsApi.create(orderId)
    showBasket(data.basket, data.created ? 'created' : 'existing')
    if (basketInfo.value?.order_id === orderId) {
      basketInfo.value = { ...basketInfo.value, basket: data.basket, needs_basket: false }
    }
    if (order.value?.order_id === orderId) order.value.basket_number = data.basket.number
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creatingBasket.value = false
  }
}

function reprintBasket(b: Basket | null) {
  if (b && !printBasketLabel(b)) toast.error('Trình duyệt chặn cửa sổ in — cho phép popup cho trang này rồi bấm lại.')
}

// Màn đơn: có cần tạo giỏ không (nhiều sản phẩm, chưa đủ, chưa có giỏ).
const orderNeedsBasket = computed(() => {
  const o = order.value
  return !!o && !o.basket_number && o.total_items > 1 && o.passed_items < o.total_items
})
async function openOrderBasket() {
  const o = order.value
  if (!o?.basket_number) return
  try {
    const { data } = await basketsApi.forOrder(o.order_id)
    if (data.basket) showBasket(data.basket, 'existing')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

const failOpen = ref(false)
const failing = ref(false)
const defect = reactive({
  defect_code: 'PRINT_WRONG',
  note: '',
  // Phần NVL bị lỗi (combo phải chọn) và nơi trả sản phẩm về để làm lại.
  batch_item_id: null as number | null,
  rework_route: 'PRODUCTION' as 'PRODUCTION' | 'DESIGN',
})


// Mã tem sản phẩm có dạng <mã đơn>_<dòng>/<tổng> (102431_1/2); mã đơn chỉ là số.
function looksLikeItemCode(v: string) {
  return /[_/]/.test(v)
}
// Tem giỏ chờ: "GIO-37" (QR) hoặc gõ tay số giỏ 1–3 chữ số (mã đơn có 6 chữ số).
function looksLikeBasketCode(v: string) {
  return /^(gi[oỏ]|g)?[\s\-#]*\d{1,3}$/i.test(v)
}

function focusScan() {
  nextTick(() => scanInput.value?.focus())
}

async function scan() {
  const value = code.value.trim()
  if (!value || scanning.value) return
  scanning.value = true
  scanError.value = null
  try {
    if (looksLikeItemCode(value)) {
      // Mã item: mở thẳng sản phẩm, như trước đây.
      const { data } = await qcApi.scan({ code: value })
      order.value = null
      result.value = data
    } else if (looksLikeBasketCode(value)) {
      // Quét tem giỏ: mở đơn đang nằm trong giỏ đó.
      const { data: found } = await basketsApi.lookup(value)
      if (!found.basket) throw new Error(found.message || 'Giỏ này đang trống')
      const { data } = await qcApi.scanOrder({ order_id: found.basket.order_id })
      result.value = null
      order.value = data
    } else {
      const { data } = await qcApi.scanOrder({ code: value })
      result.value = null
      order.value = data
    }
  } catch (e) {
    result.value = null
    order.value = null
    scanError.value = errorMessage(e)
  } finally {
    scanning.value = false
    code.value = ''
    focusScan()
  }
}

// Thôi QC sản phẩm đang mở. Đang làm trong một đơn thì quay về đơn (tải lại để
// trạng thái mới nhất hiện ra); không thì trạm trống, sẵn sàng quét mã khác.
function clearStation() {
  result.value = null
  scanError.value = null
  if (order.value) void refreshOrder()
  focusScan()
}

// Thôi luôn cả đơn, quét đơn / sản phẩm khác.
function clearOrder() {
  result.value = null
  order.value = null
  scanError.value = null
  focusScan()
}

async function refreshOrder() {
  if (!order.value) return
  try {
    const { data } = await qcApi.scanOrder({ order_id: order.value.order_id })
    // Người dùng có thể đã quét đơn khác trong lúc chờ — đừng ghi đè.
    if (order.value?.order_id === data.order_id) order.value = data
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// Bấm một sản phẩm trong đơn → mở màn QC của sản phẩm đó.
const openingItemId = ref<number | null>(null)
async function openItem(it: QcResultItem) {
  if (openingItemId.value) return
  openingItemId.value = it.item_id
  scanError.value = null
  try {
    const { data } = await qcApi.scan({ item_id: it.item_id })
    result.value = data
    window.scrollTo?.({ top: 0 })
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    openingItemId.value = null
  }
}

const ITEM_QC: Record<string, { label: string; chip: string }> = {
  PASSED: { label: 'Đã QC', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  REWORK: { label: 'Đang làm lại', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  WAITING: { label: 'Chờ QC', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
}
const itemQc = (it: QcResultItem) => ITEM_QC[it.qc_status] ?? ITEM_QC.WAITING
const stageLabel = (it: QcResultItem) => INTERNAL_STATUS[it.internal_status]?.label ?? it.internal_status

// Tổng số lượng cái hàng trong đơn (cộng SL từng dòng) — số "sản phẩm" là số dòng.
const orderQty = computed(() => (order.value?.items ?? []).reduce((n, it) => n + (it.quantity || 0), 0))
const orderPct = computed(() => {
  const o = order.value
  return o && o.total_items ? Math.round((o.passed_items / o.total_items) * 100) : 0
})

// Trạm QC là một vòng lặp tay: quét → soi mockup → PASS → quét cái tiếp theo. Bắt
// người QC đứng đợi server ghi xong mới cho quét mã sau là buộc cả xưởng chạy theo
// tốc độ đường truyền — mỗi sản phẩm mất thêm cả giây chỉ để nhìn cái spinner.
//
// Nên PASS nhả trạm ra NGAY rồi ghi ở nền. Việc này an toàn vì mọi điều kiện chặn
// (đã QC rồi, còn NVL chưa cắt) đã được kiểm ngay lúc quét và hiện trên màn; phần
// còn lại là ghi xuống DB. Nếu ghi hỏng thật thì toast đỏ nêu ĐÍCH DANH mã item để
// quét lại — không nuốt lỗi.
const pending = ref<string[]>([])

function markPassedLocally(itemId: number) {
  const o = order.value
  const line = o?.items.find((i) => i.item_id === itemId)
  if (!o || !line || line.qc_status === 'PASSED') return
  if (line.qc_status === 'REWORK') o.rework_items--
  o.waiting_items--
  o.passed_items++
  line.qc_status = 'PASSED'
  line.internal_status = 'QC_PASSED'
  o.status = o.passed_items === o.total_items ? 'DONE' : 'PARTIAL'
}

function pass() {
  const item = result.value
  if (!item || !canJudge.value || alreadyQC.value || notProducedYet.value || mustAckNote.value) return
  // Giỏ chờ, chốt TRƯỚC khi nhả trạm (sau đó basketInfo bị xoá theo result):
  //   - đơn cần giỏ (sản phẩm đầu của đơn nhiều SP) → PASS kiêm tạo giỏ;
  //   - đơn đã có giỏ → PASS xong báo bỏ vào giỏ nào, hoặc báo ĐỦ nếu là SP cuối.
  const basket = itemBasket.value
  const last = isLastOfOrder.value
  const orderIdForBasket = needsBasket.value ? basketInfo.value?.order_id : undefined
  if (orderIdForBasket) void createBasket(orderIdForBasket)

  // Đang làm trong một đơn: đánh dấu ngay sản phẩm này là "Đã QC" trên màn đơn để
  // người QC thấy tiến độ và làm sản phẩm kế tiếp mà không phải đợi server.
  markPassedLocally(item.item_id)
  result.value = null // nhả trạm trước, quét mã tiếp theo / bấm sản phẩm khác được luôn
  scanError.value = null
  focusScan()

  pending.value.push(item.item_code)
  qcApi
    .pass({ item_id: item.item_id })
    .then(() => {
      if (basket && last) {
        // SP cuối: giỏ đủ — hiện số giỏ to, hướng dẫn đi nhặt + quét xác nhận.
        showBasket({ ...basket, passed_items: basket.total_items, status: 'FULL' }, 'full')
      } else if (basket) {
        toast.success(`${item.item_code} đã QC PASS → bỏ vào GIỎ #${basket.number}`)
      } else {
        toast.success(`${item.item_code} đã QC PASS → Đã QC`)
      }
    })
    .catch((e) =>
      toast.error(`${item.item_code}: CHƯA lưu được QC PASS — ${errorMessage(e)}. Quét lại mã này.`),
    )
    .finally(() => {
      const i = pending.value.indexOf(item.item_code)
      if (i !== -1) pending.value.splice(i, 1)
      // Đồng bộ lại với server (ghi hỏng thì trạng thái thật hiện ra, không treo "Đã QC" ảo).
      void refreshOrder()
    })
}

// Lỗi thuộc về FILE design thì in lại y hệt sẽ hỏng y hệt — mặc định trả về khâu
// thiết kế. Các lỗi còn lại là lỗi làm, chỉ cần làm lại sản xuất. Người QC vẫn
// đổi được nếu thực tế khác.
const DESIGN_DEFECTS = ['ENGRAVE_WRONG', 'WRONG_MOCKUP']
const routeOptions = [
  { value: 'PRODUCTION', label: 'Làm lại sản xuất (file design giữ nguyên)' },
  { value: 'DESIGN', label: 'Trả về Chờ thiết kế (phải sửa file trước)' },
]
// Các phần NVL còn hiệu lực của sản phẩm — combo phải chỉ rõ phần nào hỏng.
const failableParts = computed(() => result.value?.batches ?? [])
const partOptions = computed(() =>
  failableParts.value.map((b) => ({
    value: b.batch_item_id,
    label: `${b.material_code} · ${b.batch_code}`,
  })),
)

// ---- Hạ QC (bấm nhầm) -------------------------------------------------------
// Khác hẳn FAIL. FAIL nghĩa là hàng hỏng: phần đã sản xuất bị huỷ, tính một lần
// làm lại, mở note cho xưởng. Bấm nhầm thì hàng vẫn nguyên vẹn trên bàn — huỷ nó
// là ghi vào sổ một lần huỷ vật lý không hề xảy ra (rework_count sai, KPI làm
// lại sai, tấm vật liệu "đã tiêu" thực ra vẫn còn). Hạ QC chỉ mở lại cổng.
// Chỉ OWNER/ADMIN, khớp guard BE: ranh giới giữa "bấm nhầm" và "hàng hỏng nhưng
// ngại làm thủ tục huỷ" là thứ phải có người chịu trách nhiệm.
// Pass/Fail là "Thao tác" của màn Quét QC; chỉ có "Xem" thì quét để tra thôi.
const canJudge = computed(() => auth.can('qc.manage'))
const canUndoQC = computed(
  () => auth.hasAdminRights && canJudge.value && alreadyQC.value,
)
const undoOpen = ref(false)
const undoing = ref(false)
const undoReason = ref('')
const undoReasonValid = computed(() => undoReason.value.trim().length <= 60)

function openUndo() {
  undoReason.value = ''
  undoOpen.value = true
}

async function submitUndo() {
  if (!result.value || undoing.value || !undoReasonValid.value) return
  undoing.value = true
  try {
    const itemId = result.value.item_id
    const itemCode = result.value.item_code
    const { data } = await qcApi.undo({ item_id: itemId, reason: undoReason.value.trim() || undefined })
    toast.success(`${itemCode}: đã hạ QC (${data.parts} phần NVL về “Đã cắt”) — QC lại rồi PASS.`)
    undoOpen.value = false
    // Quét lại chính sản phẩm đó: trạm phải hiện trạng thái mới ngay, người QC
    // đang cầm hàng trên tay và sắp bấm PASS lại.
    const { data: rescanned } = await qcApi.scan({ item_id: itemId })
    result.value = rescanned
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    undoing.value = false
  }
}

function openFail() {
  defect.defect_code = 'PRINT_WRONG'
  defect.note = ''
  defect.rework_route = 'PRODUCTION'
  // Một NVL thì khỏi bắt chọn; combo để trống buộc người QC chỉ đúng phần hỏng.
  defect.batch_item_id = failableParts.value.length === 1 ? failableParts.value[0].batch_item_id : null
  failOpen.value = true
}

// Đổi loại lỗi thì gợi ý lại hướng xử lý cho khớp.
watch(
  () => defect.defect_code,
  (code) => {
    defect.rework_route = DESIGN_DEFECTS.includes(code) ? 'DESIGN' : 'PRODUCTION'
  },
)

async function submitFail() {
  if (!result.value || failing.value) return
  failing.value = true
  try {
    const code = result.value.item_code
    const { data } = await qcApi.fail({
      item_id: result.value.item_id,
      defect_code: defect.defect_code,
      note: defect.note || undefined,
      batch_item_id: defect.batch_item_id ?? undefined,
      rework_route: defect.rework_route,
    })
    // Nói rõ sản phẩm đã đi đâu — người QC không phải đoán bước tiếp theo.
    toast.error(
      data?.route === 'DESIGN'
        ? `${code}: đã huỷ phần hỏng, trả về Chờ thiết kế để sửa file (lần sản xuất ${data?.attempt ?? 1})`
        : `${code}: đã huỷ phần hỏng, trả về danh sách chờ gom batch làm lại (lần sản xuất ${data?.attempt ?? 1})`,
    )
    failOpen.value = false
    clearStation()
    // QC fail sinh một note "cần xử lý" ở backend, tức badge "Ghi chú / Cần xử lý"
    // vừa TĂNG. Không bắn tín hiệu thì trạm QC báo lỗi xong mà sidebar vẫn im, và
    // người phụ trách note không biết có việc mới cho tới lần poll sau.
    void refreshActionCounts()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    failing.value = false
  }
}

onMounted(focusScan)
</script>

<template>
  <div>
    <PageHeader
      title="Quét QC"
      subtitle="Quét mã đơn → xem các sản phẩm trong đơn → bấm từng sản phẩm, đối chiếu mockup → PASS/FAIL. QC 1 lần cho cả sản phẩm (mọi NVL), làm khi sản phẩm đã hoàn thành."
    />

    <!-- Scan bar -->
    <div class="card mb-5 p-4">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="scan">
        <div class="flex-1">
          <label class="label" for="qc-scan">Mã đơn / mã item</label>
          <input
            id="qc-scan"
            ref="scanInput"
            v-model="code"
            class="input font-mono text-base"
            placeholder="Quét hoặc nhập mã rồi Enter…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary sm:w-40" :disabled="scanning || !code.trim()">
          <UiSpinner v-if="scanning" :size="16" />
          <UiIcon v-else name="qc" :size="16" /> Quét
        </button>
      </form>
      <p v-if="scanError" class="mt-3 rounded-md bg-red-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-red-700 dark:text-rose-300">
        {{ scanError }}
      </p>
      <!-- PASS ghi ở nền nên trạm trống ngay; dòng này để việc đang chạy không vô hình. -->
      <p v-if="pending.length" class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <UiSpinner :size="14" />
        Đang lưu QC PASS: <span class="font-mono">{{ pending.join(', ') }}</span>
      </p>
    </div>

    <!-- Màn ĐƠN: quét mã đơn → thấy cả đơn có bao nhiêu sản phẩm, bấm từng cái để QC -->
    <div v-if="order && !result" class="space-y-4">
      <div class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Đơn đang QC</p>
            <p class="font-mono text-3xl font-bold leading-tight text-foreground">{{ order.internal_code }}</p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              {{ order.store_order_id }}<template v-if="order.seller_name"> · {{ order.seller_name }}</template>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <!-- Góc phải: giỏ chờ của đơn — số giỏ to, hoặc nút tạo giỏ khi cần. -->
            <button
              v-if="order.basket_number"
              type="button"
              class="inline-flex items-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-1.5 text-amber-900 hover:bg-amber-100 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-100"
              title="Xem / in lại tem giỏ"
              @click="openOrderBasket"
            >
              <span class="text-xs font-bold uppercase tracking-wider">Giỏ chờ</span>
              <span class="text-2xl font-extrabold tabular-nums">#{{ order.basket_number }}</span>
            </button>
            <button
              v-else-if="orderNeedsBasket && canJudge"
              type="button"
              class="btn-secondary border-amber-400 text-amber-800 dark:text-amber-200"
              :disabled="creatingBasket"
              @click="createBasket(order.order_id)"
            >
              <UiSpinner v-if="creatingBasket" :size="14" /><UiIcon v-else name="box" :size="16" /> Tạo giỏ chờ
            </button>
            <button class="btn-secondary" @click="clearOrder">Quét đơn khác</button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p class="label">Sản phẩm trong đơn</p>
            <p class="text-3xl font-bold leading-none tabular-nums text-foreground">
              {{ order.total_items }}
              <span v-if="orderQty !== order.total_items" class="text-sm font-semibold text-muted-foreground">({{ orderQty }} cái)</span>
            </p>
          </div>
          <div>
            <p class="label">Đã QC</p>
            <p class="text-3xl font-bold leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
              {{ order.passed_items }}<span class="text-base font-semibold text-muted-foreground"> / {{ order.total_items }}</span>
            </p>
          </div>
          <div>
            <p class="label">Chờ QC</p>
            <p class="text-3xl font-bold leading-none tabular-nums text-amber-600 dark:text-amber-400">{{ order.waiting_items - order.rework_items }}</p>
          </div>
          <div v-if="order.rework_items">
            <p class="label">Đang làm lại</p>
            <p class="text-3xl font-bold leading-none tabular-nums text-rose-600 dark:text-rose-400">{{ order.rework_items }}</p>
          </div>
        </div>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" :aria-valuenow="orderPct" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: orderPct + '%' }" />
        </div>
        <p
          v-if="order.status === 'DONE'"
          class="mt-3 flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          <UiIcon name="check" :size="16" /> Đơn đã QC đủ — sẵn sàng gửi / đóng gói.
        </p>
      </div>

      <div
        v-if="order.order_note"
        class="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-500/60 dark:bg-amber-500/10"
        role="alert"
      >
        <p class="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          <UiIcon name="alert" :size="18" /> Đơn có ghi chú
        </p>
        <p class="mt-2 whitespace-pre-line break-words text-xl font-semibold leading-snug text-amber-900 dark:text-amber-100">{{ order.order_note }}</p>
        <p class="mt-2 text-xs text-amber-700 dark:text-amber-300">Mở từng sản phẩm để QC sẽ phải bấm “Đã đọc ghi chú” trước khi PASS.</p>
      </div>

      <div v-if="!order.items.length" class="card py-10 text-center text-sm text-muted-foreground">
        Đơn này không còn sản phẩm nào cần QC (đã huỷ hết).
      </div>
      <ul v-else class="space-y-2">
        <li v-for="it in order.items" :key="it.item_id">
          <button
            type="button"
            class="card flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            :class="[
              it.qc_status === 'PASSED' ? 'border-emerald-300 dark:border-emerald-500/40' : '',
              it.qc_status === 'REWORK' ? 'border-rose-300 bg-rose-50/40 dark:border-rose-500/40 dark:bg-rose-500/5' : '',
            ]"
            :disabled="openingItemId !== null"
            @click="openItem(it)"
          >
            <div class="min-w-0 flex-1 basis-56">
              <p class="font-mono text-sm text-muted-foreground">{{ it.internal_code }}</p>
              <p class="break-all text-xl font-bold leading-tight text-foreground">{{ it.sku_code }}</p>
              <p v-if="it.product_name" class="break-words text-sm text-muted-foreground">{{ it.product_name }}</p>
            </div>
            <div class="text-center">
              <p class="label">SL</p>
              <p class="text-2xl font-bold leading-none tabular-nums" :class="it.quantity > 1 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'">{{ it.quantity }}</p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class="inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold" :class="itemQc(it).chip">
                <UiIcon v-if="it.qc_status === 'PASSED'" name="check" :size="13" class="mr-1" />{{ itemQc(it).label }}
              </span>
              <span class="text-[11px] text-muted-foreground">Sản xuất: {{ stageLabel(it) }}</span>
            </div>
            <UiSpinner v-if="openingItemId === it.item_id" :size="16" />
            <span v-else class="text-lg text-muted-foreground" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Idle state -->
    <div v-else-if="!result" class="card flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <div class="rounded-full bg-muted p-4">
        <UiIcon name="qc" :size="32" />
      </div>
      <p class="text-sm">Quét một mã đơn (hoặc mã item) để bắt đầu kiểm tra QC.</p>
    </div>

    <!-- QC comparison -->
    <template v-else>
    <!-- Đang QC một sản phẩm của đơn: một nút quay về đơn, luôn thấy ngay trên đầu. -->
    <div v-if="order" class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-4 py-2.5">
      <button class="text-sm font-semibold text-primary hover:underline" @click="clearStation">← Về đơn {{ order.internal_code }}</button>
      <span class="text-sm text-muted-foreground">
        Đã QC <b class="text-foreground">{{ order.passed_items }}/{{ order.total_items }}</b> sản phẩm
      </span>
    </div>
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- Mockup -->
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-border bg-muted px-4 py-2.5">
          <h3 class="text-sm font-semibold text-foreground">Mockup chuẩn (seller)</h3>
          <UiMockupLink :url="result.mockup_url" small label="Mở tab mới" />
        </div>
        <div class="flex min-h-[14rem] items-center justify-center bg-slate-900 p-4 sm:min-h-[18rem] lg:min-h-[22rem]">
          <img
            v-if="isValidUrl(result.mockup_url) && !mockupError"
            :src="mockupSrc"
            :alt="`Mockup ${result.item_code}`"
            class="max-h-[14rem] max-w-full rounded object-contain sm:max-h-[20rem] lg:max-h-[28rem]"
            decoding="async"
            fetchpriority="high"
            @error="onMockupError"
          />
          <div v-else class="flex flex-col items-center gap-2 text-center text-slate-300">
            <UiIcon name="alert" :size="28" />
            <p v-if="!isValidUrl(result.mockup_url)" class="text-sm">Item này chưa có mockup — không thể đối chiếu.</p>
            <template v-else>
              <p class="text-sm">Ảnh mockup không tải được — link không phải ảnh trực tiếp.</p>
              <UiMockupLink :url="result.mockup_url" small label="Mở mockup ở tab mới" />
            </template>
          </div>
        </div>
      </div>

      <!-- Detail + checklist + actions -->
      <div class="space-y-5">
        <!-- Giỏ chờ (góc trên bên phải): đơn nhiều sản phẩm gom ở giỏ tới khi đủ. -->
        <div
          v-if="itemBasket"
          class="flex items-center gap-4 rounded-xl border-2 p-4"
          :class="isLastOfOrder ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-500/10' : 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'"
          role="status"
        >
          <div class="flex shrink-0 flex-col items-center">
            <span class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Giỏ chờ</span>
            <span class="text-5xl font-extrabold leading-none tabular-nums text-foreground">#{{ itemBasket.number }}</span>
          </div>
          <div class="min-w-0 flex-1 text-sm text-foreground">
            <p v-if="alreadyQC" class="font-semibold">Sản phẩm này đã QC — hàng của đơn ở giỏ #{{ itemBasket.number }}.</p>
            <p v-else-if="isLastOfOrder" class="text-base font-bold">
              Sản phẩm CUỐI của đơn — PASS xong giỏ #{{ itemBasket.number }} tự xoá; cầm sản phẩm ra giỏ, lấy đủ {{ itemBasket.total_items }} sản phẩm bó lại.
            </p>
            <p v-else class="text-base font-bold">Hàng của đơn đang ở giỏ #{{ itemBasket.number }} — PASS xong bỏ vào giỏ này.</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Đơn {{ basketInfo?.passed_items }}/{{ basketInfo?.total_items }} sản phẩm đã QC đạt ·
              <button type="button" class="font-medium text-primary hover:underline" @click="reprintBasket(itemBasket)">In lại tem giỏ</button>
            </p>
          </div>
        </div>
        <div
          v-else-if="needsBasket"
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 p-4 dark:border-amber-500/60 dark:bg-amber-500/10"
        >
          <div class="min-w-0 text-sm text-foreground">
            <p class="font-bold">Đơn có {{ basketInfo?.total_items }} sản phẩm — mới QC đạt {{ basketInfo?.passed_items }}</p>
            <p class="text-xs text-muted-foreground">Cần giỏ chờ để gom hàng. Bấm PASS là tự tạo giỏ (số trống thấp nhất) và hiện tem giỏ để in.</p>
          </div>
          <button v-if="canJudge && basketInfo" class="btn-secondary" :disabled="creatingBasket" @click="createBasket(basketInfo.order_id)">
            <UiSpinner v-if="creatingBasket" :size="14" /><UiIcon v-else name="box" :size="16" /> Tạo giỏ chờ
          </button>
        </div>
        <!-- Ghi chú đơn: để trên cùng, to, đổi màu — đơn có ghi chú là đơn khác thường. -->
        <div
          v-if="orderNote"
          class="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-500/60 dark:bg-amber-500/10"
          role="alert"
        >
          <p class="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            <UiIcon name="alert" :size="18" /> Đơn có ghi chú — đọc kỹ trước khi QC
          </p>
          <p class="mt-2 whitespace-pre-line break-words text-xl font-semibold leading-snug text-amber-900 dark:text-amber-100">
            {{ orderNote }}
          </p>
          <button v-if="!noteAcked" class="btn-secondary mt-3" @click="noteAcked = true">Đã đọc ghi chú</button>
          <p v-else class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Đã đọc ghi chú</p>
        </div>

        <div class="card p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-mono text-lg font-semibold text-foreground">{{ result.item_code }}</p>
              <p class="text-sm text-muted-foreground">
                {{ result.order_code }} · {{ result.store_order_id }}
              </p>
            </div>
            <UiStatusBadge kind="internal" :value="result.internal_status" />
          </div>

          <!-- Tên sản phẩm (lấy từ SKU master data) và mô tả NVL của SKU
               (spec vật liệu/kích thước) tách 2 dòng, chữ to để QC đứng xa
               vẫn đọc được khi đối chiếu hàng thật. -->
          <div v-if="productName || result.material_description" class="mt-4 space-y-1">
            <p v-if="productName" class="break-words text-2xl font-bold leading-tight text-foreground">
              {{ productName }}
            </p>
            <p v-if="result.material_description" class="break-words text-lg font-medium leading-snug text-foreground/80">
              {{ result.material_description }}
            </p>
          </div>
          <!-- Cả ba nguồn mô tả đều trống thì nói ra, thay vì im lặng như thể màn
               hình không có chỗ hiện mô tả. Mô tả là dữ liệu Master data, không
               phải thứ trạm QC tự sinh ra. -->
          <p
            v-if="!result.material_description && !result.sku_description && !result.qc_description"
            class="mt-1 text-xs text-muted-foreground"
          >
            Chưa có mô tả chi tiết — nhập ở Master data (mô tả SKU hoặc mô tả Loại VL).
          </p>

          <!-- Thông tin cấu trúc để QC đối chiếu với hàng thực tế.
               Các trường quan trọng luôn hiển thị ngay, bỏ qua trường trống. -->
          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <!-- SKU to đậm ngang ô Số lượng: QC đối chiếu SKU với hàng thật nên phải
                 đọc được từ xa. Không dùng font-mono vì số 0 có gạch chéo dễ đọc nhầm. -->
            <div v-if="result.sku_code">
              <dt class="label">SKU</dt>
              <dd class="break-all text-2xl font-bold leading-tight tracking-tight text-foreground">{{ result.sku_code }}</dd>
            </div>
            <!-- Số lượng là ô hay đọc nhầm nhất (2 cái mà QC chỉ soi 1), nên để số
                 to hẳn; khác 1 thì đổi màu cảnh báo cho đập vào mắt. -->
            <div v-if="result.quantity != null">
              <dt class="label">Số lượng</dt>
              <dd
                class="text-2xl font-bold leading-tight tabular-nums"
                :class="result.quantity > 1 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'"
              >
                {{ result.quantity }}
                <span v-if="result.quantity > 1" class="text-xs font-semibold">— đủ {{ result.quantity }} cái</span>
              </dd>
            </div>
            <div v-if="result.material_name">
              <dt class="label">Loại VL</dt>
              <dd class="text-foreground">{{ result.material_name }}</dd>
            </div>
            <div v-if="result.image_code">
              <dt class="label">Mã ảnh</dt>
              <dd class="font-mono text-foreground">{{ result.image_code }}</dd>
            </div>
          </dl>

          <!-- Nội dung khắc — nổi bật để QC đối chiếu chính xác từng ký tự -->
          <div v-if="result.engrave_text" class="mt-3">
            <p class="label">Nội dung khắc</p>
            <p class="rounded-md bg-amber-50 px-3 py-2 font-mono text-base font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200 whitespace-pre-line break-words">
              {{ result.engrave_text }}
            </p>
          </div>

          <!-- Mô tả hiện thẳng, không gập lại và không nhãn: ở xưởng không ai bấm
               mở từng ô để đọc, mà mô tả chính là thứ dùng để đối chiếu hàng. Dài
               thì cứ để dài, thà cuộn còn hơn bỏ sót. -->
          <p
            v-if="result.qc_description"
            class="mt-3 whitespace-pre-line break-words rounded-md border border-border bg-muted px-3 py-2 text-lg font-semibold leading-snug text-foreground"
          >
            {{ result.qc_description }}
          </p>
          <!-- Chỉ một khối mô tả: có mô tả viết riêng cho QC thì dùng nó, không thì
               lấy mô tả catalog. Hai khối chữ to giống hệt nhau nằm cạnh nhau chỉ
               tổ làm người quét phải đọc hai lần cùng một thứ. -->
          <p
            v-else-if="result.sku_description"
            class="mt-3 whitespace-pre-line break-words rounded-md border border-border bg-muted px-3 py-2 text-lg font-semibold leading-snug text-foreground"
          >
            {{ result.sku_description }}
          </p>

          <!-- File in/cắt & link design — hiển thị link nào có, bỏ qua link trống -->
          <div class="mt-4 border-t border-border pt-3">
            <p class="label">File &amp; Design</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <a v-if="result.design_url" :href="result.design_url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> Design (mặt trước)</a>
              <a v-if="result.back_design_url" :href="result.back_design_url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> Design (mặt sau)</a>
              <UiMockupLink :url="result.mockup_url" small label="Mockup" />
              <a v-if="result.print_file_url" :href="result.print_file_url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> File in</a>
              <a v-if="result.cut_file_url" :href="result.cut_file_url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline"><UiIcon name="link" :size="13" /> File cắt</a>
            </div>
          </div>

          <div v-if="parts.length" class="mt-4 border-t border-border pt-3">
            <p class="mb-2 text-xs font-medium text-muted-foreground">
              Các phần NVL của sản phẩm ({{ parts.length }}) — QC 1 lần cho cả sản phẩm
            </p>
            <div class="flex flex-wrap gap-2">
              <NuxtLink
                v-for="b in parts"
                :key="b.batch_item_id"
                :to="`/batches/${b.batch_code.replace('#', '')}`"
                class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                {{ b.batch_code }} · {{ b.material_code }}
                <UiStatusBadge kind="internal" :value="b.status" />
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Checklist -->
        <div class="card p-5">
          <div
            v-if="alreadyQC"
            class="mb-4 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          >
            <UiIcon name="check" :size="18" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">Item này đã QC rồi</p>
              <p class="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90">
                Không cần quét lại. Quay về đơn hoặc quét mã khác để tiếp tục.
              </p>
            </div>
          </div>
          <p class="mb-3 text-sm text-muted-foreground">
            Đối chiếu thành phẩm với mockup chuẩn bằng mắt, rồi bấm PASS hoặc ghi lỗi.
            QC làm <span class="font-medium text-foreground">1 lần cho cả sản phẩm</span> (mọi NVL), không QC lẻ từng NVL.
          </p>

          <div
            v-if="notProducedYet && !alreadyQC"
            class="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <UiIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">Sản phẩm chưa cắt xong</p>
              <p class="mt-0.5 text-xs">
                Còn {{ notReadyParts.length }} phần NVL chưa đạt “Đã cắt” (còn Chờ xử lý hoặc mới in). Cắt xong toàn bộ NVL rồi mới QC được.
              </p>
            </div>
          </div>

          <p v-if="!canJudge" class="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Tài khoản chỉ có quyền xem ở trạm QC — quét để tra thông tin, không bấm Pass / Fail được.
          </p>
          <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              class="btn-success"
              :disabled="alreadyQC || notProducedYet || mustAckNote"
              :title="alreadyQC ? 'Item đã QC rồi' : (notProducedYet ? 'Còn NVL chưa cắt xong' : (mustAckNote ? 'Đọc ghi chú đơn và bấm “Đã đọc ghi chú” trước' : ''))"
              @click="pass"
            >
              <UiIcon name="check" :size="16" /> {{ alreadyQC ? 'Đã QC' : needsBasket ? 'PASS + vào giỏ chờ' : 'PASS — Đã QC' }}
            </button>
            <button
              class="btn-danger"
              :disabled="failing"
              :title="alreadyQC ? 'Sản phẩm đã QC — ghi lỗi sẽ huỷ phần đã sản xuất và trả về làm lại' : ''"
              @click="openFail"
            >
              <UiIcon name="alert" :size="16" /> FAIL — Ghi lỗi
            </button>
          </div>
          <!-- Bấm nhầm PASS thì hàng vẫn tốt: mở lại cổng, đừng huỷ hàng. -->
          <button v-if="canUndoQC" class="btn-secondary mt-2 w-full" :disabled="undoing" @click="openUndo">
            <UiSpinner v-if="undoing" :size="16" />
            <UiIcon v-else name="refresh" :size="16" /> Hạ QC (bấm nhầm — hàng vẫn tốt)
          </button>
          <button class="btn-secondary mt-2 w-full" @click="clearStation">
            {{ order ? `← Về đơn ${order.internal_code} (bỏ qua sản phẩm này)` : 'Bỏ qua / Quét mã khác' }}
          </button>
        </div>
      </div>
    </div>
    </template>

    <BasketDialog v-model="basketDialog" :basket="dialogBasket" :mode="basketDialogMode" />

    <!-- Fail modal -->
    <UiModal v-model="failOpen" title="Ghi nhận lỗi QC">
      <div class="space-y-3">
        <p class="text-sm text-foreground">
          Item <span class="font-mono font-semibold">{{ result?.item_code }}</span>: phần đã sản xuất
          sẽ bị huỷ (vẫn lưu ở batch cũ để truy vết), hệ thống mở note theo dõi và trả sản phẩm về để
          làm lại.
        </p>
        <div
          v-if="alreadyQC"
          class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <p class="font-semibold">Sản phẩm này đã QC PASS rồi.</p>
          <p class="mt-0.5">
            Ghi lỗi ở đây là huỷ hàng thật: phần được chọn bị huỷ, các phần NVL còn lại của sản phẩm
            được hạ khỏi “đã QC”, và đây tính là một lần làm lại. Nếu chỉ là BẤM NHẦM PASS thì đóng
            hộp thoại này và dùng “Hạ QC”.
          </p>
        </div>
        <div>
          <label class="label">Loại lỗi</label>
          <UiSelect v-model="defect.defect_code" :options="DEFECT_CODE_OPTIONS" aria-label="Loại lỗi" />
        </div>
        <div v-if="partOptions.length > 1">
          <label class="label">Phần NVL bị lỗi</label>
          <UiSelect
            v-model="defect.batch_item_id"
            :options="partOptions"
            placeholder="Chọn phần bị lỗi…"
            aria-label="Phần NVL bị lỗi"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Sản phẩm combo: chỉ phần được chọn bị huỷ và làm lại, phần đạt giữ nguyên.
          </p>
        </div>
        <div>
          <label class="label">Trả về đâu để làm lại</label>
          <UiSelect v-model="defect.rework_route" :options="routeOptions" aria-label="Hướng xử lý" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Lỗi từ file design thì phải sửa file trước, nếu không lần in lại sẽ hỏng y hệt.
          </p>
        </div>
        <div>
          <label class="label">Ghi chú (tuỳ chọn)</label>
          <textarea v-model="defect.note" rows="3" class="input" placeholder="Mô tả chi tiết lỗi…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="failOpen = false">Huỷ</button>
        <button class="btn-danger" :disabled="failing" @click="submitFail">
          <UiSpinner v-if="failing" :size="16" /> Xác nhận lỗi
        </button>
      </template>
    </UiModal>

    <!-- Hạ QC: chỉ dành cho ca bấm nhầm -->
    <UiModal v-model="undoOpen" title="Hạ QC đã bấm nhầm">
      <div class="space-y-3">
        <p class="text-sm text-foreground">
          Sản phẩm <span class="font-mono font-semibold">{{ result?.item_code }}</span> sẽ quay về
          “Đã cắt” để QC lại. Không tấm nào bị huỷ, không tính là một lần làm lại, không đụng tới
          file design.
        </p>
        <div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Chỉ dùng khi hàng VẪN TỐT và chỉ là bấm nhầm. Hàng hỏng thật thì dùng “FAIL — Ghi lỗi”
          (một sản phẩm) hoặc “Huỷ batch” ở màn batch (cả tấm) — nếu không, tấm hỏng sẽ không được
          ghi nhận ở đâu cả.
        </div>
        <div>
          <label class="label" for="qc-undo-reason">Lý do (tuỳ chọn)</label>
          <input
            id="qc-undo-reason"
            v-model="undoReason"
            class="input"
            maxlength="60"
            placeholder="VD: quét nhầm mã sản phẩm bên cạnh"
            @keyup.enter="submitUndo"
          />
          <p class="mt-1 text-right text-[11px] text-muted-foreground">{{ undoReason.trim().length }}/60</p>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="undoOpen = false">Đóng</button>
        <button class="btn-primary" :disabled="undoing || !undoReasonValid" @click="submitUndo">
          <UiSpinner v-if="undoing" :size="16" /> Hạ QC
        </button>
      </template>
    </UiModal>
  </div>
</template>
