<script setup lang="ts">
// Modal in label dùng chung — gắn MỘT lần ở app.vue; điều khiển bằng useLabelPrint().
const { state, close, reprint } = useLabelPrint()
const open = computed({
  get: () => state.value.open,
  set: (v: boolean) => { if (!v) close() },
})
const loading = computed(() => state.value.phase === 'loading')
const canReprint = computed(() => state.value.images.length > 0 && state.value.phase !== 'loading' && state.value.phase !== 'printing')
</script>

<template>
  <UiModal v-model="open" :title="`${state.title}${state.total > 1 ? ` (${state.total} đơn)` : ''}`" wide>
    <div data-testid="label-modal">
      <p v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground" data-testid="label-loading">
        <UiSpinner :size="16" /> Đang tải label… {{ state.loaded }}/{{ state.total }}
      </p>
      <p v-else-if="state.phase === 'printing'" class="mb-3 text-xs text-muted-foreground">Đang mở hộp in… (khổ 4×6, lề không, tỉ lệ 100%)</p>
      <p v-else-if="state.images.length" class="mb-3 text-xs text-muted-foreground" data-testid="label-ready">
        {{ state.images.length }} label khổ 4×6. Bấm "In lại" nếu hộp in đã đóng.
      </p>

      <div
        v-if="state.failures.length"
        class="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
        role="alert"
        data-testid="label-failures"
      >
        <b>{{ state.failures.length }} label không tải được{{ state.images.length ? ' (các label còn lại vẫn in)' : '' }}:</b>
        <ul class="mt-1 list-disc space-y-0.5 pl-5">
          <li v-for="f in state.failures" :key="f.orderId">Đơn <span class="font-mono font-semibold">{{ f.code }}</span>: {{ f.reason }}</li>
        </ul>
      </div>

      <div v-if="state.images.length" class="flex flex-col items-center gap-3" data-testid="label-images">
        <img
          v-for="im in state.images"
          :key="im.orderId"
          :src="im.src"
          :alt="`Label ${im.code}`"
          class="w-full max-w-[4in] border border-border bg-white object-contain shadow-sm"
          style="aspect-ratio: 2 / 3"
        />
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn-secondary" :disabled="!canReprint" data-testid="label-reprint" @click="reprint">
        <UiIcon name="print" :size="16" /> In lại
      </button>
      <button type="button" class="btn-primary" data-testid="label-close" @click="close">Đóng</button>
    </template>
  </UiModal>
</template>
