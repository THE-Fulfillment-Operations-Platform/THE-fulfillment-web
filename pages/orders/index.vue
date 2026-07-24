<script setup lang="ts">
import { itemsApi } from '~/services/api'
import type { OrderItem } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER, REVIEW_STATUS, DESIGN_STATUS, badgeFrom } from '~/utils/enums'
import { itemOrderId, itemStoreOrderId, itemStoreOrderDup, itemMaterial, itemBatchLabel } from '~/utils/item'
import { useApiResource } from '~/composables/useApiResource'
import { exportCsv } from '~/utils/csv'
import { formatDate, formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

// Item-level operational view (matches Wireframe 02). Filters map to the
// /api/items query the backend actually supports.
const filters = reactive({
  store_order_id: '',
  sku: '',
  internal_code: '',
  status: '',
  design_status: '',
  review_status: '',
  batch_id: '',
  date_from: '',
  date_to: '',
  page: 1,
  page_size: 20,
})

// The backend filters created_at <= date_to; to make "Đến ngày" INCLUSIVE of the
// whole selected day (so from=to=today still matches today's items), send the
// start of the next day. Anchored at noon so the local→date conversion can't slip
// a day across timezones.
function inclusiveEnd(d: string): string | undefined {
  if (!d) return undefined
  const dt = new Date(d + 'T12:00:00')
  dt.setDate(dt.getDate() + 1)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Server-side sort. Empty `by` = backend default (newest first). Sorting SKU/date/
// quantity/STT runs in the backend so it covers the whole dataset, not just this
// page (never a front-end array sort of the current page).
const sort = reactive<{ by: '' | 'sku' | 'stt' | 'quantity' | 'created_at'; dir: 'asc' | 'desc' }>({
  by: '',
  dir: 'asc',
})

const { data, meta, loading, error, reload } = useApiResource<OrderItem[]>(() =>
  itemsApi.list({
    store_order_id: filters.store_order_id || undefined,
    sku: filters.sku || undefined,
    internal_code: filters.internal_code || undefined,
    status: filters.status || undefined,
    design_status: filters.design_status || undefined,
    review_status: filters.review_status || undefined,
    batch_id: filters.batch_id ? Number(filters.batch_id) : undefined,
    date_from: filters.date_from || undefined,
    date_to: inclusiveEnd(filters.date_to),
    sort: sort.by || undefined,
    order: sort.by ? sort.dir : undefined,
    page: filters.page,
    page_size: filters.page_size,
  }),
)

// STT trong ngày = the parent order's per-day sequence (stable across pages).
function itemStt(it: OrderItem): string {
  const seq = it.order?.daily_seq
  return seq && seq > 0 ? String(seq) : '—'
}
function itemCreatedAt(it: OrderItem): string | undefined {
  return it.order?.created_at
}
function toggleSort(col: 'sku' | 'stt' | 'quantity' | 'created_at') {
  if (sort.by === col) {
    sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
  } else {
    sort.by = col
    sort.dir = 'asc'
  }
  filters.page = 1
  reload()
}
function sortIcon(col: string): string {
  if (sort.by !== col) return '↕'
  return sort.dir === 'asc' ? '↑' : '↓'
}

const statusOptions = computed(() => [
  { value: '', label: 'Tất cả' },
  ...INTERNAL_STATUS_ORDER.map((s) => ({ value: s, label: INTERNAL_STATUS[s].label })),
])
const designStatusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ design' },
  { value: 'IN_PROGRESS', label: 'Đang design' },
  { value: 'READY', label: 'Sẵn sàng' },
  { value: 'MISSING', label: 'Thiếu file' },
]
const reviewStatusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'NEEDS_CORRECTION', label: 'Cần sửa' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
]

function applyFilters() {
  filters.page = 1
  reload()
}

function resetFilters() {
  filters.store_order_id = ''
  filters.sku = ''
  filters.internal_code = ''
  filters.status = ''
  filters.design_status = ''
  filters.review_status = ''
  filters.batch_id = ''
  filters.date_from = ''
  filters.date_to = ''
  applyFilters()
}

function changePage(p: number) {
  filters.page = p
  reload()
}

function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1 // avoid landing past the last page after enlarging rows
  reload()
}

const items = computed(() => data.value ?? [])

// A rejected/cancelled/pending order shouldn't read as a production status —
// surface its review state instead of the (misleading) internal_status.
function itemStatus(it: OrderItem): { kind: 'review' | 'internal'; value: string } {
  const rv = it.order?.review_status
  if (rv && rv !== 'APPROVED') return { kind: 'review', value: rv }
  return { kind: 'internal', value: it.internal_status }
}
function itemDead(it: OrderItem): boolean {
  const rv = it.order?.review_status
  return rv === 'REJECTED' || rv === 'CANCELLED'
}

const toast = useToastStore()
function statusLabel(it: OrderItem): string {
  const s = itemStatus(it)
  return s.kind === 'review'
    ? badgeFrom(REVIEW_STATUS, s.value as never).label
    : badgeFrom(INTERNAL_STATUS, s.value as never).label
}
function exportItems() {
  const rows = items.value
  if (!rows.length) {
    toast.info('Không có item nào để xuất.')
    return
  }
  // Exports the rows currently loaded (this page). Increase rows-per-page to
  // export more in one go.
  exportCsv(`orders-items-${new Date().toISOString().slice(0, 10)}`, rows, [
    { label: 'STT ngày', value: (it) => itemStt(it) },
    { label: 'Internal Item', value: 'internal_code' },
    { label: 'Store Order', value: (it) => itemStoreOrderId(it) },
    { label: 'Trùng StoreOrderID', value: (it) => (itemStoreOrderDup(it) ? 'Có' : '') },
    { label: 'SKU', value: 'sku_code' },
    { label: 'Sản phẩm', value: (it) => it.product_name ?? '' },
    { label: 'Số lượng', value: 'quantity' },
    { label: 'NVL', value: (it) => itemMaterial(it) },
    { label: 'Design', value: (it) => badgeFrom(DESIGN_STATUS, it.design_status).label },
    { label: 'Batch', value: (it) => itemBatchLabel(it) },
    { label: 'Ngày tạo', value: (it) => formatDate(itemCreatedAt(it)) },
    { label: 'Trạng thái', value: (it) => statusLabel(it) },
  ])
  toast.success(`Đã xuất ${rows.length} dòng CSV.`)
}
</script>

<template>
  <div>
    <PageHeader
      title="Orders / Items"
      subtitle="Góc nhìn item-level — sản xuất/QC/packing chạy theo từng sản phẩm"
    >
      <template #actions>
        <button
          class="btn-secondary"
          :disabled="!items.length"
          title="Xuất các dòng đang hiển thị (trang hiện tại) ra CSV"
          @click="exportItems"
        >
          <UiIcon name="upload" :size="16" /> Xuất CSV
        </button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="card mb-4 p-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <div>
          <label class="label">Store Order ID</label>
          <input v-model="filters.store_order_id" class="input" placeholder="Etsy-7821…" @keyup.enter="applyFilters" />
        </div>
        <div>
          <label class="label">SKU</label>
          <input v-model="filters.sku" class="input" placeholder="WOOD-01" @keyup.enter="applyFilters" />
        </div>
        <div>
          <label class="label">Internal code (item)</label>
          <input v-model="filters.internal_code" class="input" placeholder="100035_1/5" @keyup.enter="applyFilters" />
        </div>
        <div>
          <label class="label">Trạng thái nội bộ</label>
          <UiSelect v-model="filters.status" :options="statusOptions" aria-label="Trạng thái nội bộ" />
        </div>
        <div>
          <label class="label">Design</label>
          <UiSelect v-model="filters.design_status" :options="designStatusOptions" aria-label="Design" />
        </div>
        <div>
          <label class="label">Duyệt (review)</label>
          <UiSelect v-model="filters.review_status" :options="reviewStatusOptions" aria-label="Trạng thái duyệt" />
        </div>
        <div>
          <label class="label">Batch ID</label>
          <input v-model="filters.batch_id" class="input" placeholder="101001" @keyup.enter="applyFilters" />
        </div>
        <div>
          <label class="label">Từ ngày</label>
          <!-- Hai đầu khoá lẫn nhau: không chọn được khoảng ngược. -->
          <UiDatePicker v-model="filters.date_from" :max="filters.date_to" aria-label="Từ ngày" />
        </div>
        <div>
          <label class="label">Đến ngày</label>
          <UiDatePicker v-model="filters.date_to" :min="filters.date_from" aria-label="Đến ngày" />
        </div>
        <div class="col-span-2 flex items-end gap-2 md:col-span-1">
          <button class="btn-primary flex-1" @click="applyFilters">
            <UiIcon name="search" :size="16" /> Lọc
          </button>
          <button class="btn-secondary" @click="resetFilters">Xóa</button>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && items.length === 0"
        empty-text="Không có item nào khớp bộ lọc."
        skeleton
        :skeleton-rows="8"
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">
                  <button class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('stt')" title="Số thứ tự trong ngày">
                    STT <span class="text-[10px] opacity-70">{{ sortIcon('stt') }}</span>
                  </button>
                </th>
                <th class="table-th">Internal Item</th>
                <th class="table-th hidden md:table-cell">Store Order</th>
                <th class="table-th">
                  <button class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('sku')">
                    SKU <span class="text-[10px] opacity-70">{{ sortIcon('sku') }}</span>
                  </button>
                </th>
                <th class="table-th">
                  <button class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('quantity')">
                    SL <span class="text-[10px] opacity-70">{{ sortIcon('quantity') }}</span>
                  </button>
                </th>
                <th class="table-th hidden lg:table-cell">NVL</th>
                <th class="table-th hidden sm:table-cell">Design</th>
                <th class="table-th hidden lg:table-cell">Mockup</th>
                <th class="table-th hidden md:table-cell">Batch</th>
                <th class="table-th hidden lg:table-cell">
                  <button class="inline-flex items-center gap-1 hover:text-foreground" @click="toggleSort('created_at')">
                    Ngày tạo <span class="text-[10px] opacity-70">{{ sortIcon('created_at') }}</span>
                  </button>
                </th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th hidden md:table-cell">Tracking</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="it in items"
                :key="it.id"
                class="hover:bg-muted"
                :class="{ 'opacity-55': itemDead(it), 'bg-rose-50/60 dark:bg-rose-500/10': itemStoreOrderDup(it) }"
              >
                <td class="table-td font-semibold tabular-nums text-foreground" :title="`STT trong ngày ${formatDate(itemCreatedAt(it))}`">{{ itemStt(it) }}</td>
                <td class="table-td font-medium text-foreground">
                  {{ it.internal_code }}
                  <span
                    v-if="itemStoreOrderDup(it)"
                    class="ml-1.5 inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    title="StoreOrderID này trùng với đơn khác — kiểm tra, báo khách nếu cần"
                  >
                    <UiIcon name="alert" :size="10" /> Trùng
                  </span>
                </td>
                <td class="table-td hidden md:table-cell" :class="itemStoreOrderDup(it) ? 'font-medium text-rose-700 dark:text-rose-300' : ''">{{ itemStoreOrderId(it) }}</td>
                <td class="table-td">{{ it.sku_code }}</td>
                <td class="table-td tabular-nums">{{ it.quantity }}</td>
                <td class="table-td hidden lg:table-cell">{{ itemMaterial(it) }}</td>
                <td class="table-td hidden sm:table-cell"><UiStatusBadge kind="design" :value="it.design_status" /></td>
                <td class="table-td hidden lg:table-cell"><UiMockupLink :url="it.mockup_url" small label="Mockup" /></td>
                <td class="table-td hidden text-muted-foreground md:table-cell">{{ itemBatchLabel(it) }}</td>
                <td class="table-td hidden text-xs text-muted-foreground lg:table-cell" :title="formatDateTime(itemCreatedAt(it))">{{ formatDate(itemCreatedAt(it)) }}</td>
                <td class="table-td">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <UiStatusBadge :kind="itemStatus(it).kind" :value="itemStatus(it).value" />
                    <span
                      v-if="it.order?.cancellation_status === 'REQUESTED'"
                      class="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      title="Đơn này có yêu cầu huỷ đang chờ xử lý — kiểm tra trước khi sản xuất tiếp"
                    >
                      <UiIcon name="alert" :size="10" /> Yêu cầu huỷ
                    </span>
                  </div>
                </td>
                <td class="table-td hidden md:table-cell">
                  <UiStatusBadge
                    v-if="it.order?.tracking_status && it.order.tracking_status !== 'NONE'"
                    kind="tracking"
                    :value="it.order.tracking_status"
                  />
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td class="table-td text-right">
                  <NuxtLink
                    v-if="itemOrderId(it)"
                    :to="`/orders/${itemOrderId(it)}`"
                    class="text-xs font-medium text-primary hover:underline"
                  >
                    Chi tiết
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4">
          <UiPagination
            :meta="meta"
            :page-size="filters.page_size"
            @change="changePage"
            @update:page-size="changePageSize"
          />
        </div>
      </UiStateBlock>
    </div>
  </div>
</template>
