<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { Batch, InternalStatus } from '~/types'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER } from '~/utils/enums'
import { formatDate } from '~/utils/format'
import { useApiResource } from '~/composables/useApiResource'

const { data, loading, error, reload } = useApiResource<Batch[]>(() =>
  // Bảng sản xuất chỉ hiện batch còn việc: batch mà toàn bộ hàng đã bị huỷ ở QC
  // không còn gì để in/cắt (hàng được làm lại ở batch mới) nên không được chiếm
  // chỗ trên bảng.
  batchesApi.list({ page_size: 200, open: true }),
)

const columns = computed(() => {
  const grouped: Record<InternalStatus, Batch[]> = {
    PENDING: [], PRINTED: [], CUT: [], QC_PASSED: [],
  }
  for (const b of data.value ?? []) {
    if (grouped[b.status]) grouped[b.status].push(b)
  }
  // API trả batch mới nhất trước, nhưng xưởng làm theo thứ tự batch: mỗi cột xếp
  // mã tăng dần từ trên xuống để batch đến lượt trước nằm trên cùng. numeric:true
  // để 101099 đứng trước 101100 (so sánh chuỗi thuần thì ngược lại).
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.id - b.id)
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
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold text-foreground">{{ b.code }}</span>
                <!-- Ngày tạo batch: xưởng nhìn card là biết batch nằm chờ bao lâu
                     mà không phải mở chi tiết. min-w-0 + truncate để mã batch dài
                     không đẩy badge ưu tiên rớt dòng. -->
                <span v-if="b.created_at" class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{{ formatDate(b.created_at) }}</span>
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
