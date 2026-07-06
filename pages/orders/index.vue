<script setup lang="ts">
import { itemsApi } from '~/services/api'
import type { OrderItem } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER } from '~/utils/enums'
import { itemOrderId, itemStoreOrderId, itemMaterial, itemBatchLabel } from '~/utils/item'
import { useApiResource } from '~/composables/useApiResource'

// Item-level operational view (matches Wireframe 02). Filters map to the
// /api/items query the backend actually supports.
const filters = reactive({
  sku: '',
  status: '',
  design_status: '',
  batch_id: '',
  page: 1,
})

const { data, meta, loading, error, reload } = useApiResource<OrderItem[]>(() =>
  itemsApi.list({
    sku: filters.sku || undefined,
    status: filters.status || undefined,
    design_status: filters.design_status || undefined,
    batch_id: filters.batch_id ? Number(filters.batch_id) : undefined,
    page: filters.page,
    page_size: 20,
  }),
)

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

function applyFilters() {
  filters.page = 1
  reload()
}

function resetFilters() {
  filters.sku = ''
  filters.status = ''
  filters.design_status = ''
  filters.batch_id = ''
  applyFilters()
}

function changePage(p: number) {
  filters.page = p
  reload()
}

const items = computed(() => data.value ?? [])
</script>

<template>
  <div>
    <PageHeader
      title="Orders / Items"
      subtitle="Góc nhìn item-level — sản xuất/QC/packing chạy theo từng sản phẩm"
    />

    <!-- Filters -->
    <div class="card mb-4 p-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div>
          <label class="label">SKU</label>
          <input v-model="filters.sku" class="input" placeholder="WOOD-01" @keyup.enter="applyFilters" />
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
          <label class="label">Batch ID</label>
          <input v-model="filters.batch_id" class="input" placeholder="101001" @keyup.enter="applyFilters" />
        </div>
        <div class="flex items-end gap-2">
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
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Internal Item</th>
                <th class="table-th">Store Order</th>
                <th class="table-th">SKU</th>
                <th class="table-th">NVL</th>
                <th class="table-th">Design</th>
                <th class="table-th">Mockup</th>
                <th class="table-th">Batch</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="it in items" :key="it.id" class="hover:bg-muted">
                <td class="table-td font-medium text-foreground">{{ it.internal_code }}</td>
                <td class="table-td">{{ itemStoreOrderId(it) }}</td>
                <td class="table-td">{{ it.sku_code }}</td>
                <td class="table-td">{{ itemMaterial(it) }}</td>
                <td class="table-td"><UiStatusBadge kind="design" :value="it.design_status" /></td>
                <td class="table-td"><UiMockupLink :url="it.mockup_url" small label="Mockup" /></td>
                <td class="table-td text-muted-foreground">{{ itemBatchLabel(it) }}</td>
                <td class="table-td"><UiStatusBadge kind="internal" :value="it.internal_status" /></td>
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
          <UiPagination :meta="meta" @change="changePage" />
        </div>
      </UiStateBlock>
    </div>
  </div>
</template>
