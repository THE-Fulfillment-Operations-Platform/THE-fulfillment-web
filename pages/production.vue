<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { BatchStageCounts } from '~/services/api'
import type { Batch } from '~/types'
import { INTERNAL_STATUS } from '~/utils/enums'
import { formatDate } from '~/utils/format'
import { batchMaterialLabel, batchMaterialUnits } from '~/utils/batch'
import { useBatchFilterOptions } from '~/composables/useBatchFilterOptions'
import { batchFilterParams, batchFiltersFromQuery, batchFiltersToQuery } from '~/utils/batchFilters'
import {
  BATCH_LIFECYCLE_ORDER,
  boardColumns,
  cardStageChip,
  columnBreakdown,
  columnParams,
  mergePage,
  stageFilterOptions,
  stageMeta,
  stagesFromQuery,
  type BoardColumnSpec,
} from '~/utils/batchStages'
import { errorMessage } from '~/utils/api-error'

// Bảng sản xuất. Bộ lọc giống màn Batch (cùng BatchesFilterGrid) + ô tìm nhanh.
//   - Lọc ở SERVER (/api/batches): mỗi cột gọi riêng với cùng bộ lọc, nên số trên
//     đầu cột là TỔNG khớp bộ lọc (meta.total), không phải số thẻ đã tải.
//   - Ô Trạng thái có ĐỦ mọi chặng của batch (utils/batchStages.ts, Nghĩa 27/11):
//     Chờ xử lý, Đã có file SX, Đã in, Đã cắt, Đã QC, Đã đóng gói, Đã bàn giao,
//     Đã gửi đi, Đã giao, Đã đóng, Đơn đã huỷ hết — mỗi mục kèm số batch.
//   - Không chọn gì (= Tất cả) giữ y bảng cũ: 4 cột Chờ xử lý / Đã in / Đã cắt /
//     Đã QC, mọi batch còn việc; đầu cột tách số theo chặng, bấm vào là lọc đúng
//     chặng đó. Chọn chặng thì mỗi chặng một cột.
//   - Mỗi cột tải COLUMN_PAGE batch, "Xem thêm" tải tiếp — cột Đã QC (~1.700 batch)
//     không tải hết một lần. Cột còn việc xếp cũ nhất trước (đến lượt trước nằm
//     trên); cột đã xong xếp mới nhất trước.
//   - Khoảng ngày = ngày TẠO batch, nửa mở theo giờ máy (utils/batchFilters).
//   - Bộ lọc nằm trên URL (?seller_id=3&status=HANDED_OFF…): F5 / gửi link không mất lọc.
const route = useRoute()
const router = useRouter()

const COLUMN_PAGE = 50

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
  // Chỉ nhận mã chặng; link cũ (?status=PENDING / HANDED_OVER…) đổi sang chặng cùng nghĩa.
  return { ...blank(), ...parsed, status: stagesFromQuery(parsed.status) }
}

const filters = reactive<Filters>(fromQuery())
// Bản ĐÃ ÁP DỤNG: "Làm mới" và tải lại dùng bản này, không dùng chữ đang gõ dở.
const applied = ref<Filters>(JSON.parse(JSON.stringify(filters)))

const { materialOptions, sellerOptions, priorityOptions } = useBatchFilterOptions()

// ---- Dữ liệu --------------------------------------------------------------------
interface Column extends BoardColumnSpec {
  rows: Batch[]
  total: number
  page: number
  more: boolean // đang tải "Xem thêm"
  moreError: string | null
}

const columnsState = ref<Column[]>([])
const counts = ref<BatchStageCounts | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let seq = 0 // lần tải mới nhất thắng (bấm lọc liên tục)

function commonParams(f: Filters) {
  return { ...batchFilterParams(f), q: f.q.trim() || undefined }
}

async function fetchColumn(spec: BoardColumnSpec, f: Filters, page: number) {
  return batchesApi.list({ ...commonParams(f), ...columnParams(spec), page, page_size: COLUMN_PAGE })
}

async function load() {
  const mine = ++seq
  const f = applied.value
  loading.value = true
  error.value = null
  try {
    // Bảng đếm và các cột tải song song. Đếm hỏng (API cũ) thì bảng vẫn chạy, chỉ
    // thiếu số trong ô lọc và dòng tách đầu cột.
    const countsP = batchesApi.stageCounts(commonParams(f)).then((r) => r.data).catch(() => null)
    let specs = boardColumns(f.status)
    const pages = await Promise.all(specs.map((s) => fetchColumn(s, f, 1)))
    const c = await countsP
    if (mine !== seq) return
    // Trạng thái lưu lạ (không phải 4 cột) mà DB có: thêm cột cho nó ở chế độ mặc định.
    let extraPages: typeof pages = []
    if (!f.status.length && c) {
      const all = boardColumns([], Object.keys(c.by_status ?? {}))
      const extra = all.slice(specs.length)
      if (extra.length) {
        extraPages = await Promise.all(extra.map((s) => fetchColumn(s, f, 1)))
        if (mine !== seq) return
        specs = all
      }
    }
    const res = [...pages, ...extraPages]
    counts.value = c
    columnsState.value = specs.map((s, i) => ({
      ...s,
      rows: res[i].data ?? [],
      total: res[i].meta?.total ?? res[i].data?.length ?? 0,
      page: 1,
      more: false,
      moreError: null,
    }))
  } catch (e) {
    if (mine !== seq) return
    error.value = errorMessage(e)
    columnsState.value = []
  } finally {
    if (mine === seq) loading.value = false
  }
}
onMounted(load)

async function loadMore(col: Column) {
  if (col.more) return
  const mine = seq
  col.more = true
  col.moreError = null
  try {
    const res = await fetchColumn(col, applied.value, col.page + 1)
    if (mine !== seq) return // bộ lọc đã đổi trong lúc tải
    col.rows = mergePage(col.rows, res.data ?? [])
    col.total = res.meta?.total ?? col.total
    col.page += 1
  } catch (e) {
    col.moreError = errorMessage(e)
  } finally {
    col.more = false
  }
}

// ---- Bộ lọc <-> URL -------------------------------------------------------------
function writeUrl() {
  router.replace({ query: batchFiltersToQuery(applied.value) })
}
function applyFilters() {
  filters.status = stagesFromQuery(filters.status)
  applied.value = JSON.parse(JSON.stringify(filters))
  writeUrl()
  load()
}
function clearFilters() {
  Object.assign(filters, blank())
  applyFilters()
}
// Bấm số tách ở đầu cột mặc định: lọc đúng chặng đó, giữ mọi bộ lọc khác.
function pickStage(stage: string) {
  filters.status = [stage]
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
    load()
  },
)

const activeCount = computed(() => Object.keys(batchFiltersToQuery(applied.value)).length)
const hasFilter = computed(() => activeCount.value > 0)

// Ô Trạng thái: đủ mọi chặng, mỗi mục kèm số batch khớp các bộ lọc khác.
const statusOptions = computed(() => stageFilterOptions(counts.value?.stages))
// Chặng lạ mà API đếm được nhưng web chưa biết (API mới hơn web): nói ra, không giấu.
const unknownStages = computed(() =>
  Object.entries(counts.value?.stages ?? {}).filter(([s, n]) => n > 0 && !(BATCH_LIFECYCLE_ORDER as string[]).includes(s)),
)

const columns = computed(() =>
  columnsState.value.map((c) => {
    const meta = c.kind === 'status' ? (INTERNAL_STATUS[c.value as keyof typeof INTERNAL_STATUS] ?? stageMeta(c.value)) : stageMeta(c.value)
    return {
      col: c,
      meta,
      breakdown: c.kind === 'status' ? columnBreakdown(counts.value?.by_status, c.value) : [],
    }
  }),
)
const totalShown = computed(() => columnsState.value.reduce((n, c) => n + c.total, 0))
const fmt = (n: number) => n.toLocaleString('vi-VN')
// Số cột quyết định độ rộng (class đầy đủ để Tailwind giữ lại). Từ 5 cột trở lên
// thì cuộn ngang, mỗi cột rộng cố định.
const GRID: Record<number, string> = {
  1: 'grid grid-cols-1 items-start gap-4',
  2: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2',
  3: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3',
  4: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4',
}
const WIDE = 'grid auto-cols-[minmax(17rem,1fr)] grid-flow-col items-start gap-4 overflow-x-auto pb-2'
</script>

<template>
  <div>
    <PageHeader title="Bảng sản xuất" subtitle="Theo dõi batch theo từng khâu: mặc định Chờ xử lý / Đã in / Đã cắt / Đã QC; chọn Trạng thái để xem các khâu khác">
      <template #actions>
        <button class="btn-secondary" @click="load"><UiIcon name="refresh" :size="16" /> Làm mới</button>
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
      <p v-if="!applied.status.length" class="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        Trạng thái "Tất cả": 4 cột theo khâu, gồm mọi batch còn việc. Batch
        <b class="text-foreground">Đã đóng</b> (huỷ batch / huỷ hết ở QC) chỉ hiện khi chọn riêng.
      </p>
      <p v-if="unknownStages.length" class="mt-2 text-xs text-amber-700 dark:text-amber-400">
        Có batch ở trạng thái web chưa biết:
        <span v-for="([s, n], i) in unknownStages" :key="s"><template v-if="i">, </template><code>{{ s }}</code> ({{ fmt(n) }})</span>.
      </p>
    </div>
    <div v-if="hasFilter" class="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>
        Đang lọc theo {{ activeCount }} điều kiện — {{ fmt(totalShown) }} batch khớp. Khoảng ngày tính theo
        <b class="text-foreground">ngày tạo batch</b>.
      </span>
      <button type="button" class="btn-secondary !px-2 !py-1 text-xs" @click="clearFilters">Xoá lọc</button>
    </div>

    <UiStateBlock :loading="loading" :error="error" @retry="load">
      <!-- items-start stops the grid from stretching every column to the tallest
           one: an empty column keeps its own compact, stable height (min-h) with a
           centered "Trống" instead of bulging to match columns that have cards. -->
      <div :class="GRID[columns.length] ?? WIDE">
        <div v-for="{ col, meta, breakdown } in columns" :key="col.key" class="flex min-h-[9rem] flex-col rounded-lg bg-muted p-3">
          <div class="mb-1 flex shrink-0 items-center justify-between px-1">
            <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium" :class="meta.classes">{{ meta.label }}</span>
            <span class="text-sm font-semibold text-muted-foreground">{{ fmt(col.total) }}</span>
          </div>
          <!-- Cột mặc định gồm nhiều chặng: tách số, bấm là lọc đúng chặng đó. -->
          <div v-if="breakdown.length" class="mb-2 flex flex-wrap gap-x-2 gap-y-1 px-1 text-[11px] text-muted-foreground">
            <button
              v-for="p in breakdown"
              :key="p.stage"
              type="button"
              class="rounded hover:text-foreground hover:underline"
              :title="`Chỉ xem ${stageMeta(p.stage).label}`"
              @click="pickStage(p.stage)"
            >
              <b class="font-semibold text-foreground">{{ fmt(p.count) }}</b> {{ stageMeta(p.stage).label }}
            </button>
          </div>
          <div v-else class="mb-2" />
          <div v-if="col.rows.length" class="space-y-2">
            <NuxtLink
              v-for="b in col.rows"
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
                <!-- Cột mặc định: thẻ ở chặng khác chặng chính của cột thì nói ra
                     (Đã có file SX ở cột Chờ xử lý, Đã bàn giao ở cột Đã QC…). -->
                <span
                  v-if="cardStageChip(b, col)"
                  class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="cardStageChip(b, col)!.classes"
                >
                  {{ cardStageChip(b, col)!.label }}
                </span>
              </div>
              <p v-if="b.closed_at && b.close_reason" class="mt-1 truncate text-[11px] text-muted-foreground" :title="b.close_reason">
                {{ b.close_reason }}
              </p>
            </NuxtLink>
          </div>
          <div v-else class="flex flex-1 items-center justify-center text-xs text-muted-foreground">Trống</div>
          <div v-if="col.total > col.rows.length" class="mt-2 space-y-1 px-1 text-center">
            <button type="button" class="btn-secondary w-full !py-1 text-xs" :disabled="col.more" @click="loadMore(col)">
              <UiSpinner v-if="col.more" :size="14" />
              Xem thêm {{ Math.min(COLUMN_PAGE, col.total - col.rows.length) }} batch
              <span class="text-muted-foreground">(đang hiện {{ fmt(col.rows.length) }} / {{ fmt(col.total) }})</span>
            </button>
            <p v-if="col.moreError" class="text-[11px] text-red-700 dark:text-red-400">{{ col.moreError }}</p>
          </div>
        </div>
      </div>
    </UiStateBlock>
  </div>
</template>
