<script setup lang="ts">
import { useToastStore } from '~/stores/toast'
const toast = useToastStore()

const colorFor = (type: string) =>
  type === 'success'
    ? 'border-emerald-200/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200'
    : type === 'error'
      ? 'border-rose-200/60 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200'
      : 'border-border bg-card text-foreground'
</script>

<template>
  <ClientOnly>
    <div class="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm">
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.toasts"
          :key="t.id"
          class="pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-soft"
          :class="colorFor(t.type)"
        >
          <UiIcon :name="t.type === 'success' ? 'check' : t.type === 'error' ? 'alert' : 'box'" :size="16" class="mt-0.5 shrink-0" />
          <span class="flex-1">{{ t.message }}</span>
          <button class="shrink-0 text-current opacity-60 hover:opacity-100" @click="toast.dismiss(t.id)">
            <UiIcon name="close" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </ClientOnly>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
}
</style>
