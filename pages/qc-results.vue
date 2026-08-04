<script setup lang="ts">
import { qcApi } from '~/services/api'
import type { QcResultOrder, QcResultItem, QcOrderStatus } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDate, formatDateTime } from '~/utils/format'
import { exportCsv } from '~/utils/csv'
import { reasonCodeLabel, INTERNAL_STATUS } from '~/utils/enums'

// Kết quả QC — màn ĐỌC, trả lời đúng câu hỏi của xưởng sau khi quét QC:
// "đơn nào đã QC đủ để đóng gói, đơn nào còn kẹt, kẹt ở sản phẩm nào".
//
// Vì thế trang gom theo ĐƠN chứ không phải danh sách sản phẩm phẳng: đóng gói
// làm việc theo đơn, một đơn thiếu 1 sản phẩm là chưa đóng được. Mỗi đơn là một
// thẻ có thanh tiến độ; bung ra mới thấy từng sản phẩm — nhìn lướt thấy tình
// hình, cần chi tiết mới phải mở.

const filters = reactive({ state: '', q: '', page: 1, page_size: 20 })

const { data, meta, loading, error, reload } = useApiResource(() =>
  qcApi.results({
    state: filters.state || undefined,
    q: filters.q.trim() || undefined,
    page: filters.page,
    page_size: filters.page_size,
  }),
)
const orders = computed<QcResultOrder[]>(() => data.value?.orders ?? [])
const summary = computed(() => data.value?.summary)

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
// Ô thống kê chính là bộ lọc: bấm vào con số là xem đúng nhóm đó, bấm lại để bỏ.
function pickState(state: string) {
  filters.state = filters.state === state ? '' : state
  applyFilters()
}

// Mở/đóng chi tiết từng đơn. Đơn chưa QC đủ mở sẵn — đó là việc cần xử lý;
// đơn đã đủ thì gấp lại cho gọn.
const expanded = ref<Set<number>>(new Set())
function toggle(orderID: number) {
  const next = new Set(expanded.value)
  next.has(orderID) ? next.delete(orderID) : next.add(orderID)
  expanded.value = next
}
function isOpen(o: QcResultOrder) {
  return expanded.value.has(o.order_id) || (o.status !== 'DONE' && !collapsedAll.value)
}
const collapsedAll = ref(false)
function toggleAll() {
  collapsedAll.value = !collapsedAll.value
  expanded.value = new Set()
}

const ORDER_STATUS: Record<QcOrderStatus, { label: string; dot: string; chip: string }> = {
  DONE: {
    label: 'Đã QC đủ · sẵn sàng đóng gói',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  PARTIAL: {
    label: 'Đạt một phần',
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  NONE: {
    label: 'Chưa QC',
    dot: 'bg-slate-400',
    chip: 'bg-muted text-muted-foreground',
  },
}

const ITEM_STATUS: Record<string, { label: string; chip: string; icon: string }> = {
  PASSED: {
    label: 'Đạt',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    icon: 'check',
  },
  REWORK: {
    label: 'Đang làm lại',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    icon: 'alert',
  },
  WAITING: {
    label: 'Chờ QC',
    chip: 'bg-muted text-muted-foreground',
    icon: 'calendar',
  },
}

function itemStatus(it: QcResultItem) {
  return ITEM_STATUS[it.qc_status] ?? ITEM_STATUS.WAITING
}
function stageLabel(it: QcResultItem) {
  return INTERNAL_STATUS[it.internal_status]?.label ?? it.internal_status
}
function progressPct(o: QcResultOrder) {
  return o.total_items > 0 ? Math.round((o.passed_items / o.total_items) * 100) : 0
}

// Xuất đúng những gì đang xem, cấp SẢN PHẨM — để đối chiếu ngoài Excel.
function exportRows() {
  const rows = orders.value.flatMap((o) =>
    o.items.map((it) => ({ o, it })),
  )
  exportCsv(
    'ket-qua-qc',
    rows,
    [
      { label: 'Mã đơn', value: ({ o }) => o.internal_code },
      { label: 'Store Order', value: ({ o }) => o.store_order_id },
      { label: 'Seller', value: ({ o }) => o.seller_name ?? '' },
      { label: 'Trạng thái đơn', value: ({ o }) => ORDER_STATUS[o.status].label },
      { label: 'Đạt / Tổng', value: ({ o }) => `${o.passed_items}/${o.total_items}` },
      { label: 'Mã sản phẩm', value: ({ it }) => it.internal_code },
      { label: 'SKU', value: ({ it }) => it.sku_code },
      { label: 'SL', value: ({ it }) => it.quantity },
      { label: 'QC', value: ({ it }) => itemStatus(it).label },
      { label: 'Giai đoạn sản xuất', value: ({ it }) => stageLabel(it) },
      { label: 'Số lần làm lại', value: ({ it }) => it.rework_count || 0 },
      { label: 'Lỗi gần nhất', value: ({ it }) => (it.last_defect ? reasonCodeLabel(it.last_defect) : '') },
      { label: 'QC lúc', value: ({ it }) => (it.last_checked_at ? formatDateTime(it.last_checked_at) : '') },
      { label: 'Người QC', value: ({ it }) => it.last_checked_by ?? '' },
    ],
  )
}
</script>

<template>
  <div>
    <PageHeader
      title="Kết quả QC"
      subtitle="Đơn nào đã QC đủ để đóng gói, đơn nào còn kẹt và kẹt ở sản phẩm nào"
    >
      <template #actions>
        <button class="btn-secondary" :disabled="!orders.length" @click="exportRows">
          <UiIcon name="download" :size="16" /> Xuất CSV
        </button>
      </template>
    </PageHeader>

    <!-- Thống kê = bộ lọc. Bấm ô nào là lọc đúng nhóm đó. -->
    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button
        v-for="tile in [
          { key: 'done', label: 'Đơn đã QC đủ', hint: 'sẵn sàng đóng gói', value: summary?.orders_done ?? 0, tone: 'emerald' },
          { key: 'partial', label: 'Đơn đạt một phần', hint: 'còn sản phẩm chưa QC', value: summary?.orders_partial ?? 0, tone: 'amber' },
          { key: 'none', label: 'Đơn chưa QC', hint: 'chưa sản phẩm nào đạt', value: summary?.orders_none ?? 0, tone: 'slate' },
          { key: 'rework', label: 'Sản phẩm làm lại', hint: 'QC fail, đang sản xuất lại', value: summary?.items_rework ?? 0, tone: 'rose' },
        ]"
        :key="tile.key"
        class="card p-4 text-left transition-shadow hover:shadow-soft"
        :class="filters.state === tile.key ? 'ring-2 ring-primary' : ''"
        @click="pickState(tile.key)"
      >
        <p
          class="text-2xl font-semibold tabular-nums"
          :class="{
            'text-emerald-600 dark:text-emerald-400': tile.tone === 'emerald',
            'text-amber-600 dark:text-amber-400': tile.tone === 'amber',
            'text-foreground': tile.tone === 'slate',
            'text-rose-600 dark:text-rose-400': tile.tone === 'rose',
          }"
        >
          {{ tile.value }}
        </p>
        <p class="text-sm font-medium text-foreground">{{ tile.label }}</p>
        <p class="text-[11px] text-muted-foreground">{{ tile.hint }}</p>
      </button>
    </div>

    <!-- Bộ lọc -->
    <div class="card mb-4 p-3">
      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1">
          <label class="label">Tìm kiếm</label>
          <input
            v-model="filters.q"
            class="input"
            placeholder="Mã đơn, Store Order ID, mã sản phẩm hoặc SKU…"
            @keyup.enter="applyFilters"
          />
        </div>
        <div class="flex gap-2">
          <button class="btn-primary flex-1 sm:flex-none" @click="applyFilters">
            <UiIcon name="search" :size="16" /> Lọc
          </button>
          <button
            v-if="filters.state || filters.q"
            class="btn-secondary"
            @click="((filters.state = ''), (filters.q = ''), applyFilters())"
          >
            Xóa
          </button>
          <button class="btn-secondary" :title="collapsedAll ? 'Mở tất cả' : 'Thu gọn tất cả'" @click="toggleAll">
            <UiIcon
              name="chevron-down"
              :size="16"
              :class="collapsedAll ? '' : 'rotate-180'"
            />
            {{ collapsedAll ? 'Mở' : 'Thu gọn' }}
          </button>
        </div>
      </div>
      <p v-if="summary" class="mt-2 text-xs text-muted-foreground">
        Tổng <span class="font-medium text-foreground">{{ summary.orders }}</span> đơn đã duyệt ·
        <span class="font-medium text-emerald-600 dark:text-emerald-400">{{ summary.items_passed }}</span>
        sản phẩm đạt QC ·
        <span class="font-medium text-foreground">{{ summary.items_waiting }}</span> sản phẩm chưa đạt
      </p>
    </div>

    <UiStateBlock
      :loading="loading"
      :error="error"
      :empty="!loading && !error && orders.length === 0"
      empty-text="Không có đơn nào khớp bộ lọc."
      skeleton
      :skeleton-rows="6"
      @retry="reload"
    >
      <div class="space-y-3">
        <div v-for="o in orders" :key="o.order_id" class="card overflow-hidden">
          <!-- Đầu thẻ: bấm đâu cũng mở/đóng được -->
          <button
            class="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted sm:flex-row sm:items-center"
            @click="toggle(o.order_id)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="h-2 w-2 shrink-0 rounded-full" :class="ORDER_STATUS[o.status].dot" />
                <span class="font-semibold text-foreground">{{ o.internal_code }}</span>
                <span class="truncate text-sm text-muted-foreground">{{ o.store_order_id }}</span>
                <span
                  class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="ORDER_STATUS[o.status].chip"
                >
                  {{ ORDER_STATUS[o.status].label }}
                </span>
                <span
                  v-if="o.rework_items > 0"
                  class="inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                >
                  {{ o.rework_items }} sản phẩm đang làm lại
                </span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ o.seller_name || '—' }}
                <template v-if="o.daily_seq"> · STT ngày {{ o.daily_seq }}</template>
                · {{ formatDate(o.created_at) }}
              </p>
            </div>

            <!-- Tiến độ QC: số + thanh, đọc được trong một cái liếc -->
            <div class="flex shrink-0 items-center gap-3 sm:w-64">
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between text-xs">
                  <span class="font-medium text-foreground">
                    {{ o.passed_items }}/{{ o.total_items }} sản phẩm đạt
                  </span>
                  <span class="tabular-nums text-muted-foreground">{{ progressPct(o) }}%</span>
                </div>
                <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="o.status === 'DONE' ? 'bg-emerald-500' : 'bg-amber-500'"
                    :style="{ width: `${progressPct(o)}%` }"
                  />
                </div>
              </div>
              <UiIcon
                name="chevron-down"
                :size="16"
                class="shrink-0 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': isOpen(o) }"
              />
            </div>
          </button>

          <!-- Chi tiết sản phẩm trong đơn -->
          <div v-if="isOpen(o)" class="border-t border-border">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-border">
                <thead class="bg-muted">
                  <tr>
                    <th class="table-th">Sản phẩm</th>
                    <th class="table-th">SKU</th>
                    <th class="table-th">SL</th>
                    <th class="table-th">QC</th>
                    <th class="table-th hidden sm:table-cell">Giai đoạn sản xuất</th>
                    <th class="table-th hidden lg:table-cell">Lần QC gần nhất</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr
                    v-for="it in o.items"
                    :key="it.item_id"
                    class="hover:bg-muted"
                    :class="it.qc_status === 'REWORK' ? 'bg-rose-50/40 dark:bg-rose-500/5' : ''"
                  >
                    <td class="table-td font-medium text-foreground">
                      {{ it.internal_code }}
                      <span
                        v-if="it.rework_count > 0"
                        class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                        :title="`QC fail ${it.rework_count} lần`"
                      >
                        làm lại ×{{ it.rework_count }}
                      </span>
                      <p v-if="it.product_name" class="text-xs font-normal text-muted-foreground">
                        {{ it.product_name }}
                      </p>
                    </td>
                    <td class="table-td text-muted-foreground">{{ it.sku_code }}</td>
                    <td class="table-td tabular-nums">{{ it.quantity }}</td>
                    <td class="table-td">
                      <span
                        class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                        :class="itemStatus(it).chip"
                      >
                        <UiIcon :name="itemStatus(it).icon" :size="12" />
                        {{ itemStatus(it).label }}
                      </span>
                    </td>
                    <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">
                      {{ stageLabel(it) }}
                    </td>
                    <td class="table-td hidden text-xs lg:table-cell">
                      <template v-if="it.last_checked_at">
                        <span
                          :class="it.last_result === 'FAIL' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'"
                        >
                          {{ it.last_result === 'FAIL' ? 'Fail' : 'Pass' }}
                          <template v-if="it.last_defect"> · {{ reasonCodeLabel(it.last_defect) }}</template>
                        </span>
                        <p class="text-muted-foreground">
                          {{ formatDateTime(it.last_checked_at) }}
                          <template v-if="it.last_checked_by"> · {{ it.last_checked_by }}</template>
                        </p>
                      </template>
                      <span v-else class="text-muted-foreground">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <UiPagination
        :meta="meta"
        :page-size="filters.page_size"
        @change="changePage"
        @update:page-size="changePageSize"
      />
    </UiStateBlock>
  </div>
</template>
