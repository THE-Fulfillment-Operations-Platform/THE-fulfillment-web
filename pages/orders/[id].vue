<script setup lang="ts">
import { ordersApi } from '~/services/api'
import type { UpdateOrderInput, EditOrderItemInput, UpdateTrackingInput } from '~/services/api'
import type { Order, OrderItem, Role, TrackingStatus } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { TRACKING_STATUS_OPTIONS } from '~/utils/enums'

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
  shipping_email: '',
  ioss: '',
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
  editForm.shipping_email = o.shipping_email ?? ''
  editForm.ioss = o.ioss ?? ''
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
      shipping_email: editForm.shipping_email,
      ioss: editForm.ioss,
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
const trackingForm = reactive<{
  tracking_number: string
  tracking_carrier: string
  tracking_status: TrackingStatus
  tracking_url: string
}>({
  tracking_number: '',
  tracking_carrier: '',
  tracking_status: 'NONE',
  tracking_url: '',
})

function openTracking() {
  const o = order.value
  if (!o) return
  trackingForm.tracking_number = o.tracking_number ?? ''
  trackingForm.tracking_carrier = o.tracking_carrier ?? ''
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
      tracking_carrier: trackingForm.tracking_carrier,
      tracking_status: trackingForm.tracking_status,
      tracking_url: trackingForm.tracking_url,
    }
    await ordersApi.updateTracking(o.id, body)
    toast.success('Đã cập nhật tracking')
    trackingOpen.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    savingTracking.value = false
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
              <!-- Production status is only meaningful once approved. -->
              <UiStatusBadge v-if="inProduction" kind="seller" :value="order.seller_status" />
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
                <button
                  v-if="canEditTracking"
                  class="text-xs font-medium text-primary hover:underline"
                  @click="openTracking"
                >
                  Cập nhật
                </button>
              </div>
              <template v-if="showTracking">
                <dl class="space-y-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="shrink-0 text-muted-foreground">Trạng thái</dt>
                    <dd><UiStatusBadge kind="tracking" :value="order.tracking_status" /></dd>
                  </div>
                  <div v-if="order.tracking_number" class="flex justify-between gap-3">
                    <dt class="shrink-0 text-muted-foreground">Mã vận đơn</dt>
                    <dd class="text-right font-mono font-medium text-foreground">{{ order.tracking_number }}</dd>
                  </div>
                  <div v-if="order.tracking_carrier" class="flex justify-between gap-3">
                    <dt class="shrink-0 text-muted-foreground">Đơn vị</dt>
                    <dd class="text-right font-medium text-foreground">{{ order.tracking_carrier }}</dd>
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
              </template>
              <p v-else class="text-sm text-muted-foreground">Chưa có thông tin tracking.</p>
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
                <label class="label">Email</label>
                <input v-model="editForm.shipping_email" type="email" class="input" />
              </div>
              <div>
                <label class="label">IOSS</label>
                <input v-model="editForm.ioss" class="input" />
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
              <label class="label">Đơn vị vận chuyển</label>
              <input v-model="trackingForm.tracking_carrier" class="input" placeholder="VD: USPS, GHN…" />
            </div>
            <div>
              <label class="label">Link tracking</label>
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
