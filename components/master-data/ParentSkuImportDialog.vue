<script setup lang="ts">
// Bước 1 của thiết lập SKU cha → con: import các SKU cha (vd "Hộp nhựa"). Bước 2
// (SkuImportDialog) mới xếp SKU con vào dưới qua cột "SKU cha" — và từ chối SKU
// cha chưa có, nên cha phải vào trước.
import { masterDataApi } from '~/services/api'
import type { ParentSkuImportAction, ParentSkuImportItem, ParentSkuImportPreview, MasterImportRowError } from '~/types'
import { errorMessage } from '~/utils/api-error'
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
const preview = ref<ParentSkuImportPreview | null>(null)
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
    const { data } = await masterDataApi.parentsPreviewFile(file.value)
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

// Gửi lại mọi dòng hợp lệ (kể cả NOCHANGE) — server phân tích lại từ đầu trong
// transaction nên kết quả áp dụng khớp đúng bản xem trước.
const rowsToCommit = computed(() =>
  (preview.value?.items ?? []).map((i) => ({
    sku: i.name,
    product_name: i.product_name,
    description: i.description,
    row_number: i.row_numbers?.[0],
  })),
)
const changedCount = computed(() => (preview.value?.items ?? []).filter((i) => i.action !== 'NOCHANGE').length)
const canCommit = computed(() => !!preview.value && !committed.value && changedCount.value > 0)

async function commit() {
  if (!canCommit.value || committing.value) return
  committing.value = true
  try {
    const { data } = await masterDataApi.parentsCommit(rowsToCommit.value)
    preview.value = data
    committed.value = true
    const a = data.applied
    toast.success(a ? `Đã tạo ${a.created}, cập nhật ${a.updated} SKU cha` : 'Đã áp dụng')
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
    await masterDataApi.downloadParentTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

const s = computed(() => preview.value?.summary)

// Dòng lỗi không nằm trong items — trộn vào bảng theo số dòng file rồi tô đỏ,
// để thứ tự bảng khớp thứ tự Excel.
interface PreviewRow {
  key: string
  row: number
  item: ParentSkuImportItem | null
  error: MasterImportRowError | null
}
const previewRows = computed<PreviewRow[]>(() => {
  const items: PreviewRow[] = (preview.value?.items ?? []).map((it, i) => ({
    key: `i${i}-${it.code}`,
    row: it.row_numbers?.[0] ?? Number.MAX_SAFE_INTEGER,
    item: it,
    error: null,
  }))
  const errors: PreviewRow[] = (preview.value?.errors ?? []).map((e, i) => ({
    key: `e${i}-${e.row_number}`,
    row: e.row_number,
    item: null,
    error: e,
  }))
  return [...items, ...errors].sort((a, b) => a.row - b.row || (a.item ? 1 : 0) - (b.item ? 1 : 0))
})

const ACTION_BADGE: Record<ParentSkuImportAction, string> = {
  CREATE: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  UPDATE: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  NOCHANGE: 'bg-muted text-muted-foreground',
}
const ACTION_LABEL: Record<ParentSkuImportAction, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  NOCHANGE: 'Không đổi',
}
</script>

<template>
  <UiModal v-model="open" title="Bước 1 · Import SKU cha" wide>
    <div class="space-y-4">
      <p class="text-xs text-muted-foreground">
        SKU cha gom các SKU cùng loại, vd cha <span class="font-mono text-foreground">HOP-NHUA</span> (Hộp nhựa)
        chứa các con bé / lớn / vuông. File gồm cột <span class="font-medium text-foreground">SKU cha</span>
        (mã), <span class="font-medium text-foreground">Tên sản phẩm</span> và
        <span class="font-medium text-foreground">Mô tả</span> (tuỳ chọn). Ô để trống không ghi đè giá trị
        đang có. Xong bước này mới import SKU con (bước 2) — cột SKU cha bên đó phải trùng mã ở đây.
      </p>

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
            <span class="text-xs text-muted-foreground">CSV / XLSX · SKU cha + Tên sản phẩm + Mô tả</span>
          </div>
          <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
        </label>
        <div class="mt-2 flex items-center justify-between">
          <button class="text-xs text-primary hover:underline disabled:opacity-50" :disabled="downloadingTemplate" @click="downloadTemplate">
            <UiSpinner v-if="downloadingTemplate" :size="12" /> Tải template SKU cha (.xlsx)
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

      <div v-if="preview" class="space-y-3">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-md bg-indigo-50 p-2 dark:bg-indigo-500/10">
            <p class="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{{ s?.new }}</p>
            <p class="text-[11px] text-muted-foreground">SKU cha mới</p>
          </div>
          <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ s?.updates }}</p>
            <p class="text-[11px] text-muted-foreground">Cập nhật tên / mô tả</p>
          </div>
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">{{ s?.unchanged }}</p>
            <p class="text-[11px] text-muted-foreground">Không đổi</p>
          </div>
          <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ s?.error_rows }}</p>
            <p class="text-[11px] text-muted-foreground">Lỗi — bỏ qua</p>
          </div>
        </div>
        <p v-if="s?.duplicate_rows" class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Đã gộp <span class="font-medium text-foreground">{{ s.duplicate_rows }}</span> dòng lặp lại cùng mã SKU cha.
        </p>

        <div class="max-h-72 overflow-auto rounded-md border border-border">
          <table class="min-w-full divide-y divide-border text-sm">
            <thead class="sticky top-0 z-10 bg-muted">
              <tr>
                <th class="table-th w-14">Dòng</th>
                <th class="table-th">SKU cha</th>
                <th class="table-th">Tên sản phẩm</th>
                <th class="table-th">SKU con</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="r in previewRows" :key="r.key" :class="r.error ? 'bg-rose-50 dark:bg-rose-500/10' : 'hover:bg-muted'">
                <td class="table-td tabular-nums" :class="r.error ? 'font-medium text-rose-700 dark:text-rose-300' : 'text-muted-foreground'">
                  {{ r.row }}
                </td>
                <template v-if="r.error">
                  <td class="table-td font-mono text-xs font-medium text-rose-700 dark:text-rose-300">{{ r.error.sku || '—' }}</td>
                  <td class="table-td whitespace-normal text-rose-600 dark:text-rose-400" colspan="2">{{ r.error.message }}</td>
                  <td class="table-td">
                    <span class="inline-flex rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Lỗi — bỏ qua</span>
                  </td>
                </template>
                <template v-else-if="r.item">
                  <td class="table-td font-mono text-xs font-medium text-foreground">{{ r.item.code }}</td>
                  <td class="table-td whitespace-normal text-foreground">
                    <template v-if="r.item.action === 'UPDATE' && r.item.product_name && r.item.product_name !== r.item.current_product_name">
                      <span class="line-through opacity-60">{{ r.item.current_product_name || '—' }}</span>
                      → {{ r.item.product_name }}
                    </template>
                    <template v-else>{{ r.item.product_name || r.item.current_product_name || '—' }}</template>
                  </td>
                  <td class="table-td text-muted-foreground">{{ r.item.exists ? `${r.item.child_count} SKU con` : '—' }}</td>
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

        <p v-if="committed" class="text-sm text-emerald-600 dark:text-emerald-400">
          ✓ Đã áp dụng. Tiếp theo: bấm <span class="font-medium">Import SKU con</span> để xếp SKU con vào các SKU cha này.
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
