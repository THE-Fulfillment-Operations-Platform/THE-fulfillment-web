<script setup lang="ts">
import { qcApi, handoffsApi } from '~/services/api'
import type { ShipToCarrierResult } from '~/services/api/handoffs'
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
// người dùng chỉ thấy một lần bấm, một bản tổng kết.
const SHIP_CHUNK = 200

async function shipSelected() {
  const ids = selectedIds.value
  if (!ids.length || shipping.value) return
  const ok = await useConfirm().confirm({
    title: 'Gửi đơn cho THE',
    message:
      `Gửi ${ids.length} đơn đã chọn cho THE? Sau khi gửi, đơn rời hàng đợi này và sang màn ` +
      'Hành trình đơn hàng để CS gắn mã vận đơn. Đơn nào chưa QC đủ sẽ bị bỏ qua kèm lý do.',
    confirmText: `Gửi ${ids.length} đơn`,
  })
  if (!ok) return

  shipping.value = true
  const merged: ShipToCarrierResult = { shipped: [], skipped: [] }
  try {
    for (let i = 0; i < ids.length; i += SHIP_CHUNK) {
      const { data } = await handoffsApi.shipToCarrier(ids.slice(i, i + SHIP_CHUNK))
      merged.shipped.push(...(data?.shipped ?? []))
      merged.skipped.push(...(data?.skipped ?? []))
    }
    lastResult.value = merged
    if (merged.shipped.length) toast.success(`Đã gửi ${merged.shipped.length} đơn cho THE.`)
    if (merged.skipped.length) {
      toast.error(`${merged.skipped.length} đơn không gửi được — xem lý do bên dưới bảng.`)
    }
    clearSelection()
    reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    shipping.value = false
  }
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
        handoff_code: res?.handoff_code,
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
                — đã gửi cho THE<span v-if="entry.handoff_code" class="font-mono text-xs"> ({{ entry.handoff_code }})</span>
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
          Gửi {{ count }} đơn cho THE
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
      <p class="text-sm text-muted-foreground">
        <span class="font-semibold text-emerald-700 dark:text-emerald-300">{{ lastResult.shipped.length }}</span>
        đơn đã gửi cho THE<template v-if="lastResult.skipped.length">
          · <span class="font-semibold text-red-700 dark:text-rose-300">{{ lastResult.skipped.length }}</span>
          đơn bị bỏ qua</template>
      </p>
      <ul v-if="lastResult.skipped.length" class="mt-2 max-h-56 space-y-1 overflow-y-auto">
        <li
          v-for="sk in lastResult.skipped"
          :key="sk.order_id"
          class="flex items-start gap-2 rounded-md bg-red-50 px-2.5 py-1.5 text-sm text-red-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <UiIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
          <span><span class="font-mono font-semibold">{{ sk.internal_code || sk.order_id }}</span> — {{ sk.reason }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
