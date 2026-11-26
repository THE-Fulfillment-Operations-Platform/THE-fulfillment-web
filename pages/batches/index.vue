<script setup lang="ts">
import { batchFilterParams } from '~/utils/batchFilters'
import { useBatchFilterOptions } from '~/composables/useBatchFilterOptions'
import { usePersistedFilters } from '~/composables/usePersistedFilters'
import { batchesApi } from '~/services/api'
import type { AutoCreateBatchesResult } from '~/services/api'
import type { Batch } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER, PRIORITY } from '~/utils/enums'
import { useApiResource } from '~/composables/useApiResource'
import { formatDate, formatDateTime } from '~/utils/format'
import {
  isBatchOverdue,
  overdueDays,
  batchProductTotal,
  batchMaterialUnits,
  batchMaterialLabel,
  batchStatusBadge,
  missingBatchLinks,
  PRODUCTION_FILES_READY,
  BATCH_HANDED_OVER,
} from '~/utils/batch'
import { exportCsv } from '~/utils/csv'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { useRowLink } from '~/composables/useRowLink'

// Bấm vào bất kỳ đâu trên một dòng là vào thẳng chi tiết (xem useRowLink).
const { rowLinkAttrs } = useRowLink()

const toast = useToastStore()
const auth = useAuthStore()

// Gom batch + gắn file sản xuất: quyền "Thao tác" của màn Batch — khớp guard BE
// trên /api/batches/auto và /api/batches/links/*.
const canDesignOps = computed(() => auth.can('batches.manage'))

const filters = reactive({
  material_id: '',
  // Ô Trạng thái và ô Seller chọn NHIỀU (chủ xưởng 22/11): mảng rỗng = Tất cả. Bản lưu
  // cũ dạng chuỗi đơn tự thành mảng (usePersistedFilters).
  status: [] as string[],
  priority: '',
  batch_id: '', // server-side: mã batch chứa chuỗi này
  sku: '', // server-side: batch chứa dòng có SKU chứa chuỗi này
  code: '', // server-side: mã nội bộ đơn / mã tem item → batch chứa đơn đó
  seller_id: [] as string[], // server-side: batch chứa hàng của (một trong) các seller này
  store_order: '', // server-side: batch chứa đơn có mã đơn shop khớp
  overdue: false, // client-side refine
  date_from: '', // server-side: batch tạo từ ngày/phút này, giờ máy (utils/dateRange apiInstantFrom) — anh Kiên 20/11
  date_to: '', // server-side: tới HẾT ngày/phút này — gửi đầu ngày/phút kế tiếp, API lọc < (apiInstantBefore)
  page: 1,
  page_size: 20,
})
usePersistedFilters('batches', filters)

const { data, meta, loading, error, reload } = useApiResource<Batch[]>(() =>
  batchesApi.list({
    ...batchFilterParams(filters),
    ...statusQuery(filters.status),
    page: filters.page,
    page_size: filters.page_size,
  }),
)

// "Đã có file SX" không phải status lưu trong DB — là PENDING đã đủ link in +
// cắt (xem batchStatusBadge). Lọc vẫn chạy ở backend (?files=) để phân trang và
// tổng số đúng; "Chờ xử lý" vì thế chỉ còn các batch chưa đủ file, khớp nhãn.
const FILES_READY = 'FILES_READY'
// Tương tự: "Đã bàn giao" là QC_PASSED mà mọi đơn còn sống đã rời xưởng (?handover=).
// "Đã QC" vì thế chỉ còn batch chưa bàn giao hết (bàn giao một phần vẫn ở đây).
const HANDED_OVER = 'HANDED_OVER'
// Không có dòng "Tất cả": UiMultiSelect tự có (bỏ chọn hết = Tất cả).
const statusOptions = [
  ...INTERNAL_STATUS_ORDER.flatMap((s) =>
    s === 'PENDING'
      ? [
          { value: s, label: INTERNAL_STATUS[s].label },
          { value: FILES_READY, label: PRODUCTION_FILES_READY.label },
        ]
      : s === 'QC_PASSED'
        ? [
            { value: s, label: INTERNAL_STATUS[s].label },
            { value: HANDED_OVER, label: BATCH_HANDED_OVER.label },
          ]
        : [{ value: s, label: INTERNAL_STATUS[s].label }],
  ),
]
// Giá trị ô Status → tham số API.
//   - Chọn MỘT mục: gửi đúng tham số kiểu cũ như trước (status + files/handover) —
//     y hệt bản trước, chạy được cả với API chưa cập nhật.
//   - Chọn NHIỀU: ?status=a,b,c — mỗi mục một token, API OR với nhau (xem
//     repositories/status_filter.go bên API). Mục gộp đổi sang token cùng nghĩa:
//     "Chờ xử lý" = FILES_MISSING, "Đã QC" = HANDOVER_PENDING (vì PENDING/QC_PASSED
//     trần là MỌI batch của trạng thái đó).
function statusQuery(list: string[]): { status?: string; files?: 'ready' | 'missing'; handover?: 'done' | 'pending' } {
  if (!list.length) return {}
  if (list.length === 1) {
    const v = list[0]
    if (v === HANDED_OVER) return { status: 'QC_PASSED', handover: 'done' }
    if (v === 'QC_PASSED') return { status: 'QC_PASSED', handover: 'pending' }
    if (v === FILES_READY) return { status: 'PENDING', files: 'ready' }
    if (v === 'PENDING') return { status: 'PENDING', files: 'missing' }
    return { status: v }
  }
  const token = (v: string) => (v === 'PENDING' ? 'FILES_MISSING' : v === 'QC_PASSED' ? 'HANDOVER_PENDING' : v)
  return { status: list.map(token).join(',') }
}
const { materialOptions, sellerOptions, priorityOptions } = useBatchFilterOptions()

// Mọi SKU của batch (đã bỏ trùng). List endpoint lồng SKU trong order_item
// (không có field phẳng trên batch item).
function skuCodes(b: Batch): string[] {
  return Array.from(
    new Set((b.items ?? []).map((i) => i.sku_code ?? i.order_item?.sku_code).filter((c): c is string => !!c)),
  )
}
// Chữ hiện trong ô: cột SKU bị giới hạn bề rộng (xem <td> bên dưới) nên chỉ cần
// danh sách đầy đủ — phần dài bị cắt bằng dấu …, rê chuột vào xem đủ (title).
// Seller của batch: một batch có thể gom hàng của nhiều seller. Ô hiện tối đa 2 tên
// ("A, B +2"), rê chuột thấy đủ (title). API đã bỏ trùng và xếp theo tên.
const SELLER_SHOWN = 2
const sellerName = (s: { name?: string; code?: string }) => s.name || s.code || ''
function sellerSummary(b: Batch): string {
  const list = (b.sellers ?? []).map(sellerName).filter(Boolean)
  if (!list.length) return '—'
  const head = list.slice(0, SELLER_SHOWN).join(', ')
  return list.length > SELLER_SHOWN ? `${head} +${list.length - SELLER_SHOWN}` : head
}
function sellerFull(b: Batch): string {
  return (b.sellers ?? []).map(sellerName).filter(Boolean).join(', ')
}
function skuSummary(b: Batch): string {
  const codes = skuCodes(b)
  return codes.length ? codes.join(', ') : '—'
}

const rows = computed(() => {
  let list = data.value ?? []
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

// Đổi số dòng/trang thì về trang 1: trang đang xem có thể không còn tồn tại ở
// kích thước mới.
function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1
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
    { label: 'Chất liệu', value: (b) => batchMaterialLabel(b) },
    { label: 'Số lượng SP', value: (b) => batchProductTotal(b) ?? '' },
    { label: 'NVL cần (tấm)', value: (b) => batchMaterialUnits(b) ?? '' },
    { label: 'Đã huỷ', value: (b) => b.scrapped_count ?? 0 },
    { label: 'Tạo lúc', value: (b) => (b.created_at ? formatDateTime(b.created_at) : '') },
    { label: 'Đóng lúc', value: (b) => (b.closed_at ? formatDate(b.closed_at) : '') },
    { label: 'Seller', value: (b) => sellerFull(b) },
    { label: 'SKU', value: (b) => skuSummary(b) },
    { label: 'Trạng thái', value: (b) => batchStatusBadge(b).label },
    { label: 'Ưu tiên', value: (b) => PRIORITY[b.priority || 'NORMAL']?.label ?? b.priority ?? '' },
    { label: 'Hạn', value: (b) => (b.due_date ? formatDate(b.due_date) : '') },
    { label: 'Trễ (ngày)', value: (b) => (isBatchOverdue(b) ? overdueDays(b) : '') },
    { label: 'Người tạo', value: (b) => b.created_by?.full_name || b.created_by?.email || '' },
  ])
  toast.success(`Đã xuất ${list.length} batch ra CSV.`)
}

// ---- Tạo batch tự động ------------------------------------------------------
// Hệ thống tự gom TOÀN BỘ sản phẩm của đơn đã duyệt chưa vào batch: phân theo NVL, chia theo định mức,
// tự sinh mã batch. Người vận hành không chọn từng sản phẩm, không đặt tên.
const autoCreating = ref(false)
const autoResult = ref<AutoCreateBatchesResult | null>(null)
const autoResultOpen = ref(false)
const linkImportOpen = ref(false)

async function autoCreateBatches() {
  if (autoCreating.value) return
  const ok = await useConfirm().confirm({
    title: 'Tạo batch tự động',
    message:
      'Hệ thống sẽ tự gom TOÀN BỘ sản phẩm của đơn đã duyệt (chưa vào batch) thành batch theo từng nguyên vật liệu và định mức, tự sinh mã batch. Tiếp tục?',
    tone: 'primary',
    confirmText: 'Tạo batch',
  })
  if (!ok) return
  autoCreating.value = true
  try {
    const { data } = await batchesApi.autoCreate()
    autoResult.value = data
    const created = data.created ?? []
    const skipped = data.skipped ?? []
    if (!created.length && !skipped.length) {
      toast.info('Không có sản phẩm nào đang chờ gom batch.')
    } else {
      autoResultOpen.value = true
      toast.success(`Đã tạo ${data.total_batches} batch từ ${data.total_items} sản phẩm.`)
    }
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    autoCreating.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Batch sản xuất" subtitle="Lệnh sản xuất theo nhóm nguyên vật liệu">
      <template #actions>
        <button class="btn-secondary" :disabled="!rows.length" title="Xuất các batch đang hiển thị ra CSV" @click="exportBatches">
          <UiIcon name="upload" :size="16" /> Xuất CSV
        </button>
        <button
          v-if="canDesignOps"
          class="btn-secondary"
          title="Tải Excel danh sách batch chờ file, điền link in/cắt rồi upload lại"
          @click="linkImportOpen = true"
        >
          <UiIcon name="link" :size="16" /> Excel link in/cắt
        </button>
        <button
          v-if="canDesignOps"
          class="btn-primary"
          :disabled="autoCreating"
          title="Hệ thống tự gom sản phẩm của đơn đã duyệt thành batch theo NVL và định mức"
          @click="autoCreateBatches"
        >
          <UiSpinner v-if="autoCreating" :size="16" />
          <UiIcon v-else name="layers" :size="16" /> Tạo batch tự động
        </button>
        <NuxtLink to="/batches/new" class="btn-secondary">
          <UiIcon name="plus" :size="16" /> Tạo batch thủ công
        </NuxtLink>
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
      />
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
        :empty-text="filters.code.trim()
          ? `Không có batch nào chứa mã ${filters.code.trim()} — kiểm tra lại mã, hoặc đơn chưa được gom vào batch.`
          : 'Không có batch nào.'"
        skeleton
        :skeleton-rows="8"
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Batch</th>
                <th class="table-th">Chất liệu</th>
                <th class="table-th" title="Seller có hàng trong batch">Seller</th>
                <th class="table-th" title="Tổng số sản phẩm trong batch (cộng SL từng dòng)">Số lượng SP</th>
                <th class="table-th" title="Số tấm NVL cần, theo định mức của từng cặp SKU – NVL (khai, chưa khai thì ước tính theo kích thước)">NVL</th>
                <th class="table-th hidden lg:table-cell">SKU / Sản phẩm</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th hidden sm:table-cell">Ưu tiên</th>
                <th class="table-th hidden md:table-cell">Hạn</th>
                <th class="table-th hidden xl:table-cell">Tạo lúc</th>
                <th class="table-th hidden lg:table-cell">Người tạo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="b in rows"
                :key="b.id"
                v-bind="rowLinkAttrs(`/batches/${b.id}`)"
                class="hover:bg-muted"
                :class="{ 'bg-rose-50/40 dark:bg-rose-500/5': isBatchOverdue(b) }"
              >
                <td class="table-td font-medium text-foreground">
                  <div class="flex items-center gap-1.5">
                    <span>{{ b.code }}</span>
                    <span
                      v-if="b.closed_at"
                      class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      :title="b.close_reason || 'Batch đã đóng'"
                    >
                      Đã đóng
                    </span>
                  </div>
                </td>
                <td class="table-td">{{ batchMaterialLabel(b) }}</td>
                <td class="table-td max-w-[12rem] truncate" :title="sellerFull(b) || undefined">{{ sellerSummary(b) }}</td>
                <td class="table-td font-medium text-foreground">
                  {{ batchProductTotal(b) ?? '—' }}
                  <!-- Batch có thể còn 0 sản phẩm mà vẫn tồn tại: hàng nó làm ra đã
                       bị huỷ ở QC. Nói ra để không ai tưởng batch lỗi/trống. -->
                  <span
                    v-if="(b.scrapped_count ?? 0) > 0"
                    class="ml-1 text-[11px] font-normal text-rose-600 dark:text-rose-400"
                    :title="`${b.scrapped_count} phần sản xuất của batch này đã bị huỷ (QC không đạt lẻ hoặc huỷ cả tấm) và đang được làm lại ở batch khác`"
                  >
                    ({{ b.scrapped_count }} huỷ)
                  </span>
                </td>
                <td class="table-td">
                  <span
                    v-if="batchMaterialUnits(b) != null"
                    title="Số tấm NVL cần, theo định mức của từng cặp SKU – NVL (khai, chưa khai thì ước tính theo kích thước)"
                  >{{ batchMaterialUnits(b) }} tấm</span>
                  <span v-else class="text-muted-foreground" title="Có sản phẩm hoặc NVL chưa khai kích thước trong Dữ liệu gốc (Master Data) — chưa tính được số tấm">—</span>
                </td>
                <td class="table-td hidden max-w-[9rem] truncate text-muted-foreground lg:table-cell" :title="skuSummary(b)">{{ skuSummary(b) }}</td>
                <td class="table-td">
                  <span class="inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium" :class="batchStatusBadge(b).classes">
                    {{ batchStatusBadge(b).label }}
                  </span>
                  <!-- Có một link rồi mà thiếu link kia: vẫn là Chờ xử lý, nhưng nói
                       rõ còn thiếu gì để designer biết mà nộp nốt. -->
                  <p
                    v-if="b.status === 'PENDING' && !b.closed_at && missingBatchLinks(b).length === 1"
                    class="mt-0.5 whitespace-nowrap text-[11px] text-amber-600 dark:text-amber-400"
                  >
                    thiếu link {{ missingBatchLinks(b)[0] === 'PRINT' ? 'in' : 'cắt' }}
                  </p>
                </td>
                <td class="table-td hidden sm:table-cell"><UiStatusBadge kind="priority" :value="b.priority || 'NORMAL'" /></td>
                <td class="table-td hidden md:table-cell">
                  <span v-if="!b.due_date" class="text-muted-foreground">—</span>
                  <span v-else-if="isBatchOverdue(b)" class="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-300">
                    {{ formatDate(b.due_date) }}
                    <span class="rounded bg-rose-100 px-1 text-[10px] dark:bg-rose-500/20">trễ {{ overdueDays(b) }}n</span>
                  </span>
                  <span v-else class="text-muted-foreground">{{ formatDate(b.due_date) }}</span>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground xl:table-cell">
                  {{ b.created_at ? formatDateTime(b.created_at) : '—' }}
                </td>
                <td class="table-td hidden text-muted-foreground lg:table-cell">{{ b.created_by?.full_name || b.created_by?.email || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4"><UiPagination
            :meta="meta"
            :page-size="filters.page_size"
            @change="changePage"
            @update:page-size="changePageSize"
          /></div>
      </UiStateBlock>
    </div>

    <!-- Kết quả tạo batch tự động: hệ thống đã gom gì, và NVL nào nó chưa tự
         xử lý được (phải gom tay) — không im lặng bỏ qua. -->
    <UiModal v-model="autoResultOpen" title="Kết quả tạo batch tự động" wide>
      <div v-if="autoResult" class="space-y-4">
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-foreground">{{ autoResult.total_batches }}</div>
            <div class="text-muted-foreground">Batch sản xuất</div>
          </div>
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-foreground">{{ autoResult.total_items }}</div>
            <div class="text-muted-foreground">Sản phẩm đã gom</div>
          </div>
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-foreground">{{ (autoResult.created ?? []).length }}</div>
            <div class="text-muted-foreground">Nguyên vật liệu</div>
          </div>
        </div>

        <div v-if="(autoResult.created ?? []).length" class="space-y-2">
          <div
            v-for="c in autoResult.created ?? []"
            :key="c.material_id"
            class="rounded-md border border-border p-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-sm font-medium text-foreground">
                {{ c.material_name }}
                <span class="text-xs font-normal text-muted-foreground">({{ c.material_code }})</span>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ c.item_count }} sản phẩm · {{ (c.batch_codes ?? []).length }} batch
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="code in c.batch_codes ?? []"
                :key="code"
                class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
              >{{ code }}</span>
            </div>
            <p v-if="(c.skipped_item_ids ?? []).length" class="mt-2 text-[11px] text-muted-foreground">
              Bỏ qua {{ (c.skipped_item_ids ?? []).length }} sản phẩm (đã được gom ở nơi khác trong lúc chạy).
            </p>
          </div>
        </div>

        <div v-if="(autoResult.skipped ?? []).length" class="space-y-2">
          <p class="text-xs font-medium text-amber-700 dark:text-amber-400">
            Nguyên vật liệu hệ thống chưa tự gom được — xử lý thủ công ở màn "Tạo batch thủ công":
          </p>
          <div
            v-for="sk in autoResult.skipped ?? []"
            :key="sk.material_code"
            class="rounded-md border border-amber-200/60 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
          >
            <span class="font-semibold">{{ sk.material_name }} ({{ sk.material_code }}):</span>
            {{ sk.reason }}
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="autoResultOpen = false">Đóng</button>
      </template>
    </UiModal>

    <BatchesLinkImportDialog v-model="linkImportOpen" @done="reload" />
  </div>
</template>
