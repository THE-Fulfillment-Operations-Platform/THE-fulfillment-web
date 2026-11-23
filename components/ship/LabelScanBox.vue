<script setup lang="ts">
import { ordersApi } from '~/services/api'
import type { LabelScanResult } from '~/services/api/orders'
import { openPrintWindow, printExternalLabelsInto, printTHELabelsInto } from '~/utils/theLabels'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

// "Quét in label": quét tem QR nội bộ của đơn (hoặc tem sản phẩm) là in ngay label
// của đơn đó. CHỈ ĐỌC — không đổi trạng thái đơn, không bàn giao, không gọi THE
// tạo label. Dùng sau khi QC + đóng hàng xong, khi cần in lại label mua ngoài.
//
// Trình duyệt chỉ cho window.open khi nó chạy ĐỒNG BỘ trong cú bấm / phím Enter
// của người dùng. Nên cửa sổ in được mở NGAY trong handler Enter (submit), trước
// mọi await; sau đó mới tra mã + tải label rồi đổ vào cửa sổ đó. Không có label
// để in thì đóng cửa sổ lại.

const emit = defineEmits<{ close: [] }>()
const toast = useToastStore()

// Quét trùng một đơn trong khoảng này thì không in lần hai (máy quét hay bắn đúp,
// hoặc thợ quét lại tờ vừa in).
const DUP_MS = 10_000

type Outcome = 'printed' | 'no_label' | 'load_error' | 'error' | 'recent'
interface LogEntry {
  key: number
  code: string
  time: string
  outcome: Outcome
  order_id?: number
  internal_code?: string
  store_order_id?: string
  /** Loại label đã in / định in. */
  kind?: 'ext' | 'the'
  /** Đơn chưa QC xong nhưng vẫn in — ghi chú cho người soát. */
  notQc?: string
  reason?: string
}

const code = ref('')
const input = ref<HTMLInputElement | null>(null)
const log = ref<LogEntry[]>([])
const popupBlocked = ref(false)
const busy = ref(0)
let logKey = 0
/** Đơn vừa in: order_id → thời điểm. Đặt ngay khi tra xong mã (trước khi tải) để hai lần quét sát nhau không in đúp. */
const recentOrders = new Map<number, number>()
/** Mã gõ vào vừa in: bắt quét trùng ĐỒNG BỘ, trước khi mở cửa sổ. */
const recentCodes = new Map<string, { at: number; entry: LogEntry }>()

const lastEntry = computed(() => log.value[0])
const printedCount = computed(() => log.value.filter((e) => e.outcome === 'printed').length)
const problemCount = computed(() => log.value.filter((e) => e.outcome === 'no_label' || e.outcome === 'load_error' || e.outcome === 'error').length)

function focusInput() {
  nextTick(() => input.value?.focus())
}
onMounted(focusInput)

function timeNow() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function push(e: Omit<LogEntry, 'key' | 'time'>): LogEntry {
  const entry: LogEntry = { key: ++logKey, time: timeNow(), ...e }
  log.value.unshift(entry)
  if (log.value.length > 50) log.value.splice(50)
  return entry
}

/** Handler phím Enter của máy quét (và nút "In label"): window.open chạy ở đây, trước mọi await. */
function submit() {
  const value = code.value.trim()
  code.value = ''
  focusInput()
  if (!value) return
  const seen = recentCodes.get(value)
  if (seen && Date.now() - seen.at < DUP_MS) {
    notifyRecent(value, seen.entry)
    return
  }
  start(value, false)
}

/** Nút "In lại": cũng là cú bấm của người dùng nên mở được cửa sổ ngay tại đây. */
function reprint(entry: LogEntry) {
  start(entry.code, true)
}

function start(value: string, force: boolean) {
  let w: Window
  try {
    w = openPrintWindow() // ĐỒNG BỘ — không đặt sau await
  } catch {
    popupBlocked.value = true
    push({ code: value, outcome: 'error', reason: 'trình duyệt chặn cửa sổ in — cho phép popup (xem khung đỏ phía trên) rồi bấm In lại' })
    toast.error('Trình duyệt chặn cửa sổ in — xem hướng dẫn cho phép popup trong hộp quét')
    return
  }
  popupBlocked.value = false
  void run(value, w, force)
}

function notifyRecent(value: string, order: Pick<LogEntry, 'order_id' | 'internal_code' | 'store_order_id' | 'kind'>) {
  push({
    code: value, outcome: 'recent', order_id: order.order_id, internal_code: order.internal_code,
    store_order_id: order.store_order_id, kind: order.kind,
  })
  toast.info(`Đơn ${order.internal_code ?? value} vừa in — không in lần hai`)
}

async function run(value: string, w: Window, force: boolean) {
  busy.value++
  try {
    let res: LabelScanResult
    try {
      res = (await ordersApi.labelScan(value)).data
    } catch (e) {
      w.close()
      push({ code: value, outcome: 'error', reason: errorMessage(e) })
      toast.error(`${value}: ${errorMessage(e)}`)
      return
    }
    const now = Date.now()
    const base = { code: value, order_id: res.order_id, internal_code: res.internal_code, store_order_id: res.store_order_id }

    const last = recentOrders.get(res.order_id)
    if (!force && last !== undefined && now - last < DUP_MS) {
      w.close()
      notifyRecent(value, base)
      return
    }

    const notQc = res.qc_done
      ? undefined
      : `đơn chưa QC xong${res.total_items ? ` (còn ${res.unfinished_items ?? '?'}/${res.total_items} sản phẩm chưa đạt)` : ''}`

    const kind: 'ext' | 'the' | undefined = res.has_external_label ? 'ext' : res.the_tracking ? 'the' : undefined
    if (!kind) {
      w.close()
      push({ ...base, outcome: 'no_label', notQc })
      toast.error(`Đơn ${res.internal_code} chưa có label ngoài`)
      return
    }

    recentOrders.set(res.order_id, now)
    const target = [{ id: res.order_id, code: res.internal_code }]
    let failure: string | undefined
    try {
      const r = kind === 'ext' ? await printExternalLabelsInto(w, target) : await printTHELabelsInto(w, target)
      if (r.failed.length || !r.printed) failure = r.failed[0]?.reason ?? 'Không tải được label'
    } catch (e) {
      failure = errorMessage(e)
    }
    if (failure) {
      recentOrders.delete(res.order_id) // lỗi tải thì cho quét lại ngay
      w.close()
      push({ ...base, outcome: 'load_error', kind, notQc, reason: failure })
      toast.error(`Đơn ${res.internal_code}: không tải được label — ${failure}`)
      return
    }
    const entry = push({ ...base, outcome: 'printed', kind, notQc })
    recentCodes.set(value, { at: now, entry })
    if (notQc) toast.info(`Đã in label đơn ${res.internal_code} — ${notQc}`)
  } finally {
    busy.value--
    focusInput()
  }
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  printed: 'đã in',
  no_label: 'chưa có label',
  load_error: 'lỗi tải label',
  error: 'lỗi',
  recent: 'vừa in — không in lần hai',
}
function lineClass(o: Outcome) {
  if (o === 'printed') return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
  if (o === 'recent') return 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
  return 'bg-red-50 text-red-700 dark:bg-rose-500/10 dark:text-rose-300'
}
</script>

<template>
  <div class="card mb-4 border-primary/40 p-4 ring-1 ring-primary/30" data-testid="label-scan-box">
    <div class="mb-3 flex items-start justify-between gap-3">
      <p class="text-xs text-muted-foreground">
        <b class="text-foreground">Quét in label:</b> quét tem QR nội bộ của đơn (hoặc tem sản phẩm) là in ngay label mua ngoài của đơn đó.
        Không đổi trạng thái đơn, không bàn giao, không gọi THE. Quét trùng một đơn trong 10 giây thì không in lần hai.
      </p>
    </div>

    <!-- Trình duyệt chặn popup: nói rõ cách mở. -->
    <div
      v-if="popupBlocked"
      class="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
      role="alert"
      data-testid="popup-blocked"
    >
      <b>Trình duyệt đang chặn cửa sổ in.</b>
      Bấm biểu tượng "popup bị chặn" bên phải thanh địa chỉ → chọn <b>Luôn cho phép popup từ trang này</b> → Xong, rồi quét lại.
      (Chrome: Cài đặt → Quyền riêng tư → Cài đặt trang web → Cửa sổ bật lên → Cho phép trang này.)
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1">
        <label class="label" for="label-scan">Quét QR trên đơn (mã nội bộ) hoặc tem sản phẩm</label>
        <input
          id="label-scan"
          ref="input"
          v-model="code"
          class="input font-mono text-base"
          placeholder="Quét hoặc nhập mã rồi Enter — label của đơn được in ngay…"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="submit"
        />
      </div>
      <button type="button" class="btn-primary sm:w-44" :disabled="!code.trim()" @click="submit">
        <UiIcon name="print" :size="16" /> In label
      </button>
      <button type="button" class="btn-secondary sm:w-32" @click="emit('close')">
        <UiIcon name="close" :size="16" /> Dừng quét
      </button>
    </div>

    <p v-if="busy" class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <UiSpinner :size="14" /> Đang tra mã và tải label…
    </p>

    <!-- Kết quả lần quét gần nhất, chữ to để đứng xa vẫn đọc được. -->
    <div
      v-if="lastEntry"
      class="mt-3 rounded-lg px-4 py-3 text-lg font-semibold"
      :class="lineClass(lastEntry.outcome)"
      role="status"
      data-testid="last-result"
    >
      <template v-if="lastEntry.outcome === 'printed'">Đã in label {{ lastEntry.kind === 'the' ? 'THE' : 'ngoài' }} — đơn {{ lastEntry.internal_code }}</template>
      <template v-else-if="lastEntry.outcome === 'no_label'">Đơn {{ lastEntry.internal_code }} chưa có label ngoài</template>
      <template v-else-if="lastEntry.outcome === 'recent'">Đơn {{ lastEntry.internal_code }} vừa in — không in lần hai</template>
      <template v-else-if="lastEntry.outcome === 'load_error'">Đơn {{ lastEntry.internal_code }}: không tải được label</template>
      <template v-else>{{ lastEntry.code }}: {{ lastEntry.reason }}</template>
      <span v-if="lastEntry.notQc" class="ml-2 text-sm font-medium">· {{ lastEntry.notQc }}</span>
    </div>

    <div v-if="log.length" class="mt-4 border-t border-border pt-3">
      <p class="mb-2 text-xs font-medium text-muted-foreground">
        Phiên quét này: <span class="font-semibold text-emerald-700 dark:text-emerald-300">{{ printedCount }}</span> lượt đã in
        <template v-if="problemCount > 0">
          · <span class="font-semibold text-red-700 dark:text-rose-300">{{ problemCount }}</span> lượt chưa in được
        </template>
      </p>
      <ul class="max-h-64 space-y-1 overflow-y-auto pr-1" data-testid="label-scan-log">
        <li
          v-for="entry in log"
          :key="entry.key"
          class="flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm"
          :class="lineClass(entry.outcome)"
        >
          <UiIcon :name="entry.outcome === 'printed' ? 'check' : 'alert'" :size="15" class="mt-0.5 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="font-mono text-xs opacity-80" title="Mã đã quét">{{ entry.code }}</span>
            <template v-if="entry.internal_code">
              · đơn <span class="font-mono font-semibold">{{ entry.internal_code }}</span>
              <span v-if="entry.store_order_id"> ({{ entry.store_order_id }})</span>
            </template>
            — {{ OUTCOME_TEXT[entry.outcome] }}<template v-if="entry.outcome === 'printed' && entry.kind"> label {{ entry.kind === 'the' ? 'THE' : 'ngoài' }}</template>
            <template v-if="entry.reason">: {{ entry.reason }}</template>
            <span
              v-if="entry.notQc"
              class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
            >{{ entry.notQc }}</span>
            <span class="ml-1 text-xs opacity-70">{{ entry.time }}</span>
            <button
              class="ml-2 rounded bg-white/70 px-1.5 py-0.5 text-xs font-medium hover:bg-white dark:bg-white/10"
              @click="reprint(entry)"
            >
              In lại
            </button>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
