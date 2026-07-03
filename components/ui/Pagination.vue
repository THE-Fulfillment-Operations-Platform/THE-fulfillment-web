<script setup lang="ts">
import type { ApiMeta } from '~/types'

const props = defineProps<{ meta?: ApiMeta | null }>()
const emit = defineEmits<{ (e: 'change', page: number): void }>()

const canPrev = computed(() => (props.meta?.page ?? 1) > 1)
const canNext = computed(() => (props.meta?.page ?? 1) < (props.meta?.total_pages ?? 1))
</script>

<template>
  <div v-if="meta && meta.total_pages > 1" class="flex flex-wrap items-center justify-between gap-2 px-1 py-3 text-sm text-muted-foreground">
    <span class="min-w-0 truncate">
      Trang {{ meta.page }} / {{ meta.total_pages }} · {{ meta.total }} mục
    </span>
    <div class="flex shrink-0 gap-2">
      <button class="btn-secondary px-3 py-1.5" :disabled="!canPrev" @click="emit('change', meta.page - 1)">
        Trước
      </button>
      <button class="btn-secondary px-3 py-1.5" :disabled="!canNext" @click="emit('change', meta.page + 1)">
        Sau
      </button>
    </div>
  </div>
</template>
