<script setup lang="ts">
import { sellerViewApi } from '~/services/api'
import type { SellerOrder } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { SELLER_STATUS, sellerDisplayBadge, cancelStageLabel } from '~/utils/enums'
import { useRowLink } from '~/composables/useRowLink'
import { useToastStore } from '~/stores/toast'

// Bấm vào bất kỳ đâu trên một dòng là vào thẳng chi tiết (xem useRowLink).
const { rowLinkAttrs } = useRowLink()
const toast = useToastStore()

// Seller portal — order list (Wireframe: Seller View). Confined to /seller/* by
// global middleware; the backend returns only seller-safe fields (no internal
// status, no production detail).
definePageMeta({ layout: 'seller' })

const filters = reactive({ status: '', search: '', page: 1, page_size: 20 })

const { data, meta, loading, error, reload } = useApiResource<SellerOrder[]>(() =>
  sellerViewApi.orders({
    status: filters.status || undefined,
    store_order_id: filters.search || undefined,
    page: filters.page,
    page_size: filters.page_size,
  }),
)
const orders = computed(() => data.value ?? [])

const SELLER_STATUS_OPTIONS = ['PRODUCTION', 'PACKED', 'HANDED_OFF', 'SHIPPED', 'DELIVERED'] as const

// "Đã huỷ" không phải một khâu sản xuất mà là trạng thái duyệt — backend biết
// đường tách ra. Có mặt ở đây vì đơn huỷ giữa chừng vẫn bị tính tiền, nên seller
// phải tra lại được chúng thay vì mất dấu.
const statusOptions = computed<{ value: string; label: string }[]>(() => [
  { value: '', label: 'Tất cả' },
  ...SELLER_STATUS_OPTIONS.map((s) => ({ value: s, label: SELLER_STATUS[s].label })),
  { value: 'CANCELLED', label: 'Đã huỷ' },
])

function applyFilters() {
  filters.page = 1
  reload()
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

// ---- Huỷ đơn ngay từ danh sách --------------------------------------------
// Không bắt seller mở chi tiết mới huỷ được: huỷ là việc hay làm gấp, và ở đây
// họ nhìn thấy cả trang đơn cùng lúc. Luật vẫn nằm ở BE — hai cờ can_cancel /
// can_request_cancellation quyết định hiện nút nào (và có phải chờ duyệt không).
const cancelOpen = ref(false)
const cancelTarget = ref<SellerOrder | null>(null)
const cancelling = ref(false)
const cancelMode = computed<'cancel' | 'request'>(() => (cancelTarget.value?.can_cancel ? 'cancel' : 'request'))

function openCancel(o: SellerOrder) {
  cancelTarget.value = o
  cancelOpen.value = true
}

async function submitCancel(reason: string) {
  const target = cancelTarget.value
  if (!target || cancelling.value) return
  cancelling.value = true
  try {
    if (target.can_cancel) {
      await sellerViewApi.cancel(target.id, reason || undefined)
      toast.success('Đã huỷ đơn')
    } else {
      await sellerViewApi.requestCancellation(target.id, reason || undefined)
      toast.success('Đã gửi yêu cầu huỷ — chờ vận hành duyệt')
    }
    cancelOpen.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-foreground">Đơn hàng của tôi</h1>
        <p class="mt-1 text-sm text-muted-foreground">Theo dõi tiến độ sản xuất và giao hàng các đơn của bạn</p>
        <!-- Luật huỷ nói ngay ở nơi seller duyệt đơn hằng ngày, chứ không đợi tới
             lúc họ bấm huỷ mới biết là mất tiền. -->
        <p class="mt-1 text-xs text-muted-foreground">
          Huỷ đơn: <span class="font-medium text-foreground">chưa vào sản xuất</span> thì huỷ ngay và không mất phí ·
          <span class="font-medium text-foreground">đã vào sản xuất</span> thì cần vận hành duyệt và đơn vẫn được tính tiền.
        </p>
      </div>
      <NuxtLink to="/seller/import" class="btn-primary">
        <UiIcon name="upload" :size="16" /> Tải đơn lên
      </NuxtLink>
    </div>

    <!-- Filters -->
    <div class="card mb-4 p-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="sm:col-span-1">
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
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && orders.length === 0"
        empty-text="Chưa có đơn hàng nào."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Mã đơn</th>
                <th class="table-th">Cửa hàng</th>
                <th class="table-th">Số sản phẩm</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th">Ngày tạo</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="o in orders"
                :key="o.id"
                v-bind="rowLinkAttrs(`/seller/${o.id}`)"
                class="hover:bg-muted"
                :class="{ 'bg-rose-50/60 dark:bg-rose-500/10': o.store_order_dup }"
              >
                <td class="table-td">
                  <p class="flex items-center gap-1.5 font-medium" :class="o.store_order_dup ? 'text-rose-700 dark:text-rose-300' : 'text-foreground'">
                    {{ o.store_order_id }}
                    <span
                      v-if="o.store_order_dup"
                      class="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      title="Đơn này trùng mã StoreOrderID với đơn đã tải trước — kiểm tra lại"
                    >
                      <UiIcon name="alert" :size="10" /> Trùng
                    </span>
                  </p>
                  <p class="text-xs text-muted-foreground">{{ o.internal_code }}</p>
                </td>
                <td class="table-td text-foreground">{{ o.store_name || '—' }}</td>
                <td class="table-td text-foreground">{{ o.item_count }}</td>
                <td class="table-td">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <UiStatusBadge :kind="sellerDisplayBadge(o).kind" :value="sellerDisplayBadge(o).value" />
                    <span
                      v-if="o.cancellation_status === 'REQUESTED'"
                      class="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      title="Bạn đã yêu cầu huỷ đơn này — vận hành đang xử lý"
                    >
                      <UiIcon name="alert" :size="10" /> Chờ xử lý huỷ
                    </span>
                    <!-- Đơn huỷ mà vẫn vào hoá đơn: phải thấy ngay ở danh sách,
                         không bắt mở từng đơn mới biết mình bị tính tiền. -->
                    <span
                      v-else-if="o.cancel_billable"
                      class="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      :title="`Huỷ khi đơn ${cancelStageLabel(o.cancel_stage).toLowerCase()} — vẫn tính tiền`"
                    >
                      Vẫn tính tiền
                    </span>
                    <span
                      v-else-if="o.cancellation_status === 'REJECTED'"
                      class="inline-flex items-center gap-0.5 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      title="Vận hành đã từ chối yêu cầu huỷ — đơn vẫn đang chạy"
                    >
                      Từ chối huỷ
                    </span>
                  </div>
                </td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(o.created_at) }}</td>
                <td class="table-td">
                  <!-- Chưa sản xuất: huỷ thẳng. Đã sản xuất: chỉ xin được, và nút
                       nói rõ là vẫn tính tiền để không ai bấm nhầm. -->
                  <div class="flex justify-end">
                    <button
                      v-if="o.can_cancel"
                      class="whitespace-nowrap rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      @click="openCancel(o)"
                    >
                      Huỷ đơn
                    </button>
                    <button
                      v-else-if="o.can_request_cancellation"
                      class="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                      title="Đơn đã vào sản xuất — vận hành phải duyệt, và đơn vẫn được tính tiền"
                      @click="openCancel(o)"
                    >
                      Yêu cầu huỷ
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

    <SellerCancelDialog
      v-model="cancelOpen"
      :mode="cancelMode"
      :will-bill="cancelTarget?.cancel_will_bill"
      :order-code="cancelTarget?.store_order_id"
      :saving="cancelling"
      @submit="submitCancel"
    />
  </div>
</template>
