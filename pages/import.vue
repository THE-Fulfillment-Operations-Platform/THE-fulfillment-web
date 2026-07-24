<script setup lang="ts">
import { importsApi, sellersApi } from '~/services/api'
import type { ImportPreview, ImportRow, Seller } from '~/types'
import { parseCsv, importTemplateCsv, IMPORT_COLUMNS } from '~/utils/csv'
import { importErrorVi } from '~/utils/import-errors'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const toast = useToastStore()

const sellers = ref<Seller[]>([])
const sellerId = ref<number | null>(null)
const sellerOptions = computed(() =>
  sellers.value.length === 0
    ? [{ value: 1, label: 'SELLER01 (mặc định)' }]
    : sellers.value.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
)
const mode = ref<'file' | 'paste'>('file')
const file = ref<File | null>(null)
const fileName = ref('')
const csvText = ref('')
const dragging = ref(false)

const previewing = ref(false)
const committing = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<ImportPreview | null>(null)
const committed = ref(false)

onMounted(async () => {
  try {
    const { data } = await sellersApi.list()
    sellers.value = data ?? []
    sellerId.value = sellers.value[0]?.id ?? 1
  } catch {
    sellerId.value = 1 // fall back to the seed seller
  }
})

// Shared by both the click-to-select input and the drag-drop zone.
function setFile(f: File | null | undefined) {
  if (!f) return
  if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
    toast.error('Chỉ nhận file .csv, .xlsx hoặc .xls')
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

function rowsFromCsv(): ImportRow[] {
  const parsed = parseCsv(csvText.value)
  return parsed.map((r) => {
    const row: Record<string, string | number> = {}
    for (const col of IMPORT_COLUMNS) {
      if (r[col] !== undefined && r[col] !== '') row[col] = r[col]
    }
    if (row.Quantity !== undefined) row.Quantity = Number(row.Quantity) || 0
    return row as unknown as ImportRow
  })
}

async function runPreview() {
  if (!sellerId.value) {
    toast.error('Vui lòng chọn seller')
    return
  }
  previewing.value = true
  previewError.value = null
  preview.value = null
  committed.value = false
  try {
    if (mode.value === 'file') {
      if (!file.value) {
        toast.error('Chưa chọn file CSV/XLSX')
        return
      }
      const { data } = await importsApi.previewFile(file.value, sellerId.value)
      preview.value = data
    } else {
      const rows = rowsFromCsv()
      if (!rows.length) {
        toast.error('Không đọc được dòng nào từ CSV')
        return
      }
      const { data } = await importsApi.preview({
        seller_id: sellerId.value,
        commit: false,
        filename: 'pasted.csv',
        rows,
      })
      preview.value = data
    }
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
    const { data } = await importsApi.commitJob(preview.value.import_job_id)
    const created = data.commit?.created_count ?? data.preview?.created_count ?? 0
    committed.value = true
    if (preview.value) preview.value.status = 'COMMITTED'
    toast.success(`Đã commit ${created} đơn hợp lệ`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

const downloadingTemplate = ref(false)
// Pull the template as a real .xlsx from the backend: columns split cleanly in
// Excel on any locale, unlike the old client-side comma CSV that opened with
// everything crammed into column A and "Mã ảnh" garbled.
async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    await importsApi.downloadTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

function loadSample() {
  mode.value = 'paste'
  csvText.value = importTemplateCsv()
}

const canCommit = computed(
  () => !!preview.value && preview.value.valid_rows > 0 && !committed.value && preview.value.status !== 'COMMITTED',
)

// SKU setup issues: SKU not in master (SKU_UNMAPPED) or SKU exists but has no
// material yet (SKU_NO_MATERIAL). Both are resolved in Master Data, so surface a
// clear call-to-action instead of a bare error.
const SKU_ISSUE_CODES = ['SKU_UNMAPPED', 'SKU_NO_MATERIAL']
function isSkuIssue(code?: string) {
  return !!code && SKU_ISSUE_CODES.includes(code)
}
// Enrich each row error with its Vietnamese, customer-friendly copy.
const errorRows = computed(() =>
  (preview.value?.errors ?? []).map((e) => ({ ...e, vi: importErrorVi(e) })),
)
// Non-blocking heads-up rows (duplicate StoreOrderID). They ARE imported — a store
// order id is a repeatable reference label — but we surface them red so staff can
// eyeball a possible re-send and confirm with the customer.
const warningRows = computed(() =>
  (preview.value?.warnings ?? []).map((e) => ({ ...e, vi: importErrorVi(e) })),
)
const skuIssues = computed(() => (preview.value?.errors ?? []).filter((e) => isSkuIssue(e.error_code)))
const unmappedSkus = computed(() => [...new Set(skuIssues.value.map((e) => e.sku).filter(Boolean))] as string[])
// Deep-link: unknown SKU → legacy import / create; existing-but-unmapped → mapping.
function masterDataLink(code?: string) {
  return code === 'SKU_NO_MATERIAL' ? '/master-data?tab=mapping' : '/master-data?tab=import'
}
</script>

<template>
  <div>
    <PageHeader title="Import đơn hàng" subtitle="Upload CSV/XLSX, kiểm tra lỗi theo dòng, commit các dòng hợp lệ">
      <template #actions>
        <button class="btn-secondary" :disabled="downloadingTemplate" @click="downloadTemplate">
          <UiSpinner v-if="downloadingTemplate" :size="16" />
          <UiIcon v-else name="upload" :size="16" />
          {{ downloadingTemplate ? 'Đang tải…' : 'Tải template (.xlsx)' }}
        </button>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Input -->
      <div class="card p-5 lg:col-span-1">
        <div class="mb-4">
          <label class="label">Seller</label>
          <UiSelect v-model="sellerId" :options="sellerOptions" aria-label="Seller" />
        </div>

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
            class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors"
            :class="dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'"
            @dragenter.prevent="dragging = true"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <div class="pointer-events-none flex flex-col items-center gap-2">
              <UiIcon name="upload" :size="28" :class="dragging ? 'text-primary' : 'text-muted-foreground'" />
              <span class="text-sm text-foreground">
                {{ fileName || (dragging ? 'Thả file vào đây…' : 'Kéo thả file vào đây, hoặc bấm để chọn') }}
              </span>
              <span class="text-xs text-muted-foreground">Backend tự parse và validate · CSV / XLSX</span>
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" class="hidden" @change="onFile" />
          </label>
        </div>
        <div v-else>
          <textarea
            v-model="csvText"
            rows="8"
            class="input font-mono text-xs"
            placeholder="Dán nội dung CSV (gồm header)…"
          />
          <button class="mt-2 text-xs text-primary hover:underline" @click="loadSample">
            Chèn dữ liệu mẫu
          </button>
        </div>

        <button class="btn-primary mt-4 w-full" :disabled="previewing" @click="runPreview">
          <UiSpinner v-if="previewing" :size="16" />
          {{ previewing ? 'Đang kiểm tra…' : 'Preview & Validate' }}
        </button>

        <div class="mt-4 border-t border-border pt-3">
          <p class="mb-1 text-xs font-medium text-muted-foreground">Cột dữ liệu cần có</p>
          <p class="text-[11px] leading-relaxed text-muted-foreground">{{ IMPORT_COLUMNS.join(', ') }}</p>
          <p class="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            <b class="text-foreground">Front Design</b>: link design mặt trước — bắt buộc nếu sản phẩm có in.
            <b class="text-foreground">Back Design</b>: link design mặt sau — chỉ điền khi sản phẩm in 2 mặt; để trống nếu chỉ in 1 mặt.
          </p>
        </div>
      </div>

      <!-- Preview -->
      <div class="lg:col-span-2">
        <div v-if="previewError" class="card mb-4 border-rose-200/60 dark:border-rose-500/25 bg-red-50 dark:bg-rose-500/10 p-4 text-sm text-red-700 dark:text-rose-300">
          {{ previewError }}
        </div>

        <div v-if="preview" class="space-y-4">
          <div class="card p-5">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-foreground">
                Kết quả preview · Job #{{ preview.import_job_id }}
              </h3>
              <UiStatusBadge
                v-if="preview.status === 'COMMITTED' || committed"
                kind="design"
                value="READY"
              />
            </div>
            <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="rounded-md bg-muted p-3">
                <p class="text-2xl font-semibold text-foreground">{{ preview.total_rows }}</p>
                <p class="text-xs text-muted-foreground">Tổng dòng</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-2xl font-semibold text-foreground">{{ preview.order_count }}</p>
                <p class="text-xs text-muted-foreground">Số orders</p>
              </div>
              <div class="rounded-md bg-emerald-50 p-3 dark:bg-emerald-500/10">
                <p class="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{{ preview.valid_rows }}</p>
                <p class="text-xs text-emerald-600 dark:text-emerald-400">Hợp lệ</p>
              </div>
              <div class="rounded-md bg-red-50 dark:bg-rose-500/10 p-3">
                <p class="text-2xl font-semibold text-red-700 dark:text-rose-300">{{ preview.error_rows }}</p>
                <p class="text-xs text-red-600 dark:text-rose-400">Lỗi cần sửa</p>
              </div>
            </div>

            <div class="mt-4 flex items-center gap-2">
              <button class="btn-success" :disabled="!canCommit || committing" @click="commit">
                <UiSpinner v-if="committing" :size="16" />
                {{ committed || preview.status === 'COMMITTED' ? 'Đã commit' : `Commit ${preview.valid_rows} dòng hợp lệ` }}
              </button>
              <p v-if="committed" class="text-sm text-emerald-600 dark:text-emerald-400">
                ✓ Đã tạo đơn. Xem ở <NuxtLink to="/orders" class="underline">Orders</NuxtLink>.
              </p>
            </div>
            <p v-if="warningRows.length" class="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
              ⚠ {{ warningRows.length }} dòng trùng StoreOrderID — vẫn import (mã nội bộ riêng), xem chi tiết bên dưới.
            </p>
          </div>

          <!-- SKU setup call-to-action -->
          <div
            v-if="skuIssues.length"
            class="card border-amber-200/60 bg-amber-50 p-4 dark:border-amber-500/25 dark:bg-amber-500/10"
          >
            <div class="flex items-start gap-3">
              <div class="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                <UiIcon name="alert" :size="18" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {{ skuIssues.length }} dòng chưa import được vì SKU chưa được setup nguyên vật liệu
                </p>
                <p class="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                  Hệ thống cần biết mỗi SKU thuộc nguyên vật liệu nào trước khi gom batch.
                  Khai báo SKU/NVL rồi Preview lại file này.
                </p>
                <p v-if="unmappedSkus.length" class="mt-1.5 flex flex-wrap gap-1">
                  <span
                    v-for="sku in unmappedSkus"
                    :key="sku"
                    class="inline-flex rounded-md bg-amber-100 px-2 py-0.5 font-mono text-[11px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                  >
                    {{ sku }}
                  </span>
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <NuxtLink to="/master-data?tab=import" class="btn-primary px-3 py-1.5 text-xs">
                    <UiIcon name="layers" :size="14" /> Setup SKU/NVL
                  </NuxtLink>
                  <button class="btn-secondary px-3 py-1.5 text-xs" :disabled="previewing" @click="runPreview">
                    <UiIcon name="refresh" :size="14" /> Validate lại
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Duplicate StoreOrderID — non-blocking heads-up (rows are still imported) -->
          <div v-if="warningRows.length" class="card overflow-hidden border-rose-300/60 dark:border-rose-500/30">
            <div class="border-b border-rose-200/60 bg-rose-50 px-4 py-2.5 dark:border-rose-500/25 dark:bg-rose-500/10">
              <h3 class="flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
                <UiIcon name="alert" :size="16" /> Trùng StoreOrderID ({{ warningRows.length }}) — vẫn import, cần kiểm tra
              </h3>
              <p class="mt-0.5 text-xs text-rose-600/90 dark:text-rose-300/80">
                Các đơn dưới đây trùng StoreOrderID với đơn đã có. Hệ thống vẫn tạo đơn mới (mã nội bộ riêng) — kiểm tra kẻo up nhầm, nghi trùng thì báo lại khách.
              </p>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-border">
                <thead class="bg-card">
                  <tr>
                    <th class="table-th">Dòng</th>
                    <th class="table-th">Mã đơn (StoreOrderID)</th>
                    <th class="table-th">SKU</th>
                    <th class="table-th">Ghi chú</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(w, i) in warningRows" :key="i" class="bg-rose-50/50 dark:bg-rose-500/10">
                    <td class="table-td">{{ w.row_number }}</td>
                    <td class="table-td font-medium text-rose-700 dark:text-rose-300">{{ w.store_order_id || '—' }}</td>
                    <td class="table-td">{{ w.sku || '—' }}</td>
                    <td class="table-td max-w-xs whitespace-normal text-muted-foreground">{{ w.vi.suggestion || w.vi.detail }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Errors -->
          <div v-if="preview.errors?.length" class="card overflow-hidden">
            <div class="border-b border-border bg-muted px-4 py-2.5">
              <h3 class="text-sm font-semibold text-foreground">Lỗi theo dòng ({{ preview.errors.length }})</h3>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-border">
                <thead class="bg-card">
                  <tr>
                    <th class="table-th">Dòng</th>
                    <th class="table-th">Mã đơn</th>
                    <th class="table-th">SKU</th>
                    <th class="table-th hidden sm:table-cell">Cột</th>
                    <th class="table-th">Lỗi</th>
                    <th class="table-th">Cần làm gì</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(err, i) in errorRows" :key="i" class="hover:bg-red-50/40 dark:bg-rose-500/10">
                    <td class="table-td">{{ err.row_number }}</td>
                    <td class="table-td">{{ err.store_order_id || '—' }}</td>
                    <td class="table-td">{{ err.sku || '—' }}</td>
                    <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">{{ err.field || '—' }}</td>
                    <td class="table-td max-w-xs whitespace-normal">
                      <span class="font-medium text-red-600 dark:text-rose-400">{{ err.vi.label }}</span>
                      <span class="mt-0.5 block text-xs text-muted-foreground">{{ err.vi.detail }}</span>
                      <span class="mt-1 inline-block rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground/60">{{ err.error_code }}</span>
                    </td>
                    <td class="table-td max-w-xs whitespace-normal text-muted-foreground">
                      <span>{{ err.vi.suggestion || '—' }}</span>
                      <NuxtLink
                        v-if="isSkuIssue(err.error_code)"
                        :to="masterDataLink(err.error_code)"
                        class="mt-0.5 block text-xs font-medium text-primary hover:underline"
                      >
                        → Thiết lập SKU/NVL
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else class="card p-4 text-sm text-emerald-600 dark:text-emerald-400">
            Không có lỗi — tất cả dòng hợp lệ.
          </div>
        </div>

        <div v-else-if="!previewError" class="card flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <UiIcon name="upload" :size="32" />
          <p class="text-sm">Chọn file hoặc dán CSV rồi bấm Preview để xem kết quả.</p>
        </div>
      </div>
    </div>
  </div>
</template>
