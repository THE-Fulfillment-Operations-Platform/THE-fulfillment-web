<script setup lang="ts">
import { reviewApi } from '~/services/api'
import type { Order } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useSelection } from '~/composables/useSelection'
import { useConfirm } from '~/composables/useConfirm'
import { useToastStore } from '~/stores/toast'
import { formatDateTime } from '~/utils/format'
import { errorMessage } from '~/utils/api-error'
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '~/utils/enums'

// Pending Review — seller-uploaded/imported orders wait here until Ops/Design
// approves them. Only approved orders enter the design/production flow.
const filters = reactive({ status: '', search: '', page: 1 })
const toast = useToastStore()

const { data, meta, loading, error, reload } = useApiResource<Order[]>(() =>
  reviewApi.list({
    status: filters.status || undefined,
    store_order_id: filters.search || undefined,
    page: filters.page,
    page_size: 20,
  }),
)
const orders = computed(() => data.value ?? [])

// Bulk selection over the CURRENTLY VISIBLE page only. Selection is cleared on any
// page/filter/search change so we never carry hidden ticks into a bulk action.
const { selectedIds, count, isSelected, toggle, allSelected, someSelected, toggleAll, clear } =
  useSelection<Order>(() => orders.value)

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'Chờ duyệt + Cần sửa' },
  ...REVIEW_STATUS_OPTIONS.map((s) => ({ value: s, label: REVIEW_STATUS[s].label })),
]

function applyFilters() {
  filters.page = 1
  clear()
  reload()
}
function changePage(p: number) {
  filters.page = p
  clear()
  reload()
}

const submitting = ref(false)
async function bulkApprove() {
  if (!count.value || submitting.value) return
  const ok = await useConfirm().confirm({
    title: 'Duyệt các đơn đã chọn',
    message: `Duyệt ${count.value} đơn đang chọn? Chỉ đơn hợp lệ (không còn lỗi chặn) mới được duyệt; các đơn khác sẽ được bỏ qua kèm lý do.`,
    tone: 'primary',
    confirmText: `Duyệt ${count.value} đơn`,
  })
  if (!ok) return
  submitting.value = true
  try {
    const { data: res } = await reviewApi.bulkApprove(selectedIds.value)
    if (res.approved_count > 0) toast.success(`Đã duyệt ${res.approved_count} đơn`)
    if (res.skipped_count > 0) {
      const reasons = res.skipped
        .slice(0, 3)
        .map((s) => `#${s.order_id}: ${s.reason}`)
        .join(' · ')
      toast.error(
        `${res.skipped_count} đơn bị bỏ qua. ${reasons}${res.skipped.length > 3 ? ' …' : ''}`,
      )
    }
    if (res.approved_count === 0 && res.skipped_count === 0) toast.info('Không có đơn nào được xử lý')
    clear()
    reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Chờ duyệt"
      subtitle="Đơn seller upload phải được Ops/Design duyệt trước khi vào sản xuất"
    />

    <!-- Filters -->
    <div class="card mb-4 p-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label class="label">Trạng thái</label>
          <UiSelect v-model="filters.status" :options="statusOptions" aria-label="Trạng thái" @change="applyFilters" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Mã đơn (Store Order ID)</label>
          <div class="flex gap-2">
            <input v-model="filters.search" class="input" placeholder="VD: Etsy-7821" @keyup.enter="applyFilters" />
            <button class="btn-primary" @click="applyFilters"><UiIcon name="search" :size="16" /> Tìm</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <!-- Bulk action bar (slides in when rows are ticked). -->
      <UiBulkBar :count="count" noun="đơn" @clear="clear">
        <button class="btn-primary" :disabled="submitting" @click="bulkApprove">
          <UiSpinner v-if="submitting" :size="16" />
          <UiIcon v-else name="check" :size="16" />
          {{ submitting ? 'Đang duyệt…' : `Duyệt ${count} đơn đã chọn` }}
        </button>
      </UiBulkBar>

      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && orders.length === 0"
        empty-text="Không có đơn nào chờ duyệt."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th w-10">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-border align-middle accent-primary"
                    :checked="allSelected"
                    :indeterminate.prop="someSelected"
                    aria-label="Chọn tất cả đơn trên trang"
                    @change="toggleAll"
                  />
                </th>
                <th class="table-th">Mã đơn</th>
                <th class="table-th">Seller / Cửa hàng</th>
                <th class="table-th">Số item</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th">Ngày tạo</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="o in orders"
                :key="o.id"
                class="hover:bg-muted"
                :class="{ 'bg-primary/5': isSelected(o.id), 'bg-rose-50/60 dark:bg-rose-500/10': o.store_order_dup && !isSelected(o.id) }"
              >
                <td class="table-td">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-border align-middle accent-primary"
                    :checked="isSelected(o.id)"
                    :aria-label="`Chọn đơn ${o.store_order_id}`"
                    @change="toggle(o.id)"
                  />
                </td>
                <td class="table-td">
                  <p class="flex items-center gap-1.5 font-medium" :class="o.store_order_dup ? 'text-rose-700 dark:text-rose-300' : 'text-foreground'">
                    {{ o.store_order_id }}
                    <span
                      v-if="o.store_order_dup"
                      class="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      title="StoreOrderID này trùng với đơn khác — kiểm tra, báo khách nếu cần"
                    >
                      <UiIcon name="alert" :size="10" /> Trùng
                    </span>
                  </p>
                  <p class="text-xs text-muted-foreground">{{ o.internal_code }}</p>
                </td>
                <td class="table-td text-foreground">
                  {{ o.seller?.name || o.seller?.code || '—' }}
                  <span v-if="o.store_name" class="text-xs text-muted-foreground">· {{ o.store_name }}</span>
                </td>
                <td class="table-td text-foreground">{{ o.items?.filter(it => it.cancellation_status !== 'SELLER_CANCELLED' && it.cancellation_status !== 'APPROVED').length ?? 0 }}</td>
                <td class="table-td"><UiStatusBadge kind="review" :value="o.review_status" /></td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(o.created_at) }}</td>
                <td class="table-td text-right">
                  <NuxtLink :to="`/review/${o.id}`" class="text-xs font-medium text-primary hover:underline">
                    Xem & duyệt
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4">
          <UiPagination :meta="meta" @change="changePage" />
        </div>
      </UiStateBlock>
    </div>
  </div>
</template>
