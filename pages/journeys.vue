<script setup lang="ts">
import { ordersApi, trackingApi } from '~/services/api'
import type { UpdateTrackingInput } from '~/services/api'
import type { Order, OrderTrackingEvent } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime, formatDate, APP_TZ } from '~/utils/format'
import { liveItemQty } from '~/utils/item'
import { orderStatusBadge, orderInternalStatus } from '~/utils/enums'

// Màn nội bộ: khâu sản xuất khi còn ở xưởng, trạng thái vận chuyển khi đã đi.
const rowStatus = (o: Order) => orderStatusBadge(o, orderInternalStatus(o.items))

// Hành trình đơn hàng — hàng đợi của CS sau khi hàng đã rời xưởng.
//
//   Xưởng bấm "Gửi hàng đi cho THE" (màn Chờ gửi hàng)
//     → đơn xuất hiện ở đây, mặc định lọc "chưa có mã vận đơn"
//     → CS dán mã vận đơn lấy từ hãng
//     → hệ thống chạy 24hTrack, hành trình hiện ngay bên dưới và cho seller thấy
//
// Khác với màn Tra cứu CS (tìm bất kỳ đơn nào khi khách gọi hỏi), màn này chỉ
// chứa đơn ĐÃ GỬI — nó là danh sách việc phải làm, không phải ô tìm kiếm.

const auth = useAuthStore()
const toast = useToastStore()

type Scope = 'missing' | 'has' | 'all'
const filters = reactive({
  q: '',
  scope: 'missing' as Scope,
  // Khoảng ngày xuất xưởng (yyyy-mm-dd) — CS lọc "đơn đi ngày X" trước khi đối
  // chiếu với file mã vận đơn của hãng.
  date_from: '',
  date_to: '',
  page: 1,
  page_size: 20,
})

const hasTrackingParam = computed(() =>
  filters.scope === 'missing' ? false : filters.scope === 'has' ? true : undefined,
)

// Ngày chọn là ngày theo giờ máy CS; đổi sang mốc thời gian thật (RFC3339) để
// 00:00 nghĩa là 00:00 giờ Việt Nam, không phải 00:00 UTC (lệch 7 tiếng). Cận
// trên gửi ĐẦU NGÀY KẾ TIẾP vì backend lọc nửa mở (<) — trọn ngày cuối vẫn tính.
function dayStartISO(d: string): string | undefined {
  if (!d) return undefined
  return new Date(d + 'T00:00:00').toISOString()
}
function nextDayStartISO(d: string): string | undefined {
  if (!d) return undefined
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString()
}

const { data, meta, loading, error, reload } = useApiResource<Order[]>(() =>
  ordersApi.list({
    // Chỉ đơn đã bàn giao cho THE: trước đó chưa có gì để theo dõi.
    handed_over: true,
    has_tracking: hasTrackingParam.value,
    handed_over_from: dayStartISO(filters.date_from),
    handed_over_to: nextDayStartISO(filters.date_to),
    search: filters.q.trim() || undefined,
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
function pickScope(scope: Scope) {
  filters.scope = scope
  applyFilters()
}
function clearDates() {
  filters.date_from = ''
  filters.date_to = ''
  applyFilters()
}

// Giờ xuất xưởng, tách khỏi ngày để cột hiển thị 2 tầng (ngày đậm, giờ mờ) —
// cùng múi giờ nghiệp vụ với formatDate, không theo giờ máy người xem.
function handedOverTime(v?: string | null): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: APP_TZ })
}

// ---- Gắn mã hàng loạt từ Excel ----------------------------------------------
const importOpen = ref(false)
const downloadingTemplate = ref(false)
async function downloadImportTemplate() {
  downloadingTemplate.value = true
  try {
    await trackingApi.downloadImportTemplate()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingTemplate.value = false
  }
}

// ---- Đơn đang mở ------------------------------------------------------------
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
    // Hành trình lỗi không được che mất đơn: việc chính ở đây là gắn mã vận đơn.
    journey.value = []
  } finally {
    journeyLoading.value = false
  }
}

// Sau khi gắn mã, đơn có thể rơi khỏi bộ lọc "chưa có mã" — bỏ chọn thay vì để
// panel treo một đơn không còn trong danh sách.
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
// Chỉ mã vận đơn. Tên hãng vận chuyển KHÔNG được nhập, lưu hay hiện ở bất cứ
// đâu: với seller thì THE chính là đơn vị vận chuyển, để lộ nhà thầu phía sau
// là lộ nhà cung cấp của mình.
const trackingForm = reactive({ tracking_number: '' })
const saving = ref(false)
const syncing = ref(false)

const trackingChanged = computed(
  () =>
    !!selected.value &&
    trackingForm.tracking_number.trim() !== (selected.value.tracking_number ?? '').trim(),
)

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
    toast.success('Đã gắn mã vận đơn — hệ thống đang lấy hành trình')
    await reload()
    await loadJourney(o.id)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function syncTracking() {
  const o = selected.value
  if (!o || syncing.value) return
  syncing.value = true
  try {
    await trackingApi.syncOrder(o.id)
    await reload()
    await loadJourney(o.id)
    toast.success('Đã cập nhật hành trình')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    syncing.value = false
  }
}

// Người nhận hiện ĐỦ từng trường rời, không gộp thành một dòng địa chỉ.
// Lý do: CS phải nhập lại đúng từng ô trên site hãng vận chuyển (address line 2,
// state, ZIP là các ô riêng), mà bản gộp cũ còn bỏ hẳn Địa chỉ 2 và Email —
// nhìn vào không phân biệt được "trống thật" với "bị ẩn".
//
// Các trường lõi luôn hiện (kể cả trống → '—') để thiếu dữ liệu là nhìn thấy
// ngay; IOSS chỉ hiện khi có vì nó là thứ riêng của đơn EU, không phải thông tin
// người nhận.
const recipientRows = computed<[string, string][]>(() => {
  const o = selected.value
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

// Một dòng địa chỉ gộp để CS dán nhanh sang site hãng — bổ sung cho bảng trường
// rời ở trên, không thay thế nó.
function fullAddress(o: Order): string {
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
  const o = selected.value
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
</script>

<template>
  <div>
    <PageHeader
      title="Hành trình đơn hàng"
      subtitle="Đơn đã gửi cho THE — gắn mã vận đơn và theo dõi hành trình"
    >
      <template #actions>
        <button class="btn-secondary" @click="reload">
          <UiIcon name="refresh" :size="16" /> Làm mới
        </button>
        <template v-if="canEditTracking">
          <button
            class="btn-secondary"
            :disabled="downloadingTemplate"
            title="File mẫu 2 cột: OrderID + Mã vận đơn"
            @click="downloadImportTemplate"
          >
            <UiSpinner v-if="downloadingTemplate" :size="16" />
            <UiIcon v-else name="download" :size="16" />
            Tải file mẫu
          </button>
          <button class="btn-primary" @click="importOpen = true">
            <UiIcon name="upload" :size="16" /> Gắn mã từ Excel
          </button>
        </template>
      </template>
    </PageHeader>

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
            placeholder="Mã đơn shop, mã nội bộ, mã vận đơn hoặc tên người nhận…"
          />
        </div>
        <button type="submit" class="btn-primary" :disabled="loading">
          <UiSpinner v-if="loading" :size="16" />
          <UiIcon v-else name="search" :size="16" />
          Tìm
        </button>
      </form>

      <!-- "Tất cả đơn đã gửi" đứng đầu vì nó là toàn bộ tập dữ liệu, hai cái sau
           là lát cắt của nó. Vị trí không đổi mặc định: màn vẫn mở ở "Chưa có mã
           vận đơn" — đó là việc CS cần làm. -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          v-for="opt in [
            { key: 'all', label: 'Tất cả đơn đã gửi' },
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
          @click="pickScope(opt.key as Scope)"
        >
          {{ opt.label }}
        </button>

        <!-- Lọc theo ngày xuất xưởng: "đơn đi ngày nào" là câu hỏi CS đặt trước
             khi đối chiếu file mã vận đơn của hãng. -->
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted-foreground">Xuất xưởng</span>
          <div class="w-36">
            <UiDatePicker
              v-model="filters.date_from"
              aria-label="Xuất xưởng từ ngày"
              :max="filters.date_to || undefined"
              @change="applyFilters"
            />
          </div>
          <span class="text-xs text-muted-foreground">–</span>
          <div class="w-36">
            <UiDatePicker
              v-model="filters.date_to"
              aria-label="Xuất xưởng đến ngày"
              :min="filters.date_from || undefined"
              @change="applyFilters"
            />
          </div>
          <button
            v-if="filters.date_from || filters.date_to"
            class="text-xs font-medium text-primary hover:underline"
            @click="clearDates"
          >
            Bỏ lọc ngày
          </button>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div class="card overflow-hidden">
        <UiStateBlock
          :loading="loading"
          :error="error"
          :empty="!loading && !error && orders.length === 0"
          :empty-text="
            filters.scope === 'missing'
              ? 'Không còn đơn nào chờ gắn mã vận đơn.'
              : 'Chưa có đơn nào đã gửi cho THE.'
          "
          @retry="reload"
        >
          <!-- Bảng không cuộn ngang và không xén chữ. Panel phải chiếm 26rem nên
               cột bảng chỉ còn ~800px, mà `.table-td` mặc định `whitespace-nowrap`
               → hàng luôn rộng hơn khung, cột Trạng thái bị cắt. Ở đây khoá bề
               rộng bằng table-fixed + tỉ lệ cột, và cho chữ xuống dòng: khung
               chật thì ô cao thêm một dòng, không bao giờ mất thông tin.
               min-w chỉ dành cho màn rất hẹp (mobile) — dưới ngưỡng đó 5 cột
               không còn đọc được, thà cuộn còn hơn nát. -->
          <div class="overflow-x-auto">
            <table class="w-full min-w-[36rem] table-fixed divide-y divide-border">
              <colgroup>
                <col class="w-[25%]" />
                <col class="w-[19%]" />
                <col class="w-[14%]" />
                <col class="w-[22%]" />
                <col class="w-[20%]" />
              </colgroup>
              <thead class="bg-muted">
                <tr>
                  <th class="table-th">Mã đơn shop</th>
                  <th class="table-th">Người nhận</th>
                  <th class="table-th">Xuất xưởng</th>
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
                  <td class="table-td whitespace-normal align-top">
                    <div class="break-words font-medium text-foreground">{{ o.store_order_id }}</div>
                    <div class="break-words text-xs text-muted-foreground">
                      {{ o.internal_code }}
                      <!-- Số món hiện ngay trên hàng: đơn nhiều món là đơn dễ
                           đóng thiếu, nhìn danh sách phải thấy được. -->
                      <span v-if="liveItemQty(o.items)"> · {{ liveItemQty(o.items) }} sp</span>
                    </div>
                  </td>
                  <td class="table-td whitespace-normal align-top">
                    <div class="break-words text-foreground">{{ o.shipping_name || '—' }}</div>
                    <div class="break-words text-xs text-muted-foreground">{{ o.shipping_city || '' }}</div>
                  </td>
                  <td class="table-td align-top">
                    <template v-if="o.handed_over_at">
                      <div class="text-foreground">{{ formatDate(o.handed_over_at) }}</div>
                      <div class="text-xs text-muted-foreground">{{ handedOverTime(o.handed_over_at) }}</div>
                    </template>
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <!-- Mã vận đơn là 22 ký tự liền không có chỗ ngắt: hạ một nấc
                       cỡ chữ để vừa một dòng ở khổ thường, chật hơn nữa thì
                       break-all cho xuống dòng giữa số — vẫn đọc và bôi đen copy
                       được, hơn là bị xén mất đuôi. -->
                  <td class="table-td whitespace-normal align-top">
                    <span
                      v-if="o.tracking_number"
                      class="break-all font-mono text-[11px] leading-5 tracking-tight text-foreground"
                    >{{ o.tracking_number }}</span>
                    <span
                      v-else
                      class="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    >chờ gắn mã</span>
                  </td>
                  <td class="table-td whitespace-normal align-top">
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

      <!-- Panel: gắn mã + hành trình -->
      <div class="space-y-4">
        <div v-if="!selected" class="card p-6 text-center text-sm text-muted-foreground">
          Chọn một đơn để gắn mã vận đơn và xem hành trình.
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
              <button
                v-if="fullAddress(selected)"
                class="shrink-0 text-xs font-medium text-primary hover:underline"
                @click="copyAddress"
              >
                Copy địa chỉ
              </button>
            </div>
            <dl class="space-y-2 text-sm">
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
          </div>

          <!-- Kiện gồm những gì: biết trước khi gắn mã, và trả lời được ngay khi
               seller/khách hỏi mà không phải mở sang màn chi tiết đơn. -->
          <OrderItemsCard :items="selected.items" />

          <div class="card p-4">
            <h3 class="mb-3 text-sm font-semibold text-foreground">Mã vận đơn</h3>
            <template v-if="canEditTracking">
              <div class="space-y-2">
                <div>
                  <label class="label">Mã vận đơn</label>
                  <input
                    v-model="trackingForm.tracking_number"
                    class="input font-mono"
                    placeholder="VD: 9400111899223456789012"
                    @keyup.enter="saveTracking"
                  />
                </div>
              </div>
              <div class="mt-3 flex gap-2">
                <button class="btn-primary flex-1" :disabled="saving || !trackingChanged" @click="saveTracking">
                  <UiSpinner v-if="saving" :size="16" />
                  Lưu mã vận đơn
                </button>
                <button
                  v-if="journeyEnabled"
                  class="btn-secondary"
                  :disabled="syncing"
                  title="Lấy trạng thái và hành trình mới nhất"
                  @click="syncTracking"
                >
                  <UiSpinner v-if="syncing" :size="16" />
                  <UiIcon v-else name="refresh" :size="16" />
                  Tra tracking
                </button>
              </div>
            </template>
            <p v-else class="text-sm text-muted-foreground">Bạn không có quyền sửa mã vận đơn.</p>

            <dl
              v-if="selected.tracking_status && selected.tracking_status !== 'NONE'"
              class="mt-4 space-y-2 border-t border-border pt-3 text-sm"
            >
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

          <div v-if="journey.length || journeyLoading" class="card p-4">
            <h3 class="mb-3 text-sm font-semibold text-foreground">Hành trình</h3>
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
                  <!-- raw_date giữ nguyên văn: hãng báo giờ địa phương không kèm
                       múi giờ, đổi định dạng là bịa ra một múi giờ. -->
                  {{ ev.raw_date || (ev.event_at ? formatDateTime(ev.event_at) : '') }}
                  <span v-if="ev.location"> · {{ ev.location }}</span>
                </p>
              </li>
            </ol>
          </div>
        </template>
      </div>
    </div>

    <!-- Upload file (orderID, mã vận đơn) → preview đối chiếu → xác nhận gắn.
         Truyền khoảng ngày đang lọc để preview so được "file thiếu đơn nào". -->
    <JourneysTrackingImportDialog
      v-model="importOpen"
      :date-from="filters.date_from"
      :date-to="filters.date_to"
      @done="reload"
    />
  </div>
</template>
