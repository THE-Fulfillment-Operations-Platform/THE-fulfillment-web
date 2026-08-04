<script setup lang="ts">
// Import file Excel vận hành cũ (cột SKU + Loại VL + Tên sản phẩm) để tạo
// Materials, SKUs và mapping. Trước đây là một tab riêng ở màn Master Data; giờ
// nằm ngay cạnh nút "Thêm SKU" vì nó chính là cách tạo SKU hàng loạt.
import { masterDataApi } from '~/services/api'
import type { MasterImportPreview, MasterSkuStatus } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'imported'): void }>()

const toast = useToastStore()
const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const mode = ref<'file' | 'paste'>('file')
const file = ref<File | null>(null)
const fileName = ref('')
const csvText = ref('')
const dragging = ref(false)

const previewing = ref(false)
const committing = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<MasterImportPreview | null>(null)
const committed = ref(false)

// Mở lại lần sau phải sạch, không dính preview của file trước.
watch(open, (v) => {
  if (!v) reset()
})
function reset() {
  mode.value = 'file'
  file.value = null
  fileName.value = ''
  csvText.value = ''
  preview.value = null
  previewError.value = null
  committed.value = false
}

// Dùng chung cho ô chọn file và vùng kéo thả.
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
    emit('imported')
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
  'Tên sản phẩm,SKU,Loại VL,Mã ảnh,Số lượng',
  'Kệ gỗ treo tường,BR A 1.6 kep,Mica trong 3 ly,IMG1,1',
  'Thớt gỗ khắc tên,3LWD 12in,Gỗ 5 ly 3 layer,IMG2,1',
  'Bảng tên để bàn,NEW SKU X,MDF 3ly 80x120,IMG3,1',
  'Đèn gỗ combo,BR A 2 Gai,Mica trong 3 ly + Mica Hologram,IMG4,1',
].join('\n')

function loadSample() {
  mode.value = 'paste'
  csvText.value = SAMPLE_CSV
}

const downloadingTemplate = ref(false)
// Lấy file mẫu .xlsx thật từ backend: cột tách đúng trong Excel ở mọi locale,
// không bị vỡ như blob CSV sinh ở client.
async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    await masterDataApi.downloadTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}
</script>

<template>
  <UiModal v-model="open" title="Import SKU từ file Excel vận hành" wide>
    <div class="space-y-4">
      <p class="text-xs text-muted-foreground">
        Hệ thống đọc cột <span class="font-medium text-foreground">SKU</span>,
        <span class="font-medium text-foreground">Loại VL</span> và
        <span class="font-medium text-foreground">Tên sản phẩm</span> (tuỳ chọn) để tạo Materials,
        SKUs và mapping. Các cột khác được bỏ qua. Không tự đoán nguyên vật liệu. SKU làm từ
        <span class="font-medium text-foreground">nhiều NVL</span> (combo) thì ghi các NVL trong cùng
        ô, ngăn cách bằng dấu <span class="font-medium text-foreground">+</span> (vd:
        <span class="font-mono">Mica trong 3 ly + Mica Hologram</span>).
      </p>

      <!-- Nguồn dữ liệu -->
      <div v-if="!committed">
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
              <span class="text-xs text-muted-foreground">File Excel vận hành của xưởng · CSV / XLSX</span>
            </div>
            <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
          </label>
        </div>
        <div v-else>
          <textarea
            v-model="csvText"
            rows="6"
            class="input font-mono text-xs"
            placeholder="Dán nội dung CSV (gồm header có cột SKU và Loại VL)…"
          />
          <button class="mt-2 text-xs text-primary hover:underline" @click="loadSample">
            Chèn dữ liệu mẫu
          </button>
        </div>

        <div class="mt-2 flex items-center justify-between">
          <button
            class="text-xs text-primary hover:underline disabled:opacity-50"
            :disabled="downloadingTemplate"
            @click="downloadTemplate"
          >
            <UiSpinner v-if="downloadingTemplate" :size="12" /> Tải template mẫu (.xlsx)
          </button>
          <button class="btn-primary" :disabled="previewing" @click="runPreview">
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

      <!-- Preview -->
      <div v-if="preview" class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold text-foreground">Job #{{ preview.import_job_id }}</h4>
          <span
            v-if="preview.status === 'COMMITTED' || committed"
            class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            <UiIcon name="check" :size="12" /> Đã áp dụng
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">{{ s?.total_rows }}</p>
            <p class="text-[11px] text-muted-foreground">Tổng dòng</p>
          </div>
          <div class="rounded-md bg-sky-50 p-2 dark:bg-sky-500/10">
            <p class="text-lg font-semibold text-sky-700 dark:text-sky-300">{{ s?.new_materials }}</p>
            <p class="text-[11px] text-muted-foreground">NVL mới</p>
          </div>
          <div class="rounded-md bg-indigo-50 p-2 dark:bg-indigo-500/10">
            <p class="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{{ s?.new_skus }}</p>
            <p class="text-[11px] text-muted-foreground">SKU mới</p>
          </div>
          <div class="rounded-md bg-emerald-50 p-2 dark:bg-emerald-500/10">
            <p class="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{{ s?.new_mappings }}</p>
            <p class="text-[11px] text-muted-foreground">Mapping mới</p>
          </div>
          <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ s?.review_count }}</p>
            <p class="text-[11px] text-muted-foreground">Cần review</p>
          </div>
          <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">
              {{ (s?.missing_count ?? 0) + (s?.error_rows ?? 0) }}
            </p>
            <p class="text-[11px] text-muted-foreground">Thiếu NVL / lỗi</p>
          </div>
        </div>

        <!-- Cần review -->
        <div v-if="needsReview.length" class="rounded-md border border-amber-200/60 dark:border-amber-500/25">
          <div class="border-b border-border bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            <p class="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Cần kiểm tra — 1 SKU khai NVL không đồng nhất giữa các dòng ({{ needsReview.length }})
            </p>
            <p class="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              Hệ vẫn gộp (union) tất cả NVL và gán cho SKU, nhưng nên rà lại file cho đồng nhất.
            </p>
          </div>
          <div class="max-h-40 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr><th class="table-th">SKU</th><th class="table-th">Các Loại VL xuất hiện</th></tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="k in needsReview" :key="k.code">
                  <td class="table-td font-mono text-xs">{{ k.code }}</td>
                  <td class="table-td whitespace-normal">
                    <span
                      v-for="n in k.material_names"
                      :key="n"
                      class="mr-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                    >{{ n }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Thiếu NVL -->
        <div v-if="missingMaterial.length" class="rounded-md border border-rose-200/60 dark:border-rose-500/25">
          <div class="border-b border-border bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
            <p class="text-xs font-semibold text-rose-700 dark:text-rose-300">
              Thiếu nguyên vật liệu — SKU không có Loại VL ({{ missingMaterial.length }})
            </p>
            <p class="text-[11px] text-rose-700/80 dark:text-rose-300/80">
              Vẫn tạo SKU nhưng chưa gán NVL. Bổ sung Loại VL trong file hoặc map thủ công sau.
            </p>
          </div>
          <div class="flex max-h-32 flex-wrap gap-1.5 overflow-auto p-2.5">
            <span
              v-for="k in missingMaterial"
              :key="k.code"
              class="inline-flex rounded-md bg-rose-50 px-2 py-0.5 font-mono text-xs text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
            >{{ k.code }}</span>
          </div>
        </div>

        <!-- Dòng lỗi -->
        <div v-if="preview.errors?.length" class="rounded-md border border-border">
          <p class="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            Dòng lỗi ({{ preview.errors.length }})
          </p>
          <div class="max-h-40 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr><th class="table-th">Dòng</th><th class="table-th">Loại VL</th><th class="table-th">Lỗi</th></tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(e, i) in preview.errors" :key="i" class="bg-rose-50/70 dark:bg-rose-500/10">
                  <td class="table-td font-medium text-rose-700 dark:text-rose-300">{{ e.row_number }}</td>
                  <td class="table-td text-rose-700 dark:text-rose-300">{{ e.material || '—' }}</td>
                  <td class="table-td text-rose-600 dark:text-rose-400">
                    <span class="font-medium">{{ e.error_code }}</span> — {{ e.message }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Toàn bộ SKU sẽ tạo/map -->
        <div class="rounded-md border border-border">
          <p class="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            Chi tiết SKU ({{ preview.skus.length }})
          </p>
          <div class="max-h-64 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 z-10 bg-muted">
                <tr>
                  <th class="table-th">SKU</th>
                  <th class="table-th">Tên sản phẩm</th>
                  <th class="table-th">Trạng thái</th>
                  <th class="table-th">Loại VL (từ file)</th>
                  <th class="table-th">Dòng</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="k in preview.skus" :key="k.code" class="hover:bg-muted">
                  <td class="table-td font-mono text-xs">
                    {{ k.code }}
                    <span
                      v-if="!k.exists"
                      class="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    >mới</span>
                    <span
                      v-if="k.is_combo"
                      class="ml-1 rounded bg-violet-50 px-1 text-[10px] text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                      :title="`Combo ${k.material_names.length} NVL`"
                    >combo</span>
                  </td>
                  <td class="table-td whitespace-normal text-foreground">
                    <template v-if="k.product_name">
                      {{ k.product_name }}
                      <span
                        v-if="(k.product_names?.length ?? 0) > 1"
                        class="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                        :title="k.product_names?.join(' · ')"
                      >+{{ (k.product_names?.length ?? 1) - 1 }} tên khác</span>
                    </template>
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="table-td">
                    <span class="inline-flex rounded-md px-2 py-0.5 text-xs font-medium" :class="STATUS_BADGE[k.status]">
                      {{ STATUS_LABEL[k.status] }}
                    </span>
                  </td>
                  <td class="table-td whitespace-normal text-muted-foreground">
                    {{ k.material_names.join(', ') || '—' }}
                  </td>
                  <td class="table-td text-muted-foreground">{{ k.row_count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- NVL mới -->
        <div v-if="newMaterials.length" class="rounded-md border border-border p-3">
          <p class="mb-2 text-xs font-semibold text-foreground">
            Nguyên vật liệu mới sẽ tạo ({{ newMaterials.length }})
          </p>
          <div class="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
            <span
              v-for="m in newMaterials"
              :key="m.code"
              class="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
            >
              {{ m.name }} <span class="font-mono text-[10px] opacity-70">{{ m.code }}</span>
            </span>
          </div>
        </div>

        <p v-if="committed && preview.applied" class="text-sm text-emerald-600 dark:text-emerald-400">
          ✓ Đã tạo {{ preview.applied.materials_created }} material,
          {{ preview.applied.skus_created }} SKU, {{ preview.applied.mappings_created }} mapping. Có
          thể đóng cửa sổ.
        </p>
      </div>

      <div
        v-else-if="!previewError"
        class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-10 text-muted-foreground"
      >
        <UiIcon name="layers" :size="28" />
        <p class="text-sm">Chọn file hoặc dán CSV rồi bấm Xem trước để kiểm tra dữ liệu sẽ tạo.</p>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="open = false">{{ committed ? 'Đóng' : 'Huỷ' }}</button>
      <button v-if="preview" class="btn-success" :disabled="!canCommit || committing" @click="commit">
        <UiSpinner v-if="committing" :size="16" />
        {{ committed || preview.status === 'COMMITTED' ? 'Đã áp dụng' : 'Áp dụng tạo dữ liệu' }}
      </button>
    </template>
  </UiModal>
</template>
