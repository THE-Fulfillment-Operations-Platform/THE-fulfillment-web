<script setup lang="ts">
// Ô gõ tự do có gợi ý (thay <input list> + <datalist> của trình duyệt — popup đó do
// hệ điều hành vẽ: không đổi được giao diện, không tô chữ khớp, không phím tắt rõ
// ràng). Khác UiSelect: giá trị là CHỮ NGƯỜI DÙNG GÕ; gợi ý chỉ để chọn nhanh, gõ
// một giá trị không có trong danh sách vẫn hợp lệ (vd test SKU sai).
//
// Bảng gợi ý teleport ra <body>, vị trí fixed nên không bị modal / bảng cuộn cắt, tự
// lật lên khi dưới hết chỗ — cùng cách UiSelect làm.
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'

interface ComboOption {
  value: string
  // Dòng phụ nhỏ bên dưới (tên sản phẩm của một mã SKU…). Cũng được tìm.
  sublabel?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ComboOption[]
    placeholder?: string
    id?: string
    // Số gợi ý hiện tối đa — danh sách hàng trăm SKU không cần dựng hết.
    maxResults?: number
    // Chữ monospace trong ô (mã SKU).
    mono?: boolean
    // Câu nói khi gõ giá trị không khớp gợi ý nào ("vẫn dùng được").
    freeTextHint?: string
  }>(),
  { placeholder: 'Gõ để tìm…', maxResults: 50, mono: false, freeTextHint: '' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const inputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const open = ref(false)
// -1 = người dùng chưa chọn dòng nào bằng phím/chuột: Enter khi đó chỉ chốt chữ đã gõ
// chứ không nhảy sang gợi ý đầu tiên.
const active = ref(-1)
const panelStyle = ref<Record<string, string>>({})

const q = computed(() => props.modelValue.trim().toLowerCase())

// Xếp hạng: trùng hẳn > bắt đầu bằng > chứa trong mã > chỉ chứa trong mô tả.
function rank(o: ComboOption): number {
  const v = o.value.toLowerCase()
  if (!q.value) return 4
  if (v === q.value) return 0
  if (v.startsWith(q.value)) return 1
  if (v.includes(q.value)) return 2
  if (o.sublabel?.toLowerCase().includes(q.value)) return 3
  return -1
}
const matches = computed(() =>
  props.options
    .map((o) => ({ o, r: rank(o) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.o.value.localeCompare(b.o.value, undefined, { numeric: true }))
    .map((x) => x.o),
)
const shown = computed(() => matches.value.slice(0, props.maxResults))
const hidden = computed(() => matches.value.length - shown.value.length)
const exact = computed(() => props.options.some((o) => o.value.toLowerCase() === q.value))
// Chỉ nhắc "vẫn dùng được" khi KHÔNG còn gợi ý nào — đang gõ dở mà có gợi ý thì nói vậy là gây hiểu nhầm.
const showFreeHint = computed(() => !!props.freeTextHint && !!q.value && !exact.value && shown.value.length === 0)

// Tô đậm đoạn khớp trong mã — tách thành 3 phần thay vì v-html.
function parts(text: string): { pre: string; hit: string; post: string } {
  const i = q.value ? text.toLowerCase().indexOf(q.value) : -1
  if (i < 0) return { pre: text, hit: '', post: '' }
  return { pre: text.slice(0, i), hit: text.slice(i, i + q.value.length), post: text.slice(i + q.value.length) }
}

function reposition() {
  const el = inputRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const below = window.innerHeight - r.bottom
  const above = r.top
  const budget = 320
  const up = below < Math.min(budget, 240) && above > below
  const maxH = Math.max(140, Math.min(budget, (up ? above : below) - 12))
  const width = Math.min(Math.max(r.width, 320), window.innerWidth - r.left - 16)
  panelStyle.value = {
    position: 'fixed',
    left: `${Math.round(r.left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(maxH)}px`,
    ...(up ? { bottom: `${Math.round(window.innerHeight - r.top + 4)}px` } : { top: `${Math.round(r.bottom + 4)}px` }),
  }
}

function openMenu() {
  if (open.value) return
  open.value = true
  active.value = -1
  nextTick(() => {
    reposition()
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

function closeMenu() {
  if (!open.value) return
  open.value = false
  detach()
}

// Cuộn BÊN TRONG bảng gợi ý không được coi là cuộn trang (nếu không nó đóng/nhảy vị trí).
function onScroll(e: Event) {
  if (panelRef.value && e.target instanceof Node && panelRef.value.contains(e.target)) return
  reposition()
}

function onDocMouseDown(e: MouseEvent) {
  const t = e.target as Node
  if (inputRef.value?.contains(t) || panelRef.value?.contains(t)) return
  closeMenu()
}

function pick(o: ComboOption) {
  emit('update:modelValue', o.value)
  closeMenu()
  inputRef.value?.focus()
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
  openMenu()
  active.value = -1
  nextTick(reposition)
}

function scrollActive() {
  nextTick(() => panelRef.value?.querySelector<HTMLElement>(`[data-idx="${active.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) {
      openMenu()
      return
    }
    const n = shown.value.length
    if (!n) return
    const d = e.key === 'ArrowDown' ? 1 : -1
    active.value = active.value < 0 ? (d > 0 ? 0 : n - 1) : (active.value + d + n) % n
    scrollActive()
    return
  }
  if (!open.value) return
  if (e.key === 'Enter') {
    // Có chọn dòng gợi ý thì lấy dòng đó; không thì chỉ chốt chữ đã gõ (và không
    // để Enter làm gì khác trong form).
    e.preventDefault()
    if (active.value >= 0 && shown.value[active.value]) pick(shown.value[active.value])
    else closeMenu()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeMenu()
  } else if (e.key === 'Tab') {
    closeMenu()
  }
}

function clear() {
  emit('update:modelValue', '')
  inputRef.value?.focus()
  openMenu()
}

watch(
  () => shown.value.length,
  (n) => {
    if (active.value >= n) active.value = n - 1
  },
)
onBeforeUnmount(detach)
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      ref="inputRef"
      :value="modelValue"
      type="text"
      class="input pr-16"
      :class="{ 'font-mono': mono, 'border-ring ring-2 ring-ring/30': open }"
      :placeholder="placeholder"
      autocomplete="off"
      spellcheck="false"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      @focus="openMenu"
      @click="openMenu"
      @input="onInput"
      @keydown="onKeydown"
    />
    <div class="absolute inset-y-0 right-2 flex items-center gap-1">
      <button
        v-if="modelValue"
        type="button"
        tabindex="-1"
        class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Xoá"
        @mousedown.prevent
        @click="clear"
      >
        <UiIcon name="close" :size="14" />
      </button>
      <UiIcon
        name="chevron-down"
        :size="16"
        class="pointer-events-none text-muted-foreground transition-transform duration-150"
        :class="{ 'rotate-180': open }"
      />
    </div>

    <Teleport to="body">
      <Transition name="uicombo">
        <ul
          v-if="open && (shown.length || showFreeHint)"
          ref="panelRef"
          role="listbox"
          class="z-[60] overflow-auto rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-soft"
          :style="panelStyle"
          @mousedown.prevent
        >
          <li
            v-for="(o, i) in shown"
            :key="o.value"
            :data-idx="i"
            role="option"
            :aria-selected="o.value === modelValue"
            class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
            :class="[i === active ? 'bg-muted' : '', o.value === modelValue ? 'text-primary' : 'text-foreground']"
            @click="pick(o)"
            @mousemove="active = i"
          >
            <span class="min-w-0">
              <span class="block truncate font-mono text-[13px] font-semibold">
                {{ parts(o.value).pre }}<mark v-if="parts(o.value).hit" class="rounded-sm bg-amber-200/70 px-0 text-inherit dark:bg-amber-400/30">{{ parts(o.value).hit }}</mark>{{ parts(o.value).post }}
              </span>
              <span v-if="o.sublabel" class="block truncate text-xs text-muted-foreground">{{ o.sublabel }}</span>
            </span>
            <UiIcon v-if="o.value === modelValue" name="check" :size="15" class="shrink-0 text-primary" />
          </li>
          <li v-if="hidden > 0" class="px-2.5 py-1.5 text-center text-xs text-muted-foreground">
            Còn {{ hidden }} mã nữa — gõ thêm để thu hẹp
          </li>
          <li v-if="showFreeHint" class="px-2.5 py-2 text-xs text-muted-foreground">
            <span class="font-mono font-semibold text-foreground">{{ modelValue.trim() }}</span> {{ freeTextHint }}
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.uicombo-enter-active,
.uicombo-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.uicombo-enter-from,
.uicombo-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
