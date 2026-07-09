<script setup lang="ts">
import { sellerViewApi } from '~/services/api'
import type { SellerOrder, SellerStatus } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { SELLER_STATUS, REVIEW_STATUS, sellerDisplayBadge } from '~/utils/enums'
import { useToastStore } from '~/stores/toast'

// Seller order detail. Shows a friendly status (review status until approved,
// then the production timeline) plus the items with their mockups. Sellers can
// cancel a pending-review order directly or request cancellation of an approved
// (not-yet-in-production) order. No internal/production detail is exposed.
definePageMeta({ layout: 'seller' })

const route = useRoute()
const toast = useToastStore()
const id = route.params.id as string

const { data: order, loading, error, reload } = useApiResource<SellerOrder>(() =>
  sellerViewApi.order(id),
)
const items = computed(() => order.value?.items ?? [])

const STAGES: SellerStatus[] = ['PRODUCTION', 'PACKED', 'HANDED_OFF', 'SHIPPED']
const isApproved = computed(() => order.value?.review_status === 'APPROVED')
const currentStep = computed(() => (order.value ? STAGES.indexOf(order.value.status) : -1))

// Cancellation
const open = ref(false)
const mode = ref<'cancel' | 'request'>('cancel')
const reason = ref('')
const saving = ref(false)

function openCancel(m: 'cancel' | 'request') {
  mode.value = m
  reason.value = ''
  open.value = true
}

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    if (mode.value === 'cancel') await sellerViewApi.cancel(id, reason.value.trim() || undefined)
    else await sellerViewApi.requestCancellation(id, reason.value.trim() || undefined)
    toast.success(mode.value === 'cancel' ? 'Đã huỷ đơn' : 'Đã gửi yêu cầu huỷ')
    open.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
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
            <div class="flex flex-col items-end gap-2">
              <div class="flex flex-wrap items-center justify-end gap-1.5">
                <UiStatusBadge :kind="sellerDisplayBadge(order).kind" :value="sellerDisplayBadge(order).value" />
                <span
                  v-if="order.cancellation_status === 'REQUESTED'"
                  class="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                >
                  <UiIcon name="alert" :size="10" /> Chờ xử lý huỷ
                </span>
              </div>
              <div v-if="order.can_cancel || order.can_request_cancellation" class="flex gap-2">
                <button
                  v-if="order.can_cancel"
                  class="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  @click="openCancel('cancel')"
                >
                  Huỷ đơn
                </button>
                <button
                  v-if="order.can_request_cancellation"
                  class="btn-secondary text-xs"
                  @click="openCancel('request')"
                >
                  Yêu cầu huỷ
                </button>
              </div>
            </div>
          </div>

          <!-- Pending cancellation request — shown in ANY state (incl. in-production) so it isn't forgotten -->
          <div
            v-if="order.cancellation_status === 'REQUESTED'"
            class="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <UiIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">Yêu cầu huỷ đang chờ vận hành xử lý</p>
              <p class="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                Bạn đã yêu cầu huỷ đơn này. Đơn vẫn tiếp tục ở trạng thái hiện tại cho tới khi vận hành duyệt huỷ — theo dõi để không bỏ sót.
              </p>
            </div>
          </div>

          <!-- Needs-correction / rejected note -->
          <div
            v-if="(order.review_status === 'NEEDS_CORRECTION' || order.review_status === 'REJECTED') && order.review_note"
            class="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <span class="font-medium">Phản hồi từ vận hành:</span> {{ order.review_note }}
          </div>

          <!-- Review state banner (before production) -->
          <div v-if="!isApproved" class="mt-5 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            <template v-if="order.review_status === 'PENDING_REVIEW'">Đơn đang chờ được duyệt trước khi vào sản xuất.</template>
            <template v-else-if="order.review_status === 'NEEDS_CORRECTION'">Đơn cần bạn chỉnh sửa thông tin theo phản hồi ở trên.</template>
            <template v-else-if="order.review_status === 'REJECTED'">Đơn đã bị từ chối.</template>
            <template v-else-if="order.review_status === 'CANCELLED'">Đơn đã được huỷ.</template>
            <template v-else>Trạng thái: {{ REVIEW_STATUS[order.review_status]?.label }}</template>
          </div>

          <!-- Production progress timeline (only once approved) -->
          <div v-else class="mt-6 flex items-center">
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

    <!-- Cancel / request modal -->
    <UiModal v-model="open" :title="mode === 'cancel' ? 'Huỷ đơn hàng' : 'Yêu cầu huỷ đơn'">
      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">
          <template v-if="mode === 'cancel'">Bạn chắc chắn muốn huỷ đơn <span class="font-medium text-foreground">{{ order?.store_order_id }}</span>? Thao tác này không thể hoàn tác.</template>
          <template v-else>Gửi yêu cầu huỷ đơn <span class="font-medium text-foreground">{{ order?.store_order_id }}</span>. Vận hành sẽ xem xét và phản hồi.</template>
        </p>
        <div>
          <label class="label">Lý do (tuỳ chọn)</label>
          <textarea v-model="reason" rows="3" class="input" placeholder="Nhập lý do huỷ…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Đóng</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> {{ mode === 'cancel' ? 'Xác nhận huỷ' : 'Gửi yêu cầu' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
