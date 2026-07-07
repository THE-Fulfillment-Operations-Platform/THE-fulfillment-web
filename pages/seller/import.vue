<script setup lang="ts">
import { sellerImportApi } from '~/services/api'
import type { ImportPreview, ImportRow } from '~/types'
import { parseCsv, importTemplateCsv, IMPORT_COLUMNS } from '~/utils/csv'
import { importErrorVi } from '~/utils/import-errors'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

// Seller self-upload. Orders are created under the logged-in seller (enforced by
// the backend) and land in "Chờ duyệt" — the workshop reviews before production.
definePageMeta({ layout: 'seller' })

const toast = useToastStore()

const mode = ref<'file' | 'paste'>('file')
const file = ref<File | null>(null)
const fileName = ref('')
const csvText = ref('')

const previewing = ref(false)
const committing = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<ImportPreview | null>(null)
const committed = ref(false)

// Seller can't fix master data — surface SKU-setup errors as "contact workshop".
const SKU_ISSUE_CODES = ['SKU_UNMAPPED', 'SKU_NO_MATERIAL']
const hasSkuIssue = computed(() =>
  (preview.value?.errors ?? []).some((e) => SKU_ISSUE_CODES.includes(e.error_code || '')),
)
// Enrich each row error with its Vietnamese, seller-friendly copy.
const errorRows = computed(() =>
  (preview.value?.errors ?? []).map((e) => ({ ...e, vi: importErrorVi(e) })),
)

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  file.value = f
  fileName.value = f.name
  preview.value = null
  committed.value = false
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
      const { data } = await sellerImportApi.previewFile(file.value)
      preview.value = data
    } else {
      const rows = rowsFromCsv()
      if (!rows.length) {
        toast.error('Không đọc được dòng nào từ CSV')
        return
      }
      const { data } = await sellerImportApi.preview(rows, 'pasted.csv')
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
    const { data } = await sellerImportApi.commitJob(preview.value.import_job_id)
    const created = data.created_count ?? preview.value.valid_rows
    committed.value = true
    if (preview.value) preview.value.status = 'COMMITTED'
    toast.success(`Đã gửi ${created} đơn — chờ xưởng duyệt`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

function downloadTemplate() {
  const blob = new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mau-nhap-don.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function loadSample() {
  mode.value = 'paste'
  csvText.value = importTemplateCsv()
}

const canCommit = computed(
  () => !!preview.value && preview.value.valid_rows > 0 && !committed.value && preview.value.status !== 'COMMITTED',
)
</script>

<template>
  <div>
    <PageHeader title="Tải đơn lên" subtitle="Tải file đơn của bạn — hệ thống kiểm tra rồi gửi cho xưởng duyệt">
      <template #actions>
        <button class="btn-secondary" @click="downloadTemplate">
          <UiIcon name="upload" :size="16" /> Tải file mẫu
        </button>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Input -->
      <div class="card p-5 lg:col-span-1">
        <div class="mb-3 flex gap-1 rounded-xl bg-muted p-1 text-sm">
          <button
            class="flex-1 rounded-lg px-3 py-1.5 font-medium transition-colors"
            :class="mode === 'file' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="mode = 'file'"
          >
            Tải file
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
            class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center hover:border-primary"
          >
            <UiIcon name="upload" :size="28" class="text-muted-foreground" />
            <span class="text-sm text-foreground">{{ fileName || 'Chọn file CSV / XLSX' }}</span>
            <span class="text-xs text-muted-foreground">Đúng theo file mẫu</span>
            <input type="file" accept=".csv,.xlsx,.xls" class="hidden" @change="onFile" />
          </label>
        </div>
        <div v-else>
          <textarea
            v-model="csvText"
            rows="8"
            class="input font-mono text-xs"
            placeholder="Dán nội dung CSV (gồm dòng tiêu đề)…"
          />
          <button class="mt-2 text-xs text-primary hover:underline" @click="loadSample">
            Chèn dữ liệu mẫu
          </button>
        </div>

        <button class="btn-primary mt-4 w-full" :disabled="previewing" @click="runPreview">
          <UiSpinner v-if="previewing" :size="16" />
          {{ previewing ? 'Đang kiểm tra…' : 'Kiểm tra file' }}
        </button>

        <div class="mt-4 border-t border-border pt-3">
          <p class="mb-1 text-xs font-medium text-muted-foreground">Các cột cần có</p>
          <p class="text-[11px] leading-relaxed text-muted-foreground">{{ IMPORT_COLUMNS.join(', ') }}</p>
        </div>
      </div>

      <!-- Result -->
      <div class="lg:col-span-2">
        <div
          v-if="previewError"
          class="card mb-4 border-rose-200/60 bg-red-50 p-4 text-sm text-red-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {{ previewError }}
        </div>

        <div v-if="preview" class="space-y-4">
          <div class="card p-5">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-foreground">Kết quả kiểm tra</h3>
              <UiStatusBadge v-if="committed || preview.status === 'COMMITTED'" kind="review" value="PENDING_REVIEW" />
            </div>
            <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="rounded-md bg-muted p-3">
                <p class="text-2xl font-semibold text-foreground">{{ preview.total_rows }}</p>
                <p class="text-xs text-muted-foreground">Tổng dòng</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-2xl font-semibold text-foreground">{{ preview.order_count }}</p>
                <p class="text-xs text-muted-foreground">Số đơn</p>
              </div>
              <div class="rounded-md bg-emerald-50 p-3 dark:bg-emerald-500/10">
                <p class="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{{ preview.valid_rows }}</p>
                <p class="text-xs text-emerald-600 dark:text-emerald-400">Hợp lệ</p>
              </div>
              <div class="rounded-md bg-red-50 p-3 dark:bg-rose-500/10">
                <p class="text-2xl font-semibold text-red-700 dark:text-rose-300">{{ preview.error_rows }}</p>
                <p class="text-xs text-red-600 dark:text-rose-400">Lỗi cần sửa</p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <button class="btn-success" :disabled="!canCommit || committing" @click="commit">
                <UiSpinner v-if="committing" :size="16" />
                {{ committed || preview.status === 'COMMITTED' ? 'Đã gửi' : `Gửi ${preview.valid_rows} đơn cho xưởng` }}
              </button>
              <p v-if="committed" class="text-sm text-emerald-600 dark:text-emerald-400">
                ✓ Đã gửi. Theo dõi ở <NuxtLink to="/seller" class="underline">Đơn của tôi</NuxtLink> (trạng thái <b>Chờ duyệt</b>).
              </p>
            </div>
          </div>

          <div
            v-if="hasSkuIssue"
            class="card border-amber-200/60 bg-amber-50 p-4 dark:border-amber-500/25 dark:bg-amber-500/10"
          >
            <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">Có SKU chưa được xưởng khai báo</p>
            <p class="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
              Một số SKU trong file chưa có trong hệ thống của xưởng. Vui lòng liên hệ xưởng để được khai báo, sau đó
              tải lại file.
            </p>
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
                    <th class="table-th">Lỗi</th>
                    <th class="table-th">Cần làm gì</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(err, i) in errorRows" :key="i" class="hover:bg-red-50/40 dark:bg-rose-500/10">
                    <td class="table-td">{{ err.row_number }}</td>
                    <td class="table-td">{{ err.store_order_id || '—' }}</td>
                    <td class="table-td">{{ err.sku || '—' }}</td>
                    <td class="table-td max-w-xs whitespace-normal">
                      <span class="font-medium text-red-600 dark:text-rose-400">{{ err.vi.label }}</span>
                      <span class="mt-0.5 block text-xs text-muted-foreground">{{ err.vi.detail }}</span>
                    </td>
                    <td class="table-td max-w-xs whitespace-normal text-muted-foreground">{{ err.vi.suggestion || '—' }}</td>
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
          <p class="text-sm">Chọn file hoặc dán CSV rồi bấm “Kiểm tra file”.</p>
        </div>
      </div>
    </div>
  </div>
</template>
