<script setup lang="ts">
// Một dòng thông số: thanh kéo để mò nhanh, ô số để gõ chính xác. Thợ chỉnh bằng
// thanh kéo, còn khi xưởng chốt "viền đúng 3 mm" thì gõ thẳng vào ô số.
const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    min: number
    max: number
    step?: number
    unit?: string
    hint?: string
    disabled?: boolean
  }>(),
  { step: 0.1, unit: 'mm', hint: '', disabled: false },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

function set(v: number | string) {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, n)))
}
</script>

<template>
  <div :class="props.disabled ? 'opacity-50' : ''">
    <div class="mb-1 flex items-baseline justify-between gap-2">
      <label class="text-xs font-medium text-muted-foreground">{{ props.label }}</label>
      <div class="flex items-center gap-1">
        <input
          type="number"
          class="w-16 rounded-md border border-input bg-card px-1.5 py-0.5 text-right text-xs tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          :value="props.modelValue"
          :min="props.min"
          :max="props.max"
          :step="props.step"
          :disabled="props.disabled"
          @change="set(($event.target as HTMLInputElement).value)"
        />
        <span v-if="props.unit" class="w-6 text-xs text-muted-foreground">{{ props.unit }}</span>
      </div>
    </div>
    <input
      type="range"
      class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      :value="props.modelValue"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :disabled="props.disabled"
      @input="set(($event.target as HTMLInputElement).value)"
    />
    <p v-if="props.hint" class="mt-1 text-[11px] leading-snug text-muted-foreground">{{ props.hint }}</p>
  </div>
</template>
