<script setup lang="ts">
import { batchesApi, materialsApi } from '~/services/api'
import type { Batch, Material } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER, PRIORITY, PRIORITY_OPTIONS } from '~/utils/enums'
import { useApiResource } from '~/composables/useApiResource'
import { formatDate } from '~/utils/format'

const materials = ref<Material[]>([])

const filters = reactive({
  material_id: '',
  status: '',
  priority: '',
  batch_id: '', // client-side refine
  sku: '', // client-side refine
  page: 1,
})

const { data, meta, loading, error, reload } = useApiResource<Batch[]>(() =>
  batchesApi.list({
    material_id: filters.material_id ? Number(filters.material_id) : undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    page: filters.page,
    page_size: 20,
  }),
)

const materialOptions = computed(() => [
  { value: '', label: 'Tất cả' },
  ...materials.value.map((m) => ({ value: m.id, label: m.name })),
])
const statusOptions = [
  { value: '', label: 'Tất cả' },
  ...INTERNAL_STATUS_ORDER.map((s) => ({ value: s, label: INTERNAL_STATUS[s].label })),
]
const priorityOptions = [
  { value: '', label: 'Tất cả' },
  ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: PRIORITY[p].label })),
]

onMounted(async () => {
  try {
    const { data: m } = await materialsApi.list()
    materials.value = m ?? []
  } catch {
    /* materials filter optional */
  }
})

function skuSummary(b: Batch): string {
  const codes = Array.from(new Set((b.items ?? []).map((i) => i.sku_code).filter(Boolean)))
  if (!codes.length) return '—'
  return codes.slice(0, 3).join(', ') + (codes.length > 3 ? '…' : '')
}

const rows = computed(() => {
  let list = data.value ?? []
  if (filters.batch_id) list = list.filter((b) => b.code.includes(filters.batch_id))
  if (filters.sku) {
    const q = filters.sku.toUpperCase()
    list = list.filter((b) => (b.items ?? []).some((i) => (i.sku_code ?? '').toUpperCase().includes(q)))
  }
  return list
})

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
    <PageHeader title="Batches" subtitle="Lệnh sản xuất theo nhóm nguyên vật liệu">
      <template #actions>
        <NuxtLink to="/batches/new" class="btn-primary">
          <UiIcon name="plus" :size="16" /> Tạo batch
        </NuxtLink>
      </template>
    </PageHeader>

    <div class="card mb-4 p-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div>
          <label class="label">Batch ID</label>
          <input v-model="filters.batch_id" class="input" placeholder="#101001" />
        </div>
        <div>
          <label class="label">Material</label>
          <UiSelect v-model="filters.material_id" :options="materialOptions" aria-label="Material" @change="applyFilters" />
        </div>
        <div>
          <label class="label">SKU</label>
          <input v-model="filters.sku" class="input" placeholder="WOOD-01" />
        </div>
        <div>
          <label class="label">Status</label>
          <UiSelect v-model="filters.status" :options="statusOptions" aria-label="Status" @change="applyFilters" />
        </div>
        <div>
          <label class="label">Priority</label>
          <UiSelect v-model="filters.priority" :options="priorityOptions" aria-label="Priority" @change="applyFilters" />
        </div>
        <div class="flex items-end">
          <button class="btn-secondary w-full" @click="applyFilters">
            <UiIcon name="search" :size="16" /> Lọc
          </button>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && rows.length === 0"
        empty-text="Không có batch nào."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Batch</th>
                <th class="table-th">Material</th>
                <th class="table-th">Items</th>
                <th class="table-th">SKU / Products</th>
                <th class="table-th">Status</th>
                <th class="table-th">Priority</th>
                <th class="table-th">Người tạo</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="b in rows" :key="b.id" class="hover:bg-muted">
                <td class="table-td font-medium text-foreground">{{ b.code }}</td>
                <td class="table-td">{{ b.material_name || b.material?.name || b.material_code }}</td>
                <td class="table-td">{{ b.item_count ?? b.items?.length ?? 0 }}</td>
                <td class="table-td text-muted-foreground">{{ skuSummary(b) }}</td>
                <td class="table-td"><UiStatusBadge kind="internal" :value="b.status" /></td>
                <td class="table-td"><UiStatusBadge kind="priority" :value="b.priority || 'NORMAL'" /></td>
                <td class="table-td text-muted-foreground">{{ b.creator_name || b.created_by || '—' }}</td>
                <td class="table-td text-right">
                  <NuxtLink :to="`/batches/${b.id}`" class="text-xs font-medium text-primary hover:underline">Open</NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4"><UiPagination :meta="meta" @change="changePage" /></div>
      </UiStateBlock>
    </div>
  </div>
</template>
