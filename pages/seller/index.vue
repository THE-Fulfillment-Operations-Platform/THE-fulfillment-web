<script setup lang="ts">
import { sellerViewApi } from '~/services/api'
import type { SellerOrder } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'
import { SELLER_STATUS, sellerDisplayBadge } from '~/utils/enums'

// Seller portal — order list (Wireframe: Seller View). Confined to /seller/* by
// global middleware; the backend returns only seller-safe fields (no internal
// status, no production detail).
definePageMeta({ layout: 'seller' })

const filters = reactive({ status: '', search: '', page: 1 })

const { data, meta, loading, error, reload } = useApiResource<SellerOrder[]>(() =>
  sellerViewApi.orders({
    status: filters.status || undefined,
    store_order_id: filters.search || undefined,
    page: filters.page,
    page_size: 20,
  }),
)
const orders = computed(() => data.value ?? [])

const SELLER_STATUS_OPTIONS = ['PRODUCTION', 'PACKED', 'HANDED_OFF', 'SHIPPED'] as const

const statusOptions = computed<{ value: string; label: string }[]>(() => [
  { value: '', label: 'Tất cả' },
  ...SELLER_STATUS_OPTIONS.map((s) => ({ value: s, label: SELLER_STATUS[s].label })),
])

function applyFilters() {
  filters.page = 1
  reload()
}
function changePage(p: number) {
  filters.page = p
  reload()
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-foreground">Đơn hàng của tôi</h1>
        <p class="mt-1 text-sm text-muted-foreground">Theo dõi tiến độ sản xuất và giao hàng các đơn của bạn</p>
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
              <tr v-for="o in orders" :key="o.id" class="hover:bg-muted">
                <td class="table-td">
                  <p class="font-medium text-foreground">{{ o.store_order_id }}</p>
                  <p class="text-xs text-muted-foreground">{{ o.internal_code }}</p>
                </td>
                <td class="table-td text-foreground">{{ o.store_name || '—' }}</td>
                <td class="table-td text-foreground">{{ o.item_count }}</td>
                <td class="table-td">
                  <UiStatusBadge :kind="sellerDisplayBadge(o).kind" :value="sellerDisplayBadge(o).value" />
                </td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(o.created_at) }}</td>
                <td class="table-td text-right">
                  <NuxtLink :to="`/seller/${o.id}`" class="text-xs font-medium text-primary hover:underline">
                    Chi tiết
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
