<script setup lang="ts">
// Theme-aware, keyboard-accessible custom dropdown that replaces the native
// <select> (whose option popup is OS-rendered and cannot be styled). The panel
// is teleported to <body> with fixed positioning so it is never clipped by a
// modal, a table's overflow-x-auto, or a card — and it flips upward when there
// is more room above. Drop-in for `<select v-model class="input">`.
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

type SelectValue = string | number

interface SelectOption {
  value: SelectValue
  label: string
  disabled?: boolean
  // Secondary text pinned to the right of the row (counts, units…). Kept out of
  // `label` so it lines up in a column instead of trailing labels of every width.
  hint?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: SelectValue | null | undefined
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    id?: string
    ariaLabel?: string
  }>(),
  { placeholder: 'Chọn…', disabled: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: SelectValue): void
  (e: 'change', v: SelectValue): void
}>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)

const selected = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null)
const displayLabel = computed(() => selected.value?.label ?? '')

// ---- Positioning (fixed, so it escapes overflow/modal clipping) ------------
const panelStyle = ref<Record<string, string>>({})

function reposition() {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - r.bottom
  const spaceAbove = r.top
  const budget = 288
  const up = spaceBelow < Math.min(budget, 220) && spaceAbove > spaceBelow
  const maxH = Math.max(120, Math.min(budget, (up ? spaceAbove : spaceBelow) - 12))
  panelStyle.value = {
    position: 'fixed',
    left: `${Math.round(r.left)}px`,
    width: `${Math.round(r.width)}px`,
    maxHeight: `${Math.round(maxH)}px`,
    ...(up
      ? { bottom: `${Math.round(window.innerHeight - r.top + 4)}px` }
      : { top: `${Math.round(r.bottom + 4)}px` }),
  }
}

// ---- Open / close ----------------------------------------------------------
function openMenu() {
  if (props.disabled || open.value) return
  open.value = true
  const cur = props.options.findIndex((o) => o.value === props.modelValue)
  activeIndex.value = cur >= 0 ? cur : 0
  nextTick(() => {
    reposition()
    scrollActiveIntoView()
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

function closeMenu(refocus = true) {
  if (!open.value) return
  open.value = false
  detach()
  if (refocus) triggerRef.value?.focus()
}

function toggle() {
  open.value ? closeMenu() : openMenu()
}

function onDocMouseDown(e: MouseEvent) {
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return
  closeMenu(false)
}

// ---- Selection & keyboard --------------------------------------------------
function selectOption(o: SelectOption) {
  if (o.disabled) return
  if (o.value !== props.modelValue) {
    emit('update:modelValue', o.value)
    emit('change', o.value)
  }
  closeMenu()
}

function scrollActiveIntoView() {
  nextTick(() => {
    panelRef.value?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

function move(delta: number) {
  const n = props.options.length
  if (!n) return
  let i = activeIndex.value
  for (let step = 0; step < n; step++) {
    i = (i + delta + n) % n
    if (!props.options[i]?.disabled) break
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
      e.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      e.preventDefault()
      activeIndex.value = props.options.length - 1
      scrollActiveIntoView()
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (props.options[activeIndex.value]) selectOption(props.options[activeIndex.value])
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
      class="input flex items-center justify-between gap-2 text-left"
      :class="{ 'border-ring ring-2 ring-ring/30': open }"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="truncate" :class="displayLabel ? 'text-foreground' : 'text-muted-foreground'">
        {{ displayLabel || placeholder }}
      </span>
      <span class="ml-auto flex shrink-0 items-center gap-1.5">
        <span v-if="selected?.hint" class="text-xs tabular-nums text-muted-foreground">
          {{ selected.hint }}
        </span>
        <UiIcon
          name="chevron-down"
          :size="16"
          class="text-muted-foreground transition-transform duration-150"
          :class="{ 'rotate-180': open }"
        />
      </span>
    </button>

    <Teleport to="body">
      <Transition name="uiselect">
        <ul
          v-if="open"
          ref="panelRef"
          role="listbox"
          class="z-[60] overflow-auto rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-soft"
          :style="panelStyle"
        >
          <li
            v-for="(o, i) in options"
            :key="String(o.value)"
            :data-idx="i"
            role="option"
            :aria-selected="o.value === modelValue"
            class="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5"
            :class="[
              o.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
              i === activeIndex && !o.disabled ? 'bg-muted' : '',
              o.value === modelValue ? 'font-medium text-primary' : 'text-foreground',
            ]"
            @click="selectOption(o)"
            @mousemove="activeIndex = i"
          >
            <span class="truncate">{{ o.label }}</span>
            <span class="ml-auto flex shrink-0 items-center gap-1.5">
              <span
                v-if="o.hint"
                class="text-xs tabular-nums"
                :class="o.value === modelValue ? 'text-primary/70' : 'text-muted-foreground'"
              >
                {{ o.hint }}
              </span>
              <!-- The tick is swapped for an equal-width spacer so hints stay in
                   one column instead of jumping when the row is selected. -->
              <UiIcon v-if="o.value === modelValue" name="check" :size="15" class="text-primary" />
              <span v-else class="block w-[15px]" aria-hidden="true" />
            </span>
          </li>
          <li v-if="!options.length" class="px-2.5 py-2 text-xs text-muted-foreground">Không có lựa chọn</li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.uiselect-enter-active,
.uiselect-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.uiselect-enter-from,
.uiselect-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
