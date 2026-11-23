<script setup lang="ts">
// Gắn mã vận đơn và/hoặc LABEL NGOÀI hàng loạt từ file Excel/CSV.
//
// Cột "Link label" (tuỳ chọn) là link PDF label mua ở hãng ngoài; kho in nó ở
// màn Chờ gửi hàng. Cột Mã vận đơn cũng tuỳ chọn — file chỉ có link cũng được.
// Một cú tick "ghi đè" chung cho cả mã vận đơn lẫn link đã có khác.
//
// Luồng 3 bước, không bước nào ghi dữ liệu cho tới khi CS bấm xác nhận:
//   1. Chọn file (2 cột: OrderID + Mã vận đơn) — có nút tải file mẫu.
//   2. "Đối chiếu": backend so từng dòng với hệ thống và trả preview —
//      dòng khớp / dòng lỗi / đơn trong khoảng ngày xuất xưởng mà file bỏ sót.
//      Lệch số lượng giữa file và hệ thống hiện thành alert rõ ràng ở đây.
//   3. "Gắn N mã": chỉ ghi các dòng đã duyệt; đơn ĐÃ có mã khác chỉ bị ghi đè
//      khi CS tick ô đồng ý riêng.
import { trackingApi, TRACKING_COMMIT_BATCH } from '~/services/api'
import type {
  TrackingImportPreview,
  TrackingImportCommitResult,
  TrackingImportIssue,
} from '~/services/api'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { apiInstantFrom, apiInstantBefore, pickerValueLabel } from '~/utils/dateRange'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{
  modelValue: boolean
  /**
   * Khoảng xuất xưởng đang lọc trên trang (`yyyy-mm-dd` hoặc `yyyy-mm-ddTHH:MM`,
   * giờ máy), để so thiếu/đủ — cùng mốc với danh sách và nút Xuất Excel.
   */
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

// Mốc gửi backend: cùng hàm với danh sách + Xuất Excel của trang (utils/dateRange)
// — giờ máy CS đổi ra RFC3339, cận trên nửa mở (đầu phút/ngày kế tiếp), để
// "file thiếu đơn nào" so đúng tập đơn đang hiện trên bảng.
const hasRange = computed(() => !!(props.dateFrom || props.dateTo))
const rangeLabel = computed(() => {
  if (!hasRange.value) return ''
  const from = props.dateFrom ? pickerValueLabel(props.dateFrom) : '…'
  const to = props.dateTo ? pickerValueLabel(props.dateTo) : '…'
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
      handed_over_from: apiInstantFrom(props.dateFrom ?? ''),
      handed_over_to: apiInstantBefore(props.dateTo ?? ''),
    })
    preview.value = data
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewing.value = false
  }
}

const s = computed(() => preview.value?.summary)
// `?? []` trên CHÍNH mảng, không phải trên kết quả filter: Go trả mảng rỗng
// thành JSON null, mà `null.filter(...)` là lỗi render — cả dialog (kể cả nút
// xác nhận ở footer) biến mất, nhìn như bấm không ăn.
const matchRows = computed(() => preview.value?.matches ?? [])
// Dòng gắn mới: mã vận đơn mới HOẶC link label mới (không đụng gì đang có).
const assigns = computed(() => matchRows.value.filter((m) => m.action === 'ASSIGN' || m.label_action === 'ASSIGN'))
// Dòng sẽ ghi đè thứ đang có (mã vận đơn hoặc link khác) — chỉ ghi khi được tick.
const overwrites = computed(() => matchRows.value.filter((m) => m.action === 'OVERWRITE' || m.label_action === 'OVERWRITE'))
const issueRows = computed(() => preview.value?.issues ?? [])
const scopeMissingRows = computed(() => preview.value?.scope_missing ?? [])
const hasLabels = computed(() => {
  const x = s.value
  return !!x && x.label_assign + x.label_overwrite + x.label_unchanged > 0
})

// Những gì thực sự gửi đi: từng đơn chỉ mang phần được phép ghi. Chưa tick ghi
// đè thì phần ghi đè bị bỏ khỏi dòng (đơn vẫn gắn được phần mới còn lại).
interface Assignment { order_id: number; tracking_number?: string; label_url?: string }
const assignments = computed<Assignment[]>(() => {
  const out: Assignment[] = []
  for (const m of matchRows.value) {
    const a: Assignment = { order_id: m.order_id }
    if (m.tracking_number && (m.action === 'ASSIGN' || (m.action === 'OVERWRITE' && includeOverwrite.value))) {
      a.tracking_number = m.tracking_number
    }
    if (m.label_url && (m.label_action === 'ASSIGN' || (m.label_action === 'OVERWRITE' && includeOverwrite.value))) {
      a.label_url = m.label_url
    }
    if (a.tracking_number || a.label_url) out.push(a)
  }
  return out
})
const commitCount = computed(() => assignments.value.length)
function shortLink(u?: string): string {
  if (!u) return ''
  return u.length > 48 ? `${u.slice(0, 30)}…${u.slice(-16)}` : u
}

// So khớp hai chiều cho alert tổng: file thừa (dòng lỗi) / file thiếu (đơn trong
// khoảng ngày chưa được phủ). Chỉ "hoàn hảo" khi không lệch chiều nào.
const scopeMissing = computed(() => (s.value && s.value.scope_missing > 0 ? s.value.scope_missing : 0))
const skippedBlank = computed(() => s.value?.skipped_blank ?? 0)
const perfect = computed(
  () => !!s.value && s.value.issues === 0 && scopeMissing.value === 0 && commitCount.value > 0,
)

async function commit() {
  if (!preview.value || committing.value || commitCount.value === 0) return
  committing.value = true
  try {
    const list = assignments.value
    // Backend nhận tối đa TRACKING_COMMIT_BATCH đơn mỗi lần — file "Xuất Excel"
    // điền nhiều mã hơn thế thì gửi từng lô. Mỗi lô vốn đã là partial success
    // (đơn lỗi không kéo cả lô), nên gộp kết quả các lô là đúng nghĩa cũ.
    const data: TrackingImportCommitResult = { updated: 0, failed: [] }
    let sent = 0
    try {
      for (let i = 0; i < list.length; i += TRACKING_COMMIT_BATCH) {
        const chunk = list.slice(i, i + TRACKING_COMMIT_BATCH)
        const { data: part } = await trackingApi.commitImport(chunk)
        data.updated += part.updated ?? 0
        data.failed.push(...(part.failed ?? []))
        sent += chunk.length
      }
    } catch (e) {
      // Lỗi ở lô đầu: chưa ghi gì, báo như cũ. Lỗi ở lô sau: các lô trước ĐÃ ghi
      // — vẫn hiện kết quả thật và làm mới bảng, đơn chưa gửi ghi vào danh sách lỗi.
      if (sent === 0) throw e
      const reason = `Chưa gửi được (${errorMessage(e)}) — tải lại file để gắn tiếp`
      for (const a of list.slice(sent)) data.failed.push({ order_id: a.order_id, reason })
    }
    result.value = data
    if (data.failed?.length) {
      toast.info(`Đã cập nhật ${data.updated} đơn — ${data.failed.length} đơn lỗi, xem chi tiết bên dưới`)
    } else {
      toast.success(`Đã cập nhật ${data.updated} đơn`)
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
  EMPTY_TRACKING: 'Thiếu mã vận đơn / link label',
  NOT_FOUND: 'Không có trong hệ thống',
  AMBIGUOUS: 'Trùng nhiều đơn',
  DUPLICATE: 'Dòng lặp lại',
  CONFLICT: 'Nhiều mã cho 1 đơn',
  SHARED_TRACKING: '1 mã dán nhiều đơn',
  TAKEN_TRACKING: 'Mã đã gắn đơn khác',
  EXCEL_NUMBER: 'Excel đổi thành số mũ',
  BAD_LABEL: 'Link label sai',
  SHARED_LABEL: '1 link dán nhiều đơn',
}

// Lý do từ backend chỉ hiện khi nó nói thêm được gì so với nhãn — vài mã lỗi
// (EMPTY_TRACKING) có nhãn trùng y hệt lý do, để cả hai thành "Thiếu mã vận
// đơn — Thiếu mã vận đơn".
function issueDetail(it: TrackingImportIssue): string {
  const label = ISSUE_LABEL[it.code] ?? it.code
  const reason = (it.reason ?? '').trim()
  return reason && reason !== label ? reason : ''
}
</script>

<template>
  <UiModal v-model="open" title="Gắn mã vận đơn / label từ file Excel" wide>
    <div class="space-y-4">
      <!-- Bước 1: chọn file -->
      <template v-if="!result">
        <p class="text-xs text-muted-foreground">
          File cần cột
          <span class="font-medium text-foreground">OrderID</span> (mã đơn shop hoặc mã nội bộ) cùng
          <span class="font-medium text-foreground">Mã vận đơn</span> và/hoặc
          <span class="font-medium text-foreground">Link label</span> (link PDF label mua ở hãng
          ngoài — kho sẽ in từ màn Chờ gửi hàng; nhiều dòng cùng mã đơn dùng chung 1 link được).
          Hệ thống đối chiếu từng dòng
          và <span class="font-medium text-foreground">chưa ghi gì</span> cho tới khi bạn xác nhận.
          Cũng nhận lại chính file <span class="font-medium text-foreground">Xuất Excel</span> của
          trang này: điền cột Mã vận đơn, dòng để trống được bỏ qua.
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
            <span class="text-xs text-muted-foreground">File Excel / CSV · OrderID, Mã vận đơn, Link label</span>
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
              Sẵn sàng gắn {{ commitCount }} đơn.
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
        <!-- File Xuất Excel quay lại: dòng chưa điền mã không phải lỗi, chỉ đếm.
             Đặt SAU cả cặp v-if/v-else ở trên — chen vào giữa là bẻ gãy cặp đó. -->
        <p
          v-if="skippedBlank > 0"
          class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          <UiIcon name="info" :size="14" class="shrink-0" />
          <span>
            File xuất từ trang này: <span class="font-medium text-foreground">{{ skippedBlank }}</span>
            dòng để trống mã vận đơn được bỏ qua, không gắn gì.
          </span>
        </p>

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

        <!-- Label ngoài: đếm riêng, chỉ hiện khi file có cột Link label -->
        <div v-if="hasLabels" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-md bg-emerald-50 p-2 dark:bg-emerald-500/10">
            <p class="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{{ s?.label_assign }}</p>
            <p class="text-[11px] text-muted-foreground">Label gắn mới</p>
          </div>
          <div class="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <p class="text-lg font-semibold text-amber-700 dark:text-amber-300">{{ s?.label_overwrite }}</p>
            <p class="text-[11px] text-muted-foreground">Label ghi đè link cũ</p>
          </div>
          <div class="rounded-md bg-sky-50 p-2 dark:bg-sky-500/10">
            <p class="text-lg font-semibold text-sky-700 dark:text-sky-300">{{ s?.label_unchanged }}</p>
            <p class="text-[11px] text-muted-foreground">Label trùng, bỏ qua</p>
          </div>
          <div class="rounded-md bg-muted p-2">
            <p class="text-lg font-semibold text-foreground">{{ s?.merged_rows }}</p>
            <p class="text-[11px] text-muted-foreground">Dòng gộp (chung 1 đơn)</p>
          </div>
        </div>

        <!-- Dòng lỗi -->
        <div v-if="issueRows.length" class="rounded-md border border-rose-200/60 dark:border-rose-500/25">
          <p class="border-b border-border bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Dòng lỗi — sẽ không được gắn ({{ issueRows.length }})
          </p>
          <div class="max-h-64 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <!-- Nền phải nằm trên chính ô <th>, không phải trên <thead>: bảng
                   dùng border-collapse nên nền của nhóm hàng không được vẽ, và
                   dòng dữ liệu cuộn XUYÊN QUA header dính-trên. z-10 giữ header
                   luôn nằm trên nội dung. -->
              <thead class="sticky top-0 z-10 [&_th]:bg-card">
                <tr>
                  <th class="table-th">Dòng</th>
                  <th class="table-th">Mã đơn</th>
                  <th class="table-th">Mã vận đơn / link label</th>
                  <th class="table-th">Lý do</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(it, i) in issueRows" :key="i" class="bg-rose-50/50 dark:bg-rose-500/5">
                  <td class="table-td text-muted-foreground">{{ it.row }}</td>
                  <td class="table-td font-mono text-xs">{{ it.order_key || '—' }}</td>
                  <td class="table-td font-mono text-xs break-all">{{ it.tracking_number || shortLink(it.label_url) || '—' }}</td>
                  <td class="table-td whitespace-normal">
                    <span
                      class="inline-flex rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                    >{{ ISSUE_LABEL[it.code] ?? it.code }}</span>
                    <span v-if="issueDetail(it)" class="ml-1.5 text-xs text-rose-700/80 dark:text-rose-300/80">
                      {{ issueDetail(it) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Thiếu trong file -->
        <div v-if="scopeMissingRows.length" class="rounded-md border border-amber-200/60 dark:border-amber-500/25">
          <p class="border-b border-border bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Đơn xuất xưởng {{ rangeLabel }} chưa có trong file ({{ scopeMissing
            }}<template v-if="scopeMissing > scopeMissingRows.length">
              — hiện {{ scopeMissingRows.length }} đơn đầu</template>)
          </p>
          <div class="max-h-64 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <!-- Nền phải nằm trên chính ô <th>, không phải trên <thead>: bảng
                   dùng border-collapse nên nền của nhóm hàng không được vẽ, và
                   dòng dữ liệu cuộn XUYÊN QUA header dính-trên. z-10 giữ header
                   luôn nằm trên nội dung. -->
              <thead class="sticky top-0 z-10 [&_th]:bg-card">
                <tr>
                  <th class="table-th">Mã nội bộ</th>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">Người nhận</th>
                  <th class="table-th">Xuất xưởng</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="o in scopeMissingRows" :key="o.id">
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
              <span class="font-semibold">Ghi đè {{ overwrites.length }} đơn đã có mã vận đơn / link label khác.</span>
              Mã vận đơn mới: kiện cũ bị bỏ theo dõi, hành trình chuyển sang kiện mới — seller cũng
              nhìn thấy thay đổi này. Link label mới: kho sẽ in label mới thay label cũ. Không tick
              thì các đơn dưới đây giữ nguyên mã / link cũ.
            </span>
          </label>
          <div class="max-h-36 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <!-- Nền phải nằm trên chính ô <th>, không phải trên <thead>: bảng
                   dùng border-collapse nên nền của nhóm hàng không được vẽ, và
                   dòng dữ liệu cuộn XUYÊN QUA header dính-trên. z-10 giữ header
                   luôn nằm trên nội dung. -->
              <thead class="sticky top-0 z-10 [&_th]:bg-card">
                <tr>
                  <th class="table-th">Mã đơn</th>
                  <th class="table-th">Đang có</th>
                  <th class="table-th">Trong file</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="m in overwrites" :key="m.order_id">
                  <td class="table-td">
                    <span class="font-mono text-xs">{{ m.store_order_id }}</span>
                    <span class="ml-1 text-xs text-muted-foreground">{{ m.internal_code }}</span>
                  </td>
                  <td class="table-td font-mono text-xs text-muted-foreground">
                    <div v-if="m.action === 'OVERWRITE'">Mã: {{ m.current_tracking }}</div>
                    <div v-if="m.label_action === 'OVERWRITE'" class="break-all" :title="m.current_label">Label: {{ shortLink(m.current_label) }}</div>
                  </td>
                  <td class="table-td font-mono text-xs text-foreground">
                    <div v-if="m.action === 'OVERWRITE'">Mã: {{ m.tracking_number }}</div>
                    <div v-if="m.label_action === 'OVERWRITE'" class="break-all" :title="m.label_url">Label: {{ shortLink(m.label_url) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Danh sách sẽ gắn -->
        <details v-if="assigns.length" class="rounded-md border border-border">
          <summary class="cursor-pointer select-none bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            Danh sách sẽ gắn mới ({{ assigns.length }} đơn)
          </summary>
          <div class="max-h-44 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <!-- Nền phải nằm trên chính ô <th>, không phải trên <thead>: bảng
                   dùng border-collapse nên nền của nhóm hàng không được vẽ, và
                   dòng dữ liệu cuộn XUYÊN QUA header dính-trên. z-10 giữ header
                   luôn nằm trên nội dung. -->
              <thead class="sticky top-0 z-10 [&_th]:bg-card">
                <tr>
                  <th class="table-th">Dòng</th>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">Mã nội bộ</th>
                  <th class="table-th">Người nhận</th>
                  <th class="table-th">Mã vận đơn</th>
                  <th class="table-th">Link label</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="m in assigns" :key="m.order_id">
                  <td class="table-td text-muted-foreground">{{ m.row }}</td>
                  <td class="table-td font-mono text-xs">{{ m.store_order_id }}</td>
                  <td class="table-td font-mono text-xs text-muted-foreground">{{ m.internal_code }}</td>
                  <td class="table-td">{{ m.shipping_name || '—' }}</td>
                  <td class="table-td font-mono text-xs">{{ m.action === 'ASSIGN' ? m.tracking_number : '—' }}</td>
                  <td class="table-td font-mono text-xs" :title="m.label_url">{{ m.label_action === 'ASSIGN' ? shortLink(m.label_url) : '—' }}</td>
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
              Đã cập nhật {{ result.updated }} đơn<template v-if="result.failed?.length">
                — {{ result.failed.length }} đơn lỗi</template>
            </p>
            <p class="text-xs opacity-90">
              Đơn mới gắn mã vận đơn được đăng ký 24hTrack để lấy hành trình; đơn mới gắn label thì
              kho in ở màn Chờ gửi hàng.
            </p>
          </div>
        </div>
        <div v-if="result.failed?.length" class="rounded-md border border-border">
          <p class="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground">
            Đơn không gắn được ({{ result.failed.length }})
          </p>
          <div class="max-h-44 overflow-auto">
            <table class="min-w-full divide-y divide-border text-sm">
              <!-- Nền phải nằm trên chính ô <th>, không phải trên <thead>: bảng
                   dùng border-collapse nên nền của nhóm hàng không được vẽ, và
                   dòng dữ liệu cuộn XUYÊN QUA header dính-trên. z-10 giữ header
                   luôn nằm trên nội dung. -->
              <thead class="sticky top-0 z-10 [&_th]:bg-card">
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
        Gắn {{ commitCount }} đơn
      </button>
    </template>
  </UiModal>
</template>
