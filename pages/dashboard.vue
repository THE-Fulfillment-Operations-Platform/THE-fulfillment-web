<script setup lang="ts">
import { ordersApi, itemsApi, batchesApi, notesApi, handoffsApi } from '~/services/api'
import type { Batch, Note, Order } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { formatShort } from '~/utils/format'

const loading = ref(true)
const error = ref<string | null>(null)

const totalOrders = ref(0)
const pendingItems = ref(0)
const attentionCount = ref(0)
const handoffCount = ref(0)
const batches = ref<Batch[]>([])
const recentOrders = ref<Order[]>([])
const attentionNotes = ref<Note[]>([])

const runningBatches = computed(
  () => batches.value.filter((b) => b.status !== 'QC_PASSED').length,
)
const batchByStatus = computed(() => {
  const counts: Record<string, number> = { PENDING: 0, PRINTED: 0, CUT: 0, QC_PASSED: 0 }
  for (const b of batches.value) counts[b.status] = (counts[b.status] ?? 0) + 1
  return counts
})

async function load() {
  loading.value = true
  error.value = null
  try {
    // allSettled: one KPI a role can't access (e.g. handoffs) must not blank the
    // whole dashboard — that widget just shows 0 instead.
    const r = await Promise.allSettled([
      ordersApi.list({ page_size: 1 }),
      itemsApi.list({ status: 'PENDING', page_size: 1 }),
      batchesApi.list({ page_size: 200 }),
      notesApi.list({ required_attention: true, page_size: 1 }),
      handoffsApi.list(),
      ordersApi.list({ page_size: 8 }),
      notesApi.list({ required_attention: true, page_size: 6 }),
    ])
    const val = <T>(i: number): T | null => (r[i].status === 'fulfilled' ? (r[i] as PromiseFulfilledResult<T>).value : null)
    const orders = val<any>(0), pend = val<any>(1), batchList = val<any>(2)
    const attn = val<any>(3), handoffs = val<any>(4), recent = val<any>(5), attnList = val<any>(6)
    totalOrders.value = orders?.meta?.total ?? orders?.data?.length ?? 0
    pendingItems.value = pend?.meta?.total ?? pend?.data?.length ?? 0
    batches.value = batchList?.data ?? []
    attentionCount.value = attn?.meta?.total ?? attn?.data?.length ?? 0
    handoffCount.value = handoffs?.data?.length ?? 0
    recentOrders.value = recent?.data ?? []
    attentionNotes.value = attnList?.data ?? []
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="Tổng quan" subtitle="Tình hình vận hành xưởng hôm nay">
      <template #actions>
        <button class="btn-secondary" @click="load">
          <UiIcon name="refresh" :size="16" /> Làm mới
        </button>
      </template>
    </PageHeader>

    <UiStateBlock :loading="loading" :error="error" @retry="load">
      <!-- KPI row -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Tổng đơn hàng" :value="totalOrders" icon="orders" />
        <KpiCard label="Item chờ xử lý" :value="pendingItems" icon="batches" tone="warn" />
        <KpiCard label="Batch đang chạy" :value="runningBatches" icon="board" />
        <KpiCard label="Cần chú ý" :value="attentionCount" icon="alert" tone="danger" />
        <KpiCard label="Đã bàn giao THE" :value="handoffCount" icon="shipping" tone="success" />
      </div>

      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Batch status breakdown -->
        <div class="card p-5">
          <h3 class="mb-4 text-sm font-semibold text-foreground">Batch theo trạng thái</h3>
          <div class="space-y-3">
            <div
              v-for="(key, idx) in (['PENDING','PRINTED','CUT','QC_PASSED'] as const)"
              :key="key"
              class="flex items-center justify-between"
            >
              <UiStatusBadge kind="internal" :value="key" />
              <span class="text-sm font-semibold text-foreground">{{ batchByStatus[key] }}</span>
            </div>
          </div>
        </div>

        <!-- Recent orders -->
        <div class="card p-5 lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-foreground">Đơn hàng gần đây</h3>
            <NuxtLink to="/orders" class="text-xs font-medium text-primary hover:underline">Xem tất cả</NuxtLink>
          </div>
          <div v-if="recentOrders.length" class="divide-y divide-border">
            <NuxtLink
              v-for="o in recentOrders"
              :key="o.id"
              :to="`/orders/${o.id}`"
              class="flex items-center justify-between gap-2 py-2 text-sm hover:bg-muted"
            >
              <div class="min-w-0 truncate">
                <span class="font-medium text-foreground">{{ o.internal_code }}</span>
                <span class="ml-2 text-muted-foreground">{{ o.store_order_id }}</span>
              </div>
              <div class="flex shrink-0 items-center gap-2 sm:gap-3">
                <UiStatusBadge kind="seller" :value="o.seller_status" />
                <span class="hidden text-xs text-muted-foreground sm:inline">{{ formatShort(o.created_at) }}</span>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="py-6 text-center text-sm text-muted-foreground">Chưa có đơn hàng.</p>
        </div>
      </div>

      <!-- Required attention -->
      <div class="card mt-6 p-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-foreground">Required Attention</h3>
          <NuxtLink to="/notes" class="text-xs font-medium text-primary hover:underline">Quản lý notes</NuxtLink>
        </div>
        <div v-if="attentionNotes.length" class="space-y-2">
          <div
            v-for="n in attentionNotes"
            :key="n.id"
            class="flex items-center justify-between rounded-md border border-border px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-foreground">{{ n.title }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ n.entity_type }} #{{ n.entity_id }} · {{ n.reason_code }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UiStatusBadge kind="severity" :value="n.severity" />
              <UiStatusBadge kind="noteStatus" :value="n.status" />
            </div>
          </div>
        </div>
        <p v-else class="py-4 text-center text-sm text-muted-foreground">Không có mục nào cần chú ý. 🎉</p>
      </div>
    </UiStateBlock>
  </div>
</template>
