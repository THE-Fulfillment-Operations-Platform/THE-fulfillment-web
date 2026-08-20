<script setup lang="ts">
import { ordersApi, trackingApi } from '~/services/api'
import type { UpdateTrackingInput } from '~/services/api'
import type { Order, OrderTrackingEvent } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { liveItemQty } from '~/utils/item'
import { isHandedOver, orderStatusBadge, orderInternalStatus } from '~/utils/enums'

// CS là quyền nội bộ nên được đọc khâu sản xuất khi hàng còn ở xưởng; từ lúc
// kiện lên đường thì badge chuyển sang trạng thái vận chuyển, giống hệt seller.
const rowStatus = (o: Order) => orderStatusBadge(o, orderInternalStatus(o.items))

// Tra cứu CS — màn làm việc của chăm sóc khách hàng, dựng đúng theo luồng thật:
//
//   seller up đơn (kèm đầy đủ thông tin người nhận)
//     → CS tra orderID / tên khách để biết đơn nào là đơn nào
//     → CS gắn mã vận đơn lấy từ hãng vận chuyển
//     → hệ thống chạy qua 24hTrack lấy hành trình, hiện cho seller và mọi vai trò
//
// Vì thế tất cả nằm trên MỘT màn: tìm bên trái, mở ra là thấy full thông tin
// người nhận + ô nhập mã vận đơn + hành trình. CS không phải nhảy sang màn khác
// giữa lúc đang nói chuyện với khách.

const auth = useAuthStore()
const toast = useToastStore()

const filters = reactive({ q: '', scope: 'all' as 'all' | 'missing' | 'has', page: 1, page_size: 20 })

// has_tracking chỉ gửi khi CS thực sự chọn lọc: gửi false mặc định sẽ biến màn
// này thành "chỉ đơn chưa có mã", che mất đơn khách đang hỏi.
const hasTrackingParam = computed(() =>
  filters.scope === 'missing' ? false : filters.scope === 'has' ? true : undefined,
)

const { data, meta, loading, error, reload } = useApiResource<Order[]>(() =>
  ordersApi.list({
    search: filters.q.trim() || undefined,
    has_tracking: hasTrackingParam.value,
    page: filters.page,
    page_size: filters.page_size,
  }),
)
const orders = computed<Order[]>(() => data.value ?? [])

function applyFilters() {
  filters.page = 1
  reload()
}
function changePage(p: number) {
  filters.page = p
  reload()
}
function changePageSize(size: number) {
  filters.page_size = size
  filters.page = 1
  reload()
}
function pickScope(scope: 'all' | 'missing' | 'has') {
  filters.scope = scope
  applyFilters()
}
function resetSearch() {
  filters.q = ''
  filters.scope = 'all'
  applyFilters()
}

// ---- Đơn đang mở ------------------------------------------------------------
// Chọn một đơn là mở panel chi tiết bên phải: full thông tin người nhận (thứ CS
// cần đọc cho khách), mã vận đơn, và hành trình.
const selectedId = ref<number | null>(null)
const selected = computed(() => orders.value.find((o) => o.id === selectedId.value) ?? null)
const journey = ref<OrderTrackingEvent[]>([])
const journeyEnabled = ref(false)
const journeyLoading = ref(false)

async function selectOrder(o: Order) {
  selectedId.value = o.id
  trackingForm.tracking_number = o.tracking_number ?? ''
  await loadJourney(o.id)
}

async function loadJourney(orderId: number) {
  journeyLoading.value = true
  journey.value = []
  try {
    const { data: res } = await trackingApi.events(orderId)
    journey.value = res?.events ?? []
    journeyEnabled.value = !!res?.enabled
  } catch {
    // Hành trình hỏng không được làm sập màn tra cứu — thông tin người nhận vẫn
    // là thứ CS cần nhất.
    journey.value = []
  } finally {
    journeyLoading.value = false
  }
}

// Khi danh sách được nạp lại (sau khi lưu mã vận đơn) thì đơn đang mở cũng phải
// mất trạng thái cũ, nếu không CS đọc lại đúng con số vừa sửa.
watch(orders, (rows) => {
  if (selectedId.value && !rows.some((o) => o.id === selectedId.value)) {
    selectedId.value = null
    journey.value = []
  }
})

// ---- Gắn mã vận đơn ---------------------------------------------------------
const canEditTracking = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING', 'CS'].includes(auth.role ?? ''),
)
const trackingForm = reactive({ tracking_number: '' })
const saving = ref(false)
const syncing = ref(false)

const trackingChanged = computed(
  () =>
    !!selected.value &&
    trackingForm.tracking_number.trim() !== (selected.value.tracking_number ?? '').trim(),
)

// Hành trình chỉ bắt đầu sau khi xưởng bấm "Bàn giao cho THE" ở màn Đóng gói:
// trước đó kiện hàng chưa tồn tại với hãng vận chuyển nên không có gì để tra.
// CS vẫn lưu được mã vận đơn từ trước — chỉ việc gọi hãng là phải chờ.
const handedOver = computed(() => isHandedOver(selected.value?.seller_status))

// Lưu mã vận đơn. Backend tự đăng ký mã này lên 24hTrack (gắn kèm store order
// id) rồi kéo trạng thái + hành trình về, nên CS chỉ cần dán mã và bấm lưu.
async function saveTracking() {
  const o = selected.value
  if (!o || saving.value) return
  const number = trackingForm.tracking_number.trim()
  if (!number) {
    toast.error('Chưa nhập mã vận đơn')
    return
  }
  const old = (o.tracking_number ?? '').trim()

  // Thay mã trên đơn ĐÃ có mã là chuyện khác hẳn với điền lần đầu: kiện cũ bị bỏ
  // theo dõi, hành trình đang hiện sẽ được thay bằng hành trình của kiện mới.
  // Hỏi lại một câu vì thao tác này seller cũng nhìn thấy.
  if (old && old !== number) {
    const ok = await useConfirm().confirm({
      title: 'Đổi mã vận đơn',
      message: `Đơn này đang theo dõi mã ${old}. Đổi sang ${number}? Hành trình sẽ chuyển sang kiện mới; hành trình của mã cũ được lưu lại nhưng không hiển thị nữa.`,
      confirmText: 'Đổi mã',
      tone: 'warning',
    })
    if (!ok) return
  }

  saving.value = true
  try {
    const body: UpdateTrackingInput = { tracking_number: number }
    await ordersApi.updateTracking(o.id, body)
    toast.success('Đã gắn mã vận đơn — hệ thống đang lấy hành trình từ 24hTrack')
    await reload()
    await loadJourney(o.id)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

// Đơn chưa có mã: hỏi thẳng 24hTrack xem có kiện nào gắn store order id này
// chưa. Đơn đã có mã: kéo hành trình mới nhất về.
async function syncTracking() {
  const o = selected.value
  if (!o || syncing.value) return
  syncing.value = true
  try {
    await trackingApi.syncOrder(o.id)
    await reload()
    await loadJourney(o.id)
    toast.success('Đã đồng bộ với 24hTrack')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    syncing.value = false
  }
}

// Địa chỉ giao gộp thành một khối đọc được thành tiếng cho khách / copy một phát.
function fullAddress(o: Order): string {
  return [o.shipping_address1, o.shipping_address2, o.shipping_city, o.shipping_province, o.shipping_zip, o.shipping_country]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

// ...nhưng bản gộp KHÔNG đủ để CS nhập lại lên site hãng vận chuyển (address
// line 2, state, ZIP là các ô riêng) và không cho biết trường nào trống thật.
// Nên hiện thêm đủ từng trường rời; các trường lõi luôn hiện, trống thì '—'.
const recipientRows = computed<[string, string][]>(() => {
  const o = selected.value
  if (!o) return []
  const dash = (v?: string) => (v ?? '').trim() || '—'
  const rows: [string, string][] = [
    ['Địa chỉ 1', dash(o.shipping_address1)],
    ['Địa chỉ 2', dash(o.shipping_address2)],
    ['Thành phố', dash(o.shipping_city)],
    ['Tỉnh/Bang', dash(o.shipping_province)],
    ['Mã bưu chính', dash(o.shipping_zip)],
    ['Quốc gia', dash(o.shipping_country)],
  ]
  return rows
})

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Đã copy ${label}`)
  } catch {
    toast.error('Trình duyệt không cho copy')
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Tra cứu CS"
      subtitle="Tìm đơn theo mã đơn hoặc tên khách, xem thông tin người nhận và gắn mã vận đơn"
    >
      <template #actions>
        <button class="btn-secondary" @click="reload">
          <UiIcon name="refresh" :size="16" /> Làm mới
        </button>
      </template>
    </PageHeader>

    <!-- Ô tìm kiếm: một dòng, khớp mọi thứ khách có thể đọc qua điện thoại. -->
    <div class="card mb-4 p-4">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-center" @submit.prevent="applyFilters">
        <div class="relative flex-1">
          <UiIcon
            name="search"
            :size="16"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="filters.q"
            class="input pl-9"
            placeholder="Mã đơn (ETSY-1234), mã vận đơn, tên người nhận, SĐT hoặc email…"
            autofocus
          />
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn-primary" :disabled="loading">
            <UiSpinner v-if="loading" :size="16" />
            <UiIcon v-else name="search" :size="16" />
            Tìm
          </button>
          <button type="button" class="btn-secondary" @click="resetSearch">Xoá lọc</button>
        </div>
      </form>

      <!-- Hàng đợi của CS: đơn nào còn thiếu mã vận đơn. -->
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="opt in [
            { key: 'all', label: 'Tất cả đơn' },
            { key: 'missing', label: 'Chưa có mã vận đơn' },
            { key: 'has', label: 'Đã có mã vận đơn' },
          ]"
          :key="opt.key"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="
            filters.scope === opt.key
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          "
          @click="pickScope(opt.key as 'all' | 'missing' | 'has')"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <!-- Kết quả tìm kiếm -->
      <div class="card overflow-hidden">
        <UiStateBlock
          :loading="loading"
          :error="error"
          :empty="!loading && !error && orders.length === 0"
          empty-text="Không tìm thấy đơn nào khớp. Thử mã đơn của shop hoặc tên người nhận."
          @retry="reload"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-muted">
                <tr>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">Người nhận</th>
                  <th class="table-th">Mã vận đơn</th>
                  <th class="table-th">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="o in orders"
                  :key="o.id"
                  class="cursor-pointer transition-colors hover:bg-muted/60"
                  :class="o.id === selectedId ? 'bg-muted' : ''"
                  @click="selectOrder(o)"
                >
                  <td class="table-td">
                    <div class="font-medium text-foreground">{{ o.store_order_id }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ o.internal_code }}
                      <span v-if="liveItemQty(o.items)"> · {{ liveItemQty(o.items) }} sp</span>
                    </div>
                  </td>
                  <td class="table-td">
                    <div class="text-foreground">{{ o.shipping_name || '—' }}</div>
                    <div class="text-xs text-muted-foreground">{{ o.shipping_city || '' }}</div>
                  </td>
                  <td class="table-td font-mono text-xs">
                    <span v-if="o.tracking_number">{{ o.tracking_number }}</span>
                    <span v-else class="text-muted-foreground">chưa có</span>
                  </td>
                  <td class="table-td">
                    <UiStatusBadge :kind="rowStatus(o).kind" :value="rowStatus(o).value" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <UiPagination
            :meta="meta"
            :page-size="filters.page_size"
            @change="changePage"
            @update:page-size="changePageSize"
          />
        </UiStateBlock>
      </div>

      <!-- Panel chi tiết: mọi thứ CS cần khi đang nói chuyện với khách -->
      <div class="space-y-4">
        <div v-if="!selected" class="card p-6 text-center text-sm text-muted-foreground">
          Chọn một đơn ở danh sách để xem thông tin người nhận và gắn mã vận đơn.
        </div>

        <template v-else>
          <div class="card p-4">
            <div class="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 class="text-sm font-semibold text-foreground">{{ selected.store_order_id }}</h3>
                <p class="text-xs text-muted-foreground">
                  {{ selected.internal_code }}
                  <span v-if="selected.store_name"> · {{ selected.store_name }}</span>
                </p>
              </div>
              <!-- Badge lớn = trạng thái hiện hành của đơn (xem orderStatusBadge):
                   đã lên đường thì nói chỗ kiện đang đứng, đó là thứ khách đang
                   hỏi. Trạng thái sản xuất vẫn xuống dòng riêng bên dưới để
                   không mất thông tin. -->
              <UiStatusBadge :kind="rowStatus(selected).kind" :value="rowStatus(selected).value" />
            </div>

            <!-- Thông tin người nhận: đúng thứ seller đã up lên, không cắt bớt. -->
            <dl class="space-y-2 text-sm">
              <div
                v-if="selected.tracking_status && selected.tracking_status !== 'NONE'"
                class="flex items-center justify-between gap-3"
              >
                <dt class="shrink-0 text-muted-foreground">Sản xuất</dt>
                <dd><UiStatusBadge kind="seller" :value="selected.seller_status" /></dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Người nhận</dt>
                <dd class="text-right font-medium text-foreground">{{ selected.shipping_name || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Điện thoại</dt>
                <dd class="text-right text-foreground">
                  <button
                    v-if="selected.shipping_phone"
                    class="hover:underline"
                    @click="copy(selected.shipping_phone!, 'số điện thoại')"
                  >
                    {{ selected.shipping_phone }}
                  </button>
                  <span v-else>—</span>
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Địa chỉ</dt>
                <dd class="text-right text-foreground">
                  <button class="text-left hover:underline" @click="copy(fullAddress(selected), 'địa chỉ')">
                    {{ fullAddress(selected) || '—' }}
                  </button>
                </dd>
              </div>
              <div
                v-for="[k, v] in recipientRows"
                :key="k"
                class="flex justify-between gap-3 pl-3"
              >
                <dt class="shrink-0 text-xs text-muted-foreground">{{ k }}</dt>
                <dd class="break-words text-right text-xs text-foreground">{{ v }}</dd>
              </div>
              <div v-if="selected.note" class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Ghi chú đơn</dt>
                <dd class="text-right text-foreground">{{ selected.note }}</dd>
              </div>
            </dl>
          </div>

          <!-- "Đơn của tôi gồm những gì" là câu hỏi thứ hai của khách, ngay sau
               "hàng tới đâu rồi". -->
          <OrderItemsCard :items="selected.items" />

          <!-- Gắn mã vận đơn — việc chính của CS -->
          <div class="card p-4">
            <h3 class="mb-3 text-sm font-semibold text-foreground">Mã vận đơn</h3>
            <template v-if="canEditTracking">
              <div>
                <label class="label">Mã vận đơn</label>
                <input
                  v-model="trackingForm.tracking_number"
                  class="input font-mono"
                  placeholder="VD: 9400111899223456789012"
                  @keyup.enter="saveTracking"
                />
              </div>
              <div class="mt-3 flex gap-2">
                <button class="btn-primary flex-1" :disabled="saving || !trackingChanged" @click="saveTracking">
                  <UiSpinner v-if="saving" :size="16" />
                  Lưu mã vận đơn
                </button>
                <!-- Một nút, một việc dưới mắt CS: hỏi hệ thống tracking. Đơn đã
                     có mã thì kéo hành trình mới nhất; đơn chưa có mã thì tra
                     xem đã có kiện nào gắn mã đơn này chưa — tooltip nói rõ. -->
                <button
                  v-if="journeyEnabled"
                  class="btn-secondary"
                  :disabled="syncing || !handedOver"
                  :title="
                    !handedOver
                      ? 'Đơn chưa bàn giao cho THE nên chưa có hành trình'
                      : selected.tracking_number
                        ? 'Lấy trạng thái và hành trình mới nhất'
                        : 'Tra xem đã có mã vận đơn nào gắn với mã đơn này chưa'
                  "
                  @click="syncTracking"
                >
                  <UiSpinner v-if="syncing" :size="16" />
                  <UiIcon v-else name="refresh" :size="16" />
                  Tra tracking
                </button>
              </div>
              <!-- Nói rõ vì sao chưa tra được, thay vì để CS bấm rồi nhận lỗi. -->
              <p v-if="journeyEnabled && !handedOver" class="mt-2 text-xs text-muted-foreground">
                Đơn chưa bàn giao cho THE — hành trình sẽ bắt đầu được lấy sau khi xưởng bấm
                “Bàn giao cho THE” ở màn Đóng gói. Mã vận đơn vẫn lưu được từ bây giờ.
              </p>
            </template>
            <p v-else class="text-sm text-muted-foreground">
              Bạn không có quyền sửa mã vận đơn.
            </p>

            <dl v-if="selected.tracking_status && selected.tracking_status !== 'NONE'" class="mt-4 space-y-2 border-t border-border pt-3 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Trạng thái</dt>
                <dd><UiStatusBadge kind="tracking" :value="selected.tracking_status" /></dd>
              </div>
              <div v-if="selected.tracking_detail" class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Chi tiết</dt>
                <dd class="text-right text-foreground">{{ selected.tracking_detail }}</dd>
              </div>
              <div v-if="selected.tracking_location" class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Vị trí</dt>
                <dd class="text-right text-foreground">{{ selected.tracking_location }}</dd>
              </div>
              <div v-if="selected.tracking_updated_at" class="flex justify-between gap-3">
                <dt class="shrink-0 text-muted-foreground">Cập nhật</dt>
                <dd class="text-right text-muted-foreground">{{ formatDateTime(selected.tracking_updated_at) }}</dd>
              </div>
            </dl>
            <p v-if="selected.tracking_sync_error" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
              24hTrack: {{ selected.tracking_sync_error }}
            </p>
          </div>

          <!-- Hành trình -->
          <div v-if="journey.length || journeyLoading" class="card p-4">
            <h3 class="mb-3 text-sm font-semibold text-foreground">Hành trình đơn hàng</h3>
            <div v-if="journeyLoading && !journey.length" class="flex justify-center py-4">
              <UiSpinner :size="20" />
            </div>
            <ol v-else class="space-y-3">
              <li v-for="(ev, idx) in journey" :key="ev.id" class="relative pl-5 text-sm">
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
                  <!-- raw_date giữ nguyên văn: hãng vận chuyển báo giờ địa phương
                       không kèm múi giờ, đổi định dạng là bịa ra một múi giờ. -->
                  {{ ev.raw_date || (ev.event_at ? formatDateTime(ev.event_at) : '') }}
                  <span v-if="ev.location"> · {{ ev.location }}</span>
                </p>
              </li>
            </ol>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
