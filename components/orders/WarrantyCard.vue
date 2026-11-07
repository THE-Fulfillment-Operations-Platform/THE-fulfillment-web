<script setup lang="ts">
// Nút "Bảo hành" + form + các dòng liên kết đơn gốc / đơn con (#3092).
// Bấm = tạo ĐƠN MỚI vào "Chờ duyệt"; đơn đang xem giữ nguyên trạng thái.
// Ai bấm được, đơn nào bấm được, chặn bấm đúp: backend quyết (warranty-info),
// màn này chỉ hiện đúng điều backend nói.
import { ordersApi } from '~/services/api'
import type { CreateWarrantyInput } from '~/services/api'
import type {
  Order,
  OrderItem,
  WarrantyEntry,
  WarrantyInfo,
  WarrantyReason,
} from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import WarrantyBadge from '~/components/orders/WarrantyBadge.vue'

const props = defineProps<{ order: Order; items: OrderItem[] }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const auth = useAuthStore()
const toast = useToastStore()

const REASONS: { value: WarrantyReason; label: string }[] = [
  { value: 'SHIPPING_DAMAGE', label: 'Vỡ do vận chuyển' },
  { value: 'WRONG_ITEM', label: 'Sai hàng' },
  { value: 'MISSING_ITEM', label: 'Thiếu hàng' },
  { value: 'OTHER', label: 'Khác (ghi chú)' },
]
const reasonLabel = (r?: string) => REASONS.find((x) => x.value === r)?.label ?? r ?? ''

// Hỏi backend ai bấm được (WarrantyPolicy.AllowedRoles); vai trò ngoài danh sách
// nhận can_warranty=false kèm lý do. Seller không vào màn này.
const mayAsk = computed(() => !!auth.user && auth.user.role !== 'SELLER' && auth.can('orders.view'))
const info = ref<WarrantyInfo | null>(null)
const children = ref<WarrantyEntry[]>([])
const showChildren = ref(false)
const loadingChildren = ref(false)

async function loadInfo() {
  info.value = null
  if (!mayAsk.value) return
  try {
    info.value = (await ordersApi.warrantyInfo(props.order.id)).data
  } catch {
    info.value = null
  }
}
async function loadChildren() {
  if (!(props.order.warranty_count ?? 0)) {
    children.value = []
    return
  }
  loadingChildren.value = true
  try {
    children.value = (await ordersApi.warranties(props.order.id)).data
  } catch {
    children.value = []
  } finally {
    loadingChildren.value = false
  }
}
watch(
  () => [props.order.id, props.order.warranty_count],
  () => {
    void loadInfo()
    if (showChildren.value) void loadChildren()
  },
  { immediate: true },
)
async function toggleChildren() {
  showChildren.value = !showChildren.value
  if (showChildren.value) await loadChildren()
}

// ---- Form ------------------------------------------------------------------
const open = ref(false)
const saving = ref(false)
const form = reactive({
  reason: '' as WarrantyReason | '',
  reason_note: '',
  scope: 'FULL' as 'FULL' | 'PARTIAL',
  keepAddress: true,
  shipping_name: '',
  shipping_address1: '',
  shipping_address2: '',
  shipping_city: '',
  shipping_province: '',
  shipping_zip: '',
  shipping_country: '',
  shipping_phone: '',
})
const picks = ref<{ item: OrderItem; on: boolean; qty: number }[]>([])

function openForm() {
  const o = props.order
  form.reason = '' // bắt buộc chọn, không đặt mặc định
  form.reason_note = ''
  form.scope = 'FULL'
  form.keepAddress = true
  form.shipping_name = o.shipping_name ?? ''
  form.shipping_address1 = o.shipping_address1 ?? ''
  form.shipping_address2 = o.shipping_address2 ?? ''
  form.shipping_city = o.shipping_city ?? ''
  form.shipping_province = o.shipping_province ?? ''
  form.shipping_zip = o.shipping_zip ?? ''
  form.shipping_country = o.shipping_country ?? ''
  form.shipping_phone = o.shipping_phone ?? ''
  picks.value = props.items.map((it) => ({ item: it, on: true, qty: it.quantity ?? 1 }))
  open.value = true
}

const noteMissing = computed(() => form.reason === 'OTHER' && !form.reason_note.trim())
const nothingPicked = computed(() => form.scope === 'PARTIAL' && !picks.value.some((p) => p.on))
const badQty = computed(
  () =>
    form.scope === 'PARTIAL' &&
    picks.value.some((p) => p.on && !(p.qty >= 1 && p.qty <= (p.item.quantity ?? 1))),
)
const canSubmit = computed(() => !saving.value && !!form.reason && !noteMissing.value && !nothingPicked.value && !badQty.value)

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    const body: CreateWarrantyInput = {
      reason: form.reason as WarrantyReason,
      reason_note: form.reason_note.trim(),
    }
    if (form.scope === 'PARTIAL') {
      body.items = picks.value.filter((p) => p.on).map((p) => ({ item_id: p.item.id, quantity: p.qty }))
    }
    if (!form.keepAddress) {
      body.address = {
        shipping_name: form.shipping_name,
        shipping_address1: form.shipping_address1,
        shipping_address2: form.shipping_address2,
        shipping_city: form.shipping_city,
        shipping_province: form.shipping_province,
        shipping_zip: form.shipping_zip,
        shipping_country: form.shipping_country,
        shipping_phone: form.shipping_phone,
      }
    }
    const created = (await ordersApi.createWarranty(props.order.id, body)).data
    toast.success(`Đã tạo đơn bảo hành ${created.store_order_id} — đang chờ duyệt`)
    open.value = false
    emit('changed')
    await navigateTo(`/orders/${created.id}`)
  } catch (e) {
    toast.error(errorMessage(e))
    void loadInfo() // có thể vừa bị người khác bấm trước: cập nhật lại nút
  } finally {
    saving.value = false
  }
}

// Đi từ nút "Bảo hành" ở danh sách Orders/Items (?baohanh=1): mở thẳng form, rồi
// bỏ tham số khỏi URL để F5 không bật lại. Backend vẫn là bên quyết (info.can_warranty).
const route = useRoute()
const router = useRouter()
let autoOpened = false
watch(info, (v) => {
  if (autoOpened || !v || route.query.baohanh !== '1') return
  autoOpened = true
  if (v.can_warranty) openForm()
  else toast.info(v.reason || 'Đơn này chưa bảo hành được')
  void router.replace({ query: { ...route.query, baohanh: undefined } })
})

const visible = computed(
  () =>
    (props.order.warranty_seq ?? 0) > 0 ||
    (props.order.warranty_count ?? 0) > 0 ||
    info.value?.can_warranty ||
    // Đơn chưa bàn giao cũng hiện thẻ (nút mờ + lý do + gợi ý QC fail → Làm lại)
    // để người dùng biết nút ở đâu và vì sao chưa bấm được.
    (!!info.value?.role_allowed && !!info.value.reason && props.order.review_status === 'APPROVED' &&
      !['SELLER', 'APPROVED'].includes(props.order.cancellation_status ?? '')),
)
// Đơn đã xuất kho / bàn giao thì bảo hành được; chưa thì chỉ hiện gợi ý làm lại.
const isHandedOverOrder = computed(() =>
  ['HANDED_OFF', 'SHIPPED', 'DELIVERED'].includes(props.order.seller_status),
)
// Nút "Bảo hành" nằm ở thanh nút đầu trang chi tiết đơn (pages/orders/[id].vue):
// trang cha đọc `info` và gọi `openForm` qua ref; form vẫn chỉ có MỘT bản ở đây.
defineExpose({ info, openForm })
</script>

<template>
  <div v-if="visible" class="card mb-5 p-4">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <!-- Đơn con: badge + link về đơn gốc / đơn vừa bảo hành -->
      <div v-if="(order.warranty_seq ?? 0) > 0" class="flex flex-wrap items-center gap-2 text-sm">
        <WarrantyBadge :seq="order.warranty_seq" />
        <span class="text-muted-foreground">Đơn bảo hành của</span>
        <NuxtLink
          v-if="order.root_order_id"
          :to="`/orders/${order.root_order_id}`"
          class="font-medium text-primary hover:underline"
        >
          đơn gốc
        </NuxtLink>
        <template v-if="order.parent_order_id && order.parent_order_id !== order.root_order_id">
          <span class="text-muted-foreground">·</span>
          <NuxtLink :to="`/orders/${order.parent_order_id}`" class="font-medium text-primary hover:underline">
            đơn vừa bảo hành
          </NuxtLink>
        </template>
      </div>

      <!-- Đơn cũ: "Đã bảo hành ×N" -->
      <button
        v-if="(order.warranty_count ?? 0) > 0"
        type="button"
        class="text-sm font-medium text-orange-700 hover:underline dark:text-orange-300"
        @click="toggleChildren"
      >
        Đã bảo hành ×{{ order.warranty_count }}
        <span class="text-xs text-muted-foreground">({{ showChildren ? 'ẩn' : 'xem các đơn' }})</span>
      </button>

      <div class="ml-auto flex items-center gap-2">
        <span v-if="info?.role_allowed && !info.can_warranty && info.reason" class="text-xs text-muted-foreground">
          {{ info.reason }}
          <NuxtLink v-if="info.blocking" :to="`/orders/${info.blocking.id}`" class="text-primary hover:underline">
            Xem {{ info.blocking.store_order_id }}
          </NuxtLink>
        </span>
      </div>
    </div>

    <p v-if="info?.role_allowed && !isHandedOverOrder && !info.can_warranty" class="mt-2 text-xs text-muted-foreground">
      Hàng hỏng khi sản xuất: dùng <strong>QC fail → Làm lại</strong> ở màn QC (hoặc “Làm lại tại chỗ” nếu đã in lẻ), không cần tạo đơn bảo hành.
    </p>
    <p v-if="info?.can_warranty && info.blocking" class="mt-2 text-xs text-amber-700 dark:text-amber-300">
      Đơn {{ info.blocking.store_order_id }} đang bảo hành, chưa giao — chỉ Owner được tạo thêm.
    </p>

    <!-- Các đơn bảo hành con -->
    <div v-if="showChildren" class="mt-3 border-t border-border pt-3">
      <UiSpinner v-if="loadingChildren" :size="16" />
      <ul v-else class="space-y-1.5 text-sm">
        <li v-for="e in children" :key="e.order.id" class="flex flex-wrap items-center gap-2">
          <WarrantyBadge :seq="e.order.warranty_seq" />
          <NuxtLink :to="`/orders/${e.order.id}`" class="font-medium text-primary hover:underline">
            {{ e.order.store_order_id }}
          </NuxtLink>
          <span class="text-muted-foreground">{{ e.order.internal_code }}</span>
          <UiStatusBadge
            v-if="e.order.review_status && e.order.review_status !== 'APPROVED'"
            kind="review"
            :value="e.order.review_status"
          />
          <UiStatusBadge v-else kind="seller" :value="e.order.seller_status" />
          <span v-if="e.warranty" class="text-xs text-muted-foreground">
            {{ reasonLabel(e.warranty.reason) }}
            <template v-if="e.warranty.scope === 'PARTIAL'"> · một phần</template>
          </span>
        </li>
      </ul>
    </div>

    <UiModal v-model="open" title="Bảo hành đơn" wide>
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Tạo đơn mới <span class="font-medium text-foreground">{{ info?.next_store_order_id }}</span>
          vào <span class="font-medium text-foreground">Chờ duyệt</span>. Đơn
          <span class="font-medium text-foreground">{{ order.store_order_id }}</span> giữ nguyên trạng thái.
          <span v-if="info?.bill_seller" class="text-amber-700 dark:text-amber-300">Đơn này tính tiền seller.</span>
          <span v-else>Không tính tiền seller (kể cả phí ship).</span>
        </p>

        <div>
          <label class="label">Lý do *</label>
          <UiSelect v-model="form.reason" :options="REASONS" placeholder="Chọn lý do…" aria-label="Lý do bảo hành" />
        </div>
        <div>
          <label class="label">Ghi chú {{ form.reason === 'OTHER' ? '*' : '' }}</label>
          <textarea v-model="form.reason_note" class="input" rows="2" maxlength="900" />
        </div>

        <div>
          <label class="label">Gửi lại</label>
          <div class="flex gap-4 text-sm">
            <label class="flex items-center gap-1.5"><input v-model="form.scope" type="radio" value="FULL" /> Toàn bộ</label>
            <label class="flex items-center gap-1.5"><input v-model="form.scope" type="radio" value="PARTIAL" /> Một phần</label>
          </div>
          <div v-if="form.scope === 'PARTIAL'" class="mt-2 space-y-1.5 rounded-md border border-border p-2">
            <div v-for="p in picks" :key="p.item.id" class="flex items-center gap-2 text-sm">
              <input v-model="p.on" type="checkbox" class="h-4 w-4 rounded border-border" />
              <span class="min-w-0 flex-1 truncate">{{ p.item.internal_code }} · {{ p.item.sku_code }}</span>
              <input
                v-model.number="p.qty"
                type="number"
                min="1"
                :max="p.item.quantity ?? 1"
                class="input w-20"
                :disabled="!p.on"
                :aria-label="`Số lượng ${p.item.internal_code}`"
              />
              <span class="text-xs text-muted-foreground">/ {{ p.item.quantity ?? 1 }}</span>
            </div>
            <p v-if="nothingPicked" class="text-xs text-rose-600">Chọn ít nhất một sản phẩm.</p>
            <p v-if="badQty" class="text-xs text-rose-600">Số lượng phải từ 1 đến số lượng của dòng.</p>
          </div>
        </div>

        <div>
          <label class="label">Địa chỉ</label>
          <div class="flex gap-4 text-sm">
            <label class="flex items-center gap-1.5"><input v-model="form.keepAddress" type="radio" :value="true" /> Giữ địa chỉ cũ</label>
            <label class="flex items-center gap-1.5"><input v-model="form.keepAddress" type="radio" :value="false" /> Sửa địa chỉ</label>
          </div>
          <div v-if="!form.keepAddress" class="mt-2 grid gap-2 sm:grid-cols-2">
            <input v-model="form.shipping_name" class="input" placeholder="Người nhận" />
            <input v-model="form.shipping_phone" class="input" placeholder="Điện thoại" />
            <input v-model="form.shipping_address1" class="input sm:col-span-2" placeholder="Địa chỉ 1" />
            <input v-model="form.shipping_address2" class="input sm:col-span-2" placeholder="Địa chỉ 2" />
            <input v-model="form.shipping_city" class="input" placeholder="Thành phố" />
            <input v-model="form.shipping_province" class="input" placeholder="Tỉnh/Bang" />
            <input v-model="form.shipping_zip" class="input" placeholder="Mã bưu chính" />
            <input v-model="form.shipping_country" class="input" placeholder="Quốc gia" />
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Đóng</button>
        <button class="btn-primary" :disabled="!canSubmit" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> Tạo đơn bảo hành
        </button>
      </template>
    </UiModal>
  </div>
</template>
