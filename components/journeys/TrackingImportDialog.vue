<script setup lang="ts">
// Gắn mã vận đơn hàng loạt từ file Excel/CSV của hãng vận chuyển.
//
// Luồng 3 bước, không bước nào ghi dữ liệu cho tới khi CS bấm xác nhận:
//   1. Chọn file (2 cột: OrderID + Mã vận đơn) — có nút tải file mẫu.
//   2. "Đối chiếu": backend so từng dòng với hệ thống và trả preview —
//      dòng khớp / dòng lỗi / đơn trong khoảng ngày xuất xưởng mà file bỏ sót.
//      Lệch số lượng giữa file và hệ thống hiện thành alert rõ ràng ở đây.
//   3. "Gắn N mã": chỉ ghi các dòng đã duyệt; đơn ĐÃ có mã khác chỉ bị ghi đè
//      khi CS tick ô đồng ý riêng.
import { trackingApi } from '~/services/api'
import type { TrackingImportPreview, TrackingImportCommitResult } from '~/services/api'
import { errorMessage } from '~/utils/api-error'
import { formatDate, formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{
  modelValue: boolean
  /** Khoảng ngày xuất xưởng đang lọc trên trang (ISO yyyy-mm-dd), để so thiếu/đủ. */
  dateFrom?: string
  dateTo?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'done'): void }>()

const toast = useToastStore()
const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const file = ref<File | null>(null)
const dragging = ref(false)
const previewing = ref(false)
const previewError = ref<string | null>(null)
const preview = ref<TrackingImportPreview | null>(null)
const includeOverwrite = ref(false)
const committing = ref(false)
const result = ref<TrackingImportCommitResult | null>(null)

// Mở lại lần sau phải sạch, không dính preview của file trước.
watch(open, (v) => {
  if (!v) reset()
})
function reset() {
  file.value = null
  preview.value = null
  previewError.value = null
  includeOverwrite.value = false
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
  includeOverwrite.value = false
  result.value = null
}
function onFile(e: Event) {
  setFile((e.target as HTMLInputElement).files?.[0])
}
function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files?.[0])
}

const downloadingTemplate = ref(false)
async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    await trackingApi.downloadImportTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

// Ngày trên trang là yyyy-mm-dd theo giờ máy CS; đổi sang mốc thời gian thật
// (RFC3339) để 00:00 là 00:00 giờ Việt Nam chứ không phải 07:00. Cận trên gửi
// ĐẦU NGÀY KẾ TIẾP — backend lọc nửa mở (<) nên trọn ngày cuối vẫn được tính.
function dayStartISO(d?: string): string | undefined {
  if (!d) return undefined
  return new Date(d + 'T00:00:00').toISOString()
}
function nextDayStartISO(d?: string): string | undefined {
  if (!d) return undefined
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString()
}

const hasRange = computed(() => !!(props.dateFrom || props.dateTo))
const rangeLabel = computed(() => {
  if (!hasRange.value) return ''
  const from = props.dateFrom ? formatDate(props.dateFrom) : '…'
  const to = props.dateTo ? formatDate(props.dateTo) : '…'
  return `${from} – ${to}`
})

async function runPreview() {
  if (!file.value) {
    toast.error('Chưa chọn file Excel/CSV')
    return
  }
  previewing.value = true
  previewError.value = null
  preview.value = null
  result.value = null
  try {
    const { data } = await trackingApi.previewImport(file.value, {
      handed_over_from: dayStartISO(props.dateFrom),
      handed_over_to: nextDayStartISO(props.dateTo),
    })
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

const s = computed(() => preview.value?.summary)
const assigns = computed(() => preview.value?.matches.filter((m) => m.action === 'ASSIGN') ?? [])
const overwrites = computed(() => preview.value?.matches.filter((m) => m.action === 'OVERWRITE') ?? [])
const commitCount = computed(() => assigns.value.length + (includeOverwrite.value ? overwrites.value.length : 0))

// So khớp hai chiều cho alert tổng: file thừa (dòng lỗi) / file thiếu (đơn trong
// khoảng ngày chưa được phủ). Chỉ "hoàn hảo" khi không lệch chiều nào.
const scopeMissing = computed(() => (s.value && s.value.scope_missing > 0 ? s.value.scope_missing : 0))
const perfect = computed(
  () => !!s.value && s.value.issues === 0 && scopeMissing.value === 0 && commitCount.value > 0,
)

async function commit() {
  if (!preview.value || committing.value || commitCount.value === 0) return
  committing.value = true
  try {
    const assignments = [
      ...assigns.value,
      ...(includeOverwrite.value ? overwrites.value : []),
    ].map((m) => ({ order_id: m.order_id, tracking_number: m.tracking_number }))
    const { data } = await trackingApi.commitImport(assignments)
    result.value = data
    if (data.failed?.length) {
      toast.info(`Đã gắn ${data.updated} mã — ${data.failed.length} đơn lỗi, xem chi tiết bên dưới`)
    } else {
      toast.success(`Đã gắn ${data.updated} mã vận đơn — hệ thống đang lấy hành trình`)
    }
    emit('done')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    committing.value = false
  }
}

const ISSUE_LABEL: Record<string, string> = {
  EMPTY_ORDER: 'Thiếu mã đơn',
  EMPTY_TRACKING: 'Thiếu mã vận đơn',
  NOT_FOUND: 'Không có trong hệ thống',
  AMBIGUOUS: 'Trùng nhiều đơn',
  DUPLICATE: 'Dòng lặp lại',
  CONFLICT: 'Nhiều mã cho 1 đơn',
  SHARED_TRACKING: '1 mã dán nhiều đơn',
  TAKEN_TRACKING: 'Mã đã gắn đơn khác',
}
</script>

<template>
  <UiModal v-model="open" title="Gắn mã vận đơn từ file Excel" wide>
    <div class="space-y-4">
      <!-- Bước 1: chọn file -->
      <template v-if="!result">
        <p class="text-xs text-muted-foreground">
          File cần 2 cột:
          <span class="font-medium text-foreground">OrderID</span> (mã đơn shop hoặc mã nội bộ) và
          <span class="font-medium text-foreground">Mã vận đơn</span>. Hệ thống đối chiếu từng dòng
          và <span class="font-medium text-foreground">chưa ghi gì</span> cho tới khi bạn xác nhận.
        </p>

        <div
          v-if="hasRange"
          class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          <UiIcon name="calendar" :size="14" class="shrink-0" />
          <span>
            Đang so với đơn xuất xưởng
            <span class="font-medium text-foreground">{{ rangeLabel }}</span>
            — preview sẽ báo nếu file thiếu đơn nào trong khoảng này.
          </span>
        </div>
        <div
          v-else
          class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          <UiIcon name="alert" :size="14" class="shrink-0" />
          <span>
            Chưa lọc ngày xuất xưởng trên trang — hệ thống vẫn gắn mã bình thường nhưng
            <span class="font-medium text-foreground">không so được file thiếu/đủ đơn</span>. Muốn
            so, đóng cửa sổ và chọn khoảng ngày trước.
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
            <span class="text-xs text-muted-foreground">File từ hãng vận chuyển · CSV / XLSX</span>
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
            Tải file mẫu (.xlsx)
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

      <!-- Bước 2: preview đối chiếu -->
      <div v-if="preview && !result" class="space-y-3">
        <!-- Alert tổng: khớp hoàn toàn / lệch hai chiều -->
        <div
          v-if="perfect"
          class="flex items-start gap-2 rounded-md border border-emerald-200/60 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          <UiIcon name="check" :size="16" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-semibold">Khớp hoàn toàn</p>
            <p class="text-xs opacity-90">
              Tất cả {{ s?.total_rows }} dòng trong file đều khớp đơn trong hệ thống<template v-if="hasRange">
                và không đơn xuất xưởng nào trong khoảng {{ rangeLabel }} bị bỏ sót</template>.
              Sẵn sàng gắn {{ commitCount }} mã.
            </p>
          </div>
        </div>
        <template v-else>
          <div
            v-if="(s?.issues ?? 0) > 0"
            class="flex items-start gap-2 rounded-md border border-rose-200/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <UiIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">File có {{ s?.issues }} dòng không khớp được với hệ thống</p>
              <p class="text-xs opacity-90">
                Các dòng này sẽ KHÔNG được gắn — xem bảng "Dòng lỗi" bên dưới, sửa lại file hoặc xử lý
                tay từng đơn. Các dòng hợp lệ còn lại vẫn gắn bình thường.
              </p>
            </div>
          </div>
          <div
            v-if="scopeMissing > 0"
            class="flex items-start gap-2 rounded-md border border-amber-200/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
          >
            <UiIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">
                File thiếu {{ scopeMissing }} / {{ s?.scope_total }} đơn xuất xưởng {{ rangeLabel }}
              </p>
              <p class="text-xs opacity-90">
                Trong khoảng ngày đang lọc còn {{ scopeMissing }} đơn chưa có mã vận đơn mà file không
                nhắc tới — xem danh sách bên dưới để hỏi lại hãng vận chuyển.
              </p>
            </div>
          </div>
        </template>

        <!-- Con số tổng quan -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" :class="s && s.scope_total >= 0 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'">
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">{{ s?.total_rows }}</p>
            <p class="text-[11px] text-muted-foreground">Dòng trong file</p>
          </div>
          <div class="rounded-md bg-emerald-50 p-2 dark:bg-emerald-500/10">
            <p class="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{{ s?.assign }}</p>
            <p class="text-[11px] text-muted-foreground">Gắn mới</p>
          </div>
          <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ s?.overwrite }}</p>
            <p class="text-[11px] text-muted-foreground">Ghi đè mã cũ</p>
          </div>
          <div class="rounded-md bg-sky-50 p-2 dark:bg-sky-500/10">
            <p class="text-lg font-semibold text-sky-700 dark:text-sky-300">{{ s?.unchanged }}</p>
            <p class="text-[11px] text-muted-foreground">Trùng mã, bỏ qua</p>
          </div>
          <div class="rounded-md bg-rose-50 p-2 dark:bg-rose-500/10">
            <p class="text-lg font-semibold text-rose-600 dark:text-rose-300">{{ s?.issues }}</p>
            <p class="text-[11px] text-muted-foreground">Dòng lỗi</p>
          </div>
          <div v-if="s && s.scope_total >= 0" class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ scopeMissing }}</p>
            <p class="text-[11px] text-muted-foreground">Thiếu trong file</p>
          </div>
        </div>

        <!-- Dòng lỗi -->
        <div v-if="preview.issues.length" class="rounded-md border border-rose-200/60 dark:border-rose-500/25">
          <p class="border-b border-border bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Dòng lỗi — sẽ không được gắn ({{ preview.issues.length }})
          </p>
          <div class="max-h-44 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr>
                  <th class="table-th">Dòng</th>
                  <th class="table-th">Mã đơn</th>
                  <th class="table-th">Mã vận đơn</th>
                  <th class="table-th">Lý do</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(it, i) in preview.issues" :key="i" class="bg-rose-50/50 dark:bg-rose-500/5">
                  <td class="table-td text-muted-foreground">{{ it.row }}</td>
                  <td class="table-td font-mono text-xs">{{ it.order_key || '—' }}</td>
                  <td class="table-td font-mono text-xs">{{ it.tracking_number || '—' }}</td>
                  <td class="table-td whitespace-normal text-rose-700 dark:text-rose-300">
                    <span class="font-medium">{{ ISSUE_LABEL[it.code] ?? it.code }}</span>
                    <span class="text-xs opacity-80"> — {{ it.reason }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Thiếu trong file -->
        <div v-if="preview.scope_missing.length" class="rounded-md border border-amber-200/60 dark:border-amber-500/25">
          <p class="border-b border-border bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Đơn xuất xưởng {{ rangeLabel }} chưa có trong file ({{ scopeMissing
            }}<template v-if="scopeMissing > preview.scope_missing.length">
              — hiện {{ preview.scope_missing.length }} đơn đầu</template>)
          </p>
          <div class="max-h-44 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr>
                  <th class="table-th">Mã nội bộ</th>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">Người nhận</th>
                  <th class="table-th">Xuất xưởng</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="o in preview.scope_missing" :key="o.id">
                  <td class="table-td font-mono text-xs">{{ o.internal_code }}</td>
                  <td class="table-td font-mono text-xs">{{ o.store_order_id }}</td>
                  <td class="table-td">{{ o.shipping_name || '—' }}</td>
                  <td class="table-td text-xs text-muted-foreground">
                    {{ o.handed_over_at ? formatDateTime(o.handed_over_at) : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Ghi đè: nguy hiểm nên phải tick riêng, mặc định KHÔNG ghi -->
        <div
          v-if="overwrites.length"
          class="rounded-md border border-amber-200/60 dark:border-amber-500/25"
        >
          <label class="flex cursor-pointer items-start gap-2 bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            <input v-model="includeOverwrite" type="checkbox" class="mt-0.5" />
            <span class="text-xs text-amber-800 dark:text-amber-300">
              <span class="font-semibold">Ghi đè {{ overwrites.length }} đơn đã có mã vận đơn khác.</span>
              Kiện cũ sẽ bị bỏ theo dõi, hành trình chuyển sang kiện mới — seller cũng nhìn thấy thay
              đổi này. Không tick thì các đơn dưới đây giữ nguyên mã cũ.
            </span>
          </label>
          <div class="max-h-36 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr>
                  <th class="table-th">Mã đơn</th>
                  <th class="table-th">Mã đang có</th>
                  <th class="table-th">Mã trong file</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="m in overwrites" :key="m.order_id">
                  <td class="table-td">
                    <span class="font-mono text-xs">{{ m.store_order_id }}</span>
                    <span class="ml-1 text-xs text-muted-foreground">{{ m.internal_code }}</span>
                  </td>
                  <td class="table-td font-mono text-xs text-muted-foreground">{{ m.current_tracking }}</td>
                  <td class="table-td font-mono text-xs text-foreground">{{ m.tracking_number }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Danh sách sẽ gắn -->
        <details v-if="assigns.length" class="rounded-md border border-border">
          <summary class="cursor-pointer select-none bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            Danh sách sẽ gắn mới ({{ assigns.length }})
          </summary>
          <div class="max-h-44 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr>
                  <th class="table-th">Dòng</th>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">Mã nội bộ</th>
                  <th class="table-th">Người nhận</th>
                  <th class="table-th">Mã vận đơn</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="m in assigns" :key="m.order_id">
                  <td class="table-td text-muted-foreground">{{ m.row }}</td>
                  <td class="table-td font-mono text-xs">{{ m.store_order_id }}</td>
                  <td class="table-td font-mono text-xs text-muted-foreground">{{ m.internal_code }}</td>
                  <td class="table-td">{{ m.shipping_name || '—' }}</td>
                  <td class="table-td font-mono text-xs">{{ m.tracking_number }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <!-- Bước 3: kết quả -->
      <div v-if="result" class="space-y-3">
        <div
          class="flex items-start gap-2 rounded-md border p-3 text-sm"
          :class="
            result.failed?.length
              ? 'border-amber-200/60 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
              : 'border-emerald-200/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'
          "
        >
          <UiIcon :name="result.failed?.length ? 'alert' : 'check'" :size="16" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-semibold">
              Đã gắn {{ result.updated }} mã vận đơn<template v-if="result.failed?.length">
                — {{ result.failed.length }} đơn lỗi</template>
            </p>
            <p class="text-xs opacity-90">
              Hệ thống đang đăng ký 24hTrack và lấy hành trình cho các đơn vừa gắn.
            </p>
          </div>
        </div>
        <div v-if="result.failed?.length" class="rounded-md border border-border">
          <p class="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            Đơn không gắn được ({{ result.failed.length }})
          </p>
          <div class="max-h-44 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <thead class="sticky top-0 bg-card">
                <tr><th class="table-th">Order ID</th><th class="table-th">Lý do</th></tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="f in result.failed" :key="f.order_id">
                  <td class="table-td font-mono text-xs">#{{ f.order_id }}</td>
                  <td class="table-td whitespace-normal">{{ f.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="open = false">{{ result ? 'Đóng' : 'Huỷ' }}</button>
      <button
        v-if="preview && !result"
        class="btn-primary"
        :disabled="committing || commitCount === 0"
        @click="commit"
      >
        <UiSpinner v-if="committing" :size="16" />
        Gắn {{ commitCount }} mã vận đơn
      </button>
    </template>
  </UiModal>
</template>
