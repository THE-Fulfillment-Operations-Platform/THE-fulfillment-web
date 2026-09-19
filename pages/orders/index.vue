<script setup lang="ts">
import { itemsApi, ordersApi, sellersApi } from '~/services/api'
import type { OrderItem, Seller } from '~/types'
import {
  INTERNAL_STATUS,
  INTERNAL_STATUS_ORDER,
  REVIEW_STATUS,
  DESIGN_STATUS,
  SELLER_STATUS,
  TRACKING_STATUS,
  badgeFrom,
  cancelStageLabel,
  isHandedOver,
  orderStatusBadge,
  type StatusBadgeRef,
} from '~/utils/enums'
import { itemOrderId, itemStoreOrderId, itemStoreOrderDup, itemMaterial, itemBatchLabel } from '~/utils/item'
import { useApiResource } from '~/composables/useApiResource'
import { exportCsv } from '~/utils/csv'
import { formatDate, formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useRowLink } from '~/composables/useRowLink'
import { useSelection } from '~/composables/useSelection'
import { useConfirm } from '~/composables/useConfirm'
import { refreshActionCounts } from '~/composables/useActionCounts'
import { errorMessage } from '~/utils/api-error'

// Bấm vào bất kỳ đâu trên một dòng là vào thẳng chi tiết (xem useRowLink).
const { rowLinkAttrs } = useRowLink()

// Item-level operational view (matches Wireframe 02). Filters map to the
// /api/items query the backend actually supports.
const filters = reactive({
  seller_id: '',
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
// quantity runs in the backend so it covers the whole dataset, not just this
// page (never a front-end array sort of the current page).
const sort = reactive<{ by: '' | 'sku' | 'quantity' | 'created_at'; dir: 'asc' | 'desc' }>({
  by: '',
  dir: 'asc',
})

const { data, meta, loading, error, reload } = useApiResource<OrderItem[]>(() =>
  itemsApi.list({
    seller_id: filters.seller_id ? Number(filters.seller_id) : undefined,
    // Màn này có cột Seller nên phải xin kèm: /api/items để seller ở chế độ
    // opt-in, mặc định không trả (một round trip nữa tới DB ở đầu kia internet).
    with_seller: true,
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

// STT là số thứ tự DÒNG, chạy liên tục qua các trang (trang 2 cỡ 20 bắt đầu từ
// 21) — giống màn seller. Không dùng "STT trong ngày" (daily_seq): bộ đếm đó
// reset mỗi ngày nên cột đọc ra "1, 2, 3, 1, 2…" trông như đánh số sai; số đó
// vẫn xem được ở chi tiết đơn. Lấy trang từ meta (trang của dữ liệu đang hiện),
// không từ filters — filters đổi trước khi dữ liệu mới về.
function rowNumber(idx: number): number {
  const page = meta.value?.page ?? filters.page
  const size = meta.value?.page_size ?? filters.page_size
  return (page - 1) * size + idx + 1
}
// Tên seller của sản phẩm. Đơn cũ/payload gọn có thể không kèm seller — trả về
// dấu gạch thay vì để ô trống trông như dữ liệu lỗi.
function itemSellerName(it: OrderItem): string {
  return it.order?.seller?.name || it.order?.seller?.code || ''
}

function itemCreatedAt(it: OrderItem): string | undefined {
  return it.order?.created_at
}
function toggleSort(col: 'sku' | 'quantity' | 'created_at') {
  if (sort.by === col) {
    sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
  } else {
    sort.by = col
    sort.dir = 'asc'
  }
  filters.page = 1
  clear()
  reload()
}
function sortIcon(col: string): string {
  if (sort.by !== col) return '↕'
  return sort.dir === 'asc' ? '↑' : '↓'
}

// Danh sách seller cho bộ lọc. GET /api/sellers mở cho mọi vai trò đọc được
// đơn (gồm cả CS), nên ai vào được màn này đều dựng được bộ lọc.
const sellers = ref<Seller[]>([])
const sellerOptions = computed(() => [
  { value: '', label: 'Tất cả seller' },
  ...sellers.value.map((s) => ({ value: String(s.id), label: s.name || s.code })),
])
onMounted(async () => {
  try {
    const { data: rows } = await sellersApi.list()
    sellers.value = rows ?? []
  } catch {
    /* Bộ lọc seller là phụ trợ: hỏng thì màn vẫn phải liệt kê được đơn. */
  }
})

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
  clear()
  reload()
}

function resetFilters() {
  filters.seller_id = ''
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
  clear()
  reload()
}

function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1 // avoid landing past the last page after enlarging rows
  clear()
  reload()
}

const items = computed(() => data.value ?? [])

// ---- Chọn nhiều + xoá đơn (Admin/Owner) --------------------------------------
// Mỗi dòng là một SẢN PHẨM, nhưng xoá là xoá cả ĐƠN (như nút Xoá đơn ở chi tiết
// đơn): tick một sản phẩm của đơn 3 sản phẩm là xoá cả 3. Vì vậy thanh thao tác
// đếm cả hai con số. Chỉ chọn trong trang đang xem — đổi trang/bộ lọc/sắp xếp là
// bỏ chọn, để không bao giờ xoá thứ không nhìn thấy.
const auth = useAuthStore()
const canDelete = computed(
  () => (auth.role === 'OWNER' || auth.role === 'ADMIN') && auth.can('orders.manage'),
)

const { isSelected, toggle, toggleAll, allSelected, someSelected, clear } = useSelection(() => items.value)
const selectedItems = computed(() => items.value.filter((it) => isSelected(it.id)))
const selectedOrderIds = computed(() => {
  const ids = new Set<number>()
  for (const it of selectedItems.value) {
    const id = itemOrderId(it)
    if (id) ids.add(id)
  }
  return Array.from(ids)
})

const deleting = ref(false)
async function bulkDeleteOrders() {
  const ids = selectedOrderIds.value
  if (!ids.length || deleting.value) return
  const ok = await useConfirm().confirm({
    title: 'Xoá đơn đã chọn',
    message:
      `Xoá ${ids.length} đơn (mọi sản phẩm trong các đơn này, kể cả dòng không tick)? ` +
      'Đơn đã vào sản xuất (đã vào batch hoặc đã in/cắt) sẽ được bỏ qua — huỷ đơn, hoặc Owner xoá lẻ trong chi tiết đơn.',
    tone: 'danger',
    confirmText: `Xoá ${ids.length} đơn`,
  })
  if (!ok) return
  deleting.value = true
  try {
    const { data: res } = await ordersApi.bulkRemove(ids)
    const deleted = res?.deleted_ids.length ?? 0
    const skipped = res?.skipped ?? []
    if (deleted > 0) toast.success(`Đã xoá ${deleted} đơn`)
    if (skipped.length) {
      const detail = skipped
        .slice(0, 3)
        .map((s) => `${s.internal_code || '#' + s.id}: ${s.reason}`)
        .join(' · ')
      toast.error(`${skipped.length} đơn không xoá. ${detail}${skipped.length > 3 ? ' …' : ''}`)
    }
    clear()
    await reload()
    if (deleted > 0) void refreshActionCounts()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    deleting.value = false
  }
}

// Trạng thái hiển thị là chặng NGOÀI CÙNG mà sản phẩm đã tới, theo đúng thứ tự
// vòng đời của đơn:
//
//   chưa duyệt → sản xuất/QC (theo từng sản phẩm) → đã gửi THE → hành trình kiện
//
// Vì thế khi đơn đã rời xưởng thì cột này chuyển sang phần vận chuyển: để nguyên
// "Đã QC" sẽ khiến một đơn đang trên đường giao trông như vẫn còn nằm ở xưởng.
// Trạng thái sản xuất lúc đó không mất — nó là điều kiện để gửi được, nên đã hàm
// ý trong "Đã gửi đi".
function itemStatus(it: OrderItem): StatusBadgeRef {
  return orderStatusBadge(it.order ?? {}, it.internal_status)
}
function itemDead(it: OrderItem): boolean {
  const rv = it.order?.review_status
  return rv === 'REJECTED' || rv === 'CANCELLED'
}

const toast = useToastStore()
const STATUS_LABEL_MAPS = {
  review: REVIEW_STATUS,
  internal: INTERNAL_STATUS,
  seller: SELLER_STATUS,
  tracking: TRACKING_STATUS,
} as const

function statusLabel(it: OrderItem): string {
  const s = itemStatus(it)
  return badgeFrom(STATUS_LABEL_MAPS[s.kind] as never, s.value as never).label
}
function exportItems() {
  const rows = items.value
  if (!rows.length) {
    toast.info('Không có item nào để xuất.')
    return
  }
  // Exports the rows currently loaded (this page). Increase rows-per-page to
  // export more in one go.
  const rowNo = new Map(rows.map((it, i) => [it.id, rowNumber(i)]))
  exportCsv(`orders-items-${new Date().toISOString().slice(0, 10)}`, rows, [
    { label: 'STT', value: (it) => rowNo.get(it.id) },
    { label: 'Internal Item', value: 'internal_code' },
    { label: 'Store Order', value: (it) => itemStoreOrderId(it) },
    { label: 'Seller', value: (it) => itemSellerName(it) },
    { label: 'Trùng StoreOrderID', value: (it) => (itemStoreOrderDup(it) ? 'Có' : '') },
    { label: 'SKU', value: 'sku_code' },
    { label: 'Sản phẩm', value: (it) => it.product_name ?? '' },
    { label: 'Số lượng', value: 'quantity' },
    { label: 'NVL', value: (it) => itemMaterial(it) },
    { label: 'Design', value: (it) => badgeFrom(DESIGN_STATUS, it.design_status).label },
    { label: 'Batch', value: (it) => itemBatchLabel(it) },
    { label: 'Ngày tạo', value: (it) => formatDate(itemCreatedAt(it)) },
    { label: 'Trạng thái', value: (it) => statusLabel(it) },
    { label: 'Mã vận đơn', value: (it) => it.order?.tracking_number ?? '' },
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
          <label class="label">Seller</label>
          <UiSelect
            v-model="filters.seller_id"
            :options="sellerOptions"
            aria-label="Seller"
            @update:model-value="applyFilters"
          />
        </div>
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
      <UiBulkBar v-if="canDelete" :count="selectedItems.length" noun="sản phẩm" @clear="clear">
        <template #note>
          <span class="text-sm text-muted-foreground">thuộc {{ selectedOrderIds.length }} đơn</span>
        </template>
        <button
          class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400"
          :disabled="deleting"
          @click="bulkDeleteOrders"
        >
          <UiSpinner v-if="deleting" :size="14" /> Xoá {{ selectedOrderIds.length }} đơn
        </button>
      </UiBulkBar>

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
                <th v-if="canDelete" class="table-th w-10">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    :checked="allSelected"
                    :indeterminate.prop="someSelected"
                    :disabled="items.length === 0"
                    aria-label="Chọn tất cả dòng trên trang"
                    @change="toggleAll"
                  />
                </th>
                <th class="table-th w-12">STT</th>
                <th class="table-th">Internal Item</th>
                <th class="table-th hidden md:table-cell">Store Order</th>
                <th class="table-th hidden lg:table-cell">Seller</th>
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
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="(it, idx) in items"
                :key="it.id"
                v-bind="rowLinkAttrs(itemOrderId(it) ? `/orders/${itemOrderId(it)}` : null)"
                class="hover:bg-muted"
                :class="{
                  'opacity-55': itemDead(it),
                  'bg-rose-50/60 dark:bg-rose-500/10': itemStoreOrderDup(it) && !isSelected(it.id),
                  'bg-primary/5': isSelected(it.id),
                }"
              >
                <!-- Cả ô là vùng bấm (label): lỡ tay bấm cạnh checkbox không bị
                     nhảy sang chi tiết đơn. -->
                <td v-if="canDelete" class="table-td p-0">
                  <label class="flex h-full cursor-pointer items-center px-3 py-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                      :checked="isSelected(it.id)"
                      :aria-label="`Chọn ${it.internal_code}`"
                      @change="toggle(it.id)"
                    />
                  </label>
                </td>
                <td class="table-td font-semibold tabular-nums text-foreground">{{ rowNumber(idx) }}</td>
                <td class="table-td font-medium text-foreground">
                  {{ it.internal_code }}
                  <!-- Sản phẩm từng QC fail: nói ngay đang ở lần sản xuất thứ mấy,
                       để không ai tưởng đơn "biến mất" khi nó rời batch cũ. -->
                  <span
                    v-if="(it.rework_count ?? 0) > 0"
                    class="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                    :title="`QC fail ${it.rework_count} lần — đang làm lại (lần sản xuất thứ ${(it.rework_count ?? 0) + 1})`"
                  >
                    Làm lại ×{{ it.rework_count }}
                  </span>
                  <span
                    v-if="itemStoreOrderDup(it)"
                    class="ml-1.5 inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    title="StoreOrderID này trùng với đơn khác — kiểm tra, báo khách nếu cần"
                  >
                    <UiIcon name="alert" :size="10" /> Trùng
                  </span>
                </td>
                <td class="table-td hidden md:table-cell" :class="itemStoreOrderDup(it) ? 'font-medium text-rose-700 dark:text-rose-300' : ''">{{ itemStoreOrderId(it) }}</td>
                <td class="table-td hidden lg:table-cell">{{ itemSellerName(it) || '—' }}</td>
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
                    <!-- Đơn đã huỷ nhưng vẫn phải xuất hoá đơn: dòng bị làm mờ vì
                         hết việc, nên phần tiền phải tự nói ra. -->
                    <span
                      v-if="it.order?.cancel_billable"
                      class="inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      :title="`Huỷ ở khâu ${cancelStageLabel(it.order?.cancel_stage)} — vẫn tính tiền khách`"
                    >
                      Vẫn tính tiền
                    </span>
                  </div>
                </td>
                <!-- Mã vận đơn nằm trên ĐƠN nên mọi sản phẩm cùng một đơn hiện
                     cùng một mã. Cột này in ra chính con số CS đã gắn — trạng
                     thái kiện hàng đã có ở cột Trạng thái bên cạnh. -->
                <td class="table-td hidden md:table-cell">
                  <span v-if="it.order?.tracking_number" class="font-mono text-xs text-foreground">
                    {{ it.order.tracking_number }}
                  </span>
                  <span
                    v-else-if="isHandedOver(it.order?.seller_status)"
                    class="text-xs text-amber-600 dark:text-amber-400"
                    title="Đơn đã gửi cho THE, CS chưa gắn mã vận đơn"
                  >
                    chờ gắn mã
                  </span>
                  <span v-else class="text-xs text-muted-foreground">—</span>
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
