<script setup lang="ts">
// Theme-aware date picker that replaces <input type="date">, whose popup is
// drawn by the browser and cannot be styled (it also ignores our dark theme and
// renders its own English/OS-locale chrome). Same approach as UiSelect: the panel
// is teleported to <body> with fixed positioning so a card, a modal or a table's
// overflow-x-auto can never clip it.
//
// Drop-in for `<input type="date" v-model="x" class="input">` — the model stays
// an ISO `yyyy-mm-dd` string (what the API filters send); only the display is
// Vietnamese dd/mm/yyyy.
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    placeholder?: string
    disabled?: boolean
    id?: string
    ariaLabel?: string
    /** Selectable range, ISO `yyyy-mm-dd`. Days outside it are dimmed and inert. */
    min?: string | null
    max?: string | null
    clearable?: boolean
    /**
     * Cho chọn thêm giờ:phút (anh Kiên 21/11, lọc đơn/batch theo giờ). Model khi có
     * giờ là `yyyy-mm-ddTHH:MM` (giờ máy), chưa chọn giờ vẫn là `yyyy-mm-dd`.
     */
    withTime?: boolean
  }>(),
  { placeholder: 'dd/mm/yyyy', disabled: false, clearable: true, withTime: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

// ---- Date helpers ----------------------------------------------------------
// Everything stays in local time: `new Date('2026-07-24')` parses as UTC and can
// land on the previous day for us (UTC+7), so ISO strings are split by hand.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/
const pad = (n: number) => String(n).padStart(2, '0')

function parseISO(s?: string | null): Date | null {
  const m = s?.match(ISO_RE)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toVN = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const addMonths = (d: Date, n: number) => {
  // Clamp the day so 31/01 + 1 month is 28/02, not 03/03.
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last))
}

const today = new Date()
const selected = computed(() => parseISO(props.modelValue))
const minDate = computed(() => parseISO(props.min))
const maxDate = computed(() => parseISO(props.max))

function outOfRange(d: Date): boolean {
  if (minDate.value && d < minDate.value) return true
  if (maxDate.value && d > maxDate.value) return true
  return false
}

const TIME_RE = /T(\d{2}:\d{2})/
const timePart = computed(() => (props.withTime ? (props.modelValue?.match(TIME_RE)?.[1] ?? '') : ''))
// Có giờ thì rút năm còn 2 số (21/11/26 08:30) để ô hẹp vẫn hiện đủ, không bị cắt "…".
const displayText = computed(() => {
  const d = selected.value
  if (!d) return ''
  if (!timePart.value) return toVN(d)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${timePart.value}`
})

// ---- Panel state -----------------------------------------------------------
const open = ref(false)
const view = ref<'day' | 'month' | 'year'>('day')
// The keyboard/highlight cursor. It also decides which month the grid shows.
const cursor = ref(selected.value ?? today)

watch(
  () => props.modelValue,
  () => {
    if (!open.value) cursor.value = selected.value ?? today
  },
)

const MONTHS = ['Th 1', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'Th 8', 'Th 9', 'Th 10', 'Th 11', 'Th 12']
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const headerLabel = computed(() => {
  if (view.value === 'day') return `Tháng ${cursor.value.getMonth() + 1}, ${cursor.value.getFullYear()}`
  if (view.value === 'month') return String(cursor.value.getFullYear())
  const start = decadeStart.value
  return `${start} – ${start + 11}`
})

// Always 42 cells (6 weeks) so the panel never changes height between months.
const gridDays = computed(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // Monday-first
  const start = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})

const decadeStart = computed(() => Math.floor(cursor.value.getFullYear() / 12) * 12)
const gridYears = computed(() => Array.from({ length: 12 }, (_, i) => decadeStart.value + i))

// ---- Positioning (fixed, escapes overflow/modal clipping) ------------------
const PANEL_W = 288
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function reposition() {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const height = 340
  const spaceBelow = window.innerHeight - r.bottom
  const up = spaceBelow < height && r.top > spaceBelow
  // Keep the panel on screen when the field sits near the right edge.
  const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))
  panelStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    width: `${PANEL_W}px`,
    ...(up
      ? { bottom: `${Math.round(window.innerHeight - r.top + 4)}px` }
      : { top: `${Math.round(r.bottom + 4)}px` }),
  }
}

// ---- Open / close ----------------------------------------------------------
function openPanel() {
  if (props.disabled || open.value) return
  open.value = true
  view.value = 'day'
  cursor.value = selected.value ?? today
  nextTick(() => {
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDocMouseDown, true)
  })
}

function detach() {
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
  document.removeEventListener('mousedown', onDocMouseDown, true)
}

function closePanel(refocus = true) {
  if (!open.value) return
  open.value = false
  detach()
  if (refocus) triggerRef.value?.focus()
}

function toggle() {
  open.value ? closePanel() : openPanel()
}

function onDocMouseDown(e: MouseEvent) {
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return
  closePanel(false)
}

// ---- Selection -------------------------------------------------------------
function pick(d: Date) {
  if (outOfRange(d)) return
  const iso = toISO(d) + (timePart.value ? `T${timePart.value}` : '')
  emit('update:modelValue', iso)
  emit('change', iso)
  // Có ô giờ thì để panel mở cho chọn tiếp giờ; bấm "Xong" hoặc ra ngoài là đóng.
  if (!props.withTime) closePanel()
}

// Bảng chọn giờ tự vẽ (Nghĩa 21/11: ô time của trình duyệt xấu). Giờ 00–23, phút
// bước 5 + nút nhanh Đầu ngày / Cuối ngày (23:59) / Bây giờ. Chưa chọn ngày thì lấy
// hôm nay; bỏ giờ thì về lọc cả ngày.
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))
const curHour = computed(() => timePart.value.slice(0, 2))
const curMinute = computed(() => timePart.value.slice(3, 5))

function setTime(t: string) {
  const base = toISO(selected.value ?? today)
  const v = /^\d{2}:\d{2}$/.test(t) ? `${base}T${t}` : base
  emit('update:modelValue', v)
  emit('change', v)
}
const pickHour = (h: string) => setTime(`${h}:${curMinute.value || '00'}`)
const pickMinute = (m: string) => setTime(`${curHour.value || '00'}:${m}`)
function nowTime() {
  const n = new Date()
  setTime(`${pad(n.getHours())}:${pad(n.getMinutes())}`)
}

function clear() {
  emit('update:modelValue', '')
  emit('change', '')
  closePanel()
}

function goToday() {
  cursor.value = today
  if (!outOfRange(today)) pick(today)
}

function step(n: number) {
  if (view.value === 'day') cursor.value = addMonths(cursor.value, n)
  else if (view.value === 'month') cursor.value = addMonths(cursor.value, n * 12)
  else cursor.value = addMonths(cursor.value, n * 144)
}

function zoomOut() {
  view.value = view.value === 'day' ? 'month' : 'year'
}

function pickMonth(m: number) {
  cursor.value = new Date(cursor.value.getFullYear(), m, 1)
  view.value = 'day'
}

function pickYear(y: number) {
  cursor.value = new Date(y, cursor.value.getMonth(), 1)
  view.value = 'month'
}

// ---- Keyboard --------------------------------------------------------------
function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (!open.value) {
    if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      openPanel()
    }
    return
  }
  const move = (days: number) => {
    e.preventDefault()
    cursor.value = addDays(cursor.value, days)
    view.value = 'day'
  }
  switch (e.key) {
    case 'ArrowLeft': return move(-1)
    case 'ArrowRight': return move(1)
    case 'ArrowUp': return move(-7)
    case 'ArrowDown': return move(7)
    case 'PageUp':
      e.preventDefault()
      cursor.value = addMonths(cursor.value, e.shiftKey ? -12 : -1)
      return
    case 'PageDown':
      e.preventDefault()
      cursor.value = addMonths(cursor.value, e.shiftKey ? 12 : 1)
      return
    case 'Home':
      return move(-((cursor.value.getDay() + 6) % 7))
    case 'End':
      return move(6 - ((cursor.value.getDay() + 6) % 7))
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (view.value === 'day') pick(cursor.value)
      else if (view.value === 'month') pickMonth(cursor.value.getMonth())
      else pickYear(cursor.value.getFullYear())
      return
    case 'Escape':
      e.preventDefault()
      return closePanel()
    case 'Tab':
      return closePanel(false)
  }
}

onBeforeUnmount(detach)
</script>

<template>
  <div class="relative">
    <button
      :id="id"
      ref="triggerRef"
      type="button"
      class="input flex items-center gap-2 text-left"
      :class="{ 'border-ring ring-2 ring-ring/30': open }"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span
        class="truncate tabular-nums"
        :class="[
          displayText ? 'text-foreground' : 'text-muted-foreground',
          // chừa chỗ cho nút xoá phủ lên, để ngày dài không chui xuống dưới nó
          clearable && displayText && !disabled ? 'mr-6' : '',
          // có giờ: chữ nhỏ + sát lại để 21/11/26 08:30 vừa ô hẹp (5 cột lọc)
          timePart ? 'text-sm tracking-tight' : '',
        ]"
      >
        {{ displayText || placeholder }}
      </span>
      <UiIcon name="calendar" :size="16" class="ml-auto shrink-0 text-muted-foreground" />
    </button>

    <!-- Nút xoá nằm ngoài trigger (button lồng button là HTML không hợp lệ) và
         phủ lên khoảng trống ngay trước icon lịch. Bàn phím dùng "Xoá" trong panel. -->
    <button
      v-if="clearable && displayText && !disabled"
      type="button"
      tabindex="-1"
      aria-label="Xoá ngày"
      class="absolute right-9 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      @click="clear"
    >
      <UiIcon name="close" :size="13" />
    </button>

    <Teleport to="body">
      <Transition name="uidate">
        <div
          v-if="open"
          ref="panelRef"
          role="dialog"
          aria-label="Chọn ngày"
          class="z-[60] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-soft"
          :style="panelStyle"
        >
          <!-- Header: tháng/năm bấm được để thu nhỏ về lưới tháng rồi lưới năm -->
          <div class="mb-2 flex items-center gap-1">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              :aria-label="view === 'day' ? 'Tháng trước' : 'Trước'"
              @click="step(-1)"
            >
              <UiIcon name="chevron-left" :size="16" />
            </button>
            <button
              type="button"
              class="flex-1 rounded-md px-2 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              :disabled="view === 'year'"
              @click="zoomOut"
            >
              {{ headerLabel }}
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              :aria-label="view === 'day' ? 'Tháng sau' : 'Sau'"
              @click="step(1)"
            >
              <UiIcon name="chevron-right" :size="16" />
            </button>
          </div>

          <!-- Lưới ngày -->
          <template v-if="view === 'day'">
            <div class="grid grid-cols-7 gap-0.5">
              <div
                v-for="w in WEEKDAYS"
                :key="w"
                class="grid h-7 place-items-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {{ w }}
              </div>
            </div>
            <div class="grid grid-cols-7 gap-0.5">
              <button
                v-for="d in gridDays"
                :key="d.getTime()"
                type="button"
                class="grid h-8 place-items-center rounded-md text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                :class="[
                  selected && sameDay(d, selected)
                    ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary'
                    : sameDay(d, today)
                      ? 'font-semibold text-primary ring-1 ring-inset ring-primary/40 hover:bg-muted'
                      : d.getMonth() === cursor.getMonth()
                        ? 'text-foreground hover:bg-muted'
                        : 'text-muted-foreground/50 hover:bg-muted',
                  !selected && sameDay(d, cursor) ? 'ring-1 ring-inset ring-ring/50' : '',
                ]"
                :disabled="outOfRange(d)"
                :aria-current="sameDay(d, today) ? 'date' : undefined"
                @click="pick(d)"
              >
                {{ d.getDate() }}
              </button>
            </div>
          </template>

          <!-- Lưới tháng -->
          <div v-else-if="view === 'month'" class="grid grid-cols-3 gap-1">
            <button
              v-for="(m, i) in MONTHS"
              :key="m"
              type="button"
              class="rounded-md py-2.5 text-sm transition-colors"
              :class="i === cursor.getMonth()
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-foreground hover:bg-muted'"
              @click="pickMonth(i)"
            >
              {{ m }}
            </button>
          </div>

          <!-- Lưới năm -->
          <div v-else class="grid grid-cols-3 gap-1">
            <button
              v-for="y in gridYears"
              :key="y"
              type="button"
              class="rounded-md py-2.5 text-sm tabular-nums transition-colors"
              :class="y === cursor.getFullYear()
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-foreground hover:bg-muted'"
              @click="pickYear(y)"
            >
              {{ y }}
            </button>
          </div>

          <div v-if="withTime && view === 'day'" class="mt-2 border-t border-border pt-2" role="group" aria-label="Chọn giờ">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">Giờ</span>
              <span class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
                {{ timePart || 'Cả ngày' }}
              </span>
            </div>
            <div class="grid grid-cols-6 gap-1">
              <button
                v-for="h in HOURS"
                :key="h"
                type="button"
                class="h-7 rounded-md text-xs tabular-nums transition-colors"
                :class="h === curHour ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground hover:bg-muted'"
                :aria-pressed="h === curHour"
                @click="pickHour(h)"
              >
                {{ h }}
              </button>
            </div>
            <div class="mt-1.5 grid grid-cols-6 gap-1 border-t border-dashed border-border pt-1.5">
              <button
                v-for="m in MINUTES"
                :key="m"
                type="button"
                class="h-7 rounded-md text-xs tabular-nums transition-colors"
                :class="m === curMinute ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
                :aria-pressed="m === curMinute"
                @click="pickMinute(m)"
              >
                :{{ m }}
              </button>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1">
              <button type="button" class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted" @click="setTime('00:00')">Đầu ngày</button>
              <button type="button" class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted" @click="setTime('23:59')">Cuối ngày</button>
              <button type="button" class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted" @click="nowTime">Bây giờ</button>
              <button v-if="timePart" type="button" class="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" @click="setTime('')">Bỏ giờ</button>
              <button
                type="button"
                class="ml-auto rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                @click="closePanel()"
              >
                Xong
              </button>
            </div>
          </div>
          <div class="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              class="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="clear"
            >
              Xoá
            </button>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
              @click="goToday"
            >
              Hôm nay
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.uidate-enter-active,
.uidate-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.uidate-enter-from,
.uidate-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
