<script setup lang="ts">
// Khai thông tin vận chuyển cho nhiều SKU bằng Excel: tải file mọi SKU (mỗi
// dòng một SKU, SKU cha đứng trước các con) → điền cân nặng / hộp / giá trị khai
// báo / mã HS → xem trước → áp dụng. Đây là thứ THE cần để tạo đơn từ FFM.
//
// Ô trống = SKU đó không tự khai, lấy theo SKU cha — khai một lần ở dòng SKU
// cha, dòng SKU con chỉ điền chỗ khác. Áp dụng gửi LẠI đúng file: máy chủ đối
// chiếu lại từ đầu rồi ghi tất cả hoặc không ghi gì.
import { skusApi } from '~/services/api'
import type { SkuShippingPreview } from '~/services/api/masters'
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
const downloading = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<SkuShippingPreview | null>(null)
const { file, fileName, dragging, onFile, onDrop, reset: resetFile } = useSpreadsheetFile(() => {
  preview.value = null
})

watch(open, (v) => {
  if (!v) {
    resetFile()
    preview.value = null
    previewError.value = null
  }
})

async function download() {
  downloading.value = true
  try {
    await skusApi.downloadShippingExport()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloading.value = false
  }
}

async function runPreview() {
  if (!file.value) return
  previewing.value = true
  previewError.value = null
  preview.value = null
  try {
    const { data } = await skusApi.shippingImportPreview(file.value)
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

async function commit() {
  if (!file.value || !preview.value?.can_commit || committing.value) return
  committing.value = true
  try {
    const { data } = await skusApi.shippingImportCommit(file.value)
    preview.value = data
    toast.success(`Đã cập nhật thông tin vận chuyển cho ${data.changed} SKU`)
    emit('imported')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

// Bảng chỉ cần thấy dòng có việc: lỗi, đổi, hoặc còn thiếu. Dòng không đổi mà
// đủ thông tin chỉ đếm, không liệt kê — file 488 SKU sẽ toàn dòng như thế.
const shownRows = computed(() =>
  (preview.value?.rows ?? []).filter((r) => r.status !== 'UNCHANGED' || (r.missing?.length ?? 0) > 0),
)
const COLUMN_LABEL: Record<string, string> = {
  weight: 'Cân nặng',
  length: 'Dài',
  width: 'Rộng',
  height: 'Cao',
  value: 'Giá trị',
  hs: 'Mã HS',
}
</script>

<template>
  <UiModal v-model="open" title="Thông tin vận chuyển SKU (Excel)" wide>
    <div class="space-y-4">
      <div class="rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <p class="mb-1 font-medium text-foreground">Cách làm</p>
        <ol class="list-decimal space-y-0.5 pl-4">
          <li>
            <button class="font-medium text-primary hover:underline disabled:opacity-50" :disabled="downloading" @click="download">
              <UiSpinner v-if="downloading" :size="12" /> Tải file SKU hiện có (.xlsx)
            </button>
            — mỗi dòng một SKU, SKU cha đứng trước các SKU con.
          </li>
          <li>
            Điền <b class="text-foreground">Cân nặng (g)</b> và <b class="text-foreground">Dài / Rộng / Cao hộp (cm)</b> cho MỘT sản phẩm đã đóng gói.
            Cột <b class="text-foreground">Giá trị khai báo</b> và <b class="text-foreground">Mã HS</b> để trống — bên THE đặt mặc định; chỉ điền khi sản phẩm cần khác.
          </li>
          <li>
            Khai ở dòng <b class="text-foreground">SKU cha</b> là đủ cho cả họ; dòng SKU con để trống ô nào thì lấy theo cha ô đó,
            chỉ điền chỗ khác cha (vd cân nặng của size lớn).
          </li>
          <li>Upload lại, xem trước, bấm Áp dụng.</li>
        </ol>
      </div>

      <div v-if="!preview?.committed">
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
            <span class="text-xs text-muted-foreground">XLSX / CSV · cột Mã SKU + các cột vận chuyển</span>
          </div>
          <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
        </label>
        <div class="mt-2 flex justify-end">
          <button class="btn-primary" :disabled="!file || previewing" @click="runPreview">
            <UiSpinner v-if="previewing" :size="14" />
            {{ previewing ? 'Đang đối chiếu…' : 'Xem trước' }}
          </button>
        </div>
      </div>

      <div
        v-if="previewError"
        class="rounded-md border border-rose-200/60 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
      >
        {{ previewError }}
      </div>

      <div v-if="preview" class="space-y-3">
        <p class="text-xs text-muted-foreground">
          File có cột: {{ preview.columns.map((c) => COLUMN_LABEL[c] ?? c).join(', ') }}. Cột không có trong file giữ nguyên.
        </p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ preview.changed }}</p>
            <p class="text-[11px] text-muted-foreground">SKU thay đổi</p>
          </div>
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">{{ preview.unchanged }}</p>
            <p class="text-[11px] text-muted-foreground">Không đổi</p>
          </div>
          <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ preview.errors }}</p>
            <p class="text-[11px] text-muted-foreground">Dòng lỗi</p>
          </div>
          <div class="rounded-md bg-sky-50 p-2 dark:bg-sky-500/10">
            <p class="text-lg font-semibold text-sky-700 dark:text-sky-300">{{ preview.incomplete }}</p>
            <p class="text-[11px] text-muted-foreground">SKU vẫn còn thiếu</p>
          </div>
        </div>
        <p v-if="preview.errors" class="text-xs text-rose-600 dark:text-rose-400">
          Còn dòng lỗi thì chưa áp dụng được — sửa file rồi chọn lại. (Ghi một nửa danh mục còn tệ hơn không ghi.)
        </p>
        <p v-if="preview.incomplete" class="text-xs text-muted-foreground">
          "Vẫn còn thiếu" là cân nặng / kích thước hộp, tính cả phần lấy theo SKU cha. SKU cha chỉ để gom nhóm (không đi đơn) thì có thể bỏ qua.
        </p>

        <div v-if="shownRows.length" class="max-h-72 overflow-auto rounded-md border border-border">
          <table class="min-w-full divide-y divide-border text-sm">
            <thead class="sticky top-0 z-10 bg-muted">
              <tr>
                <th class="table-th w-14">Dòng</th>
                <th class="table-th">SKU</th>
                <th class="table-th">Thay đổi</th>
                <th class="table-th">Còn thiếu</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="r in shownRows"
                :key="r.row"
                :class="r.status === 'ERROR' ? 'bg-rose-50 dark:bg-rose-500/10' : ''"
              >
                <td class="table-td tabular-nums text-muted-foreground">{{ r.row }}</td>
                <td class="table-td font-mono text-xs">{{ r.code || '—' }}</td>
                <td class="table-td whitespace-normal text-xs">
                  <span v-if="r.status === 'ERROR'" class="text-rose-600 dark:text-rose-400">{{ r.error }}</span>
                  <template v-else-if="r.changes?.length">
                    <div v-for="c in r.changes" :key="c">{{ c }}</div>
                  </template>
                  <span v-else class="text-muted-foreground">Không đổi</span>
                </td>
                <td class="table-td whitespace-normal text-xs text-amber-700 dark:text-amber-300">
                  {{ r.missing?.join(', ') || '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="preview.committed" class="text-sm text-emerald-600 dark:text-emerald-400">
          ✓ Đã áp dụng. Có thể đóng cửa sổ.
        </p>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="open = false">{{ preview?.committed ? 'Đóng' : 'Huỷ' }}</button>
      <button
        v-if="!preview?.committed"
        class="btn-success"
        :disabled="!preview?.can_commit || committing"
        @click="commit"
      >
        <UiSpinner v-if="committing" :size="16" />
        Áp dụng{{ preview?.changed ? ` (${preview.changed} SKU)` : '' }}
      </button>
    </template>
  </UiModal>
</template>
