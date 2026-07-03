<script setup lang="ts">
import { masterDataApi } from '~/services/api'
import type { MasterImportPreview, MasterSkuStatus } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const emit = defineEmits<{ (e: 'committed'): void }>()
const toast = useToastStore()

const mode = ref<'file' | 'paste'>('file')
const file = ref<File | null>(null)
const fileName = ref('')
const csvText = ref('')

const previewing = ref(false)
const committing = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<MasterImportPreview | null>(null)
const committed = ref(false)

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  file.value = f
  fileName.value = f.name
  preview.value = null
  committed.value = false
}

async function runPreview() {
  previewing.value = true
  previewError.value = null
  preview.value = null
  committed.value = false
  try {
    let f: File | null = file.value
    if (mode.value === 'paste') {
      if (!csvText.value.trim()) {
        toast.error('Chưa có nội dung CSV để phân tích')
        return
      }
      f = new File([csvText.value], 'pasted-legacy.csv', { type: 'text/csv' })
    }
    if (!f) {
      toast.error('Chưa chọn file CSV/XLSX')
      return
    }
    const { data } = await masterDataApi.previewFile(f)
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

async function commit() {
  if (!preview.value) return
  committing.value = true
  try {
    const { data } = await masterDataApi.commit(preview.value.import_job_id)
    preview.value = data
    committed.value = true
    const a = data.applied
    toast.success(
      a
        ? `Đã tạo ${a.materials_created} material, ${a.skus_created} SKU, ${a.mappings_created} mapping`
        : 'Đã commit',
    )
    emit('committed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

const canCommit = computed(
  () => !!preview.value && !committed.value && preview.value.status !== 'COMMITTED',
)
const s = computed(() => preview.value?.summary)
const newMaterials = computed(() => preview.value?.materials.filter((m) => !m.exists) ?? [])
const needsReview = computed(() => preview.value?.skus.filter((k) => k.status === 'NEEDS_REVIEW') ?? [])
const missingMaterial = computed(() => preview.value?.skus.filter((k) => k.status === 'MISSING_MATERIAL') ?? [])

const STATUS_BADGE: Record<MasterSkuStatus, string> = {
  OK: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  NEEDS_REVIEW: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  MISSING_MATERIAL: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
}
const STATUS_LABEL: Record<MasterSkuStatus, string> = {
  OK: 'Sẽ map',
  NEEDS_REVIEW: 'Cần review',
  MISSING_MATERIAL: 'Thiếu NVL',
}

const SAMPLE_CSV = [
  'Mã nội bộ,Số tấm,Ngày,Order ID,SKU,Loại VL,Mã ảnh,Số lượng,Đã QC,Tên Khách hàng',
  'IC001,1,2024-01-01,ORD1,BR A 1.6 kep,Mica trong 3 ly,IMG1,1,x,Alice',
  'IC002,2,2024-01-02,ORD2,3LWD 12in,Gỗ 5 ly 3 layer,IMG2,1,,Bob',
  'IC003,3,2024-01-03,ORD3,NEW SKU X,MDF 3ly 80x120,IMG3,1,,Carol',
].join('\n')

function loadSample() {
  mode.value = 'paste'
  csvText.value = SAMPLE_CSV
}
function downloadTemplate() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'legacy-master-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
    <!-- Input -->
    <div class="card h-fit p-5 lg:col-span-1">
      <h3 class="mb-1 text-sm font-semibold text-foreground">Import file vận hành cũ</h3>
      <p class="mb-4 text-xs text-muted-foreground">
        Hệ thống đọc 2 cột <span class="font-medium text-foreground">SKU</span> và
        <span class="font-medium text-foreground">Loại VL</span> để tạo Materials, SKUs và mapping.
        Các cột khác được bỏ qua. Không tự đoán nguyên vật liệu.
      </p>

      <div class="mb-3 flex gap-1 rounded-xl bg-muted p-1 text-sm">
        <button
          class="flex-1 rounded-lg px-3 py-1.5 font-medium transition-colors"
          :class="mode === 'file' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="mode = 'file'"
        >
          Upload file
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-1.5 font-medium transition-colors"
          :class="mode === 'paste' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="mode = 'paste'"
        >
          Dán CSV
        </button>
      </div>

      <div v-if="mode === 'file'">
        <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center hover:border-primary">
          <UiIcon name="upload" :size="28" class="text-muted-foreground" />
          <span class="text-sm text-foreground">{{ fileName || 'Chọn file CSV / XLSX' }}</span>
          <span class="text-xs text-muted-foreground">File Excel vận hành hiện tại của xưởng</span>
          <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
        </label>
      </div>
      <div v-else>
        <textarea v-model="csvText" rows="8" class="input font-mono text-xs" placeholder="Dán nội dung CSV (gồm header có cột SKU và Loại VL)…" />
        <button class="mt-2 text-xs text-primary hover:underline" @click="loadSample">Chèn dữ liệu mẫu</button>
      </div>

      <button class="btn-primary mt-4 w-full" :disabled="previewing" @click="runPreview">
        <UiSpinner v-if="previewing" :size="16" />
        {{ previewing ? 'Đang phân tích…' : 'Preview' }}
      </button>
      <button class="btn-secondary mt-2 w-full" @click="downloadTemplate">
        <UiIcon name="upload" :size="14" /> Tải template mẫu
      </button>
    </div>

    <!-- Preview -->
    <div class="lg:col-span-2">
      <div v-if="previewError" class="card mb-4 border-rose-200/60 bg-red-50 p-4 text-sm text-red-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
        {{ previewError }}
      </div>

      <div v-if="preview" class="space-y-4">
        <div class="card p-5">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-foreground">Kết quả preview · Job #{{ preview.import_job_id }}</h3>
            <span
              v-if="preview.status === 'COMMITTED' || committed"
              class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            >
              <UiIcon name="check" :size="12" /> Đã commit
            </span>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div class="rounded-md bg-muted p-3">
              <p class="text-xl font-semibold text-foreground">{{ s?.total_rows }}</p>
              <p class="text-[11px] text-muted-foreground">Tổng dòng</p>
            </div>
            <div class="rounded-md bg-sky-50 p-3 dark:bg-sky-500/10">
              <p class="text-xl font-semibold text-sky-700 dark:text-sky-300">{{ s?.new_materials }}</p>
              <p class="text-[11px] text-muted-foreground">Material mới</p>
            </div>
            <div class="rounded-md bg-indigo-50 p-3 dark:bg-indigo-500/10">
              <p class="text-xl font-semibold text-indigo-700 dark:text-indigo-300">{{ s?.new_skus }}</p>
              <p class="text-[11px] text-muted-foreground">SKU mới</p>
            </div>
            <div class="rounded-md bg-emerald-50 p-3 dark:bg-emerald-500/10">
              <p class="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{{ s?.new_mappings }}</p>
              <p class="text-[11px] text-muted-foreground">Mapping mới</p>
            </div>
            <div class="rounded-md bg-amber-50 p-3 dark:bg-amber-500/10">
              <p class="text-xl font-semibold text-amber-700 dark:text-amber-300">{{ s?.review_count }}</p>
              <p class="text-[11px] text-muted-foreground">Cần review</p>
            </div>
            <div class="rounded-md bg-rose-50 p-3 dark:bg-rose-500/10">
              <p class="text-xl font-semibold text-rose-600 dark:text-rose-300">{{ (s?.missing_count ?? 0) + (s?.error_rows ?? 0) }}</p>
              <p class="text-[11px] text-muted-foreground">Thiếu NVL / lỗi</p>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <button class="btn-success" :disabled="!canCommit || committing" @click="commit">
              <UiSpinner v-if="committing" :size="16" />
              {{ committed || preview.status === 'COMMITTED' ? 'Đã commit' : 'Commit tạo dữ liệu' }}
            </button>
            <p v-if="committed && preview.applied" class="text-sm text-emerald-600 dark:text-emerald-400">
              ✓ Tạo {{ preview.applied.materials_created }} material, {{ preview.applied.skus_created }} SKU,
              {{ preview.applied.mappings_created }} mapping.
            </p>
          </div>
        </div>

        <!-- Needs review -->
        <div v-if="needsReview.length" class="card overflow-hidden border-amber-200/60 dark:border-amber-500/25">
          <div class="border-b border-border bg-amber-50 px-4 py-2.5 dark:bg-amber-500/10">
            <h3 class="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Cần review — 1 SKU có nhiều Loại VL khác nhau ({{ needsReview.length }})
            </h3>
            <p class="text-[11px] text-amber-700/80 dark:text-amber-300/80">Không tự merge. Sẽ tạo SKU nhưng không gán NVL — hãy vào tab “SKU → Material” để xử lý.</p>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-card"><tr><th class="table-th">SKU</th><th class="table-th">Các Loại VL xuất hiện</th></tr></thead>
              <tbody class="divide-y divide-border">
                <tr v-for="k in needsReview" :key="k.code">
                  <td class="table-td font-mono text-xs">{{ k.code }}</td>
                  <td class="table-td whitespace-normal">
                    <span v-for="n in k.material_names" :key="n" class="mr-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">{{ n }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Missing material -->
        <div v-if="missingMaterial.length" class="card overflow-hidden border-rose-200/60 dark:border-rose-500/25">
          <div class="border-b border-border bg-rose-50 px-4 py-2.5 dark:bg-rose-500/10">
            <h3 class="text-sm font-semibold text-rose-700 dark:text-rose-300">Thiếu nguyên vật liệu — SKU không có Loại VL ({{ missingMaterial.length }})</h3>
            <p class="text-[11px] text-rose-700/80 dark:text-rose-300/80">Sẽ tạo SKU nhưng chưa gán NVL. Bổ sung Loại VL trong file hoặc map thủ công sau.</p>
          </div>
          <div class="flex flex-wrap gap-1.5 p-3">
            <span v-for="k in missingMaterial" :key="k.code" class="inline-flex rounded-md bg-rose-50 px-2 py-0.5 font-mono text-xs text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">{{ k.code }}</span>
          </div>
        </div>

        <!-- Errors -->
        <div v-if="preview.errors?.length" class="card overflow-hidden">
          <div class="border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Dòng lỗi ({{ preview.errors.length }})</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-card"><tr><th class="table-th">Dòng</th><th class="table-th">Loại VL</th><th class="table-th">Lỗi</th></tr></thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(e, i) in preview.errors" :key="i">
                  <td class="table-td">{{ e.row_number }}</td>
                  <td class="table-td">{{ e.material || '—' }}</td>
                  <td class="table-td text-rose-600 dark:text-rose-400"><span class="font-medium">{{ e.error_code }}</span> — {{ e.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Full SKU plan -->
        <div class="card overflow-hidden">
          <div class="border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Chi tiết SKU ({{ preview.skus.length }})</h3>
          </div>
          <div class="max-h-96 overflow-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="sticky top-0 bg-card">
                <tr><th class="table-th">SKU</th><th class="table-th">Trạng thái</th><th class="table-th">Loại VL (từ file)</th><th class="table-th">Dòng</th></tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="k in preview.skus" :key="k.code" class="hover:bg-muted">
                  <td class="table-td font-mono text-xs">
                    {{ k.code }}
                    <span v-if="!k.exists" class="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">mới</span>
                  </td>
                  <td class="table-td">
                    <span class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium" :class="STATUS_BADGE[k.status]">{{ STATUS_LABEL[k.status] }}</span>
                  </td>
                  <td class="table-td whitespace-normal text-muted-foreground">{{ k.material_names.join(', ') || '—' }}</td>
                  <td class="table-td text-muted-foreground">{{ k.row_count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- New materials -->
        <div v-if="newMaterials.length" class="card p-4">
          <h3 class="mb-2 text-sm font-semibold text-foreground">Nguyên vật liệu mới sẽ tạo ({{ newMaterials.length }})</h3>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="m in newMaterials" :key="m.code" class="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              {{ m.name }} <span class="font-mono text-[10px] opacity-70">{{ m.code }}</span>
            </span>
          </div>
        </div>
      </div>

      <div v-else-if="!previewError" class="card flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <UiIcon name="layers" :size="32" />
        <p class="text-sm">Chọn file hoặc dán CSV rồi bấm Preview để xem dữ liệu sẽ được tạo.</p>
      </div>
    </div>
  </div>
</template>
