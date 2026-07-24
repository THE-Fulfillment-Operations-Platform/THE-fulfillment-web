<script setup lang="ts">
import { designApi, itemsApi } from '~/services/api'
import type { Batch, Material, MaterialBucket, OrderItem } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useSelection } from '~/composables/useSelection'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import { isValidUrl } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

const toast = useToastStore()
const { confirm, state: confirmState } = useConfirm()
const pager = reactive({ page: 1, page_size: 50 })
const filters = reactive({
  batch: '',
  appliedBatch: '',
  material: '' as '' | number,
  sort: 'batch' as 'batch' | 'created_at',
  order: 'asc' as 'asc' | 'desc',
})
const { data, meta, loading, error, reload } = useApiResource<OrderItem[]>(() =>
  designApi.queue({
    page: pager.page,
    page_size: pager.page_size,
    batch: filters.appliedBatch || undefined,
    material_id: filters.material === '' ? undefined : filters.material,
    sort: filters.sort,
    order: filters.order,
  }),
)
const items = computed(() => data.value ?? [])

// The "gom theo NVL" dropdown lists only materials that actually have items in the
// queue (with counts), not the whole catalog — otherwise it's hundreds of materials
// whose rows are all empty. Refetched whenever the queue's contents change, since a
// material drops off once its last item leaves. Non-blocking: on failure the queue
// still works, the filter just stays empty.
const materials = ref<MaterialBucket[]>([])
async function loadQueueMaterials() {
  try {
    const { data } = await designApi.queueMaterials({ batch: filters.appliedBatch || undefined })
    materials.value = data ?? []
    // A material that just emptied out would leave the filter stuck on zero rows.
    if (filters.material !== '' && !materials.value.some((m) => m.material_id === filters.material)) {
      filters.material = ''
    }
  } catch {
    /* dropdown optional — leave empty */
  }
}
onMounted(loadQueueMaterials)

// Counts ride in `hint` rather than the label so they align in their own column.
const materialOptions = computed(() => [
  // No count on "all": a combo SKU sits in several buckets, so summing them would
  // overstate the queue.
  { value: '', label: 'Tất cả NVL' },
  ...materials.value.map((m) => ({
    value: m.material_id,
    label: m.material_code,
    hint: String(m.item_count),
  })),
])
// UiSelect hands back `string | number`; the filter only ever holds '' or an id.
const materialValue = computed({
  get: () => filters.material,
  set: (value: string | number) => {
    filters.material = value === '' ? '' : Number(value)
  },
})

const sortOptions = [
  { value: 'batch:asc', label: 'Batch tăng dần' },
  { value: 'batch:desc', label: 'Batch giảm dần' },
  { value: 'created_at:desc', label: 'Đơn mới nhất' },
  { value: 'created_at:asc', label: 'Đơn cũ nhất' },
]
const sortValue = computed({
  get: () => `${filters.sort}:${filters.order}`,
  set: (value: string | number) => {
    const [sort, order] = String(value).split(':') as ['batch' | 'created_at', 'asc' | 'desc']
    filters.sort = sort
    filters.order = order
  },
})

const hasActiveFilters = computed(
  () =>
    Boolean(filters.appliedBatch) ||
    filters.material !== '' ||
    filters.sort !== 'batch' ||
    filters.order !== 'asc',
)

// Any change to what the list shows drops both selections: the tick marks refer
// to rows the user is about to stop seeing, and the panel to a row that may no
// longer be in the queue.
function resetView() {
  pager.page = 1
  selected.value = null
  clearReadySelection()
  reload()
  // The batch filter narrows the queue, so the NVL options change with it.
  loadQueueMaterials()
}

function applyFilters() {
  filters.appliedBatch = filters.batch.trim()
  resetView()
}

function resetFilters() {
  filters.batch = ''
  filters.appliedBatch = ''
  filters.material = ''
  filters.sort = 'batch'
  filters.order = 'asc'
  resetView()
}

// The material dropdown applies immediately (unlike the batch text box, which waits
// for the Apply button) — picking a material is the whole action.
function changeMaterial() {
  resetView()
}

function changeSort() {
  resetView()
}

function changePage(p: number) {
  pager.page = p
  selected.value = null
  clearReadySelection()
  reload()
}

const selected = ref<OrderItem | null>(null)
// No print/cut fields: those files are ganged per production batch and entered once
// on the batch, which fans them down onto every item. Editing them per item here
// would fight that, so the panel only owns the seller-side assets.
const form = reactive({ mockup_url: '', design_url: '', back_design_url: '' })
const saving = ref(false)
const settingReady = ref(false)

// ---- Bulk "Set ready" ------------------------------------------------------
// Tick rows (usually after filtering by NVL) and set them all ready in one call,
// so a whole material's orders reach the create-batch bucket without opening each.
const bulkSettingReady = ref(false)

// An item still needs a mockup to become ready, and one that's already READY has
// nothing to do — only offer the ones a bulk action can actually move.
function canBulkReady(it: OrderItem) {
  return it.design_status !== 'READY' && isValidUrl(it.mockup_url ?? '')
}
const bulkReadyableItems = computed(() => items.value.filter(canBulkReady))

const {
  selectedIds: readyIds,
  count: readyCount,
  isSelected: isReadySelected,
  toggle: toggleReadyRow,
  allSelected: allReadyableSelected,
  someSelected: someReadySelected,
  toggleAll: toggleSelectAllReady,
  clear: clearReadySelection,
} = useSelection(() => bulkReadyableItems.value)

async function bulkSetReady() {
  const ids = readyIds.value
  if (!ids.length || bulkSettingReady.value) return
  bulkSettingReady.value = true
  try {
    const { data } = await designApi.bulkSetReady(ids)
    const ok = data?.ready_ids.length ?? 0
    const skipped = data?.skipped.length ?? 0
    if (ok) toast.success(`Đã set ready ${ok} đơn` + (skipped ? `, bỏ qua ${skipped}` : ''))
    else if (skipped) toast.error(`Không set được đơn nào — bỏ qua ${skipped} (thiếu mockup/đã huỷ)`)
    clearReadySelection()
    selected.value = null
    await reload()
    // Items just left the queue — a material may have emptied out entirely.
    await loadQueueMaterials()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    bulkSettingReady.value = false
  }
}

function itemBatches(it: OrderItem) {
  const batches = (it.batch_items ?? [])
    .map((ref) => ref.batch)
    .filter((batch): batch is Batch => Boolean(batch?.id))
  return Array.from(new Map(batches.map((batch) => [batch.id, batch])).values())
}

// The NVL(s) an item can be grouped by come from its SKU→material mapping (a combo
// SKU may list several). This is what tells the designer which items share a sheet
// before any batch exists.
function itemMaterials(it: OrderItem) {
  const mats = (it.sku?.materials ?? [])
    .map((m) => m.material)
    .filter((m): m is Material => Boolean(m?.id))
  return Array.from(new Map(mats.map((m) => [m.id, m])).values())
}

// ---- Detail panel ----------------------------------------------------------
const panelEl = ref<HTMLElement | null>(null)

function applySelection(it: OrderItem) {
  selected.value = it
  form.mockup_url = it.mockup_url ?? ''
  form.design_url = it.design_url ?? ''
  form.back_design_url = it.back_design_url ?? ''
  // Below lg the panel stacks under the table, so a tap on a row would otherwise
  // look like nothing happened. From lg up it's already pinned beside the list.
  if (window.matchMedia('(max-width: 1023px)').matches) {
    nextTick(() => panelEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

// Edits live only in `form` until saved, and arrow-key navigation makes it easy to
// step off a row by accident — so leaving a dirty panel asks first.
const dirty = computed(() => {
  const it = selected.value
  if (!it) return false
  return (
    form.mockup_url !== (it.mockup_url ?? '') ||
    form.design_url !== (it.design_url ?? '') ||
    form.back_design_url !== (it.back_design_url ?? '')
  )
})

async function confirmLeave() {
  if (!dirty.value) return true
  return confirm({
    title: 'Bỏ thay đổi chưa lưu?',
    message: `Item ${selected.value?.internal_code} có thay đổi chưa được lưu. Rời đi sẽ mất các thay đổi này.`,
    confirmText: 'Bỏ thay đổi',
    cancelText: 'Ở lại',
    tone: 'warning',
  })
}

async function select(it: OrderItem) {
  if (selected.value?.id === it.id) return
  if (!(await confirmLeave())) return
  applySelection(it)
}

async function closePanel() {
  if (!(await confirmLeave())) return
  selected.value = null
}

// Print/cut files are ganged per production batch and attached to the batch (which
// fans them back down onto its items), so they don't exist yet at this stage —
// readiness only needs the mockup as the QC reference. The backend gates the same.
const canSetReady = computed(() => isValidUrl(form.mockup_url))

const validMockupUrl = computed(() => isValidUrl(form.mockup_url))
const validDesignUrl = computed(() => isValidUrl(form.design_url))
// Read-only: print/cut arrive on the item only when its batch link is set, so these
// reflect the batch's files rather than anything editable here.
const batchPrintUrl = computed(() => selected.value?.print_file_url ?? '')
const batchCutUrl = computed(() => selected.value?.cut_file_url ?? '')
const validPrintUrl = computed(() => isValidUrl(batchPrintUrl.value))
const validCutUrl = computed(() => isValidUrl(batchCutUrl.value))

// Mockup URLs are images in practice, so the panel shows one — but the field only
// promises a URL, so a non-image just falls back to the plain link.
const mockupPreviewFailed = ref(false)
watch(() => form.mockup_url, () => (mockupPreviewFailed.value = false))
const showMockupPreview = computed(() => validMockupUrl.value && !mockupPreviewFailed.value)

function downloadAsset(url: string, filename?: string) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  if (filename) a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ---- Keyboard navigation ---------------------------------------------------
// A design pass is "look at row, fix URL, next row" hundreds of times — ↑/↓ walks
// the queue without the mouse, Esc closes the panel.
const listPane = ref<HTMLElement | null>(null)
const selectedIndex = computed(() => items.value.findIndex((it) => it.id === selected.value?.id))

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

async function moveSelection(delta: number) {
  if (!items.value.length) return
  const next = selectedIndex.value === -1 ? 0 : selectedIndex.value + delta
  const target = items.value[Math.min(Math.max(next, 0), items.value.length - 1)]
  if (!target || target.id === selected.value?.id) return
  await select(target)
  await nextTick()
  listPane.value?.querySelector(`[data-row="${target.id}"]`)?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent) {
  // ConfirmHost/UiModal own the keyboard while they're up — ConfirmHost listens on
  // document without stopping propagation, so Esc here would just reopen it.
  if (zipOpen.value || confirmState.value.open || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape' && !isTypingTarget(e.target) && selected.value) {
    e.preventDefault()
    closePanel()
    return
  }
  if (isTypingTarget(e.target)) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ---- Bulk ZIP download (design + mockup, one folder per internal code) ------
const zipOpen = ref(false)
const zipMode = ref<'all' | 'select'>('all')
const zipSelected = ref<Set<number>>(new Set())
const downloadingZip = ref(false)

// Only items with an actual design file (front OR back) are worth bundling — this
// download is design-only, so a mockup-only item would add nothing to the ZIP.
const downloadableItems = computed(() =>
  items.value.filter((it) => it.design_url || it.back_design_url),
)

function openZipDialog() {
  zipMode.value = 'all'
  zipSelected.value = new Set()
  zipOpen.value = true
}

function toggleZipItem(id: number) {
  const next = new Set(zipSelected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  zipSelected.value = next
}

const allSelected = computed(
  () =>
    downloadableItems.value.length > 0 &&
    downloadableItems.value.every((it) => zipSelected.value.has(it.id)),
)
function toggleSelectAll() {
  zipSelected.value = allSelected.value
    ? new Set()
    : new Set(downloadableItems.value.map((it) => it.id))
}

const canDownloadZip = computed(() =>
  zipMode.value === 'all' ? downloadableItems.value.length > 0 : zipSelected.value.size > 0,
)

async function downloadZip() {
  if (!canDownloadZip.value || downloadingZip.value) return
  downloadingZip.value = true
  try {
    const ids = zipMode.value === 'select' ? Array.from(zipSelected.value) : undefined
    // Pass the applied batch filter so "whole queue" respects it and the ZIP lands
    // in a Batch_<code> folder; without a filter the backend names it Design_<date>.
    await designApi.downloadAssetsZip({ itemIds: ids, batch: filters.appliedBatch || undefined })
    toast.success('Đang tải file ZIP…')
    zipOpen.value = false
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingZip.value = false
  }
}

async function save() {
  if (!selected.value) return
  saving.value = true
  try {
    const { data: updated } = await itemsApi.patchDesign(selected.value.id, {
      mockup_url: form.mockup_url || undefined,
      design_url: form.design_url || undefined,
      back_design_url: form.back_design_url || undefined,
    })
    toast.success('Đã lưu thông tin design')
    selected.value = updated
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function setReady() {
  if (!selected.value) return
  settingReady.value = true
  try {
    await itemsApi.patchDesign(selected.value.id, {
      mockup_url: form.mockup_url || undefined,
      set_ready: true,
    })
    toast.success('Item đã sẵn sàng sản xuất')
    selected.value = null
    await reload()
    await loadQueueMaterials()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    settingReady.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Design Queue"
      subtitle="Trạm gác vào sản xuất: duyệt design + mockup rồi set ready. File in/cắt gắn 1 lần theo batch"
    >
      <template #actions>
        <button class="btn-secondary" @click="openZipDialog">
          <UiIcon name="download" :size="16" /> Tải ZIP design
        </button>
        <NuxtLink to="/batches/new" class="btn-primary">
          <UiIcon name="plus" :size="16" /> Tạo batch
        </NuxtLink>
      </template>
    </PageHeader>

    <div class="card mb-3 p-3">
      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1">
          <label class="label">Lọc theo batch</label>
          <input
            v-model="filters.batch"
            class="input"
            placeholder="Nhập mã batch, ví dụ #101001"
            @keyup.enter="applyFilters"
          />
        </div>
        <div class="w-full sm:w-48">
          <label class="label">Lọc theo NVL</label>
          <UiSelect
            v-model="materialValue"
            :options="materialOptions"
            aria-label="Lọc theo nguyên vật liệu"
            @change="changeMaterial"
          />
        </div>
        <div class="w-full sm:w-44">
          <label class="label">Sắp xếp</label>
          <UiSelect
            v-model="sortValue"
            :options="sortOptions"
            aria-label="Sắp xếp Design Queue"
            @change="changeSort"
          />
        </div>
        <div class="flex gap-2">
          <button class="btn-primary flex-1 sm:flex-none" @click="applyFilters">
            <UiIcon name="search" :size="16" /> Lọc
          </button>
          <button v-if="hasActiveFilters" class="btn-secondary" @click="resetFilters">Xóa</button>
        </div>
      </div>
      <p v-if="filters.appliedBatch" class="mt-2 text-xs text-muted-foreground">
        Đang hiển thị các item thuộc batch có mã chứa
        <span class="font-medium text-foreground">{{ filters.appliedBatch }}</span>.
      </p>
    </div>

    <!-- Master–detail: fluid queue + fixed-width panel, so the table keeps every
         pixel the panel doesn't need instead of splitting the row into thirds. -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
      <!-- Queue list -->
      <div class="card flex min-w-0 flex-col overflow-hidden">
        <UiStateBlock
          :loading="loading"
          :error="error"
          :empty="!loading && !error && items.length === 0"
          :empty-text="filters.appliedBatch ? 'Không có item nào cần design trong batch này.' : 'Không có item nào cần design.'"
          @retry="reload"
        >
          <UiBulkBar
            :count="readyCount"
            :noun="`/ ${bulkReadyableItems.length} đơn set ready được`"
            @clear="clearReadySelection"
          >
            <button class="btn-primary" :disabled="bulkSettingReady" @click="bulkSetReady">
              <UiSpinner v-if="bulkSettingReady" :size="16" />
              <UiIcon v-else name="check" :size="16" />
              Set ready {{ readyCount }} đơn
            </button>
          </UiBulkBar>

          <!-- Own scroll viewport at lg+: the filters, the column header and the
               detail panel all stay put while only the rows move. -->
          <div
            ref="listPane"
            class="overflow-x-auto lg:max-h-[calc(100dvh-22rem)] lg:min-h-[16rem] lg:overflow-y-auto"
          >
            <table class="min-w-full">
              <thead class="sticky top-0 z-10 bg-muted">
                <tr>
                  <th class="table-th w-9 border-b border-border px-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 align-middle accent-primary"
                      :checked="allReadyableSelected"
                      :indeterminate.prop="someReadySelected"
                      :disabled="bulkReadyableItems.length === 0"
                      aria-label="Chọn tất cả đơn có thể set ready"
                      @change="toggleSelectAllReady"
                    />
                  </th>
                  <th class="table-th w-full border-b border-border px-2.5">Đơn / SKU</th>
                  <th class="table-th border-b border-border px-2.5">NVL</th>
                  <th class="table-th border-b border-border px-2.5">Batch</th>
                  <th class="table-th border-b border-border px-2.5">File</th>
                  <th class="table-th border-b border-border px-2.5 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="it in items"
                  :key="it.id"
                  :data-row="it.id"
                  class="cursor-pointer transition-colors hover:bg-muted"
                  :class="selected?.id === it.id ? 'bg-accent hover:bg-accent' : ''"
                  :aria-selected="selected?.id === it.id"
                  @click="select(it)"
                >
                  <!-- Left accent rail marks the open row without tinting it away. -->
                  <td class="relative px-2.5 py-2 align-top" @click.stop>
                    <span
                      v-if="selected?.id === it.id"
                      class="absolute inset-y-0 left-0 w-0.5 bg-primary"
                      aria-hidden="true"
                    />
                    <input
                      v-if="canBulkReady(it)"
                      type="checkbox"
                      class="mt-0.5 h-4 w-4 accent-primary"
                      :checked="isReadySelected(it.id)"
                      :aria-label="`Chọn ${it.internal_code}`"
                      @change="toggleReadyRow(it.id)"
                    />
                  </td>

                  <td class="px-2.5 py-2 align-top">
                    <div class="flex items-center gap-1.5">
                      <span class="text-sm font-medium text-foreground">{{ it.internal_code }}</span>
                      <span
                        v-if="it.quantity > 1"
                        class="rounded bg-muted px-1 py-px text-[10px] font-semibold text-muted-foreground"
                      >
                        ×{{ it.quantity }}
                      </span>
                    </div>
                    <div class="max-w-[20rem] truncate text-xs text-muted-foreground">
                      {{ it.sku_code }}<template v-if="it.product_name"> · {{ it.product_name }}</template>
                    </div>
                  </td>

                  <!-- max-width lives on the inner div: table-layout:auto ignores
                       it on the cell itself, so the chips would never wrap. -->
                  <td class="px-2.5 py-2 align-top">
                    <div v-if="itemMaterials(it).length" class="flex max-w-[13rem] flex-wrap gap-1">
                      <span
                        v-for="m in itemMaterials(it)"
                        :key="m.id"
                        class="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                        :title="m.name || m.code"
                      >
                        {{ m.code }}
                      </span>
                    </div>
                    <span v-else class="text-xs text-muted-foreground">—</span>
                  </td>

                  <td class="px-2.5 py-2 align-top">
                    <div v-if="itemBatches(it).length" class="flex flex-wrap gap-1">
                      <NuxtLink
                        v-for="batch in itemBatches(it)"
                        :key="batch.id"
                        :to="`/batches/${batch.id}`"
                        class="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                        title="Mở chi tiết batch"
                        @click.stop
                      >
                        {{ batch.code }}
                      </NuxtLink>
                    </div>
                    <span v-else class="whitespace-nowrap text-xs text-muted-foreground">Chưa vào batch</span>
                  </td>

                  <!-- Present/missing as filled vs hollow chips: scannable down a
                       column in a way "In ✓ · Cắt ✗" never is. -->
                  <td class="px-2.5 py-2 align-top">
                    <UiMockupLink :url="it.mockup_url" small label="Mockup" />
                    <div class="mt-1 flex gap-1">
                      <span
                        class="rounded px-1 py-px text-[10px] font-medium"
                        :class="it.design_url || it.back_design_url ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground/60'"
                        :title="it.design_url || it.back_design_url ? 'Đã có file design' : 'Chưa có file design'"
                      >
                        Design
                      </span>
                      <span
                        class="rounded px-1 py-px text-[10px] font-medium"
                        :class="it.print_file_url ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground/60'"
                        :title="it.print_file_url ? 'Đã có file in' : 'Chưa có file in'"
                      >
                        In
                      </span>
                      <span
                        class="rounded px-1 py-px text-[10px] font-medium"
                        :class="it.cut_file_url ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground/60'"
                        :title="it.cut_file_url ? 'Đã có file cắt' : 'Chưa có file cắt'"
                      >
                        Cắt
                      </span>
                    </div>
                  </td>

                  <td class="whitespace-nowrap px-2.5 py-2 text-right align-top">
                    <UiStatusBadge kind="design" :value="it.design_status" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-x-4 border-t border-border px-3 py-1">
            <div class="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <span>
                <b class="font-semibold text-foreground">{{ bulkReadyableItems.length }}</b>
                đơn có thể set ready
              </span>
              <span class="hidden xl:inline">
                <kbd class="rounded border border-border bg-muted px-1 font-sans">↑</kbd>
                <kbd class="rounded border border-border bg-muted px-1 font-sans">↓</kbd>
                chuyển đơn ·
                <kbd class="rounded border border-border bg-muted px-1 font-sans">Esc</kbd>
                đóng panel
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <UiPagination :meta="meta" @change="changePage" />
            </div>
          </div>
        </UiStateBlock>
      </div>

      <!-- Detail panel: pinned to the viewport so it never scrolls out of reach;
           the form scrolls inside it and the actions stay on a fixed footer. -->
      <!-- max-h keeps the panel inside the first screen so the page itself never
           needs to scroll; sticky covers the cases where it still does. -->
      <aside ref="panelEl" class="lg:sticky lg:top-2 lg:self-start">
        <div class="card flex flex-col overflow-hidden lg:max-h-[calc(100dvh-19rem)]">
          <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Design panel</h3>
            <div class="flex items-center gap-2">
              <span
                v-if="dirty"
                class="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning"
              >
                Chưa lưu
              </span>
              <button
                v-if="selected"
                class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Đóng panel"
                title="Đóng (Esc)"
                @click="closePanel"
              >
                <UiIcon name="close" :size="16" />
              </button>
            </div>
          </div>

          <p
            v-if="!selected"
            class="px-4 py-12 text-center text-sm text-muted-foreground"
          >
            Chọn một item bên trái để chỉnh sửa.
          </p>

          <div v-else class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div class="rounded-md bg-muted p-3 text-sm">
              <div class="flex items-start justify-between gap-2">
                <p class="font-medium text-foreground">
                  {{ selected.internal_code }}
                  <span v-if="selected.quantity > 1" class="text-muted-foreground">×{{ selected.quantity }}</span>
                </p>
                <UiStatusBadge kind="design" :value="selected.design_status" />
              </div>
              <p class="text-muted-foreground">{{ selected.sku_code }} · {{ selected.product_name }}</p>
              <p v-if="selected.engrave_text" class="mt-1 text-xs text-muted-foreground">
                Khắc: <span class="font-medium text-foreground">{{ selected.engrave_text }}</span>
              </p>
              <div v-if="itemBatches(selected).length" class="mt-2 flex flex-wrap gap-1">
                <NuxtLink
                  v-for="batch in itemBatches(selected)"
                  :key="batch.id"
                  :to="`/batches/${batch.id}`"
                  class="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  {{ batch.code }}
                </NuxtLink>
              </div>
            </div>

            <a
              v-if="showMockupPreview"
              :href="form.mockup_url"
              target="_blank"
              rel="noopener noreferrer"
              class="block overflow-hidden rounded-lg border border-border bg-muted"
              title="Mở mockup seller trong tab mới"
            >
              <img
                :src="form.mockup_url"
                alt="Mockup seller"
                class="mx-auto max-h-44 w-full object-contain"
                loading="lazy"
                @error="mockupPreviewFailed = true"
              />
            </a>
            <UiMockupLink v-else :url="form.mockup_url" label="Mở mockup seller" />

            <div>
              <label class="label">
                Mockup URL <span class="text-destructive">*</span>
              </label>
              <input v-model="form.mockup_url" class="input" placeholder="https://…" />
              <p v-if="form.mockup_url && !validMockupUrl" class="mt-1 text-xs text-destructive">
                URL không hợp lệ — cần dạng https://…
              </p>
            </div>
            <div>
              <label class="label">Design URL (tuỳ chọn)</label>
              <input v-model="form.design_url" class="input" placeholder="https://…" />
            </div>
            <div>
              <label class="label">Link design mặt sau (nếu có)</label>
              <input v-model="form.back_design_url" class="input" placeholder="https://…" />
            </div>

            <!-- Folded by default: these are batch-level fields, filling them per
                 item is the exception, not the flow. -->
            <div class="rounded-md border border-border p-3">
              <p class="mb-1 text-xs uppercase tracking-wide text-muted-foreground">File in / cắt</p>
              <p class="text-[11px] text-muted-foreground">
                <template v-if="validPrintUrl || validCutUrl">
                  Đã nhận từ batch: {{ validPrintUrl ? 'file in ✓' : 'file in ✗' }} ·
                  {{ validCutUrl ? 'file cắt ✓' : 'file cắt ✗' }}. Mở bằng nút bên dưới.
                </template>
                <template v-else>
                  Chưa có. File in/cắt được dàn chung <b>1 file cho cả batch</b> — tạo batch xong,
                  dán 1 link in + 1 link cắt ở màn chi tiết batch, hệ thống tự áp cho mọi đơn.
                </template>
              </p>
            </div>

            <div class="space-y-2 rounded-md border border-border p-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Mở file</p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  class="btn-secondary px-2 py-1.5 text-xs"
                  :disabled="!validMockupUrl"
                  @click="downloadAsset(form.mockup_url, `${selected.internal_code}-mockup`)"
                >
                  <UiIcon name="link" :size="14" /> Mockup
                </button>
                <button
                  class="btn-secondary px-2 py-1.5 text-xs"
                  :disabled="!validDesignUrl"
                  @click="downloadAsset(form.design_url, `${selected.internal_code}-design`)"
                >
                  <UiIcon name="link" :size="14" /> Design
                </button>
                <button
                  class="btn-secondary px-2 py-1.5 text-xs"
                  :disabled="!validPrintUrl"
                  @click="downloadAsset(batchPrintUrl, `${selected.internal_code}-print`)"
                >
                  <UiIcon name="link" :size="14" /> File in
                </button>
                <button
                  class="btn-secondary px-2 py-1.5 text-xs"
                  :disabled="!validCutUrl"
                  @click="downloadAsset(batchCutUrl, `${selected.internal_code}-cut`)"
                >
                  <UiIcon name="link" :size="14" /> File cắt
                </button>
              </div>
              <p class="text-[11px] text-muted-foreground">
                MVP chưa có endpoint upload — dán URL từ storage. Tải hàng loạt: dùng
                <b>Tải ZIP design</b> ở góc trên.
              </p>
            </div>
          </div>

          <div v-if="selected" class="flex shrink-0 gap-2 border-t border-border bg-muted/40 p-3">
            <button class="btn-secondary flex-1" :disabled="saving || !dirty" @click="save">
              <UiSpinner v-if="saving" :size="16" /> Lưu thay đổi
            </button>
            <button
              class="btn-success flex-1"
              :disabled="!canSetReady || settingReady"
              :title="!canSetReady ? 'Cần Mockup URL hợp lệ' : ''"
              @click="setReady"
            >
              <UiSpinner v-if="settingReady" :size="16" /> Set ready
            </button>
          </div>
        </div>
      </aside>
    </div>

    <!-- Bulk ZIP download dialog -->
    <UiModal v-model="zipOpen" title="Tải ZIP file Design gốc">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          <b>Chỉ tải file Design gốc (không gồm mockup).</b> Toàn bộ file nằm trong một
          thư mục (<b>Batch_&lt;mã&gt;</b> nếu đang lọc theo batch, ngược lại <b>Design_&lt;ngày&gt;</b>),
          mỗi file đặt tên theo <b>STT_SKU_SốLượng</b> (mặt trước/sau có hậu tố _FRONT/_BACK).
        </p>

        <div class="space-y-2">
          <label
            class="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
            :class="zipMode === 'all' ? 'bg-accent' : 'hover:bg-muted'"
          >
            <input
              v-model="zipMode"
              type="radio"
              value="all"
              class="mt-0.5 h-4 w-4 accent-primary"
            />
            <span class="text-sm">
              <span class="font-medium text-foreground">Tải toàn bộ hàng đợi</span>
              <span class="block text-muted-foreground">
                Tất cả đơn đang chờ design có sẵn file design (mặt trước/sau).
              </span>
            </span>
          </label>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
            :class="zipMode === 'select' ? 'bg-accent' : 'hover:bg-muted'"
          >
            <input
              v-model="zipMode"
              type="radio"
              value="select"
              class="mt-0.5 h-4 w-4 accent-primary"
            />
            <span class="text-sm">
              <span class="font-medium text-foreground">Chọn từng đơn</span>
              <span class="block text-muted-foreground">
                Tick những đơn muốn tải bên dưới.
              </span>
            </span>
          </label>
        </div>

        <div v-if="zipMode === 'select'" class="space-y-2">
          <div class="flex items-center justify-between">
            <button class="text-xs font-medium text-primary hover:underline" @click="toggleSelectAll">
              {{ allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
            </button>
            <span class="text-xs text-muted-foreground">Đã chọn {{ zipSelected.size }}</span>
          </div>
          <div class="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            <p
              v-if="downloadableItems.length === 0"
              class="px-3 py-6 text-center text-sm text-muted-foreground"
            >
              Chưa có đơn nào trong hàng đợi có file để tải.
            </p>
            <label
              v-for="it in downloadableItems"
              :key="it.id"
              class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted"
            >
              <input
                type="checkbox"
                class="h-4 w-4 accent-primary"
                :checked="zipSelected.has(it.id)"
                @change="toggleZipItem(it.id)"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-foreground">
                  {{ it.internal_code }}
                </span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ it.sku_code }} · {{ it.design_url ? 'front ✓' : 'front ✗' }} ·
                  {{ it.back_design_url ? 'back ✓' : 'back ✗' }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <template #footer>
        <button class="btn-secondary" @click="zipOpen = false">Huỷ</button>
        <button
          class="btn-primary"
          :disabled="!canDownloadZip || downloadingZip"
          @click="downloadZip"
        >
          <UiSpinner v-if="downloadingZip" :size="16" />
          <UiIcon v-else name="download" :size="16" /> Tải ZIP
        </button>
      </template>
    </UiModal>
  </div>
</template>
