<script setup lang="ts">
defineProps<{
  label: string
  value: number | string
  icon?: string
  tone?: 'default' | 'warn' | 'danger' | 'success'
  hint?: string
}>()

const toneClasses: Record<string, string> = {
  default: 'bg-accent text-primary',
  warn: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
}
</script>

<template>
  <div class="card flex items-center gap-4 p-4">
    <div class="rounded-xl p-2.5" :class="toneClasses[tone || 'default']">
      <UiIcon :name="icon || 'box'" :size="22" />
    </div>
    <div class="min-w-0">
      <p class="text-2xl font-semibold leading-tight text-foreground">{{ value }}</p>
      <p class="truncate text-xs text-muted-foreground">{{ label }}</p>
      <p v-if="hint" class="truncate text-[11px] text-muted-foreground">{{ hint }}</p>
    </div>
  </div>
</template>
