<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; title?: string; wide?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 backdrop-blur-sm sm:p-8"
        @click.self="close"
      >
        <div
          class="card my-4 flex max-h-[calc(100dvh_-_2rem)] w-full flex-col shadow-soft"
          :class="wide ? 'max-w-3xl' : 'max-w-lg'"
        >
          <div class="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
            <h3 class="text-sm font-semibold text-foreground">{{ title }}</h3>
            <button
              class="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Đóng"
              @click="close"
            >
              <UiIcon name="close" :size="18" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3.5">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
