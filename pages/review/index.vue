<script setup lang="ts">
import { reviewApi } from '~/services/api'
import type { Order } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '~/utils/enums'

// Pending Review — seller-uploaded/imported orders wait here until Ops/Design
// approves them. Only approved orders enter the design/production flow.
const filters = reactive({ status: '', search: '', page: 1 })

const { data, meta, loading, error, reload } = useApiResource<Order[]>(() =>
  reviewApi.list({
    status: filters.status || undefined,
    store_order_id: filters.search || undefined,
    page: filters.page,
    page_size: 20,
  }),
)
const orders = computed(() => data.value ?? [])

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'Chờ duyệt + Cần sửa' },
  ...REVIEW_STATUS_OPTIONS.map((s) => ({ value: s, label: REVIEW_STATUS[s].label })),
]

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
                <th class="table-th">Mã đơn</th>
                <th class="table-th">Seller / Cửa hàng</th>
                <th class="table-th">Số item</th>
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
                <td class="table-td text-foreground">
                  {{ o.seller?.name || o.seller?.code || '—' }}
                  <span v-if="o.store_name" class="text-xs text-muted-foreground">· {{ o.store_name }}</span>
                </td>
                <td class="table-td text-foreground">{{ o.items?.length ?? 0 }}</td>
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
