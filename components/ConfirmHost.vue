<script setup lang="ts">
import { watch, nextTick, ref } from 'vue'
import { useConfirm, type ConfirmTone } from '~/composables/useConfirm'

// Single global host for useConfirm(). Renders a glassy, theme-aware alert
// dialog with a tone-coloured icon bubble and an ethereal glow. Keyboard:
// Esc = cancel, Enter = confirm; the confirm button is focused on open.
const { state, accept, cancel } = useConfirm()
const confirmBtn = ref<HTMLButtonElement | null>(null)

const TONES: Record<ConfirmTone, { bubble: string; glow: string; btn: string; icon: string }> = {
  danger: {
    bubble: 'bg-rose-500/15 text-rose-600 ring-rose-500/25 dark:text-rose-400',
    glow: 'bg-rose-500/30',
    btn: 'btn-danger',
    icon: 'alert',
  },
  primary: {
    bubble: 'bg-primary/15 text-primary ring-primary/25',
    glow: 'bg-primary/30',
    btn: 'btn-primary',
    icon: 'check',
  },
  warning: {
    bubble: 'bg-amber-500/15 text-amber-600 ring-amber-500/25 dark:text-amber-400',
    glow: 'bg-amber-500/30',
    btn: 'btn-primary',
    icon: 'alert',
  },
}

function onKey(e: KeyboardEvent) {
  if (!state.value.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    accept()
  }
}

watch(
  () => state.value.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKey)
      nextTick(() => confirmBtn.value?.focus())
    } else {
      document.removeEventListener('keydown', onKey)
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div
        v-if="state.open"
        class="fixed inset-0 z-[70] flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <!-- Glassy backdrop -->
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-md" @click="cancel" />

        <!-- Bubble card -->
        <div
          class="confirm-card relative w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-white/60 bg-card/85 p-6 text-center shadow-2xl backdrop-blur-2xl dark:border-white/10"
        >
          <!-- Ethereal glow behind the icon -->
          <div
            class="pointer-events-none absolute -top-14 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl"
            :class="TONES[state.tone].glow"
          />
          <!-- Soft top sheen (glass highlight) -->
          <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20" />

          <!-- Icon bubble -->
          <div
            class="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ring-inset"
            :class="TONES[state.tone].bubble"
          >
            <UiIcon :name="TONES[state.tone].icon" :size="30" />
          </div>

          <h3 id="confirm-title" class="relative text-lg font-semibold text-foreground">{{ state.title }}</h3>
          <p class="relative mx-auto mt-2 max-w-xs whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {{ state.message }}
          </p>

          <div class="relative mt-6 flex gap-2.5">
            <button class="btn-secondary flex-1 justify-center rounded-xl py-2.5" @click="cancel">
              {{ state.cancelText }}
            </button>
            <button
              ref="confirmBtn"
              class="flex-1 justify-center rounded-xl py-2.5"
              :class="TONES[state.tone].btn"
              @click="accept"
            >
              {{ state.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Backdrop fades; the card floats in with a soft scale + rise ("ảo ảo"). */
.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.22s ease;
}
.confirm-enter-active .confirm-card,
.confirm-leave-active .confirm-card {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
.confirm-enter-from .confirm-card,
.confirm-leave-to .confirm-card {
  opacity: 0;
  transform: translateY(10px) scale(0.94);
}
</style>
