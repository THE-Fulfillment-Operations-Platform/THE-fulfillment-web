<script setup lang="ts">
import { sellerViewApi } from '~/services/api'
import type { SellerOrder, SellerStatus } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'
import { SELLER_STATUS } from '~/utils/enums'

// Seller order detail (Wireframe: Seller View). Shows a friendly progress
// timeline + the items with their mockups. No internal/production data.
definePageMeta({ layout: 'seller' })

const route = useRoute()
const id = route.params.id as string

const { data: order, loading, error, reload } = useApiResource<SellerOrder>(() =>
  sellerViewApi.order(id),
)
const items = computed(() => order.value?.items ?? [])

const STAGES: SellerStatus[] = ['PRODUCTION', 'PACKED', 'HANDED_OFF', 'SHIPPED']
const currentStep = computed(() => (order.value ? STAGES.indexOf(order.value.status) : -1))
</script>

<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/seller" class="text-sm text-primary hover:underline">← Về danh sách đơn</NuxtLink>
    </div>

    <UiStateBlock :loading="loading" :error="error" @retry="reload">
      <template v-if="order">
        <!-- Header -->
        <div class="card mb-5 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-foreground">{{ order.store_order_id }}</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ order.store_name || '—' }} · {{ order.item_count }} sản phẩm · {{ formatDateTime(order.created_at) }}
              </p>
            </div>
            <UiStatusBadge kind="seller" :value="order.status" />
          </div>

          <!-- Progress timeline -->
          <div class="mt-6 flex items-center">
            <template v-for="(stage, idx) in STAGES" :key="stage">
              <div class="flex flex-col items-center text-center">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold sm:h-9 sm:w-9 sm:text-sm"
                  :class="idx <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
                >
                  <UiIcon v-if="idx < currentStep" name="check" :size="14" />
                  <span v-else>{{ idx + 1 }}</span>
                </div>
                <span
                  class="mt-1.5 w-14 text-[10px] font-medium leading-tight sm:w-20 sm:text-[11px]"
                  :class="idx <= currentStep ? 'text-primary' : 'text-muted-foreground'"
                >
                  {{ SELLER_STATUS[stage].label }}
                </span>
              </div>
              <div
                v-if="idx < STAGES.length - 1"
                class="mx-0.5 mb-6 h-0.5 flex-1 sm:mx-1 sm:mb-5"
                :class="idx < currentStep ? 'bg-primary' : 'bg-muted'"
              />
            </template>
          </div>
        </div>

        <!-- Items -->
        <div class="card overflow-hidden">
          <div class="border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Sản phẩm trong đơn</h3>
          </div>
          <div class="divide-y divide-border">
            <div v-for="(it, idx) in items" :key="idx" class="flex items-center gap-4 px-4 py-3">
              <img
                v-if="it.mockup_url"
                :src="it.mockup_url"
                :alt="it.sku_code"
                loading="lazy"
                class="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
              />
              <div v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <UiIcon name="box" :size="22" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-foreground">{{ it.product_name || it.sku_code }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ it.sku_code }}<span v-if="it.variant_code"> · {{ it.variant_code }}</span>
                </p>
              </div>
              <div class="shrink-0 text-sm font-medium text-foreground">x{{ it.quantity }}</div>
              <UiMockupLink :url="it.mockup_url" small label="Xem mockup" />
            </div>
            <p v-if="!items.length" class="px-4 py-8 text-center text-sm text-muted-foreground">
              Không có chi tiết sản phẩm.
            </p>
          </div>
        </div>
      </template>
    </UiStateBlock>
  </div>
</template>
