<script setup lang="ts">
import { qcApi, handoffsApi, carrierApi } from '~/services/api'
import type { ShipToCarrierResult, ShipOptions } from '~/services/api/handoffs'
import type { THEPreflight } from '~/services/api/carrier'
import { printTHELabels } from '~/utils/theLabels'
import type { QcResultOrder } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useSelection } from '~/composables/useSelection'
import { useConfirm } from '~/composables/useConfirm'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { useAuthStore } from '~/stores/auth'

// Quét gửi cho THE = "Thao tác" màn Chờ gửi hàng; chỉ Xem thì xem danh sách.
const canShip = computed(() => useAuthStore().can('ship_queue.manage'))

// Chờ gửi hàng — điểm nối giữa hai nửa vòng đời của đơn.
//
//   QC là việc cuối của xưởng. Xong QC, đơn rơi vào màn này.
//   Người phụ trách bấm "Quét gửi hàng" rồi quét QR trên từng đơn:
//   quét là gửi — mã nội bộ vừa đọc được chính là lệnh gửi đơn đó cho THE.
//   Từ đó đơn sang màn Hành trình đơn hàng để CS gắn mã vận đơn.
//
// HAI đường gửi, vì có hai hoàn cảnh thật khác nhau:
//
//   • Quét QR — người đứng trạm cầm chồng đơn giấy, quét tờ nào gửi tờ ấy. Nhanh
//     và gần như không thể gửi nhầm đơn, vì mã đọc từ chính tờ đang cầm.
//   • Tick rồi gửi hàng loạt — chỗ không có máy quét (quán/văn phòng), hoặc khi
//     cần tống cả hàng đợi đi một lệnh thay vì quét từng cái.
//
// Giữ cả hai chứ không chọn một: ép nơi không có máy quét phải quét là bắt họ
// ngồi gõ tay từng mã, còn bỏ quét thì trạm xưởng mất đường nhanh nhất.

const toast = useToastStore()

const filters = reactive({ q: '', page: 1, page_size: 20 })

const { data, meta, loading, error, reload } = useApiResource(() =>
  qcApi.results({
    state: 'done',
    handed_over: false,
    q: filters.q.trim() || undefined,
    page: filters.page,
    page_size: filters.page_size,
  }),
)
const orders = computed<QcResultOrder[]>(() => data.value?.orders ?? [])

// "QC xong lúc" = lần QC muộn nhất trong các sản phẩm của đơn: màn này chỉ liệt kê
// đơn đã đạt hết, nên lần kiểm cuối cùng chính là lúc đơn QC xong. Bản cũ hiện
// created_at của ĐƠN (giờ import) dưới nhãn này, nên xưởng thấy "QC 14/9" cho đơn
// QC hôm nay. Giờ này do máy chủ ghi, không phụ thuộc đồng hồ máy ở xưởng.
function qcDoneAt(o: QcResultOrder): string | undefined {
  let latest: string | undefined
  for (const it of o.items ?? []) {
    const at = it.last_checked_at
    if (at && (!latest || new Date(at) > new Date(latest))) latest = at
  }
  return latest
}

function applyFilters() {
  filters.page = 1
  clearSelection()
  reload()
}
function changePage(p: number) {
  filters.page = p
  clearSelection()
  reload()
}
function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1
  clearSelection()
  reload()
}
function resetSearch() {
  filters.q = ''
  applyFilters()
}

// ---- Chọn nhiều + gửi hàng loạt ---------------------------------------------
// Chỉ tick được trong trang đang xem; đổi trang hay đổi bộ lọc là bỏ chọn, để
// không bao giờ gửi đi thứ mình không nhìn thấy. Muốn gửi cả hàng đợi thì có nút
// "chọn tất cả N đơn" riêng, bấm có ý thức.
const selectionRows = computed(() => orders.value.map((o) => ({ id: o.order_id })))
const { isSelected, toggle, rowClick, allSelected, someSelected, toggleAll, clear: clearSelection, selectedIds, count } =
  useSelection(() => selectionRows.value)

const shipping = ref(false)
const selectingAll = ref(false)
/** Kết quả lượt gửi gần nhất — giữ trên màn để soát, toast thì trôi mất. */
const lastResult = ref<ShipToCarrierResult | null>(null)

const totalMatching = computed(() => meta.value?.total ?? orders.value.length)
const hasMoreThanPage = computed(() => totalMatching.value > orders.value.length)

/** Tick luôn mọi đơn khớp bộ lọc, kể cả trang sau. */
async function selectAllMatching() {
  if (selectingAll.value) return
  selectingAll.value = true
  try {
    const { data } = await qcApi.results({
      state: 'done',
      handed_over: false,
      q: filters.q.trim() || undefined,
      page: 1,
      // -1 = lấy tất cả (quy ước phân trang của API), không phải 200 dòng đầu.
      page_size: -1,
    })
    const all = data?.orders ?? []
    clearSelection()
    for (const o of all) toggle(o.order_id)
    toast.info(`Đã chọn ${all.length} đơn khớp bộ lọc.`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    selectingAll.value = false
  }
}

// Máy chủ chặn quá 200 đơn mỗi lệnh, nên chia lô ở đây rồi gộp kết quả lại —
// người dùng chỉ thấy một lần bấm, một bản tổng kết. Khi kết nối THE đang bật,
// mỗi đơn là vài lời gọi THE (tạo + chốt đơn, có khi tới cả phút) nên chia lô
// 10 đơn và hiện tiến độ, thay vì một request treo vài phút.
const SHIP_CHUNK = 200
const THE_CHUNK = 10

// ---- Kết nối THE -------------------------------------------------------------
// Bấm gửi khi kết nối THE bật: kiểm tra trước (không tốn tiền) → hộp xác nhận
// nêu số đơn sẵn sàng / bị giữ lại + số dư ví → mới tạo đơn THE thật.
const preflight = ref<THEPreflight | null>(null)
const confirmOpen = ref(false)
const progress = ref<{ done: number; total: number } | null>(null)
const readyIds = computed(() => (preflight.value?.orders ?? []).filter((o) => o.ready).map((o) => o.order_id))
const blockedOrders = computed(() => (preflight.value?.orders ?? []).filter((o) => !o.ready))
const paidAlready = computed(() => (preflight.value?.orders ?? []).filter((o) => o.already_paid).length)

async function shipSelected() {
  const ids = selectedIds.value
  if (!ids.length || shipping.value) return
  shipping.value = true
  try {
    const { data: pf } = await carrierApi.preflight(ids.slice(0, SHIP_CHUNK))
    if (pf.enabled) {
      if (pf.problem && !pf.orders.length) {
        toast.error(pf.problem)
        return
      }
      preflight.value = pf
      confirmOpen.value = true
      return
    }
  } catch (e) {
    toast.error(errorMessage(e))
    return
  } finally {
    shipping.value = false
  }
  // Kết nối THE đang tắt: như trước — ghi nhận bàn giao.
  const ok = await useConfirm().confirm({
    title: 'Gửi đơn cho THE',
    message:
      `Gửi ${ids.length} đơn đã chọn cho THE? Sau khi gửi, đơn rời hàng đợi này và sang màn ` +
      'Hành trình đơn hàng để CS gắn mã vận đơn. Đơn nào chưa QC đủ sẽ bị bỏ qua kèm lý do.',
    confirmText: `Gửi ${ids.length} đơn`,
  })
  if (!ok) return
  await send(ids, {}, SHIP_CHUNK)
}

/** Xác nhận trong hộp THE: tạo đơn THE cho các đơn sẵn sàng. */
async function confirmTHE() {
  confirmOpen.value = false
  await send(readyIds.value, {}, THE_CHUNK)
}

/** Ghi nhận bàn giao KHÔNG tạo đơn THE — cho đơn THE không nhận qua API. */
async function sendManual(ids: number[]) {
  const ok = await useConfirm().confirm({
    title: 'Chỉ ghi nhận bàn giao',
    message:
      `Ghi nhận ${ids.length} đơn đã bàn giao cho THE mà KHÔNG tạo đơn trên THE qua API ` +
      '(không có label, không tự gắn mã). Chỉ dùng cho đơn đã tạo trên THE bằng cách khác.',
    confirmText: 'Ghi nhận',
  })
  if (!ok) return
  confirmOpen.value = false
  await send(ids, { manual_handoff: true }, SHIP_CHUNK)
}

/** Gửi lại các đơn trượt kiểm tra địa chỉ, bỏ qua kiểm tra (địa chỉ đã soát tay). */
async function resendSkippingAddress(ids: number[]) {
  const ok = await useConfirm().confirm({
    title: 'Gửi bỏ qua kiểm tra địa chỉ',
    message:
      `Gửi ${ids.length} đơn mà không kiểm tra địa chỉ với USPS. Chỉ làm khi đã xem kỹ địa chỉ: ` +
      'địa chỉ sai thì kiện có thể bị trả về và vẫn mất cước.',
    confirmText: `Gửi ${ids.length} đơn`,
  })
  if (!ok) return
  await send(ids, { skip_address_check: true }, THE_CHUNK)
}

async function send(ids: number[], opts: ShipOptions, chunk: number) {
  if (!ids.length || shipping.value) return
  shipping.value = true
  const merged: ShipToCarrierResult = { shipped: [], skipped: [] }
  progress.value = { done: 0, total: ids.length }
  try {
    for (let i = 0; i < ids.length; i += chunk) {
      const part = ids.slice(i, i + chunk)
      const { data } = await handoffsApi.shipToCarrier(part, opts)
      merged.shipped.push(...(data?.shipped ?? []))
      merged.skipped.push(...(data?.skipped ?? []))
      progress.value = { done: Math.min(i + part.length, ids.length), total: ids.length }
    }
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    lastResult.value = merged
    if (merged.shipped.length) toast.success(`Đã gửi ${merged.shipped.length} đơn cho THE.`)
    if (merged.skipped.length) {
      toast.error(`${merged.skipped.length} đơn không gửi được — xem lý do bên dưới bảng.`)
    }
    progress.value = null
    shipping.value = false
    clearSelection()
    reload()
  }
}

// ---- In label ------------------------------------------------------------------
const printing = ref(false)
const labelOrders = computed(() =>
  (lastResult.value?.shipped ?? []).filter((s) => s.the?.has_label).map((s) => ({ id: s.order_id, code: s.internal_code })),
)
const addressSkipped = computed(() => (lastResult.value?.skipped ?? []).filter((s) => s.code === 'ADDRESS'))

async function printLabels(orders: Array<{ id: number; code?: string }>) {
  if (!orders.length || printing.value) return
  printing.value = true
  try {
    const res = await printTHELabels(orders)
    if (res.failed.length) toast.error(`${res.failed.length} label chưa tải được — in lại từ chi tiết đơn.`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    printing.value = false
  }
}

const SKIP_HINT: Record<string, string> = {
  DATA: 'Sửa dữ liệu đơn / SKU rồi gửi lại',
  ADDRESS: 'Kiểm tra địa chỉ, hoặc gửi bỏ qua kiểm tra',
  THE: 'THE từ chối',
  WAIT: 'Đợi rồi gửi lại — an toàn, không trừ tiền 2 lần',
  UNCLEAR: 'Gửi lại sau — hệ thống tự đối chiếu với THE',
}

// ---- Trạm quét gửi hàng ------------------------------------------------------
// Máy quét là bàn phím: bắn chuỗi mã + Enter vào ô input. Vào chế độ quét thì ô
// này giữ focus liên tục — quét phát nào ăn phát đó, không cần chạm chuột.
const scanMode = ref(false)
const code = ref('')
const scanInput = ref<HTMLInputElement | null>(null)

function focusScan() {
  nextTick(() => scanInput.value?.focus())
}
function startScan() {
  scanMode.value = true
  focusScan()
}
function stopScan() {
  scanMode.value = false
  code.value = ''
}

// Nhật ký phiên quét: người đứng trạm cầm chồng đơn, quét liên tục — toast trôi
// mất, còn danh sách này giữ lại từng kết quả (gửi được / vì sao không) để soát.
interface ScanLogEntry {
  key: number
  code: string
  ok: boolean
  time: string
  internal_code?: string
  store_order_id?: string
  handoff_code?: string
  order_id?: number
  the_tracking?: string
  has_label?: boolean
  reason?: string
}
const scanLog = ref<ScanLogEntry[]>([])
const shippedCount = computed(() => scanLog.value.filter((e) => e.ok).length)
let logKey = 0

function timeNow() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Không khoá input trong lúc chờ server: bắt trạm chạy theo tốc độ đường truyền
// là mỗi đơn tốn thêm cả giây nhìn spinner. Mỗi lần quét bắn một request chạy
// nền, kết quả về thì ghi vào nhật ký + toast; mã đang bay thì chặn quét trùng
// (máy quét hay bắn đúp) — server cũng tự chặn gửi lại đơn đã gửi.
const pending = ref<string[]>([])

function submitScan() {
  const value = code.value.trim()
  code.value = ''
  focusScan()
  if (!value || pending.value.includes(value)) return

  pending.value.push(value)
  handoffsApi
    .shipScan(value)
    .then(({ data: res }) => {
      scanLog.value.unshift({
        key: ++logKey, code: value, ok: true, time: timeNow(),
        internal_code: res?.internal_code, store_order_id: res?.store_order_id,
        handoff_code: res?.handoff_code, order_id: res?.order_id,
        the_tracking: res?.the?.tracking_code, has_label: res?.the?.has_label,
      })
      toast.success(`Đã gửi đơn ${res?.internal_code ?? value} cho THE`)
      void reload()
    })
    .catch((e) => {
      scanLog.value.unshift({
        key: ++logKey, code: value, ok: false, time: timeNow(), reason: errorMessage(e),
      })
      toast.error(`${value}: ${errorMessage(e)}`)
    })
    .finally(() => {
      const i = pending.value.indexOf(value)
      if (i !== -1) pending.value.splice(i, 1)
      // Nhật ký là để soát phiên đang làm, không phải lịch sử — giữ 50 dòng gần nhất.
      if (scanLog.value.length > 50) scanLog.value.splice(50)
    })
}
</script>

<template>
  <div>
    <PageHeader
      title="Chờ gửi hàng"
      subtitle="Đơn đã QC đủ và chưa gửi — tick chọn rồi gửi hàng loạt, hoặc bấm Quét gửi hàng để quét QR từng đơn"
    >
      <template #actions>
        <button class="btn-secondary" @click="reload">
          <UiIcon name="refresh" :size="16" /> Làm mới
        </button>
        <button v-if="!scanMode && canShip" class="btn-primary" @click="startScan">
          <UiIcon name="qc" :size="16" /> Quét gửi hàng
        </button>
        <button v-else class="btn-secondary" @click="stopScan">
          <UiIcon name="close" :size="16" /> Dừng quét
        </button>
      </template>
    </PageHeader>

    <!-- Trạm quét -->
    <div v-if="scanMode" class="card mb-4 border-primary/40 p-4 ring-1 ring-primary/30">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="submitScan">
        <div class="flex-1">
          <label class="label" for="ship-scan">Quét QR trên đơn (mã nội bộ)</label>
          <input
            id="ship-scan"
            ref="scanInput"
            v-model="code"
            class="input font-mono text-base"
            placeholder="Quét hoặc nhập mã rồi Enter — đơn sẽ gửi đi ngay…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary sm:w-44" :disabled="!code.trim()">
          <UiIcon name="shipping" :size="16" /> Gửi cho THE
        </button>
      </form>

      <!-- Request chạy nền nên trạm trống ngay; dòng này để việc đang chạy không vô hình. -->
      <p v-if="pending.length" class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <UiSpinner :size="14" />
        Đang gửi: <span class="font-mono">{{ pending.join(', ') }}</span>
      </p>

      <!-- Nhật ký phiên quét -->
      <div v-if="scanLog.length" class="mt-4 border-t border-border pt-3">
        <p class="mb-2 text-xs font-medium text-muted-foreground">
          Phiên quét này: <span class="font-semibold text-emerald-700 dark:text-emerald-300">{{ shippedCount }}</span> đơn đã gửi
          <template v-if="scanLog.length - shippedCount > 0">
            · <span class="font-semibold text-red-700 dark:text-rose-300">{{ scanLog.length - shippedCount }}</span> lượt quét lỗi
          </template>
        </p>
        <ul class="max-h-64 space-y-1 overflow-y-auto pr-1">
          <li
            v-for="entry in scanLog"
            :key="entry.key"
            class="flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm"
            :class="entry.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-rose-500/10 dark:text-rose-300'"
          >
            <UiIcon :name="entry.ok ? 'check' : 'alert'" :size="15" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="font-mono font-semibold">{{ entry.internal_code || entry.code }}</span>
              <template v-if="entry.ok">
                <span v-if="entry.store_order_id"> · {{ entry.store_order_id }}</span>
                — đã gửi cho THE<span v-if="entry.the_tracking" class="font-mono text-xs"> · {{ entry.the_tracking }}</span>
                <span v-else-if="entry.handoff_code" class="font-mono text-xs"> ({{ entry.handoff_code }})</span>
                <button
                  v-if="entry.has_label && entry.order_id"
                  class="ml-2 rounded bg-white/70 px-1.5 py-0.5 text-xs font-medium text-emerald-800 hover:bg-white dark:bg-white/10 dark:text-emerald-200"
                  :disabled="printing"
                  @click="printLabels([{ id: entry.order_id, code: entry.internal_code }])"
                >
                  In label
                </button>
              </template>
              <template v-else> — {{ entry.reason }}</template>
            </span>
            <span class="shrink-0 text-xs opacity-70">{{ entry.time }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="card mb-4 p-4">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-center" @submit.prevent="applyFilters">
        <div class="relative flex-1">
          <UiIcon
            name="search"
            :size="16"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="filters.q"
            class="input pl-9"
            placeholder="Mã đơn shop, mã nội bộ, mã sản phẩm hoặc SKU…"
          />
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn-primary" :disabled="loading">
            <UiSpinner v-if="loading" :size="16" />
            <UiIcon v-else name="search" :size="16" />
            Tìm
          </button>
          <button type="button" class="btn-secondary" @click="resetSearch">Xoá lọc</button>
        </div>
      </form>
    </div>

    <div class="card overflow-hidden">
      <!-- Thanh thao tác: chỉ hiện khi có dòng được tick -->
      <UiBulkBar :count="count" noun="đơn" @clear="clearSelection">
        <template #note>
          <button
            v-if="hasMoreThanPage"
            class="table-action text-primary"
            :disabled="selectingAll"
            @click="selectAllMatching"
          >
            <UiSpinner v-if="selectingAll" :size="13" />
            Chọn tất cả {{ totalMatching }} đơn khớp bộ lọc
          </button>
        </template>
        <button class="btn-primary px-3 py-1.5 text-xs" :disabled="shipping" @click="shipSelected">
          <UiSpinner v-if="shipping" :size="14" />
          <UiIcon v-else name="shipping" :size="14" />
          <template v-if="progress">Đang gửi {{ progress.done }}/{{ progress.total }}…</template>
          <template v-else>Gửi {{ count }} đơn cho THE</template>
        </button>
      </UiBulkBar>

      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && orders.length === 0"
        empty-text="Không có đơn nào chờ gửi. Đơn sẽ xuất hiện ở đây ngay khi QC đủ sản phẩm."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th v-if="canShip" class="table-th w-10">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                    :checked="allSelected"
                    :indeterminate.prop="someSelected"
                    aria-label="Chọn tất cả đơn trong trang"
                    @change="toggleAll"
                  />
                </th>
                <th class="table-th">Mã đơn shop</th>
                <th class="table-th">Mã nội bộ</th>
                <th class="table-th hidden md:table-cell">Seller</th>
                <th class="table-th">Sản phẩm</th>
                <th class="table-th hidden sm:table-cell">QC xong lúc</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="o in orders"
                :key="o.order_id"
                class="transition-colors hover:bg-muted/60"
                :class="isSelected(o.order_id) ? 'bg-primary/5' : ''"
                @click="canShip && rowClick(o.order_id, $event)"
              >
                <td v-if="canShip" class="table-td">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                    :checked="isSelected(o.order_id)"
                    :aria-label="`Chọn đơn ${o.store_order_id}`"
                    @change="toggle(o.order_id)"
                  />
                </td>
                <td class="table-td font-medium text-foreground">{{ o.store_order_id }}</td>
                <td class="table-td font-mono text-xs text-muted-foreground">{{ o.internal_code }}</td>
                <td class="table-td hidden text-muted-foreground md:table-cell">{{ o.seller_name || '—' }}</td>
                <td class="table-td">
                  <span class="text-emerald-700 dark:text-emerald-300">{{ o.passed_items }}</span>
                  <span class="text-muted-foreground">/{{ o.total_items }} đã QC</span>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">
                  {{ formatDateTime(qcDoneAt(o)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination
          :meta="meta"
          :page-size="filters.page_size"
          @change="changePage"
          @update:page-size="changePageSize"
        />
      </UiStateBlock>
    </div>

    <!-- Kết quả lượt gửi gần nhất. Đơn bị bỏ qua phải nêu đích danh kèm lý do:
         bấm một nút gửi 50 đơn mà chỉ nói "xong" thì không ai biết 3 đơn nào rơi. -->
    <div v-if="lastResult" class="card mt-4 p-4">
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-foreground">Kết quả lượt gửi vừa rồi</p>
        <button class="table-action text-muted-foreground" @click="lastResult = null">Đóng</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm text-muted-foreground">
          <span class="font-semibold text-emerald-700 dark:text-emerald-300">{{ lastResult.shipped.length }}</span>
          đơn đã gửi cho THE<template v-if="lastResult.skipped.length">
            · <span class="font-semibold text-red-700 dark:text-rose-300">{{ lastResult.skipped.length }}</span>
            đơn bị bỏ qua</template>
        </p>
        <span class="flex-1" />
        <button v-if="labelOrders.length" class="btn-primary px-3 py-1.5 text-xs" :disabled="printing" @click="printLabels(labelOrders)">
          <UiSpinner v-if="printing" :size="14" />
          <UiIcon v-else name="print" :size="14" />
          In {{ labelOrders.length }} label THE
        </button>
        <button
          v-if="addressSkipped.length && canShip"
          class="btn-secondary px-3 py-1.5 text-xs"
          :disabled="shipping"
          @click="resendSkippingAddress(addressSkipped.map((x) => x.order_id))"
        >
          Gửi lại {{ addressSkipped.length }} đơn, bỏ qua kiểm tra địa chỉ
        </button>
      </div>
      <ul v-if="lastResult.shipped.some((x) => x.the)" class="mt-2 max-h-40 space-y-1 overflow-y-auto">
        <li
          v-for="sh in lastResult.shipped.filter((x) => x.the)"
          :key="sh.order_id"
          class="flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          <UiIcon name="check" :size="13" class="shrink-0" />
          <span class="font-mono font-semibold">{{ sh.internal_code }}</span>
          <span class="font-mono">{{ sh.the?.tracking_code }}</span>
          <span v-if="sh.the?.last_mile_tracking" class="font-mono opacity-80">· {{ sh.the.last_mile_tracking }}</span>
          <span v-if="sh.the?.cost" class="opacity-80">· ${{ sh.the.cost.toFixed(2) }}</span>
          <span v-if="sh.the?.reused" class="opacity-80">· đã có đơn THE từ trước</span>
        </li>
      </ul>
      <ul v-if="lastResult.skipped.length" class="mt-2 max-h-56 space-y-1 overflow-y-auto">
        <li
          v-for="sk in lastResult.skipped"
          :key="sk.order_id"
          class="flex items-start gap-2 rounded-md bg-red-50 px-2.5 py-1.5 text-sm text-red-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <UiIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="font-mono font-semibold">{{ sk.internal_code || sk.order_id }}</span> — {{ sk.reason }}
            <span v-if="sk.code && SKIP_HINT[sk.code]" class="block text-xs opacity-80">{{ SKIP_HINT[sk.code] }}</span>
          </span>
          <button
            v-if="sk.code === 'ADDRESS' && canShip"
            class="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-xs font-medium hover:bg-white dark:bg-white/10"
            :disabled="shipping"
            @click="resendSkippingAddress([sk.order_id])"
          >
            Gửi bỏ qua kiểm tra
          </button>
        </li>
      </ul>
    </div>

    <!-- Xác nhận trước khi tạo đơn THE thật (trừ tiền ví THE). -->
    <UiModal v-model="confirmOpen" title="Tạo đơn trên THE" wide>
      <div v-if="preflight" class="space-y-3 text-sm">
        <p v-if="preflight.problem" class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {{ preflight.problem }}
        </p>
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-md bg-emerald-50 p-2 dark:bg-emerald-500/10">
            <p class="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{{ preflight.ready }}</p>
            <p class="text-[11px] text-muted-foreground">Đơn sẵn sàng<template v-if="paidAlready"> ({{ paidAlready }} đã có đơn THE)</template></p>
          </div>
          <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ preflight.blocked }}</p>
            <p class="text-[11px] text-muted-foreground">Bị giữ lại</p>
          </div>
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">
              {{ preflight.balance != null ? '$' + preflight.balance.toFixed(2) : '—' }}
            </p>
            <p class="text-[11px] text-muted-foreground">Số dư ví THE</p>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          Mỗi đơn sẵn sàng sẽ được tạo và chốt trên THE — <b class="text-foreground">THE trừ tiền ví lúc chốt</b>, mỗi đơn một lần.
          Địa chỉ đơn đi Mỹ được kiểm với USPS trước; đơn trượt sẽ được giữ lại kèm lý do. Xong là in label ngay tại đây.
        </p>
        <p v-if="count > 200" class="text-xs text-amber-700 dark:text-amber-300">Mỗi lần chỉ xử lý 200 đơn đầu — gửi phần còn lại ở lượt sau.</p>
        <div v-if="blockedOrders.length" class="max-h-48 overflow-y-auto rounded-md border border-border">
          <p class="border-b border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">Bị giữ lại — sửa rồi gửi lại</p>
          <ul class="divide-y divide-border">
            <li v-for="b in blockedOrders" :key="b.order_id" class="px-3 py-1.5 text-xs">
              <span class="font-mono font-semibold">{{ b.internal_code || b.order_id }}</span>
              <span class="text-rose-600 dark:text-rose-400"> — {{ b.reason }}</span>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <button
          class="btn-secondary mr-auto text-xs"
          title="Chỉ ghi nhận đã bàn giao, KHÔNG tạo đơn trên THE qua API — cho đơn đã tạo trên THE bằng cách khác"
          :disabled="shipping || !preflight?.orders.length"
          @click="sendManual((preflight?.orders ?? []).map((o) => o.order_id))"
        >
          Chỉ ghi nhận bàn giao
        </button>
        <button class="btn-secondary" @click="confirmOpen = false">Huỷ</button>
        <button class="btn-primary" :disabled="shipping || !readyIds.length || !!(preflight?.problem && !preflight.ready)" @click="confirmTHE">
          Tạo & gửi {{ readyIds.length }} đơn
        </button>
      </template>
    </UiModal>
  </div>
</template>
