<script setup lang="ts">
import { ordersApi } from '~/services/api'
import type { Order, OrderItem } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'

const route = useRoute()
const id = route.params.id as string

const { data: order, loading, error, reload } = useApiResource<Order>(() => ordersApi.get(id))

const items = computed<OrderItem[]>(() => order.value?.items ?? [])

// Derive a coarse timeline from the items' internal statuses.
const timeline = computed(() => {
  const its = items.value
  const allReady = its.length > 0 && its.every((i) => i.design_status === 'READY')
  const allBatched = its.length > 0 && its.every((i) => (i.batch_items?.length ?? 0) > 0)
  const atLeast = (set: string[]) => its.length > 0 && its.every((i) => set.includes(i.internal_status))
  return [
    { key: 'import', label: 'Import', done: true },
    { key: 'design', label: 'Design', done: allReady },
    { key: 'batch', label: 'Batch', done: allBatched },
    { key: 'print', label: 'Đã in', done: atLeast(['PRINTED', 'CUT', 'QC_PASSED']) },
    { key: 'cut', label: 'Đã cắt', done: atLeast(['CUT', 'QC_PASSED']) },
    { key: 'qc', label: 'Đã QC', done: atLeast(['QC_PASSED']) },
  ]
})

const shippingRows = computed(() => {
  const o = order.value
  if (!o) return []
  return [
    ['Người nhận', o.shipping_name],
    ['Địa chỉ 1', o.shipping_address1],
    ['Địa chỉ 2', o.shipping_address2],
    ['Thành phố', o.shipping_city],
    ['Tỉnh/Bang', o.shipping_province],
    ['Mã bưu chính', o.shipping_zip],
    ['Quốc gia', o.shipping_country],
    ['Điện thoại', o.shipping_phone],
    ['Email', o.shipping_email],
    ['IOSS', o.ioss],
  ].filter(([, v]) => v) as [string, string][]
})
</script>

<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/orders" class="text-sm text-primary hover:underline">← Về danh sách</NuxtLink>
    </div>

    <UiStateBlock :loading="loading" :error="error" @retry="reload">
      <template v-if="order">
        <!-- Header -->
        <div class="card mb-5 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-foreground">{{ order.internal_code }}</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                Store Order: <span class="font-medium text-foreground">{{ order.store_order_id }}</span>
                <span class="mx-2 text-muted-foreground">·</span>
                {{ order.store_name }}
                <span class="mx-2 text-muted-foreground">·</span>
                {{ formatDateTime(order.created_at) }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <UiStatusBadge v-if="order.review_status && order.review_status !== 'APPROVED'" kind="review" :value="order.review_status" />
              <UiStatusBadge v-if="order.cancellation_status === 'REQUESTED'" kind="cancellation" :value="order.cancellation_status" />
              <UiStatusBadge kind="seller" :value="order.seller_status" />
            </div>
          </div>

          <!-- Timeline -->
          <div class="mt-5 flex flex-wrap items-center gap-1">
            <template v-for="(step, idx) in timeline" :key="step.key">
              <div class="flex items-center gap-2">
                <div
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                  :class="step.done ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'"
                >
                  <UiIcon v-if="step.done" name="check" :size="14" />
                  <span v-else>{{ idx + 1 }}</span>
                </div>
                <span class="text-xs font-medium" :class="step.done ? 'text-foreground' : 'text-muted-foreground'">
                  {{ step.label }}
                </span>
              </div>
              <div v-if="idx < timeline.length - 1" class="mx-1 h-px w-6 bg-muted" />
            </template>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <!-- Item cards -->
          <div class="space-y-4 lg:col-span-2">
            <div v-for="it in items" :key="it.id" class="card p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-foreground">
                    {{ it.sku_code }}
                    <span class="ml-2 text-xs font-normal text-muted-foreground">{{ it.internal_code }}</span>
                  </p>
                  <p class="text-sm text-muted-foreground">{{ it.product_name }} · SL {{ it.quantity }}</p>
                  <p v-if="it.engrave_text" class="mt-1 text-xs text-muted-foreground">Khắc: "{{ it.engrave_text }}"</p>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <UiStatusBadge kind="internal" :value="it.internal_status" />
                  <UiStatusBadge kind="design" :value="it.design_status" />
                </div>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
                <UiMockupLink :url="it.mockup_url" label="Mockup seller" />
                <a v-if="it.print_file_url" :href="it.print_file_url" target="_blank" class="inline-flex items-center gap-1 text-primary hover:underline">
                  <UiIcon name="link" :size="14" /> File in
                </a>
                <span v-else class="text-xs text-muted-foreground">File in: chưa có</span>
                <a v-if="it.cut_file_url" :href="it.cut_file_url" target="_blank" class="inline-flex items-center gap-1 text-primary hover:underline">
                  <UiIcon name="link" :size="14" /> File cắt
                </a>
                <span v-else class="text-xs text-muted-foreground">File cắt: chưa có</span>
              </div>

              <div v-if="it.batch_items?.length" class="mt-3 flex flex-wrap gap-2">
                <NuxtLink
                  v-for="b in it.batch_items"
                  :key="b.batch_item_id ?? b.batch_id"
                  :to="b.batch_id ? `/batches/${b.batch_id}` : ''"
                  class="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  <span class="font-medium text-foreground">{{ b.batch_code || ('#' + b.batch_id) }}</span>
                  <span class="text-muted-foreground">{{ b.material_code || b.material?.code }}</span>
                  <UiStatusBadge kind="internal" :value="b.status" />
                </NuxtLink>
              </div>
            </div>

            <div v-if="order.note" class="card p-4">
              <h3 class="mb-1 text-sm font-semibold text-foreground">Note xưởng</h3>
              <p class="text-sm text-foreground">{{ order.note }}</p>
            </div>
          </div>

          <!-- Shipping / customer -->
          <div class="space-y-4">
            <div class="card p-4">
              <h3 class="mb-3 text-sm font-semibold text-foreground">Thông tin giao hàng</h3>
              <dl class="space-y-2 text-sm">
                <div v-for="[k, v] in shippingRows" :key="k" class="flex justify-between gap-3">
                  <dt class="shrink-0 text-muted-foreground">{{ k }}</dt>
                  <dd class="text-right font-medium text-foreground">{{ v }}</dd>
                </div>
              </dl>
            </div>
            <NuxtLink
              :to="`/notes?entity_type=ORDER&entity_id=${order.id}`"
              class="btn-secondary w-full"
            >
              <UiIcon name="notes" :size="16" /> Notes liên quan
            </NuxtLink>
          </div>
        </div>
      </template>
    </UiStateBlock>
  </div>
</template>
