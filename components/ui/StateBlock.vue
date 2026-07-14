<script setup lang="ts">
// Unified loading / empty / error placeholder for data regions.
// Loading defaults to a centred spinner; pass `skeleton` for a row-shimmer
// preview (nicer for table/list regions) with `skeleton-rows` controlling count.
withDefaults(
  defineProps<{
    loading?: boolean
    error?: string | null
    empty?: boolean
    emptyText?: string
    loadingText?: string
    skeleton?: boolean
    skeletonRows?: number
  }>(),
  { skeletonRows: 6 },
)

const emit = defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <div v-if="loading && skeleton" class="space-y-3 p-4" aria-busy="true" aria-live="polite">
    <div v-for="i in skeletonRows" :key="i" class="flex items-center gap-3">
      <UiSkeleton height="0.9rem" width="20%" />
      <UiSkeleton height="0.9rem" width="30%" />
      <UiSkeleton height="0.9rem" width="18%" />
      <UiSkeleton height="0.9rem" width="16%" />
      <UiSkeleton height="0.9rem" width="10%" />
    </div>
  </div>

  <div v-else-if="loading" class="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
    <UiSpinner :size="28" />
    <p class="text-sm">{{ loadingText || 'Đang tải dữ liệu…' }}</p>
  </div>

  <div
    v-else-if="error"
    class="flex flex-col items-center justify-center gap-3 py-12 text-center"
  >
    <div class="rounded-full bg-destructive/10 p-3 text-destructive">
      <UiIcon name="alert" :size="24" />
    </div>
    <p class="max-w-md text-sm text-destructive">{{ error }}</p>
    <button class="btn-secondary" @click="emit('retry')">
      <UiIcon name="refresh" :size="16" /> Thử lại
    </button>
  </div>

  <div
    v-else-if="empty"
    class="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground"
  >
    <div class="rounded-full bg-muted p-3">
      <UiIcon name="box" :size="24" />
    </div>
    <p class="text-sm">{{ emptyText || 'Không có dữ liệu.' }}</p>
  </div>

  <slot v-else />
</template>
