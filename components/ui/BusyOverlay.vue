<script setup lang="ts">
// Full-screen "đang xử lý" scrim for actions that take a real beat — the batch
// status PATCH cascades to every item and regularly runs ~3s. It tells the user
// what is running instead of leaving a frozen page, and blocks clicks so the same
// action can't be fired twice.
//
// Two timings keep it from feeling twitchy:
//   delay       — nothing paints for fast responses (no flash on a 200ms call)
//   minDuration — once painted it stays put briefly, so it never blinks in and out
const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    subtitle?: string
    icon?: string
    /** Sub-steps of the running action; `activeStep` (0-based) marks progress. */
    steps?: string[]
    activeStep?: number
    delay?: number
    minDuration?: number
  }>(),
  { icon: 'refresh', delay: 120, minDuration: 450, activeStep: 0, steps: () => [] },
)

const visible = ref(false)
// Giây đã chờ — hiện sau 2s để người bấm biết hệ thống vẫn đang chạy, không treo.
const elapsed = ref(0)

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let shownAt = 0

function clearTimers() {
  if (showTimer) clearTimeout(showTimer)
  if (hideTimer) clearTimeout(hideTimer)
  if (ticker) clearInterval(ticker)
  showTimer = hideTimer = ticker = null
}

watch(
  () => props.open,
  (open) => {
    clearTimers()
    if (open) {
      const startedAt = Date.now()
      elapsed.value = 0
      ticker = setInterval(() => {
        elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
      }, 500)
      showTimer = setTimeout(() => {
        shownAt = Date.now()
        visible.value = true
      }, props.delay)
      return
    }
    if (!visible.value) return
    hideTimer = setTimeout(
      () => {
        visible.value = false
      },
      Math.max(0, props.minDuration - (Date.now() - shownAt)),
    )
  },
)

onBeforeUnmount(clearTimers)
</script>

<template>
  <Teleport to="body">
    <Transition name="busy">
      <div
        v-if="visible"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="busy-card card w-full max-w-sm p-6 text-center shadow-soft">
          <!-- Halo pulse + orbit ring quanh icon: báo "đang chạy" rõ hơn spinner trơn -->
          <div class="relative mx-auto h-14 w-14">
            <span class="busy-ring absolute inset-0 rounded-full bg-primary/25" />
            <span class="busy-ring busy-ring-2 absolute inset-0 rounded-full bg-primary/25" />
            <span class="absolute inset-0 grid place-items-center rounded-full bg-primary/10 text-primary">
              <UiIcon :name="icon" :size="22" />
            </span>
            <svg class="absolute -inset-1.5 animate-spin text-primary/60" viewBox="0 0 100 100" fill="none">
              <circle
                cx="50"
                cy="50"
                r="46"
                stroke="currentColor"
                stroke-width="5"
                stroke-linecap="round"
                stroke-dasharray="55 235"
              />
            </svg>
          </div>

          <h3 class="mt-4 text-sm font-semibold text-foreground">{{ title || 'Đang xử lý…' }}</h3>
          <p v-if="subtitle" class="mt-1 text-xs text-muted-foreground">{{ subtitle }}</p>

          <div class="mt-5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div class="busy-bar h-full w-1/3 rounded-full bg-primary" />
          </div>

          <p class="mt-2 h-4 text-[11px]" :class="elapsed >= 8 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'">
            <span v-if="elapsed >= 8">Lâu hơn thường lệ ({{ elapsed }}s) — vui lòng giữ nguyên trang.</span>
            <span v-else-if="elapsed >= 2">Đã chờ {{ elapsed }}s…</span>
          </p>

          <ul v-if="steps.length" class="mt-3 space-y-2 border-t border-border pt-4 text-left">
            <li
              v-for="(step, i) in steps"
              :key="step"
              class="flex items-center gap-2.5 text-xs"
              :class="i < activeStep
                ? 'text-muted-foreground'
                : i === activeStep
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground/50'"
            >
              <span class="grid h-4 w-4 shrink-0 place-items-center">
                <UiIcon v-if="i < activeStep" name="check" :size="14" class="text-emerald-500" />
                <UiSpinner v-else-if="i === activeStep" :size="14" />
                <span v-else class="h-1.5 w-1.5 rounded-full bg-border" />
              </span>
              <span class="min-w-0 flex-1">{{ step }}</span>
            </li>
          </ul>

          <p class="mt-4 text-[11px] text-muted-foreground">Đừng tải lại trang — thao tác sẽ tự hoàn tất.</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.busy-enter-active,
.busy-leave-active {
  transition: opacity 0.18s ease;
}
.busy-enter-from,
.busy-leave-to {
  opacity: 0;
}
.busy-enter-active .busy-card,
.busy-leave-active .busy-card {
  transition: transform 0.18s cubic-bezier(0.2, 0, 0.2, 1);
}
.busy-enter-from .busy-card,
.busy-leave-to .busy-card {
  transform: translateY(8px) scale(0.97);
}

/* Indeterminate bar: the request has no progress events, so the motion only
   signals "still working" — never a fake percentage. */
.busy-bar {
  animation: busy-slide 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes busy-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(320%);
  }
}

.busy-ring {
  animation: busy-pulse 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.busy-ring-2 {
  animation-delay: 0.7s;
}
@keyframes busy-pulse {
  0% {
    transform: scale(0.85);
    opacity: 0.6;
  }
  70% {
    transform: scale(1.7);
    opacity: 0;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .busy-ring {
    animation: none;
    opacity: 0;
  }
  .busy-bar {
    width: 100%;
    animation: busy-fade 1.6s ease-in-out infinite;
  }
  @keyframes busy-fade {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 1;
    }
  }
}
</style>
