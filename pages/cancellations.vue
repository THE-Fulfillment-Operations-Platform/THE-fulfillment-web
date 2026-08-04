<script setup lang="ts">
import { cancellationApi } from '~/services/api'
import type { Order, OrderItem, CancelStage } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { refreshActionCounts } from '~/composables/useActionCounts'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { CANCEL_STAGE, cancelStageLabel } from '~/utils/enums'
import { useToastStore } from '~/stores/toast'

// Cancellation requests — seller gửi lên khi đơn ĐÃ vào sản xuất (chưa sản xuất
// thì họ tự huỷ, không qua đây). Vì thế mỗi dòng ở màn này đều là tiền: duyệt
// huỷ nhưng khách vẫn phải trả, trừ khi người duyệt chủ động miễn.
const toast = useToastStore()
const filters = reactive({ search: '', page: 1, page_size: 20 })

const { data, meta, loading, error, reload } = useApiResource<Order[]>(() =>
  cancellationApi.list({
    store_order_id: filters.search || undefined,
    page: filters.page,
    page_size: filters.page_size,
  }),
)
const orders = computed(() => data.value ?? [])
const { data: itemData, loading: itemLoading, error: itemError, reload: reloadItems } = useApiResource<OrderItem[]>(() =>
  cancellationApi.itemList({ page: 1, page_size: 100 }),
)
const itemRequests = computed(() => itemData.value ?? [])

// ---- Đã xử lý ---------------------------------------------------------------
// Đơn huỷ xong thì rơi khỏi mọi hàng chờ việc (huỷ đơn là huỷ mọi dòng của nó),
// nên nếu không có mục này thì sau khi bấm "Đồng ý huỷ" là đơn biến mất khỏi mọi
// danh sách. Đây cũng là bảng kê để biết đơn nào còn phải tính tiền khách.
const onlyBillable = ref(false)
const resolvedPage = reactive({ page: 1, page_size: 20 })
const {
  data: resolvedData,
  meta: resolvedMeta,
  loading: resolvedLoading,
  error: resolvedError,
  reload: reloadResolved,
} = useApiResource<Order[]>(() =>
  cancellationApi.resolved({
    store_order_id: filters.search || undefined,
    billable: onlyBillable.value ? true : undefined,
    page: resolvedPage.page,
    page_size: resolvedPage.page_size,
  }),
)
const resolved = computed(() => resolvedData.value ?? [])

function changeResolvedPage(p: number) {
  resolvedPage.page = p
  reloadResolved()
}
function changeResolvedPageSize(size: number) {
  resolvedPage.page_size = size
  resolvedPage.page = 1
  reloadResolved()
}
function toggleBillableOnly() {
  onlyBillable.value = !onlyBillable.value
  resolvedPage.page = 1
  reloadResolved()
}

// Kết quả cuối của một yêu cầu huỷ, gộp cả đường seller tự huỷ (không qua duyệt).
function resolutionBadge(o: Order): { label: string; classes: string } {
  switch (o.cancellation_status) {
    case 'APPROVED':
      return { label: 'Đã huỷ (duyệt)', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' }
    case 'SELLER_CANCELLED':
      return { label: 'Seller tự huỷ', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' }
    case 'REJECTED':
      return { label: 'Từ chối huỷ', classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' }
    default:
      return { label: o.cancellation_status ?? '—', classes: 'bg-muted text-muted-foreground' }
  }
}

function applyFilters() {
  filters.page = 1
  resolvedPage.page = 1
  reload()
  reloadItems()
  reloadResolved()
}
function changePage(p: number) {
  filters.page = p
  reload()
}

// Đổi số dòng/trang thì về trang 1: trang đang xem có thể không còn tồn tại ở
// kích thước mới.
function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1
  reload()
}

// Giai đoạn huỷ + có tính tiền không. Hai thứ này BE đã chốt lúc seller bấm gửi
// yêu cầu (không phải lúc duyệt), nên chúng mô tả đúng trạng thái seller đã hành
// động trên đó dù xưởng có chạy tiếp trong lúc chờ.
function stageOf(row: { cancel_stage?: CancelStage }): CancelStage {
  return row.cancel_stage || 'PRE_PRODUCTION'
}
function stageBadge(row: { cancel_stage?: CancelStage }) {
  return CANCEL_STAGE[stageOf(row) as Exclude<CancelStage, ''>] ?? CANCEL_STAGE.PRE_PRODUCTION
}

// Resolution modal
const open = ref(false)
const target = ref<{ kind: 'order'; value: Order } | { kind: 'item'; value: OrderItem } | null>(null)
const mode = ref<'approve' | 'reject'>('approve')
const note = ref('')
// Duyệt huỷ nhưng vẫn tính tiền khách: mặc định theo cờ BE ghi lúc gửi yêu cầu,
// người duyệt bỏ tick nếu quyết định miễn cho khách.
const billable = ref(false)
const saving = ref(false)

function openResolve(o: Order, m: 'approve' | 'reject') {
  target.value = { kind: 'order', value: o }
  mode.value = m
  note.value = ''
  billable.value = Boolean(o.cancel_billable)
  open.value = true
}

function openItemResolve(it: OrderItem, m: 'approve' | 'reject') {
  target.value = { kind: 'item', value: it }
  mode.value = m
  note.value = ''
  billable.value = Boolean(it.cancel_billable)
  open.value = true
}

async function submit() {
  if (!target.value || saving.value) return
  saving.value = true
  try {
    const id = target.value.value.id
    const n = note.value.trim() || undefined
    if (target.value.kind === 'item') {
      if (mode.value === 'approve') await cancellationApi.approveItem(id, n, billable.value)
      else await cancellationApi.rejectItem(id, n)
    } else if (mode.value === 'approve') await cancellationApi.approve(id, n, billable.value)
    else await cancellationApi.reject(id, n)
    toast.success(mode.value === 'approve' ? 'Đã đồng ý huỷ — xem ở mục "Đã xử lý" bên dưới' : 'Đã từ chối yêu cầu huỷ')
    open.value = false
    await reload()
    await reloadItems()
    await reloadResolved()
    // Đồng ý hay từ chối thì yêu cầu cũng rời hàng đợi — badge phải giảm theo.
    void refreshActionCounts()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Yêu cầu huỷ đơn"
      subtitle="Đơn đã vào sản xuất thì seller phải xin duyệt mới huỷ được — và mặc định vẫn tính tiền khách"
    />

    <div class="card mb-4 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <input v-model="filters.search" class="input min-w-[10rem] flex-1" placeholder="Tìm theo mã đơn…" @keyup.enter="applyFilters" />
        <button class="btn-primary shrink-0" @click="applyFilters"><UiIcon name="search" :size="16" /> Tìm</button>
        <button class="btn-secondary shrink-0" @click="reload"><UiIcon name="refresh" :size="16" /></button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && orders.length === 0"
        empty-text="Không có yêu cầu huỷ nào."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Mã đơn</th>
                <th class="table-th">Seller</th>
                <th class="table-th">Giai đoạn</th>
                <th class="table-th">Lý do</th>
                <th class="table-th">Yêu cầu lúc</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="o in orders"
                :key="o.id"
                class="hover:bg-muted"
                :class="{ 'bg-rose-50/60 dark:bg-rose-500/10': o.store_order_dup }"
              >
                <td class="table-td">
                  <span class="flex items-center gap-1.5">
                    <NuxtLink :to="`/orders/${o.id}`" class="font-medium text-primary hover:underline">{{ o.store_order_id }}</NuxtLink>
                    <span
                      v-if="o.store_order_dup"
                      class="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      title="StoreOrderID này trùng với đơn khác"
                    >
                      <UiIcon name="alert" :size="10" /> Trùng
                    </span>
                  </span>
                  <p class="text-xs text-muted-foreground">{{ o.internal_code }}</p>
                </td>
                <td class="table-td text-foreground">{{ o.seller?.name || o.seller?.code || '—' }}</td>
                <td class="table-td">
                  <div class="flex flex-wrap items-center gap-1">
                    <span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold" :class="stageBadge(o).classes">
                      {{ stageBadge(o).label }}
                    </span>
                    <span
                      v-if="o.cancel_billable"
                      class="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      title="Đơn đã tốn NVL và công sản xuất — duyệt huỷ nhưng vẫn tính tiền khách"
                    >
                      Vẫn tính tiền
                    </span>
                  </div>
                </td>
                <td class="table-td max-w-xs text-sm text-muted-foreground">{{ o.cancellation_reason || '—' }}</td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(o.cancellation_requested_at || o.created_at) }}</td>
                <td class="table-td">
                  <div class="flex items-center justify-end gap-2">
                    <button class="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400" @click="openResolve(o, 'approve')">
                      Đồng ý huỷ
                    </button>
                    <button class="text-xs font-medium text-rose-500 hover:underline dark:text-rose-400" @click="openResolve(o, 'reject')">
                      Từ chối
                    </button>
                  </div>
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

    <div class="card mt-4 overflow-hidden">
      <div class="border-b border-border bg-muted px-4 py-3">
        <h2 class="font-semibold text-foreground">Yêu cầu huỷ từng sản phẩm</h2>
      </div>
      <UiStateBlock :loading="itemLoading" :error="itemError" :empty="!itemLoading && !itemError && itemRequests.length === 0" empty-text="Không có yêu cầu huỷ sản phẩm nào." @retry="reloadItems">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted"><tr><th class="table-th">Đơn</th><th class="table-th">Sản phẩm</th><th class="table-th">Giai đoạn</th><th class="table-th">Lý do</th><th class="table-th"></th></tr></thead>
            <tbody class="divide-y divide-border">
              <tr v-for="it in itemRequests" :key="it.id">
                <td class="table-td"><NuxtLink v-if="it.order" :to="`/orders/${it.order.id}`" class="font-medium text-primary hover:underline">{{ it.order.store_order_id }}</NuxtLink><span v-else>—</span></td>
                <td class="table-td"><p class="font-medium">{{ it.product_name || it.sku_code }}</p><p class="text-xs text-muted-foreground">{{ it.sku_code }} · x{{ it.quantity }}</p></td>
                <td class="table-td">
                  <div class="flex flex-wrap items-center gap-1">
                    <span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold" :class="stageBadge(it).classes">
                      {{ stageBadge(it).label }}
                    </span>
                    <span
                      v-if="it.cancel_billable"
                      class="inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      title="Sản phẩm đã sản xuất — duyệt huỷ nhưng vẫn tính tiền khách"
                    >
                      Vẫn tính tiền
                    </span>
                  </div>
                </td>
                <td class="table-td text-sm text-muted-foreground">{{ it.cancellation_reason || '—' }}</td>
                <td class="table-td"><div class="flex justify-end gap-2"><button class="text-xs font-medium text-emerald-600 hover:underline" @click="openItemResolve(it, 'approve')">Đồng ý huỷ</button><button class="text-xs font-medium text-rose-500 hover:underline" @click="openItemResolve(it, 'reject')">Từ chối</button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiStateBlock>
    </div>

    <!-- Đã xử lý: đơn huỷ xong rơi khỏi mọi hàng chờ việc, đây là chỗ tra lại
         chúng — và là bảng kê những đơn còn phải tính tiền khách. -->
    <div class="card mt-4 overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-3">
        <div>
          <h2 class="font-semibold text-foreground">Đã xử lý</h2>
          <p class="text-xs text-muted-foreground">Đơn đã huỷ xong hoặc bị từ chối huỷ — không còn nằm trong danh sách sản xuất</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="rounded-md border px-2.5 py-1 text-xs font-medium"
            :class="onlyBillable
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-border text-muted-foreground hover:bg-muted'"
            @click="toggleBillableOnly"
          >
            Chỉ đơn còn tính tiền
          </button>
          <button class="btn-secondary text-xs" @click="reloadResolved"><UiIcon name="refresh" :size="14" /></button>
        </div>
      </div>
      <UiStateBlock
        :loading="resolvedLoading"
        :error="resolvedError"
        :empty="!resolvedLoading && !resolvedError && resolved.length === 0"
        :empty-text="onlyBillable ? 'Không có đơn huỷ nào còn phải tính tiền.' : 'Chưa có yêu cầu huỷ nào được xử lý.'"
        @retry="reloadResolved"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Mã đơn</th>
                <th class="table-th">Seller</th>
                <th class="table-th">Kết quả</th>
                <th class="table-th">Giai đoạn</th>
                <th class="table-th">Lý do</th>
                <th class="table-th">Xử lý lúc</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="o in resolved" :key="o.id" class="hover:bg-muted">
                <td class="table-td">
                  <NuxtLink :to="`/orders/${o.id}`" class="font-medium text-primary hover:underline">{{ o.store_order_id }}</NuxtLink>
                  <p class="text-xs text-muted-foreground">{{ o.internal_code }}</p>
                </td>
                <td class="table-td text-foreground">{{ o.seller?.name || o.seller?.code || '—' }}</td>
                <td class="table-td">
                  <span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold" :class="resolutionBadge(o).classes">
                    {{ resolutionBadge(o).label }}
                  </span>
                </td>
                <td class="table-td">
                  <div class="flex flex-wrap items-center gap-1">
                    <span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold" :class="stageBadge(o).classes">
                      {{ stageBadge(o).label }}
                    </span>
                    <span
                      v-if="o.cancel_billable"
                      class="inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      title="Đơn huỷ sau khi đã sản xuất — vẫn tính tiền khách"
                    >
                      Vẫn tính tiền
                    </span>
                  </div>
                </td>
                <td class="table-td max-w-xs text-sm text-muted-foreground">
                  {{ o.cancellation_reason || '—' }}
                  <p v-if="o.cancellation_resolution_note" class="text-xs italic text-muted-foreground">
                    Ghi chú: {{ o.cancellation_resolution_note }}
                  </p>
                </td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(o.cancellation_resolved_at || o.cancellation_requested_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4">
          <UiPagination
            :meta="resolvedMeta"
            :page-size="resolvedPage.page_size"
            @change="changeResolvedPage"
            @update:page-size="changeResolvedPageSize"
          />
        </div>
      </UiStateBlock>
    </div>

    <UiModal v-model="open" :title="mode === 'approve' ? 'Đồng ý huỷ' : 'Từ chối yêu cầu huỷ'">
      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">
          <template v-if="target?.kind === 'item'">Sản phẩm <span class="font-medium text-foreground">{{ target.value.product_name || target.value.sku_code }}</span></template>
          <template v-else-if="target">Đơn <span class="font-medium text-foreground">{{ target.value.store_order_id }}</span></template>
          <template v-if="mode === 'approve'"> sẽ được huỷ và loại khỏi luồng sản xuất (design, batch, QC, đóng gói).</template>
          <template v-else> sẽ tiếp tục luồng bình thường.</template>
        </p>

        <!-- Quyết định tiền: chỉ hỏi khi thật sự đang huỷ, và khi đã có công sản
             xuất bỏ ra. Bỏ tick = miễn cho khách lần này. -->
        <div
          v-if="mode === 'approve' && target"
          class="rounded-md border border-border bg-muted/50 px-3 py-2.5"
        >
          <p class="text-xs text-muted-foreground">
            Giai đoạn khi seller gửi yêu cầu: <span class="font-medium text-foreground">{{ cancelStageLabel(stageOf(target.value)) }}</span>
          </p>
          <label class="mt-2 flex items-start gap-2 text-sm text-foreground">
            <input v-model="billable" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-border" />
            <span>
              Vẫn tính tiền khách
              <span class="block text-xs text-muted-foreground">
                Đã tốn nguyên vật liệu và công sản xuất thì vẫn vào hoá đơn. Bỏ tick nếu quyết định miễn.
              </span>
            </span>
          </label>
        </div>

        <div>
          <label class="label">Ghi chú xử lý (tuỳ chọn)</label>
          <textarea v-model="note" rows="3" class="input" placeholder="Ghi chú cho seller / nội bộ…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> {{ mode === 'approve' ? 'Đồng ý huỷ' : 'Từ chối' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
