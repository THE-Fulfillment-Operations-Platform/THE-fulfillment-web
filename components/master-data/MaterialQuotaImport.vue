<script setup lang="ts">
import { materialsApi } from '~/services/api'
import type { MaterialImportPreview, MaterialImportItem, MaterialImportAction } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'imported'): void }>()

const toast = useToastStore()
const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const file = ref<File | null>(null)
const fileName = ref('')
const dragging = ref(false)
const previewing = ref(false)
const committing = ref(false)
const committed = ref(false)
const downloadingTemplate = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<MaterialImportPreview | null>(null)

// Reset mọi state mỗi khi đóng modal, để lần mở sau bắt đầu sạch.
watch(open, (v) => {
  if (!v) reset()
})
function reset() {
  file.value = null
  fileName.value = ''
  preview.value = null
  previewError.value = null
  committed.value = false
}

function setFile(f: File | null | undefined) {
  if (!f) return
  if (!/\.(csv|xlsx|xlsm)$/i.test(f.name)) {
    toast.error('Chỉ nhận file .csv, .xlsx hoặc .xlsm')
    return
  }
  file.value = f
  fileName.value = f.name
  preview.value = null
  committed.value = false
}
function onFile(e: Event) {
  setFile((e.target as HTMLInputElement).files?.[0])
}
function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files?.[0])
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

// Chỉ gửi các dòng thực sự thay đổi (tạo mới / cập nhật). NOCHANGE bỏ qua.
const rowsToCommit = computed(() =>
  (preview.value?.items ?? [])
    .filter((i) => i.action !== 'NOCHANGE')
    .map((i) => ({ material: i.name, quota: i.quota, description: i.description })),
)
const canCommit = computed(
  () => !!preview.value && !committed.value && rowsToCommit.value.length > 0,
)

async function commit() {
  if (!canCommit.value || committing.value) return
  committing.value = true
  try {
    const { data } = await materialsApi.importCommit(rowsToCommit.value)
    preview.value = data
    committed.value = true
    const a = data.applied
    toast.success(a ? `Đã tạo ${a.created}, cập nhật ${a.updated} định mức` : 'Đã áp dụng')
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
    await materialsApi.downloadQuotaTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

const s = computed(() => preview.value?.summary)
function quotaLabel(q: number | null): string {
  return q == null ? 'Không giới hạn' : `${q} sp/đơn vị`
}
// Định mức đổi thật sự (file có ghi số và khác giá trị đang có) → hiện gạch cũ → mới.
function quotaChanged(it: MaterialImportItem): boolean {
  return it.action === 'UPDATE' && it.quota !== null && it.quota !== it.current_quota
}
function effectiveQuota(it: MaterialImportItem): number | null {
  return it.quota !== null ? it.quota : it.current_quota
}
// Mô tả sau import: ưu tiên giá trị trong file, không có thì giữ giá trị cũ.
function effectiveDesc(it: MaterialImportItem): string {
  return it.description || it.current_description
}

const ACTION_BADGE: Record<MaterialImportAction, string> = {
  CREATE: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  UPDATE: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  NOCHANGE: 'bg-muted text-muted-foreground',
}
const ACTION_LABEL: Record<MaterialImportAction, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Đổi định mức',
  NOCHANGE: 'Không đổi',
}
</script>

<template>
  <UiModal v-model="open" title="Import định mức NVL (Excel)">
    <div class="space-y-4">
      <p class="text-xs text-muted-foreground">
        Cột <span class="font-medium text-foreground">Loại VL</span> (tên NVL) và
        <span class="font-medium text-foreground">Định mức</span> (số sản phẩm tối đa 1 đơn vị NVL
        làm ra); thêm cột <span class="font-medium text-foreground">Mô tả</span> nếu muốn (tuỳ chọn).
        Mỗi NVL 1 dòng. Ô để trống = không ghi đè giá trị đang có.
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
            <span class="text-xs text-muted-foreground">CSV / XLSX · 2 cột Loại VL + Định mức</span>
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
          <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ s?.error_rows }}</p>
            <p class="text-[11px] text-muted-foreground">Lỗi</p>
          </div>
        </div>

        <div class="max-h-64 overflow-auto rounded-md border border-border">
          <table class="min-w-full divide-y divide-border text-sm">
            <thead class="sticky top-0 z-10 bg-muted">
              <tr>
                <th class="table-th">Loại VL</th>
                <th class="table-th">Định mức</th>
                <th class="table-th">Mô tả</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="it in preview.items" :key="it.code" class="hover:bg-muted">
                <td class="table-td font-medium text-foreground">
                  {{ it.name }}
                  <span v-if="!it.exists" class="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">mới</span>
                </td>
                <td class="table-td text-muted-foreground">
                  <template v-if="quotaChanged(it)">
                    <span class="line-through opacity-60">{{ quotaLabel(it.current_quota) }}</span>
                    → <span class="font-medium text-foreground">{{ quotaLabel(it.quota) }}</span>
                  </template>
                  <template v-else>{{ quotaLabel(effectiveQuota(it)) }}</template>
                </td>
                <td class="table-td max-w-[10rem] truncate text-muted-foreground" :title="effectiveDesc(it)">
                  {{ effectiveDesc(it) || '—' }}
                </td>
                <td class="table-td">
                  <span class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium" :class="ACTION_BADGE[it.action]">
                    {{ ACTION_LABEL[it.action] }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Errors -->
        <div v-if="preview.errors.length" class="rounded-md border border-rose-200/60 dark:border-rose-500/25">
          <p class="border-b border-border bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Dòng lỗi ({{ preview.errors.length }})
          </p>
          <ul class="divide-y divide-border">
            <li v-for="(e, i) in preview.errors" :key="i" class="px-3 py-1.5 text-xs text-muted-foreground">
              Dòng {{ e.row_number }}<template v-if="e.material"> · {{ e.material }}</template> —
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
        Áp dụng{{ rowsToCommit.length ? ` (${rowsToCommit.length})` : '' }}
      </button>
    </template>
  </UiModal>
</template>
