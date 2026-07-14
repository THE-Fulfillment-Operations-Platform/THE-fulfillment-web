<script setup lang="ts">
import { batchesApi, materialsApi } from '~/services/api'
import type { Batch, Material } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER, PRIORITY, PRIORITY_OPTIONS } from '~/utils/enums'
import { useApiResource } from '~/composables/useApiResource'
import { formatDate } from '~/utils/format'
import { isBatchOverdue, overdueDays } from '~/utils/batch'
import { exportCsv } from '~/utils/csv'
import { useToastStore } from '~/stores/toast'

const toast = useToastStore()
const materials = ref<Material[]>([])

const filters = reactive({
  material_id: '',
  status: '',
  priority: '',
  batch_id: '', // client-side refine
  sku: '', // client-side refine
  overdue: false, // client-side refine
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
  if (filters.overdue) list = list.filter(isBatchOverdue)
  return list
})

const overdueOnPage = computed(() => (data.value ?? []).filter(isBatchOverdue).length)

function applyFilters() {
  filters.page = 1
  reload()
}
function changePage(p: number) {
  filters.page = p
  reload()
}

function exportBatches() {
  const list = rows.value
  if (!list.length) {
    toast.info('Không có batch nào để xuất.')
    return
  }
  exportCsv(`batches-${new Date().toISOString().slice(0, 10)}`, list, [
    { label: 'Batch', value: 'code' },
    { label: 'Material', value: (b) => b.material_name || b.material?.name || b.material_code || '' },
    { label: 'Items', value: (b) => b.item_count ?? b.items?.length ?? 0 },
    { label: 'SKU', value: (b) => skuSummary(b) },
    { label: 'Status', value: (b) => INTERNAL_STATUS[b.status]?.label ?? b.status },
    { label: 'Priority', value: (b) => PRIORITY[b.priority || 'NORMAL']?.label ?? b.priority ?? '' },
    { label: 'Hạn', value: (b) => (b.due_date ? formatDate(b.due_date) : '') },
    { label: 'Trễ (ngày)', value: (b) => (isBatchOverdue(b) ? overdueDays(b) : '') },
    { label: 'Người tạo', value: (b) => b.created_by?.full_name || b.created_by?.email || '' },
  ])
  toast.success(`Đã xuất ${list.length} batch ra CSV.`)
}
</script>

<template>
  <div>
    <PageHeader title="Batches" subtitle="Lệnh sản xuất theo nhóm nguyên vật liệu">
      <template #actions>
        <button class="btn-secondary" :disabled="!rows.length" title="Xuất các batch đang hiển thị ra CSV" @click="exportBatches">
          <UiIcon name="upload" :size="16" /> Xuất CSV
        </button>
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
      <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input v-model="filters.overdue" type="checkbox" class="h-4 w-4 rounded border-border" />
          Chỉ hiện batch trễ hạn
        </label>
        <span
          v-if="overdueOnPage > 0"
          class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
        >
          <UiIcon name="alert" :size="14" /> {{ overdueOnPage }} batch trễ hạn ở trang này
        </span>
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && rows.length === 0"
        empty-text="Không có batch nào."
        skeleton
        :skeleton-rows="8"
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Batch</th>
                <th class="table-th">Material</th>
                <th class="table-th hidden md:table-cell">Items</th>
                <th class="table-th hidden lg:table-cell">SKU / Products</th>
                <th class="table-th">Status</th>
                <th class="table-th hidden sm:table-cell">Priority</th>
                <th class="table-th hidden md:table-cell">Hạn</th>
                <th class="table-th hidden lg:table-cell">Người tạo</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="b in rows" :key="b.id" class="hover:bg-muted" :class="{ 'bg-rose-50/40 dark:bg-rose-500/5': isBatchOverdue(b) }">
                <td class="table-td font-medium text-foreground">
                  <div class="flex items-center gap-1.5">
                    <span>{{ b.code }}</span>
                    <span
                      v-if="b.is_parent"
                      class="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                      title="Batch mẹ — gom nhiều batch con theo định mức NVL"
                    >
                      Mẹ · {{ b.child_count ?? b.child_batches?.length ?? 0 }} con
                    </span>
                    <span
                      v-else-if="b.parent_batch_id"
                      class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      title="Batch con"
                    >
                      con
                    </span>
                  </div>
                </td>
                <td class="table-td">{{ b.material_name || b.material?.name || b.material_code }}</td>
                <td class="table-td hidden md:table-cell">{{ b.item_count ?? b.items?.length ?? 0 }}</td>
                <td class="table-td hidden text-muted-foreground lg:table-cell">{{ skuSummary(b) }}</td>
                <td class="table-td"><UiStatusBadge kind="internal" :value="b.status" /></td>
                <td class="table-td hidden sm:table-cell"><UiStatusBadge kind="priority" :value="b.priority || 'NORMAL'" /></td>
                <td class="table-td hidden md:table-cell">
                  <span v-if="!b.due_date" class="text-muted-foreground">—</span>
                  <span v-else-if="isBatchOverdue(b)" class="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-300">
                    {{ formatDate(b.due_date) }}
                    <span class="rounded bg-rose-100 px-1 text-[10px] dark:bg-rose-500/20">trễ {{ overdueDays(b) }}n</span>
                  </span>
                  <span v-else class="text-muted-foreground">{{ formatDate(b.due_date) }}</span>
                </td>
                <td class="table-td hidden text-muted-foreground lg:table-cell">{{ b.created_by?.full_name || b.created_by?.email || '—' }}</td>
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
