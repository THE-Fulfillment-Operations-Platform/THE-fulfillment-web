<script setup lang="ts">
import type { ApiMeta } from '~/types'

// Shared pager. The page-size picker is opt-in: pass `:page-size` to show a
// "Hiển thị N dòng" dropdown next to Trước/Sau. Pages that omit it keep the
// original prev/next-only behaviour.
const props = withDefaults(
  defineProps<{
    meta?: ApiMeta | null
    pageSize?: number | null
    pageSizes?: number[]
  }>(),
  { meta: null, pageSize: null, pageSizes: () => [20, 50, 100, 200] },
)
const emit = defineEmits<{
  (e: 'change', page: number): void
  (e: 'update:pageSize', size: number): void
}>()

const canPrev = computed(() => (props.meta?.page ?? 1) > 1)
const canNext = computed(() => (props.meta?.page ?? 1) < (props.meta?.total_pages ?? 1))

// Nav (prev/next) only matters with >1 page; the size picker stays usable even
// on a single page so the user can raise it back down.
const showNav = computed(() => (props.meta?.total_pages ?? 1) > 1)
const showSizePicker = computed(() => props.pageSize != null && (props.meta?.total ?? 0) > 0)
const sizeOptions = computed(() => props.pageSizes.map((n) => ({ value: n, label: String(n) })))
</script>

<template>
  <div
    v-if="meta && (showNav || showSizePicker)"
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-3 text-sm text-muted-foreground"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span class="min-w-0 truncate">
        Trang {{ meta.page }} / {{ meta.total_pages }} · {{ meta.total }} mục
      </span>
      <label v-if="showSizePicker" class="flex items-center gap-1.5">
        <span class="shrink-0">Hiển thị</span>
        <div class="w-20">
          <UiSelect
            :model-value="pageSize"
            :options="sizeOptions"
            aria-label="Số dòng mỗi trang"
            @update:model-value="emit('update:pageSize', Number($event))"
          />
        </div>
        <span class="shrink-0">dòng</span>
      </label>
    </div>
    <div v-if="showNav" class="flex shrink-0 gap-2">
      <button class="btn-secondary px-3 py-1.5" :disabled="!canPrev" @click="emit('change', meta.page - 1)">
        Trước
      </button>
      <button class="btn-secondary px-3 py-1.5" :disabled="!canNext" @click="emit('change', meta.page + 1)">
        Sau
      </button>
    </div>
  </div>
</template>
