<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { Batch, InternalStatus } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER } from '~/utils/enums'
import { formatDate } from '~/utils/format'
import { batchMaterialLabel, batchMaterialUnits, batchStatusBadge, PRODUCTION_FILES_READY } from '~/utils/batch'
import { useApiResource } from '~/composables/useApiResource'
import { useBatchFilterOptions } from '~/composables/useBatchFilterOptions'
import { batchFilterParams, batchFiltersFromQuery, batchFiltersToQuery } from '~/utils/batchFilters'

// Bộ lọc giống màn Batch sản xuất (cùng component BatchesFilterGrid) + ô tìm nhanh cũ.
//   - Lọc ở SERVER (/api/batches): mỗi cột gọi một lần với status của cột đó và cùng bộ
//     lọc, nên số trên đầu cột là TỔNG khớp bộ lọc (meta.total), không phải số thẻ
//     đã tải về. Trước đây bảng tải 200 batch mới nhất chung cho cả 4 cột rồi đếm —
//     cột "Đã QC" (hơn 1.600 batch) bị cắt còn ~150 và số đếm sai.
//   - Ô Trạng thái chọn cột nào thì CHỈ hiện cột đó (bỏ chọn hết = đủ 4 cột).
//   - Khoảng ngày = ngày TẠO batch, nửa mở theo giờ máy (utils/batchFilters).
//   - Bộ lọc nằm trên URL (?seller_id=3&status=CUT…): F5 / gửi link không mất lọc.
const route = useRoute()
const router = useRouter()

const COLUMN_LIMIT = 200 // trần của API cho một trang

const blank = () => ({
  q: '',
  batch_id: '',
  code: '',
  store_order: '',
  seller_id: [] as string[],
  material_id: '',
  sku: '',
  status: [] as string[],
  priority: '',
  date_from: '',
  date_to: '',
})
type Filters = ReturnType<typeof blank>

function fromQuery(): Filters {
  const parsed = batchFiltersFromQuery(route.query)
  // Chỉ nhận trạng thái là một trong 4 cột của bảng.
  const status = parsed.status.filter((x): x is InternalStatus => (INTERNAL_STATUS_ORDER as string[]).includes(x))
  return { ...blank(), ...parsed, status }
}

const filters = reactive<Filters>(fromQuery())
// Bản ĐÃ ÁP DỤNG: "Làm mới" và tải lại dùng bản này, không dùng chữ đang gõ dở.
const applied = ref<Filters>(JSON.parse(JSON.stringify(filters)))

const { materialOptions, sellerOptions, priorityOptions } = useBatchFilterOptions()
const statusOptions = INTERNAL_STATUS_ORDER.map((s) => ({ value: s, label: INTERNAL_STATUS[s].label }))

interface ColumnData { rows: Batch[]; total: number }

const { data, loading, error, reload } = useApiResource<Record<InternalStatus, ColumnData>>(async () => {
  const f = applied.value
  const wanted = f.status.length ? INTERNAL_STATUS_ORDER.filter((s) => f.status.includes(s)) : INTERNAL_STATUS_ORDER
  const common = {
    ...batchFilterParams(f),
    q: f.q.trim() || undefined,
    // Bảng sản xuất chỉ hiện batch còn việc: batch mà toàn bộ hàng đã bị huỷ ở QC
    // không còn gì để in/cắt (hàng được làm lại ở batch mới).
    open: true,
    page: 1,
    page_size: COLUMN_LIMIT,
  }
  const res = await Promise.all(wanted.map((status) => batchesApi.list({ ...common, status })))
  const out = {} as Record<InternalStatus, ColumnData>
  wanted.forEach((status, i) => {
    out[status] = { rows: res[i].data ?? [], total: res[i].meta?.total ?? res[i].data?.length ?? 0 }
  })
  return { data: out }
})

function writeUrl() {
  router.replace({ query: batchFiltersToQuery(applied.value) })
}
function applyFilters() {
  applied.value = JSON.parse(JSON.stringify(filters))
  writeUrl()
  reload()
}
function clearFilters() {
  Object.assign(filters, blank())
  applyFilters()
}
// Nút Back/Forward hay sửa tay URL: nạp lại bộ lọc từ URL nếu khác bản đang áp dụng.
watch(
  () => route.query,
  () => {
    const next = fromQuery()
    if (JSON.stringify(batchFiltersToQuery(next)) === JSON.stringify(batchFiltersToQuery(applied.value))) return
    Object.assign(filters, next)
    applied.value = JSON.parse(JSON.stringify(next))
    reload()
  },
)

const activeCount = computed(() => Object.keys(batchFiltersToQuery(applied.value)).length)
const hasFilter = computed(() => activeCount.value > 0)

const columns = computed(() => {
  const d = data.value ?? ({} as Record<InternalStatus, ColumnData>)
  return INTERNAL_STATUS_ORDER.filter((s) => d[s]).map((s) => {
    const list = [...d[s].rows]
    // API trả batch mới nhất trước, nhưng xưởng làm theo thứ tự batch: mỗi cột xếp
    // mã tăng dần từ trên xuống để batch đến lượt trước nằm trên cùng. numeric:true
    // để 101099 đứng trước 101100 (so sánh chuỗi thuần thì ngược lại).
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.id - b.id)
    return { status: s, meta: INTERNAL_STATUS[s], batches: list, total: d[s].total }
  })
})
const totalShown = computed(() => columns.value.reduce((n, c) => n + c.total, 0))
// Số cột hiện quyết định độ rộng mỗi cột (class đầy đủ để Tailwind giữ lại).
const GRID: Record<number, string> = {
  1: 'grid grid-cols-1 items-start gap-4',
  2: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2',
  3: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3',
  4: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4',
}
</script>

<template>
  <div>
    <PageHeader title="Bảng sản xuất" subtitle="Theo dõi batch ở Chờ xử lý / Đã in / Đã cắt / Đã QC">
      <template #actions>
        <button class="btn-secondary" @click="reload"><UiIcon name="refresh" :size="16" /> Làm mới</button>
      </template>
    </PageHeader>

    <div class="card mb-4 p-4">
      <BatchesFilterGrid
        :filters="filters"
        :material-options="materialOptions"
        :seller-options="sellerOptions"
        :status-options="statusOptions"
        :priority-options="priorityOptions"
        @apply="applyFilters"
      >
        <template #extra>
          <div class="col-span-2">
            <label class="label" for="production-q">Tìm nhanh</label>
            <div class="relative">
              <UiIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="production-q"
                v-model="filters.q"
                class="input pl-9"
                placeholder="Mã batch, mã đơn, mã đơn shop hoặc tên seller…"
                autocomplete="off"
                @keyup.enter="applyFilters"
              />
            </div>
          </div>
        </template>
      </BatchesFilterGrid>
    </div>
    <div v-if="hasFilter" class="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>
        Đang lọc theo {{ activeCount }} điều kiện — {{ totalShown }} batch khớp. Khoảng ngày tính theo
        <b class="text-foreground">ngày tạo batch</b>.
      </span>
      <button type="button" class="btn-secondary !px-2 !py-1 text-xs" @click="clearFilters">Xoá lọc</button>
    </div>

    <UiStateBlock :loading="loading" :error="error" @retry="reload">
      <!-- items-start stops the grid from stretching every column to the tallest
           one: an empty column keeps its own compact, stable height (min-h) with a
           centered "Trống" instead of bulging to match columns that have cards. -->
      <div :class="GRID[columns.length] ?? GRID[4]">
        <div v-for="col in columns" :key="col.status" class="flex min-h-[9rem] flex-col rounded-lg bg-muted p-3">
          <div class="mb-3 flex shrink-0 items-center justify-between px-1">
            <UiStatusBadge kind="internal" :value="col.status" />
            <span class="text-sm font-semibold text-muted-foreground">{{ col.total }}</span>
          </div>
          <div v-if="col.batches.length" class="space-y-2">
            <NuxtLink
              v-for="b in col.batches"
              :key="b.id"
              :to="`/batches/${b.id}`"
              class="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-accent/50"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold text-foreground">{{ b.code }}</span>
                <!-- Ngày tạo batch: xưởng nhìn card là biết batch nằm chờ bao lâu
                     mà không phải mở chi tiết. min-w-0 + truncate để mã batch dài
                     không đẩy badge ưu tiên rớt dòng. -->
                <span v-if="b.created_at" class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{{ formatDate(b.created_at) }}</span>
                <UiStatusBadge kind="priority" :value="b.priority || 'NORMAL'" />
              </div>
              <!-- Vật liệu in đậm, to hơn phần còn lại: nhân viên nhìn thẻ để đi lấy
                   NVL, nên đây là dòng phải đọc được đầu tiên. Số tấm NVL tính từ
                   kích thước SKU và tấm — thiếu kích thước thì không hiện. -->
              <p class="mt-1.5 text-sm font-semibold text-foreground">{{ batchMaterialLabel(b) || '—' }}</p>
              <div class="mt-0.5 flex flex-wrap items-center justify-between gap-1.5">
                <p class="text-xs text-muted-foreground">
                  <template v-if="batchMaterialUnits(b) != null">
                    <span class="font-medium text-foreground">{{ batchMaterialUnits(b) }} tấm NVL</span> ·
                  </template>
                  {{ b.item_count ?? b.items?.length ?? 0 }} items
                </p>
                <span
                  v-if="batchStatusBadge(b) === PRODUCTION_FILES_READY"
                  class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="PRODUCTION_FILES_READY.classes"
                >
                  {{ PRODUCTION_FILES_READY.label }}
                </span>
              </div>
            </NuxtLink>
          </div>
          <p v-if="col.total > col.batches.length" class="mt-2 px-1 text-center text-xs text-muted-foreground">
            Hiện {{ col.batches.length }} batch mới nhất trong {{ col.total }} — lọc thêm để thu hẹp.
          </p>
          <div v-else-if="!col.batches.length" class="flex flex-1 items-center justify-center text-xs text-muted-foreground">Trống</div>
        </div>
      </div>
    </UiStateBlock>
  </div>
</template>
