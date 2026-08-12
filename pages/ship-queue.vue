<script setup lang="ts">
import { qcApi, handoffsApi } from '~/services/api'
import type { QcResultOrder } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'

// Chờ gửi hàng — điểm nối giữa hai nửa vòng đời của đơn.
//
//   QC là việc cuối của xưởng. Xong QC, đơn rơi vào màn này.
//   Người phụ trách bấm "Quét gửi hàng" rồi quét QR trên từng đơn:
//   quét là gửi — mã nội bộ vừa đọc được chính là lệnh gửi đơn đó cho THE.
//   Từ đó đơn sang màn Hành trình đơn hàng để CS gắn mã vận đơn.
//
// Luồng tick-từng-đơn rồi bấm nút đã bỏ: với vài chục đơn mỗi lượt, dò mã trên
// màn hình để tick đúng dòng chậm và dễ nhầm hơn nhiều so với quét thẳng tờ đơn
// đang cầm trên tay. Bảng bên dưới giữ vai trò hàng đợi để đối chiếu còn bao
// nhiêu đơn chưa quét.

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

function applyFilters() {
  filters.page = 1
  reload()
}
function changePage(p: number) {
  filters.page = p
  reload()
}
function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1
  reload()
}
function resetSearch() {
  filters.q = ''
  applyFilters()
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
      subtitle="Đơn đã QC đủ và chưa gửi — bấm Quét gửi hàng rồi quét QR trên đơn, quét là gửi cho THE"
    >
      <template #actions>
        <button class="btn-secondary" @click="reload">
          <UiIcon name="refresh" :size="16" /> Làm mới
        </button>
        <button v-if="!scanMode" class="btn-primary" @click="startScan">
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
                <th class="table-th">Mã đơn shop</th>
                <th class="table-th">Mã nội bộ</th>
                <th class="table-th hidden md:table-cell">Seller</th>
                <th class="table-th">Sản phẩm</th>
                <th class="table-th hidden sm:table-cell">QC xong lúc</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="o in orders" :key="o.order_id" class="transition-colors hover:bg-muted/60">
                <td class="table-td font-medium text-foreground">{{ o.store_order_id }}</td>
                <td class="table-td font-mono text-xs text-muted-foreground">{{ o.internal_code }}</td>
                <td class="table-td hidden text-muted-foreground md:table-cell">{{ o.seller_name || '—' }}</td>
                <td class="table-td">
                  <span class="text-emerald-700 dark:text-emerald-300">{{ o.passed_items }}</span>
                  <span class="text-muted-foreground">/{{ o.total_items }} đã QC</span>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">
                  {{ formatDateTime(o.created_at) }}
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
  </div>
</template>
