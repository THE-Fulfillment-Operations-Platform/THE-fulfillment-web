<script setup lang="ts">
import { designApi, batchesApi, materialsApi } from '~/services/api'
import type { Material, MaterialBucket, OrderItem, Priority } from '~/types'
import { formatDimMM } from '~/utils/format'
import { PRIORITY_OPTIONS, PRIORITY } from '~/utils/enums'
import { errorMessage } from '~/utils/api-error'
import { itemStoreOrderId } from '~/utils/item'
import { planBatchSplitByQuota, productCount } from '~/utils/batch'
import { productionQuota } from '~/utils/quota'
import { PAGE_SIZE_ALL } from '~/utils/pagination'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'

const toast = useToastStore()
const router = useRouter()

const buckets = ref<MaterialBucket[]>([])
const bucketsLoading = ref(true)
const bucketsError = ref<string | null>(null)

const activeMaterial = ref<MaterialBucket | null>(null)
const items = ref<OrderItem[]>([])
const itemsLoading = ref(false)
const itemsError = ref<string | null>(null)
const selectedIds = ref<Set<number>>(new Set())
// Sắp xếp theo SKU (server-side). null = chưa sắp; luân phiên null → asc → desc.
const skuSort = ref<'asc' | 'desc' | null>(null)
const skuSortIcon = computed(() =>
  skuSort.value === 'asc' ? '↑' : skuSort.value === 'desc' ? '↓' : '↕',
)

const priority = ref<Priority>('NORMAL')
const dueDate = ref('')
const note = ref('')
const creating = ref(false)

// Kích thước tấm của từng NVL (material_id → Material). Cần cho preview chẻ
// batch mẹ–con; MaterialBucket không mang kích thước nên nạp riêng danh sách.
const materialById = ref<Map<number, Material>>(new Map())
async function loadMaterialCaps() {
  try {
    const { data } = await materialsApi.list()
    materialById.value = new Map((data ?? []).map((m) => [m.id, m]))
  } catch {
    /* kích thước tuỳ chọn — thiếu thì coi như không có định mức */
  }
}

// Tấm NVL đang chọn (kích thước hiện ở khung xem trước).
const activeSheet = computed(() =>
  activeMaterial.value ? materialById.value.get(activeMaterial.value.material_id) ?? null : null,
)
const activeSheetHasSize = computed(() => activeSheet.value?.length_mm != null && activeSheet.value?.width_mm != null)

// Định mức của một item trên NVL đang chọn: số khai cho cặp (SKU, NVL), chưa
// khai thì ước tính theo kích thước (utils/quota.ts — khớp
// models.ProductionQuotaSource ở BE). 0/null = không có định mức (SKU đó không
// chiếm chỗ trên tấm, thành batch riêng).
function quotaForItem(it: OrderItem): number | null {
  const materialId = activeMaterial.value?.material_id
  if (!materialId) return null
  const quota = productionQuota(it.sku, materialById.value.get(materialId))
  return quota > 0 ? quota : null
}

// Các item đang được chọn (giữ nguyên thứ tự hiển thị để chia nhóm ổn định).
const selectedItems = computed(() => items.value.filter((it) => selectedIds.value.has(it.id)))
// Tổng sản phẩm = Σ quantity các item đã chọn.
const selectedProducts = computed(() => productCount(selectedItems.value))
// Kế hoạch chẻ: mỗi phần tử là 1 batch con. Nhóm theo SKU cha (khác nhóm không
// chung batch), trong nhóm SKU cùng mã xếp trước rồi SKU anh em nhét vào chỗ
// trống theo định mức của từng SKU.
const splitGroups = computed(() => planBatchSplitByQuota(selectedItems.value, quotaForItem))
const willSplit = computed(() => splitGroups.value.length > 1)
// Số SKU và số nhóm SKU cha đang chọn → nói rõ vì sao 7 sản phẩm lại thành 2 batch.
const skuCount = computed(() => new Set(selectedItems.value.map((it) => it.sku_code)).size)
const familyCount = computed(
  () => new Set(selectedItems.value.map((it) => (it.sku?.parent_id != null ? `p${it.sku.parent_id}` : `s${it.sku_code}`))).size,
)
// Item đang chọn mà không ra định mức (SKU chưa khai D x R, hoặc tấm chưa khai
// kích thước): chúng không chiếm chỗ trên tấm nên không được tính vào cách chẻ —
// phải nói ra, không để người vận hành tưởng một tấm chứa được vô hạn.
const unsizedCount = computed(() => selectedItems.value.filter((it) => !quotaForItem(it)).length)

async function loadBuckets() {
  bucketsLoading.value = true
  bucketsError.value = null
  try {
    const { data } = await designApi.materialBuckets()
    buckets.value = data ?? []
  } catch (e) {
    bucketsError.value = errorMessage(e)
  } finally {
    bucketsLoading.value = false
  }
}

// Nạp item của NVL đang chọn theo sort hiện tại. Không đụng tới selectedIds:
// lựa chọn keyed theo id nên các dòng đã tick vẫn được giữ khi re-sort.
async function fetchItems() {
  const b = activeMaterial.value
  if (!b) return
  itemsLoading.value = true
  itemsError.value = null
  try {
    // page_size -1 = lấy TRỌN pool: không truyền thì backend mặc định 20 dòng,
    // bucket báo 50 item mà bảng (và "chọn tất cả") chỉ thấy 20 dòng đầu.
    const params: { sort?: string; order?: 'asc' | 'desc'; page_size: number } = {
      page_size: PAGE_SIZE_ALL,
    }
    if (skuSort.value) {
      params.sort = 'sku'
      params.order = skuSort.value
    }
    const { data } = await designApi.materialItems(b.material_id, params)
    items.value = data ?? []
  } catch (e) {
    itemsError.value = errorMessage(e)
  } finally {
    itemsLoading.value = false
  }
}

async function selectMaterial(b: MaterialBucket) {
  activeMaterial.value = b
  selectedIds.value = new Set()
  skuSort.value = null
  items.value = []
  await fetchItems()
}

// Đổi NVL khác → reset chọn/sort; cùng NVL (re-sort/retry) → giữ nguyên lựa chọn.
function toggleSkuSort() {
  skuSort.value = skuSort.value === null ? 'asc' : skuSort.value === 'asc' ? 'desc' : null
  fetchItems()
}

function toggle(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function toggleAll() {
  if (selectedIds.value.size === items.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(items.value.map((i) => i.id))
  }
}

const selectedCount = computed(() => selectedIds.value.size)

const priorityOptions = PRIORITY_OPTIONS.map((p) => ({ value: p, label: PRIORITY[p].label }))

async function createBatch() {
  if (!activeMaterial.value || selectedCount.value === 0 || creating.value) return

  // Xác nhận trước khi tạo — tóm tắt NVL, số item, tổng sản phẩm, và SKU.
  const skuCodes = Array.from(
    new Set(selectedItems.value.map((it) => it.sku_code).filter(Boolean)),
  )
  const skuSummary = skuCodes.length <= 3 ? skuCodes.join(', ') : `${skuCodes.length} SKU`
  const message =
    `Batch NVL: ${activeMaterial.value.material_name} (${activeMaterial.value.material_code})\n` +
    `Số item đã chọn: ${selectedCount.value}\n` +
    `Tổng sản phẩm: ${selectedProducts.value}\n` +
    `SKU: ${skuSummary}` +
    (willSplit.value ? `\nSẽ tạo 1 batch mẹ + ${splitGroups.value.length} batch con.` : '')

  const ok = await useConfirm().confirm({
    title: 'Tạo Batch',
    message,
    tone: 'primary',
    confirmText: 'Tạo Batch',
  })
  if (!ok) return

  creating.value = true
  try {
    const { data } = await batchesApi.create({
      material_id: activeMaterial.value.material_id,
      // Gửi theo THỨ TỰ HIỂN THỊ, không theo thứ tự tick: backend chia nhóm
      // theo đúng thứ tự nhận được, nên gửi thứ tự khác preview sẽ cho ra cách
      // phân bổ item vào từng batch con khác với cái người dùng vừa xem.
      order_item_ids: selectedItems.value.map((it) => it.id),
      priority: priority.value,
      due_date: dueDate.value || undefined,
      note: note.value || undefined,
    })
    const skipped = data.skipped_item_ids?.length ?? 0
    const children = data.batch.child_batches?.length ?? data.batch.child_count ?? 0
    const base = children
      ? `Đã tạo batch mẹ ${data.batch.code} + ${children} batch con`
      : `Đã tạo batch ${data.batch.code}`
    toast.success(base + (skipped ? ` (bỏ qua ${skipped} item)` : ''))
    router.push(`/batches/${data.batch.id}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  loadBuckets()
  loadMaterialCaps()
})
</script>

<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/batches" class="text-sm text-primary hover:underline">← Về danh sách batch</NuxtLink>
    </div>
    <PageHeader
      title="Tạo Batch theo nguyên vật liệu"
      subtitle="SKU cố định theo material. Combo nhiều NVL: tạo batch riêng cho từng material với cùng item."
    />

    <!-- Material buckets -->
    <UiStateBlock :loading="bucketsLoading" :error="bucketsError" @retry="loadBuckets">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          v-for="b in buckets"
          :key="b.material_id"
          class="card p-4 text-left transition-colors hover:border-primary/60"
          :class="activeMaterial?.material_id === b.material_id ? '!border-primary bg-accent' : ''"
          @click="selectMaterial(b)"
        >
          <p class="text-sm font-semibold text-foreground">{{ b.material_name }}</p>
          <p class="text-xs text-muted-foreground">{{ b.material_code }}</p>
          <p class="mt-2 text-2xl font-semibold text-primary">{{ b.item_count }}</p>
          <p class="text-xs text-muted-foreground">item sẵn sàng</p>
        </button>
      </div>
    </UiStateBlock>

    <!-- Item selection -->
    <div v-if="activeMaterial" class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div class="card overflow-hidden lg:col-span-2">
        <div class="flex items-center justify-between border-b border-border bg-muted px-4 py-2.5">
          <h3 class="text-sm font-semibold text-foreground">
            Item NVL {{ activeMaterial.material_name }} (chưa vào batch)
          </h3>
          <button class="text-xs font-medium text-primary hover:underline" @click="toggleAll">
            {{ selectedIds.size === items.length && items.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
          </button>
        </div>
        <UiStateBlock
          :loading="itemsLoading"
          :error="itemsError"
          :empty="!itemsLoading && !itemsError && items.length === 0"
          empty-text="Không còn item design-ready cho material này."
          @retry="fetchItems"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-card">
                <tr>
                  <th class="table-th w-10"></th>
                  <th class="table-th">Mã nội bộ</th>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 font-medium uppercase tracking-wide hover:text-primary"
                      :aria-label="`Sắp xếp theo SKU (${skuSort ?? 'không'})`"
                      @click="toggleSkuSort"
                    >
                      SKU
                      <span class="text-xs leading-none" :class="skuSort ? 'text-primary' : 'text-muted-foreground'">{{ skuSortIcon }}</span>
                    </button>
                  </th>
                  <th class="table-th">SL</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="it in items" :key="it.id" class="hover:bg-muted" @click="toggle(it.id)">
                  <td class="table-td">
                    <input type="checkbox" :checked="selectedIds.has(it.id)" class="h-4 w-4 rounded border-border" @click.stop="toggle(it.id)" />
                  </td>
                  <td class="table-td font-medium text-foreground">
                    {{ it.internal_code }}
                    <!-- Hàng làm lại sau QC fail: người gom batch cần thấy ngay để
                         ưu tiên, vì khách đã chờ qua một lượt sản xuất hỏng. -->
                    <span
                      v-if="(it.rework_count ?? 0) > 0"
                      class="ml-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      :title="`Đã QC fail ${it.rework_count} lần — đây là lần sản xuất thứ ${(it.rework_count ?? 0) + 1}`"
                    >
                      Làm lại · lần {{ (it.rework_count ?? 0) + 1 }}
                    </span>
                  </td>
                  <td class="table-td">{{ itemStoreOrderId(it) }}</td>
                  <td class="table-td">{{ it.sku_code }}</td>
                  <td class="table-td">{{ it.quantity }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiStateBlock>
      </div>

      <!-- Preview / create -->
      <div class="card h-fit p-5">
        <h3 class="mb-3 text-sm font-semibold text-foreground">Xem trước batch</h3>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-muted-foreground">Loại VL</dt><dd class="font-medium">{{ activeMaterial.material_name }}</dd></div>
          <div class="flex justify-between">
            <dt class="text-muted-foreground">Kích thước tấm</dt>
            <dd class="font-medium tabular-nums">{{ activeSheetHasSize ? formatDimMM(activeSheet?.length_mm, activeSheet?.width_mm) : 'Chưa khai' }}</dd>
          </div>
          <div class="flex justify-between"><dt class="text-muted-foreground">Số item đã chọn</dt><dd class="font-medium">{{ selectedCount }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted-foreground">Tổng sản phẩm</dt><dd class="font-medium">{{ selectedProducts }}</dd></div>
        </dl>

        <!-- Nhóm theo SKU cha: khác nhóm không chung batch; trong nhóm, SKU cùng
             mã xếp trước, SKU anh em nhét vào chỗ trống theo định mức từng SKU. -->
        <p
          v-if="skuCount > 1"
          class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        >
          Đang chọn {{ skuCount }} SKU thuộc {{ familyCount }} nhóm SKU cha. SKU cùng nhóm được xếp chung
          tấm khi còn chỗ (theo định mức từng SKU); khác nhóm thì tách batch.
        </p>

        <!-- Kế hoạch chẻ batch mẹ–con -->
        <div
          v-if="willSplit"
          class="mt-3 rounded-lg border border-primary/40 bg-accent p-3 text-xs"
        >
          <p class="font-semibold text-primary">
            Tạo 1 batch mẹ + {{ splitGroups.length }} batch con
          </p>
          <ul class="mt-2 space-y-1 text-muted-foreground">
            <li v-for="(g, i) in splitGroups" :key="i" class="flex justify-between gap-2">
              <span class="truncate" :title="g.sku_codes.join(' + ')">#{{ i + 1 }} · <span class="text-foreground">{{ g.sku_codes.join(' + ') || '—' }}</span></span>
              <span class="shrink-0 font-medium text-foreground">{{ g.product_count }} sp · {{ g.items.length }} item</span>
            </li>
          </ul>
        </div>
        <p v-else-if="activeSheetHasSize && selectedCount > 0 && !unsizedCount" class="mt-3 text-xs text-muted-foreground">
          Vừa một tấm → tạo 1 batch phẳng.
        </p>
        <p
          v-if="selectedCount > 0 && unsizedCount"
          class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <template v-if="!activeSheetHasSize">
            NVL này chưa khai kích thước tấm (Master Data → NVL) và {{ unsizedCount }}/{{ selectedCount }} item chưa có định mức khai cho cặp SKU – NVL: SKU đó thành một batch riêng, không chẻ dù bao nhiêu sản phẩm.
          </template>
          <template v-else>
            {{ unsizedCount }}/{{ selectedCount }} item chưa có định mức (chưa khai cho cặp SKU – NVL và SKU chưa có D x R để ước tính) — SKU đó thành một batch riêng không giới hạn.
          </template>
        </p>

        <div class="mt-4 space-y-3">
          <div>
            <label class="label">Độ ưu tiên</label>
            <UiSelect v-model="priority" :options="priorityOptions" aria-label="Độ ưu tiên" />
          </div>
          <div>
            <label class="label">Hạn hoàn thành</label>
            <UiDatePicker v-model="dueDate" aria-label="Hạn hoàn thành" />
          </div>
          <div>
            <label class="label">Ghi chú</label>
            <textarea v-model="note" rows="2" class="input" placeholder="Tuỳ chọn" />
          </div>
        </div>

        <button class="btn-primary mt-4 w-full" :disabled="selectedCount === 0 || creating" @click="createBatch">
          <UiSpinner v-if="creating" :size="16" />
          {{
            creating
              ? 'Đang tạo…'
              : willSplit
                ? `Tạo batch mẹ + ${splitGroups.length} con`
                : `Tạo batch (${selectedCount})`
          }}
        </button>
      </div>
    </div>
  </div>
</template>
