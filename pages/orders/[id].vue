<script setup lang="ts">
import { ordersApi, trackingApi } from '~/services/api'
import type { UpdateOrderInput, EditOrderItemInput, UpdateTrackingInput } from '~/services/api'
import type { Order, OrderItem, OrderTrackingEvent, Role, TrackingStatus } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { refreshActionCounts } from '~/composables/useActionCounts'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import {
  TRACKING_STATUS_OPTIONS,
  cancelStageLabel,
  isHandedOver,
  orderStatusBadge,
  orderInternalStatus,
} from '~/utils/enums'

const route = useRoute()
const id = route.params.id as string
const auth = useAuthStore()
const toast = useToastStore()

const { data: order, loading, error, reload } = useApiResource<Order>(() => ordersApi.get(id))

// This is an operational detail view. Cancelled lines remain in the database
// for audit, but must not appear as work that Design/Production still owns.
const items = computed<OrderItem[]>(() =>
  (order.value?.items ?? []).filter(
    (item) => item.cancellation_status !== 'SELLER_CANCELLED' && item.cancellation_status !== 'APPROVED',
  ),
)

// The seller/production status only means something once the order is APPROVED.
// While it is pending / rejected / cancelled, showing "Đang sản xuất" alongside
// "Từ chối" is contradictory — so we gate the production UI on review state.
const reviewStatus = computed(() => order.value?.review_status)
const inProduction = computed(() => reviewStatus.value === 'APPROVED')
const reviewDead = computed(
  () => reviewStatus.value === 'REJECTED' || reviewStatus.value === 'CANCELLED',
)

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

// Trường lõi của người nhận LUÔN hiện, trống thì '—'. Lọc bỏ trường trống như
// bản cũ khiến ops không phân biệt được "seller không up" với "màn này không
// hiện" — mà thiếu Địa chỉ 2 / ZIP là đơn bị hãng trả về. IOSS thì ngược lại,
// chỉ đơn EU mới có nên chỉ hiện khi có.
const shippingRows = computed<[string, string][]>(() => {
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
  ]
  return rows
})

// ---- Role gating (UX only — the backend enforces the real guard) -----------
const can = (roles: Role[]) => !!auth.role && roles.includes(auth.role)
const canEdit = computed(() => can(['OWNER', 'ADMIN', 'OPS']))
const canCancel = computed(() => can(['OWNER', 'ADMIN', 'OPS']))
const canDelete = computed(() => can(['OWNER', 'ADMIN']))
const canEditTracking = computed(() => can(['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING']))
const hasActions = computed(
  () => canEdit.value || canCancel.value || canDelete.value || canEditTracking.value,
)

// ---- Edit order ------------------------------------------------------------
interface EditItemForm {
  id: number
  sku_code: string
  quantity: number
  design_url: string
  back_design_url: string
  engrave_text: string
}
const editOpen = ref(false)
const savingEdit = ref(false)
const editForm = reactive({
  store_name: '',
  note: '',
  shipping_name: '',
  shipping_address1: '',
  shipping_address2: '',
  shipping_city: '',
  shipping_province: '',
  shipping_zip: '',
  shipping_country: '',
  shipping_phone: '',
})
const editItems = ref<EditItemForm[]>([])

function openEdit() {
  const o = order.value
  if (!o) return
  editForm.store_name = o.store_name ?? ''
  editForm.note = o.note ?? ''
  editForm.shipping_name = o.shipping_name ?? ''
  editForm.shipping_address1 = o.shipping_address1 ?? ''
  editForm.shipping_address2 = o.shipping_address2 ?? ''
  editForm.shipping_city = o.shipping_city ?? ''
  editForm.shipping_province = o.shipping_province ?? ''
  editForm.shipping_zip = o.shipping_zip ?? ''
  editForm.shipping_country = o.shipping_country ?? ''
  editForm.shipping_phone = o.shipping_phone ?? ''
  // `items` already excludes seller-cancelled / approved-cancellation lines.
  editItems.value = items.value.map((it) => ({
    id: it.id,
    sku_code: it.sku_code ?? '',
    quantity: it.quantity ?? 1,
    design_url: it.design_url ?? '',
    back_design_url: it.back_design_url ?? '',
    engrave_text: it.engrave_text ?? '',
  }))
  editOpen.value = true
}

async function submitEdit() {
  if (savingEdit.value) return
  const o = order.value
  if (!o) return
  // Client-side guard so an obvious mistake gets an instant Vietnamese message.
  if (editItems.value.some((it) => !(it.quantity >= 1))) {
    toast.error('Số lượng mỗi sản phẩm phải lớn hơn hoặc bằng 1.')
    return
  }
  savingEdit.value = true
  try {
    const body: UpdateOrderInput = {
      store_name: editForm.store_name,
      note: editForm.note,
      shipping_name: editForm.shipping_name,
      shipping_address1: editForm.shipping_address1,
      shipping_address2: editForm.shipping_address2,
      shipping_city: editForm.shipping_city,
      shipping_province: editForm.shipping_province,
      shipping_zip: editForm.shipping_zip,
      shipping_country: editForm.shipping_country,
      shipping_phone: editForm.shipping_phone,
      items: editItems.value.map<EditOrderItemInput>((it) => ({
        id: it.id,
        sku_code: it.sku_code,
        quantity: it.quantity,
        design_url: it.design_url,
        back_design_url: it.back_design_url,
        engrave_text: it.engrave_text,
      })),
    }
    await ordersApi.update(o.id, body)
    toast.success('Đã lưu đơn')
    editOpen.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    savingEdit.value = false
  }
}

// ---- Cancel order (reason required) ----------------------------------------
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelling = ref(false)

// Huỷ đơn đã có công sản xuất thì khách vẫn bị tính tiền — nói ra trong hộp
// thoại, vì người bấm ở đây là vận hành chứ không phải người trả tiền. Cùng một
// luật với bên seller; BE mới là nơi chốt con số ghi vào đơn.
const cancelWillBill = computed(() => {
  const o = order.value
  if (!o) return false
  // Đã đóng gói / bàn giao / gửi đi thì hàng chắc chắn đã làm xong.
  if (o.seller_status !== 'PRODUCTION') return true
  return items.value.some((it) => it.internal_status !== 'PENDING' || (it.batch_items?.length ?? 0) > 0)
})

function openCancel() {
  cancelReason.value = ''
  cancelOpen.value = true
}

async function submitCancel() {
  if (cancelling.value) return
  const o = order.value
  if (!o) return
  const reason = cancelReason.value.trim()
  if (!reason) {
    toast.error('Vui lòng nhập lý do huỷ đơn.')
    return
  }
  cancelling.value = true
  try {
    await ordersApi.cancel(o.id, reason)
    toast.success('Đã huỷ đơn')
    cancelOpen.value = false
    await reload()
    // Huỷ một đơn đang chờ duyệt là bớt một việc trong hàng chờ; nếu đơn đó còn
    // yêu cầu huỷ chưa xử lý thì bớt cả ở badge kia.
    void refreshActionCounts()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cancelling.value = false
  }
}

// ---- Delete order ----------------------------------------------------------
const deleting = ref(false)
async function onDelete() {
  const o = order.value
  if (!o || deleting.value) return
  const ok = await useConfirm().confirm({
    title: 'Xoá đơn',
    message: `Xoá vĩnh viễn đơn ${o.internal_code}? Hành động này không thể hoàn tác.`,
    tone: 'danger',
    confirmText: 'Xoá',
  })
  if (!ok) return
  deleting.value = true
  try {
    await ordersApi.remove(o.id)
    toast.success('Đã xoá đơn')
    void refreshActionCounts()
    await navigateTo('/orders')
  } catch (e) {
    toast.error(errorMessage(e))
    deleting.value = false
  }
}

// ---- Tracking --------------------------------------------------------------
const showTracking = computed(
  () => !!order.value?.tracking_status && order.value.tracking_status !== 'NONE',
)
const trackingStatusOptions = TRACKING_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
const trackingOpen = ref(false)
const savingTracking = ref(false)
// Không có ô "đơn vị vận chuyển": THE là đơn vị vận chuyển đứng tên với seller,
// nên tên hãng thật không được nhập ở đâu cả — nhập được là sẽ có ngày lọt ra
// màn seller.
const trackingForm = reactive<{
  tracking_number: string
  tracking_status: TrackingStatus
  tracking_url: string
}>({
  tracking_number: '',
  tracking_status: 'NONE',
  tracking_url: '',
})

function openTracking() {
  const o = order.value
  if (!o) return
  trackingForm.tracking_number = o.tracking_number ?? ''
  trackingForm.tracking_status = o.tracking_status ?? 'NONE'
  trackingForm.tracking_url = o.tracking_url ?? ''
  trackingOpen.value = true
}

async function submitTracking() {
  if (savingTracking.value) return
  const o = order.value
  if (!o) return
  savingTracking.value = true
  try {
    const body: UpdateTrackingInput = {
      tracking_number: trackingForm.tracking_number,
      tracking_status: trackingForm.tracking_status,
      tracking_url: trackingForm.tracking_url,
    }
    await ordersApi.updateTracking(o.id, body)
    toast.success('Đã cập nhật tracking')
    trackingOpen.value = false
    await reload()
    await loadJourney()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    savingTracking.value = false
  }
}

// ---- Shipment journey (24hTrack) -------------------------------------------
// The journey is stored on our side by the provider sync, so opening an order
// never calls the provider — only the explicit "Đồng bộ" button does.
const journey = ref<OrderTrackingEvent[]>([])
const journeyEnabled = ref(false)
const journeyLoading = ref(false)
const syncingTracking = ref(false)

// Hành trình chỉ bắt đầu sau khi kiện hàng được bàn giao cho THE (màn Đóng gói).
// Trước đó kiện chưa tồn tại với hãng vận chuyển nên không có gì để tra.
const handedOver = computed(() => isHandedOver(order.value?.seller_status))

// Trạng thái hiển thị ở header, theo luật chung (xem orderStatusBadge). Đây là
// màn NỘI BỘ nên có truyền khâu sản xuất: người trong xưởng đọc "Đã cắt", còn
// seller mở đơn đó chỉ đọc "Đang sản xuất". Từ lúc bàn giao trở đi hai bên nhìn
// thấy y hệt nhau.
const headerStatus = computed(() =>
  orderStatusBadge(order.value ?? {}, orderInternalStatus(items.value)),
)

async function loadJourney() {
  journeyLoading.value = true
  try {
    const { data } = await trackingApi.events(id)
    journey.value = data?.events ?? []
    journeyEnabled.value = !!data?.enabled
  } catch {
    // A missing journey must never break the order screen; the tracking card
    // still shows the status we already hold.
    journey.value = []
  } finally {
    journeyLoading.value = false
  }
}
onMounted(loadJourney)

// Pulls this one order from the provider. For an order with no tracking number
// it also asks 24hTrack whether a parcel is registered under its store order id.
async function syncTracking() {
  if (syncingTracking.value) return
  syncingTracking.value = true
  try {
    await trackingApi.syncOrder(id)
    await reload()
    await loadJourney()
    toast.success('Đã đồng bộ với 24hTrack')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    syncingTracking.value = false
  }
}
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
                <template v-if="order.daily_seq != null">
                  <span class="mx-2 text-muted-foreground">·</span>
                  STT ngày: <span class="font-medium text-foreground">{{ order.daily_seq }}</span>
                </template>
              </p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <UiStatusBadge v-if="order.review_status && order.review_status !== 'APPROVED'" kind="review" :value="order.review_status" />
              <UiStatusBadge v-if="order.cancellation_status === 'REQUESTED'" kind="cancellation" :value="order.cancellation_status" />
              <!-- Đơn huỷ mà vẫn phải xuất hoá đơn: dán ngay cạnh trạng thái, kèm
                   khâu bị huỷ, để kế toán không phải tra lại lịch sử. -->
              <span
                v-if="order.cancel_billable"
                class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                title="Đơn bị huỷ sau khi đã sản xuất — vẫn tính tiền khách"
              >
                Huỷ · vẫn tính tiền
                <span class="font-normal opacity-80">({{ cancelStageLabel(order.cancel_stage) }})</span>
              </span>
              <!-- Production status is only meaningful once approved. Đi qua
                   orderStatusBadge nên khi kiện đã lên đường, badge này nói
                   đúng chỗ kiện đang đứng ("Đang vận chuyển") thay vì dừng ở
                   "Đã gửi đi" trong khi khối Tracking ngay dưới nói khác. -->
              <UiStatusBadge
                v-if="inProduction"
                :kind="headerStatus.kind"
                :value="headerStatus.value"
              />
            </div>
          </div>

          <!-- Actions (YC7) — visibility mirrors backend role guards; server re-checks. -->
          <div v-if="hasActions" class="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              v-if="canEdit"
              class="btn-secondary"
              :disabled="reviewDead"
              :title="reviewDead ? 'Đơn đã huỷ / từ chối — không thể sửa.' : ''"
              @click="openEdit"
            >
              <UiIcon name="design" :size="16" /> Sửa đơn
            </button>
            <button
              v-if="canEditTracking"
              class="btn-secondary"
              @click="openTracking"
            >
              <UiIcon name="shipping" :size="16" /> Cập nhật tracking
            </button>
            <button
              v-if="canCancel"
              class="btn-secondary"
              :disabled="reviewDead"
              :title="reviewDead ? 'Đơn đã huỷ / từ chối.' : ''"
              @click="openCancel"
            >
              <UiIcon name="close" :size="16" /> Huỷ đơn
            </button>
            <button
              v-if="canDelete"
              class="btn-danger"
              :disabled="deleting"
              @click="onDelete"
            >
              <UiSpinner v-if="deleting" :size="16" />
              <UiIcon v-else name="alert" :size="16" /> Xoá đơn
            </button>
          </div>

          <!-- Rejected / cancelled → dead order, no production timeline. -->
          <div
            v-if="reviewDead"
            class="mt-5 rounded-lg border border-rose-200/60 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {{ reviewStatus === 'REJECTED' ? 'Đơn đã bị từ chối — không vào sản xuất.' : 'Đơn đã bị huỷ.' }}
            <span v-if="order.review_note" class="text-rose-600/80 dark:text-rose-300/80">· {{ order.review_note }}</span>
          </div>
          <!-- Pending review → not in production yet. -->
          <div
            v-else-if="!inProduction"
            class="mt-5 rounded-lg border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
          >
            Đơn đang chờ duyệt — chưa vào sản xuất.
          </div>
          <!-- Approved → production timeline. -->
          <div v-else class="mt-5 flex flex-wrap items-center gap-1">
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

            <!-- Tracking (YC8) -->
            <div class="card p-4">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold text-foreground">Vận chuyển / Tracking</h3>
                <div class="flex items-center gap-3">
                  <button
                    v-if="canEditTracking && journeyEnabled"
                    class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    :disabled="syncingTracking || !handedOver"
                    :title="
                      handedOver
                        ? 'Lấy trạng thái và hành trình mới nhất'
                        : 'Đơn chưa bàn giao cho THE nên chưa có hành trình'
                    "
                    @click="syncTracking"
                  >
                    <UiSpinner v-if="syncingTracking" :size="12" />
                    Tra tracking
                  </button>
                  <button
                    v-if="canEditTracking"
                    class="text-xs font-medium text-primary hover:underline"
                    @click="openTracking"
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
              <template v-if="showTracking">
                <dl class="space-y-2 text-sm">
                  <!-- Chỉ hiện khi badge ở header ĐANG KHÔNG nói chính điều này.
                       Đơn bình thường: header đã là "Đang vận chuyển", lặp lại ở
                       đây chỉ khiến người đọc tưởng có hai trạng thái. Đơn bị
                       huỷ/từ chối: header bị trạng thái duyệt chiếm chỗ, lúc đó
                       dòng này là nơi DUY NHẤT nói kiện hàng đang ở đâu — bỏ hẳn
                       là mất dấu một kiện vẫn đang bay. -->
                  <div
                    v-if="headerStatus.kind !== 'tracking'"
                    class="flex items-center justify-between gap-3"
                  >
                    <dt class="shrink-0 text-muted-foreground">Trạng thái</dt>
                    <dd><UiStatusBadge kind="tracking" :value="order.tracking_status" /></dd>
                  </div>
                  <div v-if="order.tracking_number" class="flex justify-between gap-3">
                    <dt class="shrink-0 text-muted-foreground">Mã vận đơn</dt>
                    <dd class="text-right font-mono font-medium text-foreground">{{ order.tracking_number }}</dd>
                  </div>
                  <div v-if="order.tracking_detail" class="flex justify-between gap-3">
                    <dt class="shrink-0 text-muted-foreground">Chi tiết</dt>
                    <dd class="text-right text-foreground">{{ order.tracking_detail }}</dd>
                  </div>
                  <div v-if="order.tracking_location" class="flex justify-between gap-3">
                    <dt class="shrink-0 text-muted-foreground">Vị trí</dt>
                    <dd class="text-right text-foreground">{{ order.tracking_location }}</dd>
                  </div>
                </dl>
                <a
                  v-if="order.tracking_url"
                  :href="order.tracking_url"
                  target="_blank"
                  rel="noopener"
                  class="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <UiIcon name="link" :size="14" /> Mở tracking
                </a>
                <p v-if="order.tracking_updated_at" class="mt-3 text-xs text-muted-foreground">
                  Cập nhật lúc {{ formatDateTime(order.tracking_updated_at) }}
                </p>
                <p v-if="order.tracking_sync_error" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  24hTrack: {{ order.tracking_sync_error }}
                </p>
              </template>
              <template v-else>
                <p class="text-sm text-muted-foreground">Chưa có thông tin tracking.</p>
                <!-- Without a tracking number the sync becomes a lookup: it asks
                     24hTrack whether a parcel is tagged with this store order id. -->
                <button
                  v-if="canEditTracking && journeyEnabled"
                  class="btn-secondary mt-3 w-full"
                  :disabled="syncingTracking || !handedOver"
                  :title="
                    handedOver
                      ? 'Tra xem đã có mã vận đơn nào gắn với mã đơn này chưa'
                      : 'Đơn chưa bàn giao cho THE nên chưa có hành trình'
                  "
                  @click="syncTracking"
                >
                  <UiSpinner v-if="syncingTracking" :size="16" />
                  Tra tracking
                </button>
                <p v-if="canEditTracking && journeyEnabled && !handedOver" class="mt-2 text-xs text-muted-foreground">
                  Hành trình bắt đầu được lấy sau khi bàn giao cho THE ở màn Đóng gói.
                </p>
              </template>
            </div>

            <!-- Shipment journey, mirrored from 24hTrack by the periodic sync -->
            <div v-if="journey.length || journeyLoading" class="card p-4">
              <h3 class="mb-3 text-sm font-semibold text-foreground">Hành trình đơn hàng</h3>
              <div v-if="journeyLoading && !journey.length" class="flex justify-center py-4">
                <UiSpinner :size="20" />
              </div>
              <ol v-else class="space-y-3">
                <li
                  v-for="(ev, idx) in journey"
                  :key="ev.id"
                  class="relative pl-5 text-sm"
                >
                  <!-- Dot + connector: the newest scan is the highlighted one. -->
                  <span
                    class="absolute left-0 top-1.5 h-2 w-2 rounded-full"
                    :class="idx === 0 ? 'bg-primary' : 'bg-border'"
                  />
                  <span
                    v-if="idx < journey.length - 1"
                    class="absolute left-[3px] top-3.5 h-[calc(100%+0.25rem)] w-px bg-border"
                  />
                  <p :class="idx === 0 ? 'font-medium text-foreground' : 'text-foreground'">
                    {{ ev.description || '—' }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    <!-- raw_date is shown verbatim: scans report local facility
                         time with no timezone, so reformatting would invent one. -->
                    {{ ev.raw_date || (ev.event_at ? formatDateTime(ev.event_at) : '') }}
                    <span v-if="ev.location"> · {{ ev.location }}</span>
                  </p>
                </li>
              </ol>
            </div>

            <NuxtLink
              :to="`/notes?entity_type=ORDER&entity_id=${order.id}`"
              class="btn-secondary w-full"
            >
              <UiIcon name="notes" :size="16" /> Notes liên quan
            </NuxtLink>
          </div>
        </div>

        <!-- Edit order (YC7) -->
        <UiModal v-model="editOpen" title="Sửa đơn" wide>
          <div class="space-y-5">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="label">Store name</label>
                <input v-model="editForm.store_name" class="input" placeholder="Tên store" />
              </div>
              <div>
                <label class="label">Người nhận</label>
                <input v-model="editForm.shipping_name" class="input" />
              </div>
              <div>
                <label class="label">Điện thoại</label>
                <input v-model="editForm.shipping_phone" class="input" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Địa chỉ 1</label>
                <input v-model="editForm.shipping_address1" class="input" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Địa chỉ 2</label>
                <input v-model="editForm.shipping_address2" class="input" />
              </div>
              <div>
                <label class="label">Thành phố</label>
                <input v-model="editForm.shipping_city" class="input" />
              </div>
              <div>
                <label class="label">Tỉnh/Bang</label>
                <input v-model="editForm.shipping_province" class="input" />
              </div>
              <div>
                <label class="label">Mã bưu chính</label>
                <input v-model="editForm.shipping_zip" class="input" />
              </div>
              <div>
                <label class="label">Quốc gia</label>
                <input v-model="editForm.shipping_country" class="input" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Note xưởng</label>
                <textarea v-model="editForm.note" class="input" rows="2" />
              </div>
            </div>

            <div>
              <h4 class="mb-2 text-sm font-semibold text-foreground">Sản phẩm ({{ editItems.length }})</h4>
              <div class="space-y-3">
                <div v-for="it in editItems" :key="it.id" class="rounded-lg border border-border p-3">
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label class="label">SKU</label>
                      <input v-model="it.sku_code" class="input" />
                    </div>
                    <div>
                      <label class="label">Số lượng *</label>
                      <input v-model.number="it.quantity" type="number" min="1" class="input" />
                    </div>
                    <div>
                      <label class="label">Design (mặt trước)</label>
                      <input v-model="it.design_url" class="input" placeholder="https://…" />
                    </div>
                    <div>
                      <label class="label">Design (mặt sau)</label>
                      <input v-model="it.back_design_url" class="input" placeholder="https://…" />
                    </div>
                    <div class="sm:col-span-2">
                      <label class="label">Khắc chữ</label>
                      <input v-model="it.engrave_text" class="input" />
                    </div>
                  </div>
                  <p v-if="!(it.quantity >= 1)" class="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    Số lượng phải lớn hơn hoặc bằng 1.
                  </p>
                </div>
                <p v-if="!editItems.length" class="text-sm text-muted-foreground">Không có sản phẩm nào để sửa.</p>
              </div>
            </div>
          </div>
          <template #footer>
            <button class="btn-secondary" @click="editOpen = false">Huỷ</button>
            <button class="btn-primary" :disabled="savingEdit" @click="submitEdit">
              <UiSpinner v-if="savingEdit" :size="16" /> Lưu
            </button>
          </template>
        </UiModal>

        <!-- Cancel order (YC7) -->
        <UiModal v-model="cancelOpen" title="Huỷ đơn">
          <div class="space-y-3">
            <div
              v-if="cancelWillBill"
              class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <UiIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
              <div>
                <p class="font-semibold">Đơn đã vào sản xuất — huỷ vẫn tính tiền khách</p>
                <p class="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                  Toàn bộ sản phẩm trong đơn sẽ bị rút khỏi design, batch, QC và đóng gói.
                </p>
              </div>
            </div>
            <p class="text-sm text-muted-foreground">
              Nhập lý do huỷ đơn <span class="font-medium text-foreground">{{ order.internal_code }}</span>. Lý do là bắt buộc.
            </p>
            <div>
              <label class="label">Lý do huỷ *</label>
              <textarea v-model="cancelReason" class="input" rows="3" placeholder="Ví dụ: khách yêu cầu huỷ…" />
            </div>
          </div>
          <template #footer>
            <button class="btn-secondary" @click="cancelOpen = false">Đóng</button>
            <button class="btn-danger" :disabled="cancelling || !cancelReason.trim()" @click="submitCancel">
              <UiSpinner v-if="cancelling" :size="16" /> Huỷ đơn
            </button>
          </template>
        </UiModal>

        <!-- Tracking update (YC8) -->
        <UiModal v-model="trackingOpen" title="Cập nhật tracking">
          <div class="space-y-4">
            <div>
              <label class="label">Trạng thái</label>
              <UiSelect v-model="trackingForm.tracking_status" :options="trackingStatusOptions" aria-label="Trạng thái tracking" />
            </div>
            <div>
              <label class="label">Mã vận đơn</label>
              <input v-model="trackingForm.tracking_number" class="input" placeholder="VD: LP123456789VN" />
            </div>
            <div>
              <!-- Link nội bộ, KHÔNG gửi sang màn seller: nó dẫn tới trang của
                   nhà cung cấp tracking, mở ra là thấy hãng vận chuyển thật. -->
              <label class="label">Link tracking (nội bộ)</label>
              <input v-model="trackingForm.tracking_url" class="input" placeholder="https://…" />
            </div>
          </div>
          <template #footer>
            <button class="btn-secondary" @click="trackingOpen = false">Huỷ</button>
            <button class="btn-primary" :disabled="savingTracking" @click="submitTracking">
              <UiSpinner v-if="savingTracking" :size="16" /> Lưu
            </button>
          </template>
        </UiModal>
      </template>
    </UiStateBlock>
  </div>
</template>
