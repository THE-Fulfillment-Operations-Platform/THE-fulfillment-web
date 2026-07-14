<script setup lang="ts">
import { sellerViewApi } from '~/services/api'
import type { SellerOrder, SellerOrderItem, SellerStatus } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { SELLER_STATUS, REVIEW_STATUS, sellerDisplayBadge } from '~/utils/enums'
import { useToastStore } from '~/stores/toast'

// Seller order detail. Shows a friendly status (review status until approved,
// then the production timeline) plus the items with their mockups. Sellers can
// cancel the whole order or a single product inside it: while the order is still
// in the import/review flow the removal is immediate; once approved or in
// production it becomes a request ops must approve. No internal detail is exposed.
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

// Per-item cancellation mirrors the whole-order rules: a still-cancellable order
// (import/review flow) removes the product outright; an approved/in-production
// order turns it into a request ops must approve. Null = order is locked
// (shipped/resolved) and no per-item action is offered.
const itemAction = computed<'cancel' | 'request' | null>(() =>
  order.value?.can_cancel ? 'cancel' : order.value?.can_request_cancellation ? 'request' : null,
)
function itemCancelled(it: SellerOrderItem) {
  return it.cancellation_status === 'SELLER_CANCELLED' || it.cancellation_status === 'APPROVED'
}
function itemPending(it: SellerOrderItem) {
  return it.cancellation_status === 'REQUESTED'
}
function itemId(it: SellerOrderItem): number | null {
  const value = it.id ?? it.item_id
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
const cancelledCount = computed(() => items.value.filter(itemCancelled).length)

// Cancellation modal. target = null cancels the whole order; otherwise it targets
// a single product (id + a friendly label for the confirmation copy).
const open = ref(false)
const mode = ref<'cancel' | 'request'>('cancel')
const target = ref<{ id: number; label: string } | null>(null)
const reason = ref('')
const saving = ref(false)

const modalTitle = computed(() => {
  if (target.value) return mode.value === 'cancel' ? 'Huỷ sản phẩm' : 'Yêu cầu huỷ sản phẩm'
  return mode.value === 'cancel' ? 'Huỷ đơn hàng' : 'Yêu cầu huỷ đơn'
})

function openOrderCancel(m: 'cancel' | 'request') {
  mode.value = m
  target.value = null
  reason.value = ''
  open.value = true
}

function openItemCancel(it: SellerOrderItem) {
  if (!itemAction.value) return
  const targetId = itemId(it)
  if (targetId === null) {
    toast.error('Không thể huỷ sản phẩm: API chưa trả về ID của dòng sản phẩm.')
    return
  }
  mode.value = itemAction.value
  target.value = { id: targetId, label: it.product_name || it.sku_code }
  reason.value = ''
  open.value = true
}

async function submit() {
  if (saving.value) return
  saving.value = true
  const r = reason.value.trim() || undefined
  try {
    if (target.value) {
      if (mode.value === 'cancel') await sellerViewApi.cancelItem(id, target.value.id, r)
      else await sellerViewApi.requestItemCancellation(id, target.value.id, r)
      toast.success(mode.value === 'cancel' ? 'Đã huỷ sản phẩm' : 'Đã gửi yêu cầu huỷ sản phẩm')
    } else {
      if (mode.value === 'cancel') await sellerViewApi.cancel(id, r)
      else await sellerViewApi.requestCancellation(id, r)
      toast.success(mode.value === 'cancel' ? 'Đã huỷ đơn' : 'Đã gửi yêu cầu huỷ')
    }
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
                {{ order.store_name || '—' }} · {{ order.item_count }} sản phẩm còn lại<span v-if="cancelledCount" class="text-rose-500 dark:text-rose-300"> · {{ cancelledCount }} đã huỷ</span> · {{ formatDateTime(order.created_at) }}
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
                  @click="openOrderCancel('cancel')"
                >
                  Huỷ cả đơn
                </button>
                <button
                  v-if="order.can_request_cancellation"
                  class="btn-secondary text-xs"
                  @click="openOrderCancel('request')"
                >
                  Yêu cầu huỷ cả đơn
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
          <div class="flex flex-wrap items-center justify-between gap-1 border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Sản phẩm trong đơn</h3>
            <p v-if="itemAction" class="text-xs text-muted-foreground">
              {{ itemAction === 'cancel' ? 'Bạn có thể huỷ từng sản phẩm hoặc cả đơn.' : 'Bạn có thể yêu cầu huỷ từng sản phẩm hoặc cả đơn.' }}
            </p>
          </div>
          <div class="divide-y divide-border">
            <div
              v-for="it in items"
              :key="itemId(it) ?? `${it.sku_code}-${it.variant_code ?? ''}`"
              class="flex items-center gap-3 px-4 py-3 sm:gap-4"
              :class="itemCancelled(it) && 'opacity-60'"
            >
              <img
                v-if="it.mockup_url"
                :src="it.mockup_url"
                :alt="it.sku_code"
                loading="lazy"
                class="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                :class="itemCancelled(it) && 'grayscale'"
              />
              <div v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <UiIcon name="box" :size="22" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-foreground" :class="itemCancelled(it) && 'line-through'">
                  {{ it.product_name || it.sku_code }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ it.sku_code }}<span v-if="it.variant_code"> · {{ it.variant_code }}</span>
                </p>
                <!-- Per-item cancellation state -->
                <span
                  v-if="itemCancelled(it)"
                  class="mt-1 inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"
                >
                  <UiIcon name="close" :size="10" /> Đã huỷ
                </span>
                <span
                  v-else-if="itemPending(it)"
                  class="mt-1 inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                >
                  <UiIcon name="alert" :size="10" /> Chờ xử lý huỷ
                </span>
              </div>
              <div class="shrink-0 text-sm font-medium text-foreground">x{{ it.quantity }}</div>
              <UiMockupLink :url="it.mockup_url" small label="Xem mockup" />
              <!-- Per-item cancel / request action -->
              <button
                v-if="itemAction && itemId(it) !== null && !itemCancelled(it) && !itemPending(it)"
                class="shrink-0 rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                @click="openItemCancel(it)"
              >
                {{ itemAction === 'cancel' ? 'Huỷ' : 'Yêu cầu huỷ' }}
              </button>
              <span
                v-else-if="itemAction && itemId(it) === null && !itemCancelled(it) && !itemPending(it)"
                class="shrink-0 text-xs text-amber-600"
                title="API cần trả id hoặc item_id cho từng dòng sản phẩm"
              >
                Thiếu ID sản phẩm
              </span>
            </div>
            <p v-if="!items.length" class="px-4 py-8 text-center text-sm text-muted-foreground">
              Không có chi tiết sản phẩm.
            </p>
          </div>
        </div>
      </template>
    </UiStateBlock>

    <!-- Cancel / request modal (whole order or a single product) -->
    <UiModal v-model="open" :title="modalTitle">
      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">
          <template v-if="target">
            <template v-if="mode === 'cancel'">Bạn chắc chắn muốn huỷ sản phẩm <span class="font-medium text-foreground">{{ target.label }}</span> khỏi đơn <span class="font-medium text-foreground">{{ order?.store_order_id }}</span>? Các sản phẩm còn lại vẫn được giữ. Thao tác này không thể hoàn tác.</template>
            <template v-else>Gửi yêu cầu huỷ sản phẩm <span class="font-medium text-foreground">{{ target.label }}</span> trong đơn <span class="font-medium text-foreground">{{ order?.store_order_id }}</span>. Vận hành sẽ xem xét và phản hồi.</template>
          </template>
          <template v-else>
            <template v-if="mode === 'cancel'">Bạn chắc chắn muốn huỷ toàn bộ đơn <span class="font-medium text-foreground">{{ order?.store_order_id }}</span> (tất cả sản phẩm bên trong)? Thao tác này không thể hoàn tác.</template>
            <template v-else>Gửi yêu cầu huỷ toàn bộ đơn <span class="font-medium text-foreground">{{ order?.store_order_id }}</span>. Vận hành sẽ xem xét và phản hồi.</template>
          </template>
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
