<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { Batch, InternalStatus } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER } from '~/utils/enums'
import { useApiResource } from '~/composables/useApiResource'

const { data, loading, error, reload } = useApiResource<Batch[]>(() =>
  batchesApi.list({ page_size: 200 }),
)

const columns = computed(() => {
  const grouped: Record<InternalStatus, Batch[]> = {
    PENDING: [], PRINTED: [], CUT: [], QC_PASSED: [],
  }
  for (const b of data.value ?? []) {
    if (grouped[b.status]) grouped[b.status].push(b)
  }
  return INTERNAL_STATUS_ORDER.map((s) => ({ status: s, meta: INTERNAL_STATUS[s], batches: grouped[s] }))
})
</script>

<template>
  <div>
    <PageHeader title="Bảng sản xuất" subtitle="Theo dõi batch ở Pending / Đã in / Đã cắt / Đã QC">
      <template #actions>
        <button class="btn-secondary" @click="reload"><UiIcon name="refresh" :size="16" /> Làm mới</button>
      </template>
    </PageHeader>

    <UiStateBlock :loading="loading" :error="error" @retry="reload">
      <!-- items-start stops the grid from stretching every column to the tallest
           one: an empty column keeps its own compact, stable height (min-h) with a
           centered "Trống" instead of bulging to match columns that have cards. -->
      <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div v-for="col in columns" :key="col.status" class="flex min-h-[9rem] flex-col rounded-lg bg-muted p-3">
          <div class="mb-3 flex shrink-0 items-center justify-between px-1">
            <UiStatusBadge kind="internal" :value="col.status" />
            <span class="text-sm font-semibold text-muted-foreground">{{ col.batches.length }}</span>
          </div>
          <div v-if="col.batches.length" class="space-y-2">
            <NuxtLink
              v-for="b in col.batches"
              :key="b.id"
              :to="`/batches/${b.id}`"
              class="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-accent/50"
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-foreground">{{ b.code }}</span>
                <UiStatusBadge kind="priority" :value="b.priority || 'NORMAL'" />
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ b.material_name || b.material_code }} · {{ b.item_count ?? b.items?.length ?? 0 }} items
              </p>
            </NuxtLink>
          </div>
          <div v-else class="flex flex-1 items-center justify-center text-xs text-muted-foreground">Trống</div>
        </div>
      </div>
    </UiStateBlock>
  </div>
</template>
