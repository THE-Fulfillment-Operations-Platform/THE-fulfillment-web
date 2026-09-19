<script setup lang="ts">
// Import kích thước tấm NVL từ Excel: Loại VL + Dài (mm) + Rộng (mm) (+ Mô tả).
// Kích thước tấm cùng kích thước SKU cho ra định mức sản xuất — không còn cột
// "Định mức" nhập tay (khách chốt 18/09/2026); file mẫu cũ có cột đó thì server
// bỏ qua và nhắc trong `notices`.
import { materialsApi } from '~/services/api'
import type {
  MaterialImportPreview,
  MaterialImportItem,
  MaterialImportAction,
  MaterialImportRowError,
} from '~/types'
import { errorMessage } from '~/utils/api-error'
import { formatDimMM } from '~/utils/format'
import { useToastStore } from '~/stores/toast'
import { useSpreadsheetFile } from '~/composables/useSpreadsheetFile'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'imported'): void }>()

const toast = useToastStore()
const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const previewing = ref(false)
const committing = ref(false)
const committed = ref(false)
const downloadingTemplate = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<MaterialImportPreview | null>(null)
// Chọn file mới thì bản xem trước cũ không còn đúng.
const { file, fileName, dragging, onFile, onDrop, reset: resetFile } = useSpreadsheetFile(() => {
  preview.value = null
  committed.value = false
})

// Reset mọi state mỗi khi đóng modal, để lần mở sau bắt đầu sạch.
watch(open, (v) => {
  if (!v) reset()
})
function reset() {
  resetFile()
  preview.value = null
  previewError.value = null
  committed.value = false
}

async function runPreview() {
  if (!file.value) {
    toast.error('Chưa chọn file')
    return
  }
  previewing.value = true
  previewError.value = null
  preview.value = null
  committed.value = false
  try {
    const { data } = await materialsApi.importPreviewFile(file.value)
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

// Gửi TẤT CẢ dòng hợp lệ, kể cả NOCHANGE: server phân tích lại từ đầu trong
// transaction nên kết quả áp dụng khớp đúng bản xem trước. Server tự bỏ qua
// NOCHANGE khi ghi.
const rowsToCommit = computed(() =>
  (preview.value?.items ?? []).map((i) => ({
    material: i.name,
    length_mm: i.length_mm,
    width_mm: i.width_mm,
    description: i.description,
    row_number: i.row_numbers?.[0],
  })),
)
// Nút chỉ đếm những dòng thật sự ghi xuống DB.
const changedCount = computed(
  () => (preview.value?.items ?? []).filter((i) => i.action !== 'NOCHANGE').length,
)
const canCommit = computed(() => !!preview.value && !committed.value && changedCount.value > 0)

async function commit() {
  if (!canCommit.value || committing.value) return
  committing.value = true
  try {
    const { data } = await materialsApi.importCommit(rowsToCommit.value)
    preview.value = data
    committed.value = true
    const a = data.applied
    toast.success(a ? `Đã tạo ${a.created}, cập nhật ${a.updated} NVL` : 'Đã áp dụng')
    emit('imported')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    await materialsApi.downloadImportTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

const s = computed(() => preview.value?.summary)
// Kích thước đổi thật sự (file có ghi số và khác giá trị đang có) → hiện gạch cũ → mới.
function sizeChanged(it: MaterialImportItem): boolean {
  return (
    it.action === 'UPDATE' &&
    it.length_mm != null &&
    (it.length_mm !== it.current_length_mm || it.width_mm !== it.current_width_mm)
  )
}
function effectiveSize(it: MaterialImportItem): string {
  return it.length_mm != null
    ? formatDimMM(it.length_mm, it.width_mm)
    : formatDimMM(it.current_length_mm, it.current_width_mm)
}
// Mô tả sau import: ưu tiên giá trị trong file, không có thì giữ giá trị cũ.
function effectiveDesc(it: MaterialImportItem): string {
  return it.description || it.current_description
}

// Dòng lỗi KHÔNG nằm trong preview.items — server bỏ hẳn NVL bị lỗi ra khỏi kế
// hoạch import — nên nếu chỉ liệt kê ở khung dưới thì trong bảng không có gì để
// nhìn. Trộn chúng vào bảng theo đúng số dòng của file (item ghi số dòng đầu
// tiên của nó), rồi tô đỏ: thứ tự bảng khớp thứ tự file nên dò ngược ra Excel
// được ngay.
interface PreviewRow {
  key: string
  row: number // số dòng để sắp xếp
  rows: number[] // mọi dòng file mà mục này gom lại (1 NVL có thể nằm nhiều dòng)
  item: MaterialImportItem | null
  error: MaterialImportRowError | null
}
const previewRows = computed<PreviewRow[]>(() => {
  const items: PreviewRow[] = (preview.value?.items ?? []).map((it, i) => ({
    key: `i${i}-${it.code}`,
    row: it.row_numbers?.[0] ?? Number.MAX_SAFE_INTEGER,
    rows: it.row_numbers ?? [],
    item: it,
    error: null,
  }))
  const errors: PreviewRow[] = (preview.value?.errors ?? []).map((e, i) => ({
    key: `e${i}-${e.row_number}`,
    row: e.row_number,
    // Lỗi do nhiều dòng chọi nhau → chỉ ra hết, sửa 1 dòng không hết lỗi.
    rows: e.row_numbers?.length ? e.row_numbers : [e.row_number],
    item: null,
    error: e,
  }))
  // Lỗi đứng trước item cùng số dòng (a.item ? 1 : 0) — dòng đỏ không bị lọt
  // xuống dưới dòng hợp lệ trùng vị trí.
  return [...items, ...errors].sort((a, b) => a.row - b.row || (a.item ? 1 : 0) - (b.item ? 1 : 0))
})
const tableEl = ref<HTMLElement | null>(null)
function scrollToFirstError() {
  tableEl.value?.querySelector('[data-error="1"]')?.scrollIntoView({ block: 'center' })
}

// "11" cho 1 dòng, "11, 12" cho hai, "11, 12 +3" khi nhiều hơn — đủ để dò file
// mà không phình cột.
function rowsLabel(rows: number[]): string {
  if (!rows.length) return '—'
  const head = rows.slice(0, 2).join(', ')
  return rows.length > 2 ? `${head} +${rows.length - 2}` : head
}

const ACTION_BADGE: Record<MaterialImportAction, string> = {
  CREATE: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  UPDATE: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  NOCHANGE: 'bg-muted text-muted-foreground',
}
const ACTION_LABEL: Record<MaterialImportAction, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  NOCHANGE: 'Không đổi',
}
</script>

<template>
  <UiModal v-model="open" title="Import kích thước NVL (Excel)" wide>
    <div class="space-y-4">
      <p class="text-xs text-muted-foreground">
        Cột <span class="font-medium text-foreground">Loại VL</span> (tên NVL),
        <span class="font-medium text-foreground">Dài (mm)</span> và
        <span class="font-medium text-foreground">Rộng (mm)</span> của MỘT tấm; thêm cột
        <span class="font-medium text-foreground">Mô tả</span> nếu muốn. Kích thước tấm cùng kích thước
        SKU cho ra định mức (⌊S tấm / S sản phẩm⌋ sản phẩm mỗi tấm) — không còn cột định mức nhập tay.
        Ô để trống = không ghi đè giá trị đang có. Một tên = một NVL; tên lặp trong file phải khớp nhau.
      </p>

      <!-- Upload -->
      <div v-if="!committed">
        <label
          class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <div class="pointer-events-none flex flex-col items-center gap-1">
            <UiIcon name="upload" :size="24" :class="dragging ? 'text-primary' : 'text-muted-foreground'" />
            <span class="text-sm text-foreground">
              {{ fileName || (dragging ? 'Thả file vào đây…' : 'Kéo thả hoặc bấm chọn file') }}
            </span>
            <span class="text-xs text-muted-foreground">CSV / XLSX · Loại VL + Dài (mm) + Rộng (mm)</span>
          </div>
          <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
        </label>
        <div class="mt-2 flex items-center justify-between">
          <button class="text-xs text-primary hover:underline disabled:opacity-50" :disabled="downloadingTemplate" @click="downloadTemplate">
            <UiSpinner v-if="downloadingTemplate" :size="12" /> Tải template mẫu (.xlsx)
          </button>
          <button class="btn-primary" :disabled="!file || previewing" @click="runPreview">
            <UiSpinner v-if="previewing" :size="14" />
            {{ previewing ? 'Đang phân tích…' : 'Xem trước' }}
          </button>
        </div>
      </div>

      <div v-if="previewError" class="rounded-md border border-rose-200/60 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
        {{ previewError }}
      </div>

      <!-- Preview -->
      <div v-if="preview" class="space-y-3">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-md bg-indigo-50 p-2 dark:bg-indigo-500/10">
            <p class="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{{ s?.new_materials }}</p>
            <p class="text-[11px] text-muted-foreground">Tạo mới</p>
          </div>
          <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ s?.updates }}</p>
            <p class="text-[11px] text-muted-foreground">Cập nhật</p>
          </div>
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">{{ s?.unchanged }}</p>
            <p class="text-[11px] text-muted-foreground">Không đổi</p>
          </div>
          <!-- Bảng cuộn trong 16rem nên dòng đỏ có thể nằm ngoài tầm nhìn: bấm ô
               này nhảy thẳng tới dòng lỗi đầu tiên. -->
          <component
            :is="preview.errors.length ? 'button' : 'div'"
            type="button"
            class="rounded-md bg-rose-50 p-2 text-left dark:bg-rose-500/10"
            :class="preview.errors.length ? 'cursor-pointer ring-rose-300 hover:ring-2 dark:ring-rose-500/40' : ''"
            @click="preview.errors.length && scrollToFirstError()"
          >
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ s?.error_rows }}</p>
            <p class="text-[11px] text-muted-foreground">
              {{ preview.errors.length ? 'Lỗi — xem dòng đỏ' : 'Lỗi' }}
            </p>
          </component>
        </div>

        <p
          v-for="n in preview.notices ?? []"
          :key="n"
          class="rounded-md border border-amber-200/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
        >
          {{ n }}
        </p>
        <p v-if="s?.duplicate_rows" class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Đã gộp <span class="font-medium text-foreground">{{ s.duplicate_rows }}</span> dòng lặp lại cùng một NVL.
        </p>

        <div ref="tableEl" class="max-h-64 overflow-auto rounded-md border border-border">
          <table class="min-w-full divide-y divide-border text-sm">
            <thead class="sticky top-0 z-10 bg-muted">
              <tr>
                <th class="table-th w-14">Dòng</th>
                <th class="table-th">Loại VL</th>
                <th class="table-th">Kích thước tấm</th>
                <th class="table-th">Mô tả</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="r in previewRows"
                :key="r.key"
                :data-error="r.error ? '1' : undefined"
                :class="r.error ? 'bg-rose-50 dark:bg-rose-500/10' : 'hover:bg-muted'"
              >
                <td
                  class="table-td tabular-nums"
                  :class="r.error ? 'font-medium text-rose-700 dark:text-rose-300' : 'text-muted-foreground'"
                  :title="r.rows.join(', ')"
                >
                  {{ rowsLabel(r.rows) }}
                </td>

                <!-- Dòng lỗi: giữ nguyên số cột, gộp Kích thước + Mô tả thành ô báo lỗi. -->
                <template v-if="r.error">
                  <td class="table-td font-medium text-rose-700 dark:text-rose-300">
                    {{ r.error.material || 'Thiếu Loại VL' }}
                  </td>
                  <td class="table-td whitespace-normal text-rose-600 dark:text-rose-400" colspan="2">
                    {{ r.error.message }}
                  </td>
                  <td class="table-td">
                    <span class="inline-flex rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                      Lỗi — bỏ qua
                    </span>
                  </td>
                </template>

                <template v-else-if="r.item">
                  <td class="table-td font-medium text-foreground">
                    {{ r.item.name }}
                    <span v-if="!r.item.exists" class="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">mới</span>
                  </td>
                  <td class="table-td whitespace-nowrap tabular-nums text-muted-foreground">
                    <template v-if="sizeChanged(r.item)">
                      <span class="line-through opacity-60">{{ formatDimMM(r.item.current_length_mm, r.item.current_width_mm) }}</span>
                      → <span class="font-medium text-foreground">{{ formatDimMM(r.item.length_mm, r.item.width_mm) }}</span>
                    </template>
                    <template v-else>{{ effectiveSize(r.item) }}</template>
                  </td>
                  <td class="table-td max-w-[10rem] truncate text-muted-foreground" :title="effectiveDesc(r.item)">
                    {{ effectiveDesc(r.item) || '—' }}
                  </td>
                  <td class="table-td">
                    <span class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium" :class="ACTION_BADGE[r.item.action]">
                      {{ ACTION_LABEL[r.item.action] }}
                    </span>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Errors -->
        <div v-if="preview.errors.length" class="rounded-md border border-rose-200/60 dark:border-rose-500/25">
          <p class="border-b border-border bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Dòng lỗi ({{ preview.errors.length }}) — đã bôi đỏ trong bảng trên, các dòng này bị bỏ qua khi áp dụng
          </p>
          <ul class="divide-y divide-border">
            <li v-for="(e, i) in preview.errors" :key="i" class="px-3 py-1.5 text-xs text-muted-foreground">
              Dòng {{ (e.row_numbers?.length ? e.row_numbers : [e.row_number]).join(', ')
              }}<template v-if="e.material"> · {{ e.material }}</template> —
              <span class="text-rose-600 dark:text-rose-400">{{ e.message }}</span>
            </li>
          </ul>
        </div>

        <p v-if="committed" class="text-sm text-emerald-600 dark:text-emerald-400">
          ✓ Đã áp dụng. Có thể đóng cửa sổ.
        </p>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="open = false">{{ committed ? 'Đóng' : 'Huỷ' }}</button>
      <button v-if="!committed" class="btn-success" :disabled="!canCommit || committing" @click="commit">
        <UiSpinner v-if="committing" :size="16" />
        Áp dụng{{ changedCount ? ` (${changedCount})` : '' }}
      </button>
    </template>
  </UiModal>
</template>
