<script setup lang="ts">
// Import định mức theo từng cặp SKU–NVL: "1 tấm NVL này ra được bao nhiêu sản
// phẩm của SKU này". Đây là con số hệ thống dùng để chia batch mẹ–con; cặp nào
// trống thì rơi về định mức mặc định của NVL, NVL cũng trống thì KHÔNG giới hạn
// (cả pool dồn một batch). Luồng: tải file mọi cặp đang có → điền cột Định mức
// → upload lại → xem trước → áp dụng. Nằm trong dialog Import định mức NVL; nút
// Áp dụng ở footer của dialog nên state commit được expose ra ngoài.
import { pairQuotaApi } from '~/services/api'
import type { PairQuotaItem, PairQuotaPreview, PairQuotaRowError } from '~/services/api'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const emit = defineEmits<{ (e: 'imported'): void }>()
const toast = useToastStore()

const file = ref<File | null>(null)
const dragging = ref(false)
const exporting = ref(false)
const previewing = ref(false)
const committing = ref(false)
const committed = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<PairQuotaPreview | null>(null)

function reset() {
  file.value = null
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
  preview.value = null
  previewError.value = null
  committed.value = false
}
function onFile(e: Event) {
  setFile((e.target as HTMLInputElement).files?.[0])
}
function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files?.[0])
}

async function exportPairs() {
  exporting.value = true
  try {
    await pairQuotaApi.exportXlsx()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    exporting.value = false
  }
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
    const { data } = await pairQuotaApi.previewFile(file.value)
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

// Gửi lại đúng các cặp đã khớp (theo mã SKU + mã NVL — không mơ hồ). Server phân
// tích lại từ đầu vì danh mục có thể đã đổi từ lúc xem trước; dòng lỗi không gửi.
const changedCount = computed(() => (preview.value?.items ?? []).filter((i) => i.action === 'UPDATE').length)
const canCommit = computed(() => !!preview.value && !committed.value && changedCount.value > 0)

async function commit() {
  if (!preview.value || !canCommit.value || committing.value) return
  committing.value = true
  try {
    const { data } = await pairQuotaApi.commit(
      preview.value.items.map((i) => ({
        row_number: i.row_numbers?.[0],
        sku: i.sku_code,
        material: i.material_name,
        material_code: i.material_code,
        quota: i.quota,
      })),
    )
    // Giữ nguyên bảng xem trước (kể cả dòng lỗi, dòng trống): commit chỉ gửi lại
    // các cặp hợp lệ nên kết quả của nó "0 lỗi" — thay bảng bằng nó là giấu mất
    // những dòng vừa bị bỏ qua.
    preview.value = { ...preview.value, applied: data.applied }
    committed.value = true
    toast.success(`Đã cập nhật định mức cho ${data.applied?.updated ?? 0} cặp SKU–NVL`)
    emit('imported')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

defineExpose({ reset, commit, canCommit, committing, committed, changedCount })

const s = computed(() => preview.value?.summary)

// Lỗi không nằm trong items (server loại hẳn cặp lỗi) — trộn vào bảng theo số
// dòng file và tô đỏ, để thứ tự bảng khớp Excel.
interface Row {
  key: string
  row: number
  rows: number[]
  item: PairQuotaItem | null
  error: PairQuotaRowError | null
}
const rows = computed<Row[]>(() => {
  const items: Row[] = (preview.value?.items ?? []).map((it) => ({
    key: `i${it.mapping_id}`,
    row: it.row_numbers?.[0] ?? Number.MAX_SAFE_INTEGER,
    rows: it.row_numbers ?? [],
    item: it,
    error: null,
  }))
  const errors: Row[] = (preview.value?.errors ?? []).map((e, i) => ({
    key: `e${i}-${e.row_number}`,
    row: e.row_number,
    rows: e.row_numbers?.length ? e.row_numbers : [e.row_number],
    item: null,
    error: e,
  }))
  return [...items, ...errors].sort((a, b) => a.row - b.row || (a.item ? 1 : 0) - (b.item ? 1 : 0))
})

function rowsLabel(r: number[]): string {
  if (!r.length) return '—'
  return r.length > 2 ? `${r.slice(0, 2).join(', ')} +${r.length - 2}` : r.join(', ')
}
function quotaLabel(q: number | null | undefined): string {
  return q == null ? 'Không giới hạn' : `${q} sp/tấm`
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5 text-xs text-muted-foreground">
      <p>
        Mỗi dòng là một cặp <span class="font-medium text-foreground">SKU + NVL</span>, cột
        <span class="font-medium text-foreground">Định mức</span> = một tấm NVL đó làm ra được bao
        nhiêu sản phẩm của SKU đó. Đây là con số hệ thống dùng để chia batch mẹ–con.
      </p>
      <p>
        Cặp chưa có định mức riêng sẽ dùng định mức mặc định của NVL; NVL cũng trống thì
        <span class="font-medium text-foreground">không giới hạn</span> — cả lô dồn vào một batch.
        Ô để trống = bỏ qua dòng, không xoá định mức đang có.
      </p>
    </div>

    <div class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      <UiIcon name="download" :size="14" class="mt-0.5 shrink-0" />
      <span>
        <button
          class="font-medium text-primary hover:underline disabled:opacity-50"
          :disabled="exporting"
          @click="exportPairs"
        >
          <UiSpinner v-if="exporting" :size="12" /> Tải file các cặp SKU – NVL đang có (.xlsx)
        </button>
        — ô Định mức trống là cặp chưa có định mức. Điền vào rồi upload lại file đó.
      </span>
    </div>

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
            {{ file?.name || (dragging ? 'Thả file vào đây…' : 'Kéo thả hoặc bấm chọn file đã điền') }}
          </span>
          <span class="text-xs text-muted-foreground">CSV / XLSX · cột SKU + Loại VL + Định mức</span>
        </div>
        <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
      </label>
      <div class="mt-2 flex justify-end">
        <button class="btn-primary" :disabled="!file || previewing" @click="runPreview">
          <UiSpinner v-if="previewing" :size="14" />
          {{ previewing ? 'Đang phân tích…' : 'Xem trước' }}
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
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
          <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ s?.updates }}</p>
          <p class="text-[11px] text-muted-foreground">Đặt / đổi định mức</p>
        </div>
        <div class="rounded-md bg-muted p-2">
          <p class="text-lg font-semibold text-foreground">{{ s?.unchanged }}</p>
          <p class="text-[11px] text-muted-foreground">Không đổi</p>
        </div>
        <div class="rounded-md bg-muted p-2">
          <p class="text-lg font-semibold text-foreground">{{ s?.blank_rows }}</p>
          <p class="text-[11px] text-muted-foreground">Để trống — bỏ qua</p>
        </div>
        <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
          <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ s?.error_rows }}</p>
          <p class="text-[11px] text-muted-foreground">Lỗi — bỏ qua</p>
        </div>
      </div>
      <p v-if="s?.duplicate_rows" class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Đã gộp <span class="font-medium text-foreground">{{ s.duplicate_rows }}</span> dòng lặp lại
        (cùng SKU, NVL và định mức).
      </p>

      <div v-if="rows.length" class="max-h-72 overflow-auto rounded-md border border-border">
        <table class="min-w-full divide-y divide-border text-sm">
          <!-- Nền trên <th>: bảng border-collapse không vẽ nền nhóm hàng, dòng
               dữ liệu sẽ cuộn xuyên qua header dính-trên. -->
          <thead class="sticky top-0 z-10 [&_th]:bg-muted">
            <tr>
              <th class="table-th w-14">Dòng</th>
              <th class="table-th">SKU</th>
              <th class="table-th">NVL</th>
              <th class="table-th">Định mức</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="r in rows"
              :key="r.key"
              :class="r.error ? 'bg-rose-50 dark:bg-rose-500/10' : 'hover:bg-muted'"
            >
              <td
                class="table-td tabular-nums"
                :class="r.error ? 'font-medium text-rose-700 dark:text-rose-300' : 'text-muted-foreground'"
                :title="r.rows.join(', ')"
              >
                {{ rowsLabel(r.rows) }}
              </td>
              <template v-if="r.error">
                <td class="table-td font-medium text-rose-700 dark:text-rose-300">{{ r.error.sku || '—' }}</td>
                <td class="table-td text-rose-700 dark:text-rose-300">{{ r.error.material || '—' }}</td>
                <td class="table-td max-w-xs whitespace-normal text-rose-600 dark:text-rose-400">{{ r.error.message }}</td>
                <td class="table-td">
                  <span class="inline-flex rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                    Lỗi
                  </span>
                </td>
              </template>
              <template v-else-if="r.item">
                <td class="table-td font-medium text-foreground">{{ r.item.sku_code }}</td>
                <td class="table-td text-foreground">
                  {{ r.item.material_name }}
                  <span class="block text-[10px] text-muted-foreground">{{ r.item.material_code }}</span>
                </td>
                <td class="table-td whitespace-nowrap text-muted-foreground">
                  <template v-if="r.item.action === 'UPDATE'">
                    <span class="line-through opacity-60">
                      {{ r.item.current_quota != null ? quotaLabel(r.item.current_quota) : `mặc định NVL: ${quotaLabel(r.item.material_quota)}` }}
                    </span>
                    → <span class="font-medium text-foreground">{{ quotaLabel(r.item.quota) }}</span>
                  </template>
                  <template v-else>{{ quotaLabel(r.item.quota) }}</template>
                </td>
                <td class="table-td">
                  <span
                    class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="r.item.action === 'UPDATE'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'bg-muted text-muted-foreground'"
                  >
                    {{ r.item.action === 'UPDATE' ? 'Đổi' : 'Không đổi' }}
                  </span>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        File không có dòng nào ghi định mức.
      </p>

      <div v-if="committed" class="space-y-0.5 text-sm">
        <p class="text-emerald-600 dark:text-emerald-400">
          ✓ Đã áp dụng cho {{ preview.applied?.updated ?? 0 }} cặp. Batch tạo từ giờ sẽ chia theo định
          mức mới.
        </p>
        <p v-if="preview.errors.length" class="text-rose-600 dark:text-rose-400">
          {{ preview.errors.length }} dòng lỗi ở trên không được áp dụng — sửa file rồi import lại.
        </p>
      </div>
    </div>
  </div>
</template>
