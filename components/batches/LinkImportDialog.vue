<script setup lang="ts">
// Bàn làm việc Excel của designer, 3 bước:
//  1. Tải file danh sách batch (mỗi dòng = MỘT batch đang chờ file sản xuất),
//     điền Link in + Link cắt ngoài hệ thống, rồi chọn file để upload lại.
//  2. Đối chiếu (preview): backend so từng dòng theo BATCH ID bất biến — không
//     theo vị trí dòng — và KHÔNG ghi gì cho tới khi bấm xác nhận.
//  3. Kết quả: batch nào đã được cập nhật.
// Nguyên tắc an toàn: chỉ cần MỘT dòng lỗi là cả file không được nhập
// (can_commit = false) — hệ thống không bao giờ nhập một nửa file.
import { batchesApi } from '~/services/api'
import type {
  BatchLinkImportCommitResult,
  BatchLinkImportIssueCode,
  BatchLinkImportPreview,
  BatchLinkImportPreviewRow,
} from '~/services/api'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'done'): void }>()

const toast = useToastStore()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const file = ref<File | null>(null)
const dragging = ref(false)
const downloadingTemplate = ref(false)
const previewing = ref(false)
const preview = ref<BatchLinkImportPreview | null>(null)
const previewError = ref<string | null>(null)
const committing = ref(false)
const commitError = ref<string | null>(null)
const includeReplace = ref(false)
const replaceReason = ref('')
const result = ref<BatchLinkImportCommitResult | null>(null)

// Mở lại lần sau phải sạch, không dính file/preview/kết quả của lần trước.
watch(open, (v) => {
  if (!v) reset()
})
function reset() {
  file.value = null
  dragging.value = false
  preview.value = null
  previewError.value = null
  commitError.value = null
  includeReplace.value = false
  replaceReason.value = ''
  result.value = null
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
  commitError.value = null
  includeReplace.value = false
  replaceReason.value = ''
  result.value = null
}
function onFile(e: Event) {
  setFile((e.target as HTMLInputElement).files?.[0])
}
function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files?.[0])
}

async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    await batchesApi.downloadLinksExport()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

async function runPreview() {
  if (!file.value) {
    toast.error('Chưa chọn file Excel/CSV')
    return
  }
  previewing.value = true
  previewError.value = null
  commitError.value = null
  preview.value = null
  result.value = null
  try {
    const { data } = await batchesApi.previewLinkImport(file.value)
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

// `?? []` trên CHÍNH mảng: Go trả mảng rỗng thành JSON null, mà `null.filter()`
// là lỗi render — cả dialog (kể cả nút xác nhận) biến mất, nhìn như bấm không ăn.
const s = computed(() => preview.value?.summary)
const rows = computed<BatchLinkImportPreviewRow[]>(() => preview.value?.rows ?? [])
const errorRows = computed(() => rows.value.filter((r) => r.severity === 'ERROR'))
const replaceRows = computed(() => rows.value.filter((r) => r.action === 'REPLACE'))
const applicableRows = computed(() => rows.value.filter((r) => r.severity !== 'ERROR'))

// Số batch sẽ thực sự đổi dữ liệu (dòng UNCHANGED vẫn gửi lên nhưng backend
// tự no-op, nên không đếm vào đây).
const commitCount = computed(
  () => (s.value?.assign ?? 0) + (includeReplace.value ? (s.value?.replace ?? 0) : 0),
)
const hasReplace = computed(() => (s.value?.replace ?? 0) > 0)
const reasonMissing = computed(() => hasReplace.value && !replaceReason.value.trim())
// Backend là all-or-nothing: một dòng REPLACE không kèm lý do sẽ huỷ CẢ lần
// nhập, nên nút chỉ mở khi người dùng đã tick cho phép thay và nhập lý do.
const commitBlocked = computed(
  () =>
    committing.value ||
    !preview.value?.can_commit ||
    applicableRows.value.length === 0 ||
    (hasReplace.value && (!includeReplace.value || reasonMissing.value)),
)

const ISSUE_LABEL: Record<BatchLinkImportIssueCode, string> = {
  BAD_TEMPLATE: 'Sai mẫu file',
  MISSING_BATCH_ID: 'Thiếu Batch ID',
  MISSING_CODE: 'Thiếu mã batch',
  NOT_FOUND: 'Không có batch này',
  CODE_MISMATCH: 'Mã batch không khớp ID',
  CLOSED: 'Batch đã đóng',
  ALREADY_STARTED: 'Đã bắt đầu sản xuất',
  NO_ITEMS: 'Batch không còn sản phẩm',
  DUPLICATE_BATCH: 'Trùng batch trong file',
  MISSING_PRINT: 'Thiếu Link in',
  MISSING_CUT: 'Thiếu Link cắt',
  INVALID_URL: 'Link không hợp lệ',
  REPLACE: 'Thay link hiện có',
}
function issueLabel(row: BatchLinkImportPreviewRow): string {
  return row.code ? (ISSUE_LABEL[row.code] ?? row.code) : ''
}

/** Rút gọn URL để bảng không vỡ, vẫn giữ link đầy đủ ở href/title. */
function shortUrl(url: string): string {
  if (!url) return '—'
  return url.length > 46 ? `${url.slice(0, 28)}…${url.slice(-14)}` : url
}

async function commit() {
  if (!preview.value || commitBlocked.value) return
  committing.value = true
  commitError.value = null
  try {
    const { data } = await batchesApi.commitLinkImport({
      source_filename: file.value?.name ?? 'batch-production-links.xlsx',
      reason: hasReplace.value ? replaceReason.value.trim() : undefined,
      // Gửi cả dòng UNCHANGED — backend tự bỏ qua, không tạo lịch sử giả.
      // expected_* là link đã THẤY lúc đối chiếu: backend so lại dưới khoá,
      // lệch là huỷ cả lần nhập thay vì ghi đè thứ người khác vừa gắn.
      rows: applicableRows.value.map((r) => ({
        batch_id: r.batch_id,
        batch_code: r.batch_code,
        print_url: r.new_print_url,
        cut_url: r.new_cut_url,
        expected_print_url: r.current_print_url,
        expected_cut_url: r.current_cut_url,
      })),
    })
    result.value = data
    toast.success(`Đã cập nhật ${data.updated} batch`)
    emit('done')
  } catch (e) {
    commitError.value = errorMessage(e)
  } finally {
    committing.value = false
  }
}
</script>

<template>
  <UiModal v-model="open" title="Gắn link in/cắt từ Excel" wide>
    <div class="space-y-4">
      <!-- Bước 1: tải file mẫu + chọn file đã điền -->
      <template v-if="!preview && !result">
        <p class="text-xs text-muted-foreground">
          Mỗi dòng trong file là <span class="font-medium text-foreground">một batch</span> đang chờ
          bộ file sản xuất, kèm <span class="font-medium text-foreground">Batch ID</span> và mã
          batch. Designer chỉ cần điền
          <span class="font-medium text-foreground">Link in</span> và
          <span class="font-medium text-foreground">Link cắt</span> vào đúng dòng rồi upload lại.
          Sắp xếp lại các dòng thoải mái — hệ thống đối chiếu bằng Batch ID, không theo vị trí dòng.
        </p>
        <div class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
          <span>
            File chỉ được <span class="font-medium text-foreground">đối chiếu</span>, chưa thay đổi
            dữ liệu cho tới khi bạn bấm xác nhận ở bước sau.
          </span>
        </div>

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
              {{ file?.name || (dragging ? 'Thả file vào đây…' : 'Kéo thả hoặc bấm chọn file') }}
            </span>
            <span class="text-xs text-muted-foreground">File đã điền link · CSV / XLSX</span>
          </div>
          <input type="file" accept=".csv,.xlsx,.xlsm" class="hidden" @change="onFile" />
        </label>

        <div class="flex items-center justify-between">
          <button
            class="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            :disabled="downloadingTemplate"
            @click="downloadTemplate"
          >
            <UiSpinner v-if="downloadingTemplate" :size="12" />
            <UiIcon v-else name="download" :size="14" />
            Tải Excel danh sách batch (.xlsx)
          </button>
          <button class="btn-primary" :disabled="previewing || !file" @click="runPreview">
            <UiSpinner v-if="previewing" :size="14" />
            {{ previewing ? 'Đang đối chiếu…' : 'Đối chiếu' }}
          </button>
        </div>
      </template>

      <div
        v-if="previewError"
        class="rounded-md border border-rose-200/60 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
      >
        {{ previewError }}
      </div>

      <!-- Bước 2: preview -->
      <div v-if="preview && !result" class="space-y-3">
        <div
          v-if="(s?.errors ?? 0) > 0"
          class="flex items-start gap-2 rounded-md border border-rose-200/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <UiIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-semibold">File có {{ s?.errors }} dòng lỗi — chưa nhập được</p>
            <p class="text-xs opacity-90">
              Để an toàn, hệ thống <span class="font-semibold">không cập nhật một nửa file</span>:
              sửa các dòng lỗi bên dưới rồi tải file lên lại.
            </p>
          </div>
        </div>
        <div
          v-else
          class="flex items-start gap-2 rounded-md border border-emerald-200/60 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          <UiIcon name="check" :size="16" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-semibold">File hợp lệ</p>
            <p class="text-xs opacity-90">
              {{ s?.total_rows }} dòng đối chiếu xong, chưa có gì được ghi. Kiểm tra bảng bên dưới
              rồi bấm xác nhận.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-foreground">{{ s?.total_rows ?? 0 }}</div>
            <div class="text-muted-foreground">Dòng trong file</div>
          </div>
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-emerald-600 dark:text-emerald-400">{{ s?.assign ?? 0 }}</div>
            <div class="text-muted-foreground">Gắn mới</div>
          </div>
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-amber-600 dark:text-amber-400">{{ s?.replace ?? 0 }}</div>
            <div class="text-muted-foreground">Thay link cũ</div>
          </div>
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-foreground">{{ s?.unchanged ?? 0 }}</div>
            <div class="text-muted-foreground">Không đổi</div>
          </div>
          <div class="rounded-md bg-muted p-2">
            <div class="text-base font-semibold text-rose-600 dark:text-rose-400">{{ s?.errors ?? 0 }}</div>
            <div class="text-muted-foreground">Dòng lỗi</div>
          </div>
        </div>

        <div class="max-h-72 overflow-auto rounded-md border border-border">
          <table class="min-w-full divide-y divide-border text-xs">
            <!-- Nền phải nằm trên chính ô <th>, không phải trên <thead>: bảng
                 dùng border-collapse nên nền của nhóm hàng không được vẽ, và
                 dòng dữ liệu cuộn XUYÊN QUA header dính-trên. z-10 giữ header
                 luôn nằm trên nội dung. -->
            <thead class="sticky top-0 z-10 [&_th]:bg-card">
              <tr>
                <th class="table-th">Dòng</th>
                <th class="table-th">Batch</th>
                <th class="table-th">Chất liệu</th>
                <th class="table-th">SL item</th>
                <th class="table-th">Link hiện tại</th>
                <th class="table-th">Link mới</th>
                <th class="table-th">Kết quả</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="r in rows"
                :key="r.row"
                :class="r.severity === 'ERROR' ? 'bg-rose-50/50 dark:bg-rose-500/5' : ''"
              >
                <td class="table-td">{{ r.row }}</td>
                <td class="table-td font-medium text-foreground">
                  {{ r.batch_code || '—' }}
                  <div class="text-[10px] font-normal text-muted-foreground">ID {{ r.batch_id || '—' }}</div>
                </td>
                <td class="table-td text-muted-foreground">{{ r.material || '—' }}</td>
                <td class="table-td">{{ r.item_count || '—' }}</td>
                <td class="table-td">
                  <div class="space-y-0.5">
                    <div>
                      <span class="text-muted-foreground">In:</span>
                      <a
                        v-if="r.current_print_url"
                        :href="r.current_print_url"
                        target="_blank"
                        rel="noopener"
                        :title="r.current_print_url"
                        class="ml-1 text-primary hover:underline"
                      >{{ shortUrl(r.current_print_url) }}</a>
                      <span v-else class="ml-1 text-muted-foreground">—</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Cắt:</span>
                      <a
                        v-if="r.current_cut_url"
                        :href="r.current_cut_url"
                        target="_blank"
                        rel="noopener"
                        :title="r.current_cut_url"
                        class="ml-1 text-primary hover:underline"
                      >{{ shortUrl(r.current_cut_url) }}</a>
                      <span v-else class="ml-1 text-muted-foreground">—</span>
                    </div>
                  </div>
                </td>
                <td class="table-td">
                  <div class="space-y-0.5">
                    <div>
                      <span class="text-muted-foreground">In:</span>
                      <a
                        v-if="r.new_print_url"
                        :href="r.new_print_url"
                        target="_blank"
                        rel="noopener"
                        :title="r.new_print_url"
                        class="ml-1 text-primary hover:underline"
                      >{{ shortUrl(r.new_print_url) }}</a>
                      <span v-else class="ml-1 text-muted-foreground">—</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Cắt:</span>
                      <a
                        v-if="r.new_cut_url"
                        :href="r.new_cut_url"
                        target="_blank"
                        rel="noopener"
                        :title="r.new_cut_url"
                        class="ml-1 text-primary hover:underline"
                      >{{ shortUrl(r.new_cut_url) }}</a>
                      <span v-else class="ml-1 text-muted-foreground">—</span>
                    </div>
                  </div>
                </td>
                <td class="table-td">
                  <span
                    v-if="r.severity === 'ERROR'"
                    class="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                  >{{ issueLabel(r) }}</span>
                  <span
                    v-else-if="r.action === 'REPLACE'"
                    class="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                  >Thay link</span>
                  <span
                    v-else-if="r.action === 'UNCHANGED'"
                    class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >Không đổi</span>
                  <span
                    v-else
                    class="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  >Gắn mới</span>
                  <div v-if="r.reason" class="mt-0.5 text-[10px] text-muted-foreground">{{ r.reason }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Thay bộ file hiện có: phải tick cho phép + nhập lý do -->
        <div
          v-if="hasReplace"
          class="overflow-hidden rounded-md border border-amber-200/60 dark:border-amber-500/25"
        >
          <label class="flex cursor-pointer items-start gap-2 bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            <input v-model="includeReplace" type="checkbox" class="mt-0.5" />
            <span class="text-xs text-amber-800 dark:text-amber-300">
              <span class="font-semibold">
                Cho phép THAY bộ file của {{ replaceRows.length }} batch đã có link.
              </span>
              File in/cắt hiện tại của các batch này sẽ bị thay bằng link trong Excel. Không tick thì
              cả lần nhập không chạy được (hệ thống không nhập một nửa file).
            </span>
          </label>
          <div v-if="includeReplace" class="border-t border-amber-200/60 px-3 py-2 dark:border-amber-500/25">
            <label class="label">Lý do thay thế <span class="text-rose-600">*</span></label>
            <textarea
              v-model="replaceReason"
              class="input"
              rows="2"
              placeholder="VD: designer nộp nhầm file khổ cũ, đã dựng lại bộ mới"
            />
            <p v-if="reasonMissing" class="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
              Bắt buộc nhập lý do khi thay bộ file sản xuất.
            </p>
          </div>
        </div>

        <div
          v-if="commitError"
          class="rounded-md border border-rose-200/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <p class="font-semibold">Toàn bộ lần nhập đã bị huỷ — chưa có gì được ghi</p>
          <p class="mt-1 text-xs opacity-90">{{ commitError }}</p>
          <button class="btn-secondary mt-2" :disabled="previewing" @click="runPreview">
            <UiSpinner v-if="previewing" :size="14" />
            Đối chiếu lại
          </button>
        </div>
      </div>

      <!-- Bước 3: kết quả -->
      <div v-if="result" class="space-y-3">
        <div
          class="flex items-start gap-2 rounded-md border border-emerald-200/60 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          <UiIcon name="check" :size="16" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-semibold">
              Đã cập nhật {{ result.updated }} batch
              <template v-if="result.unchanged"> · {{ result.unchanged }} batch không đổi</template>
            </p>
            <p class="text-xs opacity-90">
              Batch có đủ link in + cắt là sẵn sàng vào sản xuất. Trạng thái batch không tự đổi —
              trạm sản xuất vẫn bấm "Đã in"/"Đã cắt" như thường.
            </p>
          </div>
        </div>
        <div v-if="(result.updated_batch_codes ?? []).length" class="space-y-1">
          <p class="text-xs font-medium text-muted-foreground">Batch đã cập nhật:</p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="code in result.updated_batch_codes ?? []"
              :key="code"
              class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            >{{ code }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="open = false">{{ result ? 'Đóng' : 'Huỷ' }}</button>
      <button
        v-if="preview && !result"
        class="btn-primary"
        :disabled="commitBlocked"
        :title="commitBlocked && hasReplace && !includeReplace
          ? 'File có dòng thay link — tick cho phép thay và nhập lý do trước'
          : ''"
        @click="commit"
      >
        <UiSpinner v-if="committing" :size="16" />
        Cập nhật {{ commitCount }} batch
      </button>
    </template>
  </UiModal>
</template>
