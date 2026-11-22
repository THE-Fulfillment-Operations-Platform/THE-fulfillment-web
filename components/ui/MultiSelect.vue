<script setup lang="ts" generic="T extends string | number">
// Ô lọc CHỌN NHIỀU (chủ xưởng 22/11: tick "Chờ xử lý" + "Đã có file SX" + "Đã in"
// một lượt thay vì lọc từng cái). Cùng dáng với UiSelect: nút mở giống ô nhập,
// bảng chọn teleport ra <body>, vị trí fixed nên không bị bảng/modal cắt, tự lật
// lên khi dưới hết chỗ; màn quá thấp thì phủ lên ô mà vẫn gọn trong khung nhìn.
//
//   - v-model là MẢNG giá trị; mảng rỗng = "Tất cả" (không lọc). Dòng "Tất cả" ở
//     đầu bảng bỏ mọi lựa chọn.
//   - Nút hiện: rỗng → allLabel; 1 mục → nhãn mục đó; nhiều → "3 đã chọn".
//   - Tick nhiều mục rồi mới lọc một lần: sự kiện `change` bắn khi ĐÓNG bảng (bấm
//     ra ngoài, Esc, Tab, nút Xong) và chỉ khi lựa chọn đã khác lúc mở.
//   - Bàn phím: ↑/↓/Home/End di chuyển, Space/Enter tick, Esc đóng (trả focus về
//     nút), Tab đóng và đi tiếp. searchable: ô tìm nhanh ở đầu bảng (gõ để lọc).
import { ref, computed, nextTick, onBeforeUnmount, watch, useId } from 'vue'

// T: kiểu giá trị (chuỗi id như '12', hay số) — v-model là T[], cùng kiểu với options.
interface SelectOption {
  value: T
  label: string
  disabled?: boolean
  // Chữ phụ bên phải dòng (số đếm…), như UiSelect.
  hint?: string
  // Dòng thứ hai dưới nhãn. Cũng được tìm.
  sublabel?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: T[] | null | undefined
    options: SelectOption[]
    // Chữ trên nút và nhãn dòng đầu khi chưa chọn gì ("Tất cả", "Tất cả seller").
    allLabel?: string
    disabled?: boolean
    id?: string
    ariaLabel?: string
    searchable?: boolean
    searchPlaceholder?: string
  }>(),
  { allLabel: 'Tất cả', disabled: false, searchable: false, searchPlaceholder: 'Gõ để lọc…' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: T[]): void
  (e: 'change', v: T[]): void
}>()

const uid = useId()
const listId = `${uid}-list`
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)
const query = ref('')
// Lựa chọn lúc mở bảng: đóng mà khác thì mới bắn `change` (một lần lọc).
let openedWith = ''

const selected = computed<T[]>(() => props.modelValue ?? [])
const selectedSet = computed(() => new Set(selected.value))
const isSelected = (v: T) => selectedSet.value.has(v)
const count = computed(() => selected.value.length)
const selectedLabels = computed(() =>
  selected.value.map((v) => props.options.find((o) => o.value === v)?.label ?? String(v)),
)
const displayLabel = computed(() => {
  if (count.value === 0) return props.allLabel
  if (count.value === 1) return props.options.find((o) => o.value === selected.value[0])?.label ?? '1 đã chọn'
  return `${count.value} đã chọn`
})
const triggerTitle = computed(() => (count.value > 1 ? selectedLabels.value.join(', ') : undefined))

// Dòng trên bảng: "Tất cả" (khi không gõ tìm) rồi các mục khớp ô tìm.
type Row = { kind: 'all' } | { kind: 'opt'; o: SelectOption }
const rows = computed<Row[]>(() => {
  const q = query.value.trim().toLowerCase()
  const opts =
    props.searchable && q
      ? props.options.filter((o) => [o.label, o.sublabel, o.hint].some((t) => t?.toLowerCase().includes(q)))
      : props.options
  const out: Row[] = q ? [] : [{ kind: 'all' }]
  for (const o of opts) out.push({ kind: 'opt', o })
  return out
})
const rowDisabled = (r: Row | undefined) => !r || (r.kind === 'opt' && !!r.o.disabled)
const rowId = (i: number) => `${uid}-row-${i}`
const activeId = computed(() => (open.value && rows.value[activeIndex.value] ? rowId(activeIndex.value) : undefined))

watch(query, () => {
  activeIndex.value = Math.max(0, rows.value.findIndex((r) => !rowDisabled(r)))
})

// ---- Vị trí (fixed: thoát khỏi overflow của bảng / modal) ------------------
const BUDGET = 340 // chiều cao tối đa của bảng chọn
const EDGE = 8 // chừa mép khung nhìn
const panelStyle = ref<Record<string, string>>({})

function reposition() {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(Math.max(r.width, props.searchable ? 300 : 220), vw - EDGE * 2)
  const left = Math.min(Math.max(EDGE, r.left), vw - width - EDGE)
  const below = vh - r.bottom - EDGE - 4
  const above = r.top - EDGE - 4
  const up = below < Math.min(BUDGET, 240) && above > below
  const room = up ? above : below
  const style: Record<string, string> = { position: 'fixed', left: `${Math.round(left)}px`, width: `${Math.round(width)}px` }
  if (room >= 160) {
    style.maxHeight = `${Math.round(Math.min(BUDGET, room))}px`
    if (up) style.bottom = `${Math.round(vh - r.top + 4)}px`
    else style.top = `${Math.round(r.bottom + 4)}px`
  } else {
    // Màn quá thấp (cửa sổ nhỏ, zoom 200%…): trên lẫn dưới đều chật. Phủ lên ô và
    // gói trong khung nhìn — thà che ô một chút còn hơn tràn ra ngoài không bấm được.
    const maxH = Math.min(BUDGET, vh - EDGE * 2)
    style.maxHeight = `${Math.round(maxH)}px`
    style.top = `${Math.round(Math.min(Math.max(EDGE, r.top), vh - maxH - EDGE))}px`
  }
  panelStyle.value = style
}

// ---- Mở / đóng --------------------------------------------------------------
function openMenu() {
  if (props.disabled || open.value) return
  open.value = true
  query.value = ''
  openedWith = JSON.stringify(selected.value)
  const first = rows.value.findIndex((r) => r.kind === 'opt' && isSelected(r.o.value))
  activeIndex.value = first >= 0 ? first : 0
  nextTick(() => {
    reposition()
    scrollActiveIntoView()
    searchRef.value?.focus()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDocMouseDown, true)
  })
}

function detach() {
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', reposition)
  document.removeEventListener('mousedown', onDocMouseDown, true)
}

function closeMenu(refocus = true) {
  if (!open.value) return
  open.value = false
  detach()
  if (refocus) triggerRef.value?.focus()
  const now = JSON.stringify(selected.value)
  if (now !== openedWith) emit('change', [...selected.value])
}

function toggleMenu() {
  open.value ? closeMenu() : openMenu()
}

function onDocMouseDown(e: MouseEvent) {
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return
  closeMenu(false)
}

// Cuộn bên trong chính danh sách không cần dời bảng; cuộn trang thì có.
function onScroll(e: Event) {
  if (panelRef.value && e.target instanceof Node && panelRef.value.contains(e.target)) return
  reposition()
}

// ---- Chọn -------------------------------------------------------------------
function setValue(next: T[]) {
  emit('update:modelValue', next)
}

function toggleRow(r: Row | undefined) {
  if (!r || rowDisabled(r)) return
  if (r.kind === 'all') {
    if (count.value) setValue([])
    return
  }
  const v = r.o.value
  if (isSelected(v)) {
    setValue(selected.value.filter((x) => x !== v))
  } else {
    // Giữ thứ tự của danh sách (nhãn trên nút, tham số gửi API ổn định); giá trị
    // không còn trong danh sách (seller đã xoá…) rơi khỏi lựa chọn ở lần tick này.
    const next = new Set([...selected.value, v])
    setValue(props.options.filter((o) => next.has(o.value)).map((o) => o.value))
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    panelRef.value?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

function move(delta: number) {
  const list = rows.value
  const n = list.length
  if (!n) return
  let i = activeIndex.value
  for (let step = 0; step < n; step++) {
    i = (i + delta + n) % n
    if (!rowDisabled(list[i])) break
  }
  activeIndex.value = i
  scrollActiveIntoView()
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      openMenu()
    }
    return
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      break
    case 'Home':
      // Trong ô tìm, Home/End là đưa con trỏ về đầu/cuối chữ.
      if (props.searchable && e.target === searchRef.value) return
      e.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      if (props.searchable && e.target === searchRef.value) return
      e.preventDefault()
      activeIndex.value = rows.value.length - 1
      scrollActiveIntoView()
      break
    case ' ':
      // Trong ô tìm, dấu cách là một ký tự chứ không phải "tick dòng này".
      if (props.searchable && e.target === searchRef.value) return
      e.preventDefault()
      toggleRow(rows.value[activeIndex.value])
      break
    case 'Enter':
      e.preventDefault()
      toggleRow(rows.value[activeIndex.value])
      break
    case 'Escape':
      e.preventDefault()
      closeMenu()
      break
    case 'Tab':
      closeMenu(false)
      break
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
      role="combobox"
      class="input flex items-center justify-between gap-2 text-left"
      :class="{ 'border-ring ring-2 ring-ring/30': open }"
      :disabled="disabled"
      :aria-label="ariaLabel ? `${ariaLabel}: ${displayLabel}` : undefined"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="searchable ? undefined : activeId"
      :title="triggerTitle"
      @click="toggleMenu"
      @keydown="onKeydown"
    >
      <span class="truncate" :class="count > 1 ? 'font-medium text-primary' : 'text-foreground'">
        {{ displayLabel }}
      </span>
      <UiIcon
        name="chevron-down"
        :size="16"
        class="ml-auto shrink-0 text-muted-foreground transition-transform duration-150"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <Teleport to="body">
      <Transition name="uimulti">
        <div
          v-if="open"
          ref="panelRef"
          class="z-[60] flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-soft"
          :style="panelStyle"
        >
          <div v-if="searchable" class="shrink-0 border-b border-border p-1">
            <div class="relative">
              <UiIcon name="search" :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref="searchRef"
                v-model="query"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                :aria-controls="listId"
                :aria-activedescendant="activeId"
                :aria-label="ariaLabel ? `Tìm ${ariaLabel}` : 'Tìm'"
                class="input h-8 py-1 pl-8 text-sm"
                :placeholder="searchPlaceholder"
                autocomplete="off"
                @keydown="onKeydown"
              />
            </div>
          </div>

          <!-- mousedown.prevent: bấm chọn không lấy mất focus của nút/ô tìm, nên
               bàn phím vẫn điều khiển được bảng sau khi tick bằng chuột. -->
          <ul
            :id="listId"
            role="listbox"
            aria-multiselectable="true"
            :aria-label="ariaLabel"
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
            @mousedown.prevent
          >
            <li
              v-for="(r, i) in rows"
              :id="rowId(i)"
              :key="r.kind === 'all' ? '__all__' : String(r.o.value)"
              :data-idx="i"
              role="option"
              :aria-selected="r.kind === 'all' ? count === 0 : isSelected(r.o.value)"
              :aria-disabled="rowDisabled(r) || undefined"
              class="flex items-center gap-2 rounded-md px-2.5 py-1.5"
              :class="[
                rowDisabled(r) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                i === activeIndex && !rowDisabled(r) ? 'bg-muted' : '',
                r.kind === 'all' ? 'border-b border-border/60 font-medium' : '',
              ]"
              @click="toggleRow(r)"
              @mousemove="activeIndex = i"
            >
              <!-- Ô vuông (không tròn như radio) để nhìn là biết tick được nhiều.
                   `rounded` của repo là 0.625rem — với ô 16px thành hình tròn. -->
              <span
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
                :class="(r.kind === 'all' ? count === 0 : isSelected(r.o.value))
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-card'"
                aria-hidden="true"
              >
                <UiIcon
                  v-if="r.kind === 'all' ? count === 0 : isSelected(r.o.value)"
                  name="check"
                  :size="12"
                />
              </span>
              <template v-if="r.kind === 'all'">
                <span class="truncate text-foreground">{{ allLabel }}</span>
              </template>
              <template v-else>
                <span class="min-w-0 flex-1">
                  <span class="block truncate" :class="isSelected(r.o.value) ? 'font-medium text-primary' : 'text-foreground'">{{ r.o.label }}</span>
                  <span v-if="r.o.sublabel" class="block truncate text-xs text-muted-foreground">{{ r.o.sublabel }}</span>
                </span>
                <span v-if="r.o.hint" class="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{{ r.o.hint }}</span>
              </template>
            </li>
            <li v-if="!rows.length" class="px-2.5 py-2 text-xs text-muted-foreground" role="presentation">
              {{ query ? 'Không có mục nào khớp' : 'Không có lựa chọn' }}
            </li>
          </ul>

          <div class="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2.5 py-1.5" @mousedown.prevent>
            <span class="truncate text-xs text-muted-foreground" aria-live="polite">
              {{ count ? `${count} đã chọn` : 'Chưa chọn — đang xem tất cả' }}
            </span>
            <button type="button" class="btn-secondary h-7 shrink-0 px-2.5 py-0 text-xs" @click="closeMenu()">Xong</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.uimulti-enter-active,
.uimulti-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.uimulti-enter-from,
.uimulti-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
