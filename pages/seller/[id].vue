<script setup lang="ts">
import { sellerViewApi } from '~/services/api'
import type {
  SellerOrder,
  SellerOrderItem,
  SellerOrderHistoryEvent,
  SellerStatus,
  OrderTrackingEvent,
} from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { SELLER_STATUS, REVIEW_STATUS, sellerDisplayBadge, cancelStageLabel } from '~/utils/enums'
import { useToastStore } from '~/stores/toast'

// Seller order detail. Shows a friendly status (review status until approved,
// then the production timeline) plus the items with their mockups. Sellers can
// cancel the whole order or a single product inside it, ở bất kỳ khâu nào của
// vòng đời đơn: chưa sản xuất thì huỷ luôn và không mất tiền, đã sản xuất thì
// chỉ gửi được yêu cầu — vận hành duyệt, và đơn vẫn được tính tiền. No internal
// detail is exposed.
definePageMeta({ layout: 'seller' })

const route = useRoute()
const toast = useToastStore()
const id = route.params.id as string

const { data: order, loading, error, reload } = useApiResource<SellerOrder>(() =>
  sellerViewApi.order(id),
)
const items = computed(() => order.value?.items ?? [])

// Hành trình kiện hàng. Chỉ tải khi đơn thực sự có mã vận đơn — đơn còn đang sản
// xuất thì gọi cũng chỉ nhận về danh sách rỗng.
const journey = ref<OrderTrackingEvent[]>([])
const journeyLoading = ref(false)
async function loadJourney() {
  if (!order.value?.tracking_number) {
    journey.value = []
    return
  }
  journeyLoading.value = true
  try {
    const { data } = await sellerViewApi.trackingEvents(id)
    journey.value = data?.events ?? []
  } catch {
    // Hành trình chỉ là thông tin thêm; lỗi ở đây không được che mất đơn hàng.
    journey.value = []
  } finally {
    journeyLoading.value = false
  }
}
watch(() => order.value?.tracking_number, loadJourney, { immediate: true })

// Kiện đi quốc tế có thể có vài chục mốc quét, đẩy phần "Sản phẩm trong đơn"
// xuống tít dưới. Mặc định hiện 5 mốc MỚI NHẤT — thứ seller thực sự cần — và
// gấp phần còn lại lại.
const JOURNEY_PREVIEW = 5
const journeyExpanded = ref(false)
const journeyOverflow = computed(() => journey.value.length > JOURNEY_PREVIEW)
const visibleJourney = computed(() =>
  journeyExpanded.value || !journeyOverflow.value
    ? journey.value
    : journey.value.slice(0, JOURNEY_PREVIEW),
)
// Đơn khác có ít mốc hơn thì nút "Rút gọn" đang mở sẽ thành nút chết — đóng lại
// mỗi khi hành trình được nạp lại.
watch(journey, () => {
  journeyExpanded.value = false
})

// Thông tin người nhận — dữ liệu chính seller đã up lên. Trường lõi LUÔN hiện,
// trống thì '—': seller mở màn này khi khách hỏi "hàng giao tới đâu", nên phải
// phân biệt được "mình quên điền" với "màn này không hiện". IOSS chỉ hiện khi có
// (riêng đơn EU).
const recipientRows = computed<[string, string][]>(() => {
  const o = order.value
  if (!o) return []
  const dash = (v?: string) => (v ?? '').trim() || '—'
  const rows: [string, string][] = [
    ['Người nhận', dash(o.shipping_name)],
    ['Địa chỉ 1', dash(o.shipping_address1)],
    ['Địa chỉ 2', dash(o.shipping_address2)],
    ['Thành phố', dash(o.shipping_city)],
    ['Tỉnh/Bang', dash(o.shipping_province)],
    ['Mã bưu chính', dash(o.shipping_zip)],
    ['Quốc gia', dash(o.shipping_country)],
    ['Điện thoại', dash(o.shipping_phone)],
    ['Email', dash(o.shipping_email)],
  ]
  if (o.ioss?.trim()) rows.push(['IOSS', o.ioss.trim()])
  return rows
})

function fullAddress(o: SellerOrder): string {
  return [
    o.shipping_address1,
    o.shipping_address2,
    o.shipping_city,
    o.shipping_province,
    o.shipping_zip,
    o.shipping_country,
  ]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

async function copyAddress() {
  const o = order.value
  if (!o) return
  const text = fullAddress(o)
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Đã copy địa chỉ')
  } catch {
    toast.error('Không copy được — trình duyệt chặn clipboard')
  }
}

// Lịch sử đơn hàng: những gì xảy ra TRƯỚC khi đơn thành kiện hàng (duyệt, vào
// sản xuất, bàn giao, huỷ). Bổ sung cho hành trình vận chuyển bên dưới, vốn chỉ
// bắt đầu từ lúc hãng quét kiện lần đầu.
const history = ref<SellerOrderHistoryEvent[]>([])
const historyLoading = ref(false)
async function loadHistory() {
  historyLoading.value = true
  try {
    const { data } = await sellerViewApi.history(id)
    // Backend trả cũ → mới; timeline đọc tự nhiên nhất khi mới nhất nằm trên.
    history.value = [...(data ?? [])].reverse()
  } catch {
    // Lịch sử là thông tin thêm — hỏng thì im lặng, không che mất đơn hàng.
    history.value = []
  } finally {
    historyLoading.value = false
  }
}
onMounted(loadHistory)

const ACTOR_LABEL: Record<SellerOrderHistoryEvent['actor'], string> = {
  seller: 'Bạn',
  ops: 'Vận hành',
  system: 'Hệ thống',
}

// from/to được ghi bằng hai bộ enum khác nhau tuỳ khâu — `kind` từ backend cho
// biết tra bảng nào. Trạng thái lạ (đơn cũ, enum đã đổi) thì hiện nguyên văn còn
// hơn hiện rỗng.
function statusLabel(ev: SellerOrderHistoryEvent, raw?: string): string {
  if (!raw) return ''
  const map = ev.kind === 'review' ? REVIEW_STATUS : SELLER_STATUS
  return (map as Record<string, { label: string } | undefined>)[raw]?.label ?? raw
}

function historyTitle(ev: SellerOrderHistoryEvent): string {
  const to = statusLabel(ev, ev.to_status)
  const from = statusLabel(ev, ev.from_status)
  // Nhiều dòng ghi from == to (ví dụ "đơn được sửa"): đó không phải chuyển
  // trạng thái, nên đừng vẽ mũi tên A → A.
  if (!to || to === from) return from || to || 'Cập nhật đơn'
  return from ? `${from} → ${to}` : to
}

const STAGES: SellerStatus[] = ['PRODUCTION', 'PACKED', 'HANDED_OFF', 'SHIPPED', 'DELIVERED']
const isApproved = computed(() => order.value?.review_status === 'APPROVED')
const cancelled = computed(() => order.value?.review_status === 'CANCELLED')
const currentStep = computed(() => (order.value ? STAGES.indexOf(order.value.status) : -1))

// Quyền huỷ của từng sản phẩm do BE tính theo tiến độ của CHÍNH dòng đó, nên một
// sản phẩm chưa động tới trong đơn đã sản xuất một phần vẫn huỷ thẳng được. Với
// đơn cũ (API chưa trả cờ theo dòng) thì rơi về quyền ở cấp đơn.
function itemAction(it: SellerOrderItem): 'cancel' | 'request' | null {
  if (it.can_cancel) return 'cancel'
  if (it.can_request_cancellation) return 'request'
  if (it.can_cancel === undefined && it.can_request_cancellation === undefined) {
    return order.value?.can_cancel ? 'cancel' : order.value?.can_request_cancellation ? 'request' : null
  }
  return null
}
const anyItemActionable = computed(() => items.value.some((it) => itemAction(it) !== null))
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
// Huỷ ở đây có bị tính tiền không — lấy từ BE cho đúng phạm vi đang huỷ (cả đơn
// hay một sản phẩm), vì hai con số này có thể khác nhau.
const willBill = ref(false)
const saving = ref(false)

function openOrderCancel(m: 'cancel' | 'request') {
  mode.value = m
  target.value = null
  willBill.value = Boolean(order.value?.cancel_will_bill)
  open.value = true
}

function openItemCancel(it: SellerOrderItem) {
  const action = itemAction(it)
  if (!action) return
  const targetId = itemId(it)
  if (targetId === null) {
    toast.error('Không thể huỷ sản phẩm: API chưa trả về ID của dòng sản phẩm.')
    return
  }
  mode.value = action
  target.value = { id: targetId, label: it.product_name || it.sku_code }
  willBill.value = Boolean(it.cancel_will_bill ?? order.value?.cancel_will_bill)
  open.value = true
}

async function submit(reason: string) {
  if (saving.value) return
  saving.value = true
  const r = reason || undefined
  try {
    if (target.value) {
      if (mode.value === 'cancel') await sellerViewApi.cancelItem(id, target.value.id, r)
      else await sellerViewApi.requestItemCancellation(id, target.value.id, r)
      toast.success(mode.value === 'cancel' ? 'Đã huỷ sản phẩm' : 'Đã gửi yêu cầu huỷ sản phẩm')
    } else {
      if (mode.value === 'cancel') await sellerViewApi.cancel(id, r)
      else await sellerViewApi.requestCancellation(id, r)
      toast.success(mode.value === 'cancel' ? 'Đã huỷ đơn' : 'Đã gửi yêu cầu huỷ — chờ vận hành duyệt')
    }
    open.value = false
    // Huỷ đơn/sản phẩm ghi thêm một dòng lịch sử — nạp lại cả hai, nếu không
    // timeline đứng im ngay sau thao tác vừa làm.
    await Promise.all([reload(), loadHistory()])
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
              <!-- Mã nội bộ là thứ vận hành hỏi tới khi seller nhắn hỏi về đơn;
                   không hiện ra thì seller chỉ có mã của sàn để đối chiếu. -->
              <p class="mt-1 text-xs text-muted-foreground">
                Mã đơn hệ thống: <span class="font-mono text-foreground">{{ order.internal_code }}</span>
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
              <div v-if="order.can_cancel || order.can_request_cancellation" class="flex flex-col items-end gap-1">
                <div class="flex gap-2">
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
                <!-- Nói trước hậu quả, ngay cạnh cái nút, thay vì để đọc trong hoá đơn. -->
                <p v-if="order.cancel_will_bill" class="text-[11px] text-amber-600 dark:text-amber-400">
                  Đã vào sản xuất — huỷ vẫn tính tiền
                </p>
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
                <template v-if="order.cancel_billable">
                  Đơn đã vào sản xuất ({{ cancelStageLabel(order.cancel_stage) }}), nên <span class="font-semibold">nếu được duyệt huỷ thì phần này vẫn được tính vào hoá đơn</span>.
                </template>
              </p>
              <p v-if="order.cancellation_reason" class="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">
                Lý do bạn gửi: {{ order.cancellation_reason }}
              </p>
            </div>
          </div>

          <!-- Đã huỷ xong. Cảnh báo tính tiền lúc bấm nút là chưa đủ: người đọc màn
               này về sau (kể cả người khác trong shop) phải thấy được vì sao đơn đã
               huỷ mà vẫn có trong hoá đơn. -->
          <div
            v-else-if="cancelled"
            class="mt-4 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm"
            :class="order.cancel_billable
              ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
              : 'border-border bg-muted text-muted-foreground'"
          >
            <UiIcon :name="order.cancel_billable ? 'alert' : 'check'" :size="18" class="mt-0.5 shrink-0" />
            <div class="min-w-0">
              <p class="font-semibold">
                <template v-if="order.cancel_billable">Đơn đã huỷ — vẫn được tính tiền</template>
                <template v-else-if="order.cancel_stage">Đơn đã huỷ — không phát sinh chi phí</template>
                <!-- Đơn huỷ từ trước khi hệ thống ghi nhận khâu huỷ: không biết thì
                     không khẳng định, tránh hứa "miễn phí" cho một đơn từng sản xuất. -->
                <template v-else>Đơn đã huỷ</template>
              </p>
              <p
                v-if="order.cancel_stage"
                class="mt-0.5 text-xs"
                :class="order.cancel_billable ? 'text-amber-700/90 dark:text-amber-300/90' : ''"
              >
                <template v-if="order.cancel_billable">
                  Huỷ khi đơn {{ cancelStageLabel(order.cancel_stage).toLowerCase() }}. Nguyên vật liệu và công sản xuất đã bỏ ra
                  nên phần này vẫn nằm trong hoá đơn của bạn.
                </template>
                <template v-else>
                  Đơn được huỷ khi chưa vào sản xuất nên bạn không bị tính tiền.
                </template>
              </p>
              <dl class="mt-2 space-y-0.5 text-xs">
                <div v-if="order.cancellation_reason" class="flex gap-1.5">
                  <dt class="shrink-0 opacity-80">Lý do huỷ:</dt>
                  <dd class="min-w-0 break-words">{{ order.cancellation_reason }}</dd>
                </div>
                <div v-if="order.cancellation_resolution_note" class="flex gap-1.5">
                  <dt class="shrink-0 opacity-80">Vận hành ghi chú:</dt>
                  <dd class="min-w-0 break-words">{{ order.cancellation_resolution_note }}</dd>
                </div>
                <div v-if="order.cancellation_resolved_at" class="flex gap-1.5">
                  <dt class="shrink-0 opacity-80">Thời điểm huỷ:</dt>
                  <dd>{{ formatDateTime(order.cancellation_resolved_at) }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Yêu cầu huỷ bị từ chối: đơn CHẠY TIẾP. Không nói ra thì seller đinh
               ninh là đã huỷ và bỏ mặc một đơn vẫn đang được sản xuất. -->
          <div
            v-else-if="order.cancellation_status === 'REJECTED'"
            class="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
          >
            <UiIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
            <div class="min-w-0">
              <p class="font-semibold">Yêu cầu huỷ bị từ chối — đơn vẫn đang chạy</p>
              <p class="mt-0.5 text-xs opacity-90">
                Vận hành không duyệt huỷ, đơn tiếp tục sản xuất và giao như bình thường.
              </p>
              <p v-if="order.cancellation_resolution_note" class="mt-1 text-xs opacity-90">
                Lý do: {{ order.cancellation_resolution_note }}
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

          <!-- Review state banner (before production). Đơn đã huỷ không vào đây:
               banner huỷ ở trên đã nói đủ, kể cả chuyện tính tiền. -->
          <div v-if="!isApproved && !cancelled" class="mt-5 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            <template v-if="order.review_status === 'PENDING_REVIEW'">Đơn đang chờ được duyệt trước khi vào sản xuất.</template>
            <template v-else-if="order.review_status === 'NEEDS_CORRECTION'">Đơn cần bạn chỉnh sửa thông tin theo phản hồi ở trên.</template>
            <template v-else-if="order.review_status === 'REJECTED'">Đơn đã bị từ chối.</template>
            <template v-else>Trạng thái: {{ REVIEW_STATUS[order.review_status]?.label }}</template>
          </div>

          <!-- Production progress timeline (only once approved) -->
          <div v-else-if="isApproved" class="mt-6 flex items-center">
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

        <!-- Thông tin người nhận: đúng những gì seller đã up lên, từng trường
             một. Khách nhắn "sao hàng chưa tới" thì thứ seller cần xem đầu tiên
             là địa chỉ đã gửi đi có đúng không — trước đây phải hỏi CS. -->
        <div class="card mb-5 p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-foreground">Thông tin người nhận</h3>
            <button
              v-if="fullAddress(order)"
              class="text-xs font-medium text-primary hover:underline"
              @click="copyAddress"
            >
              Copy địa chỉ
            </button>
          </div>
          <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div v-for="[k, v] in recipientRows" :key="k" class="flex justify-between gap-3">
              <dt class="shrink-0 text-muted-foreground">{{ k }}</dt>
              <dd
                class="break-words text-right text-foreground"
                :class="k === 'Người nhận' ? 'font-medium' : ''"
              >
                {{ v }}
              </dd>
            </div>
          </dl>
          <!-- Phương thức vận chuyển seller YÊU CẦU trên file up lên — không phải
               hãng nào thực sự cầm kiện hàng. -->
          <dl v-if="order.shipping_method || order.note" class="mt-3 space-y-2 border-t border-border pt-3 text-sm">
            <div v-if="order.shipping_method" class="flex justify-between gap-3">
              <dt class="shrink-0 text-muted-foreground">Vận chuyển yêu cầu</dt>
              <dd class="text-right text-foreground">{{ order.shipping_method }}</dd>
            </div>
            <div v-if="order.note" class="flex justify-between gap-3">
              <dt class="shrink-0 text-muted-foreground">Ghi chú đơn</dt>
              <dd class="break-words text-right text-foreground">{{ order.note }}</dd>
            </div>
          </dl>
        </div>

        <!-- Vận chuyển: khi đơn đã có mã vận đơn thì seller theo dõi được kiện
             hàng ngay trên màn này, không phải hỏi CS. -->
        <div v-if="order.tracking_number" class="card mb-5 p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-foreground">Vận chuyển</h3>
            <!-- Bỏ khi badge ở đầu trang đã nói đúng điều này — cùng một câu in
                 hai lần trên một màn đọc ra như hai trạng thái khác nhau. -->
            <UiStatusBadge
              v-if="order.tracking_status && sellerDisplayBadge(order).kind !== 'tracking'"
              kind="tracking"
              :value="order.tracking_status"
            />
          </div>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-muted-foreground">Mã vận đơn</dt>
              <dd class="text-right font-mono font-medium text-foreground">{{ order.tracking_number }}</dd>
            </div>
            <div v-if="order.tracking_detail" class="flex justify-between gap-3">
              <dt class="shrink-0 text-muted-foreground">Cập nhật mới nhất</dt>
              <dd class="text-right text-foreground">{{ order.tracking_detail }}</dd>
            </div>
            <div v-if="order.tracking_location" class="flex justify-between gap-3">
              <dt class="shrink-0 text-muted-foreground">Vị trí</dt>
              <dd class="text-right text-foreground">{{ order.tracking_location }}</dd>
            </div>
          </dl>
          <!-- Không có link "xem trên trang vận chuyển": trang đó là của nhà
               cung cấp tracking và hiện đích danh hãng vận chuyển thật. Seller
               theo dõi kiện hàng bằng hành trình ngay bên dưới — cùng dữ liệu,
               nhưng đứng tên mình. -->

          <!-- Hành trình -->
          <div v-if="journey.length || journeyLoading" class="mt-4 border-t border-border pt-4">
            <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hành trình đơn hàng
            </h4>
            <div v-if="journeyLoading && !journey.length" class="flex justify-center py-3">
              <UiSpinner :size="18" />
            </div>
            <ol v-else class="space-y-3">
              <li v-for="(ev, idx) in visibleJourney" :key="ev.id" class="relative pl-5 text-sm">
                <span
                  class="absolute left-0 top-1.5 h-2 w-2 rounded-full"
                  :class="idx === 0 ? 'bg-primary' : 'bg-border'"
                />
                <span
                  v-if="idx < visibleJourney.length - 1"
                  class="absolute left-[3px] top-3.5 h-[calc(100%+0.25rem)] w-px bg-border"
                />
                <p :class="idx === 0 ? 'font-medium text-foreground' : 'text-foreground'">
                  {{ ev.description || '—' }}
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  <!-- raw_date giữ nguyên văn: hãng vận chuyển báo giờ địa phương
                       không kèm múi giờ, đổi định dạng là bịa ra một múi giờ. -->
                  {{ ev.raw_date || (ev.event_at ? formatDateTime(ev.event_at) : '') }}
                  <span v-if="ev.location"> · {{ ev.location }}</span>
                </p>
              </li>
            </ol>
            <button
              v-if="journeyOverflow"
              class="mt-3 text-xs font-medium text-primary hover:underline"
              @click="journeyExpanded = !journeyExpanded"
            >
              <template v-if="journeyExpanded">Rút gọn</template>
              <template v-else>Xem thêm {{ journey.length - JOURNEY_PREVIEW }} mốc</template>
            </button>
          </div>
        </div>

        <!-- Lịch sử đơn hàng: khối vận chuyển ở trên chỉ bắt đầu từ lúc hãng quét
             kiện lần đầu. Mọi thứ trước đó — duyệt, vào sản xuất, bàn giao, huỷ —
             nằm ở đây, để seller không phải nhắn hỏi "đơn của tôi đang ở đâu". -->
        <div v-if="history.length || historyLoading" class="card mb-5 p-5">
          <h3 class="mb-3 text-sm font-semibold text-foreground">Lịch sử đơn hàng</h3>
          <div v-if="historyLoading && !history.length" class="flex justify-center py-3">
            <UiSpinner :size="18" />
          </div>
          <ol v-else class="space-y-3">
            <li v-for="(ev, idx) in history" :key="`${ev.at}-${idx}`" class="relative pl-5 text-sm">
              <span
                class="absolute left-0 top-1.5 h-2 w-2 rounded-full"
                :class="idx === 0 ? 'bg-primary' : 'bg-border'"
              />
              <span
                v-if="idx < history.length - 1"
                class="absolute left-[3px] top-3.5 h-[calc(100%+0.25rem)] w-px bg-border"
              />
              <p :class="idx === 0 ? 'font-medium text-foreground' : 'text-foreground'">
                {{ historyTitle(ev) }}
              </p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ formatDateTime(ev.at) }} · {{ ACTOR_LABEL[ev.actor] }}
              </p>
              <p v-if="ev.note" class="mt-1 break-words rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {{ ev.note }}
              </p>
            </li>
          </ol>
        </div>

        <!-- Items -->
        <div class="card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-1 border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Sản phẩm trong đơn</h3>
            <p v-if="anyItemActionable" class="text-xs text-muted-foreground">
              Bạn có thể huỷ từng sản phẩm hoặc cả đơn — sản phẩm đã sản xuất thì cần vận hành duyệt.
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
                <!-- Huỷ lẻ một sản phẩm đã sản xuất cũng phát sinh tiền như huỷ cả đơn. -->
                <span
                  v-if="itemCancelled(it) && it.cancel_billable"
                  class="ml-1 mt-1 inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                  :title="`Huỷ khi sản phẩm ${cancelStageLabel(it.cancel_stage).toLowerCase()} — vẫn tính tiền`"
                >
                  Vẫn tính tiền
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
                v-if="itemAction(it) && itemId(it) !== null && !itemCancelled(it) && !itemPending(it)"
                class="shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium"
                :class="itemAction(it) === 'cancel'
                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10'
                  : 'border-border text-muted-foreground hover:bg-muted'"
                :title="it.cancel_will_bill ? 'Sản phẩm đã vào sản xuất — vận hành phải duyệt, và vẫn tính tiền' : undefined"
                @click="openItemCancel(it)"
              >
                {{ itemAction(it) === 'cancel' ? 'Huỷ' : 'Yêu cầu huỷ' }}
              </button>
              <span
                v-else-if="itemAction(it) && itemId(it) === null && !itemCancelled(it) && !itemPending(it)"
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

    <!-- Cancel / request dialog (whole order or a single product) -->
    <SellerCancelDialog
      v-model="open"
      :mode="mode"
      :will-bill="willBill"
      :order-code="order?.store_order_id"
      :item-label="target?.label"
      :saving="saving"
      @submit="submit"
    />
  </div>
</template>
