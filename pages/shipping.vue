<script setup lang="ts">
import { handoffsApi } from '~/services/api'
import type { Handoff, HandoffStatus } from '~/types'
import type { HandoffInput, ShipHandoffInput } from '~/services/api'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

// Shipping / Handoff (Wireframe: Shipping). Packed orders are handed off to THE
// for dispatch. The create form mirrors the HandoffInput the backend accepts —
// carrier/tracking are populated by the SHIPPED stage, not at handoff time.
const toast = useToastStore()
const pager = reactive({ page: 1, page_size: 20 })
const { data, meta, loading, error, reload } = useApiResource<Handoff[]>(() =>
  handoffsApi.list({ page: pager.page, page_size: pager.page_size }),
)
const handoffs = computed(() => data.value ?? [])

function changePage(p: number) {
  pager.page = p
  reload()
}

const HANDOFF_STATUS: Record<HandoffStatus, { label: string; classes: string }> = {
  HANDED_OFF: { label: 'Đã bàn giao THE', classes: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  SHIPPED: { label: 'Đã gửi đi', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

const open = ref(false)
const saving = ref(false)
const form = reactive<HandoffInput>({
  order_id: undefined,
  package_id: undefined,
  box_type: '',
  weight_grams: undefined,
  length_cm: undefined,
  width_cm: undefined,
  height_cm: undefined,
  packing_note: '',
  photo_url: '',
})

function openCreate() {
  form.order_id = undefined
  form.package_id = undefined
  form.box_type = ''
  form.weight_grams = undefined
  form.length_cm = undefined
  form.width_cm = undefined
  form.height_cm = undefined
  form.packing_note = ''
  form.photo_url = ''
  open.value = true
}

const canSubmit = computed(() => !!form.order_id || !!form.package_id)

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    await handoffsApi.create({
      order_id: form.order_id || undefined,
      package_id: form.package_id || undefined,
      box_type: form.box_type || undefined,
      weight_grams: form.weight_grams || undefined,
      length_cm: form.length_cm || undefined,
      width_cm: form.width_cm || undefined,
      height_cm: form.height_cm || undefined,
      packing_note: form.packing_note || undefined,
      photo_url: form.photo_url || undefined,
    })
    toast.success('Đã tạo bàn giao cho THE')
    open.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

// ---- Mark shipped (HANDED_OFF → SHIPPED) -----------------------------------
// Records the carrier + tracking number so the order can complete and the
// seller can follow the parcel.
const shipOpen = ref(false)
const shipping = ref(false)
const shipTarget = ref<Handoff | null>(null)
const shipForm = reactive<ShipHandoffInput>({ carrier: '', tracking_number: '', label_url: '' })

function openShip(h: Handoff) {
  shipTarget.value = h
  shipForm.carrier = h.carrier || ''
  shipForm.tracking_number = h.tracking_number || ''
  shipForm.label_url = h.label_url || ''
  shipOpen.value = true
}

const canShip = computed(() => !!shipForm.carrier.trim() && !!shipForm.tracking_number.trim())

async function submitShip() {
  if (!shipTarget.value || !canShip.value || shipping.value) return
  shipping.value = true
  try {
    await handoffsApi.markShipped(shipTarget.value.id, {
      carrier: shipForm.carrier.trim(),
      tracking_number: shipForm.tracking_number.trim(),
      label_url: shipForm.label_url?.trim() || undefined,
    })
    toast.success('Đã đánh dấu gửi đi')
    shipOpen.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    shipping.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Shipping / Handoff"
      subtitle="Bàn giao kiện hàng đã đóng gói cho THE để gửi đi"
    >
      <template #actions>
        <button class="btn-secondary" @click="reload"><UiIcon name="refresh" :size="16" /> Làm mới</button>
        <button class="btn-primary" @click="openCreate"><UiIcon name="plus" :size="16" /> Tạo handoff</button>
      </template>
    </PageHeader>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && handoffs.length === 0"
        empty-text="Chưa có bàn giao nào. Tạo handoff từ kiện đã đóng gói."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Mã handoff</th>
                <th class="table-th">Order / Package</th>
                <th class="table-th">Carrier</th>
                <th class="table-th">Tracking</th>
                <th class="table-th">Kiện</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th">Thời gian</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="h in handoffs" :key="h.id" class="hover:bg-muted">
                <td class="table-td font-mono font-medium text-foreground">{{ h.code }}</td>
                <td class="table-td text-foreground">
                  <span v-if="h.order_id">Order #{{ h.order_id }}</span>
                  <span v-if="h.package_id" class="text-muted-foreground"> · Pkg #{{ h.package_id }}</span>
                </td>
                <td class="table-td">{{ h.carrier || '—' }}</td>
                <td class="table-td font-mono text-xs">{{ h.tracking_number || '—' }}</td>
                <td class="table-td text-xs text-muted-foreground">
                  {{ h.box_type || '—' }}<span v-if="h.weight_grams"> · {{ h.weight_grams }}g</span>
                </td>
                <td class="table-td">
                  <span
                    class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="(HANDOFF_STATUS[h.status] || HANDOFF_STATUS.HANDED_OFF).classes"
                  >
                    {{ (HANDOFF_STATUS[h.status] || { label: h.status }).label }}
                  </span>
                </td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(h.handed_off_at || h.created_at) }}</td>
                <td class="table-td text-right">
                  <div class="flex items-center justify-end gap-2">
                    <UiMockupLink v-if="h.label_url" :url="h.label_url" small label="Label" />
                    <button
                      v-if="h.status === 'HANDED_OFF'"
                      class="text-xs font-medium text-primary hover:underline"
                      @click="openShip(h)"
                    >
                      Đánh dấu đã gửi
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination :meta="meta" @change="changePage" />
      </UiStateBlock>
    </div>

    <!-- Create handoff -->
    <UiModal v-model="open" title="Tạo bàn giao THE" wide>
      <div class="space-y-4">
        <p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Nhập Order ID <span class="font-medium">hoặc</span> Package ID của kiện đã đóng gói (PACKED). Cân nặng &amp; kích thước giúp THE chọn cước phù hợp.
        </p>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Order ID</label>
            <input v-model.number="form.order_id" type="number" class="input" placeholder="VD: 1" />
          </div>
          <div>
            <label class="label">Package ID</label>
            <input v-model.number="form.package_id" type="number" class="input" placeholder="VD: 1" />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Loại hộp</label>
            <input v-model="form.box_type" class="input" placeholder="VD: Box-M" />
          </div>
          <div>
            <label class="label">Cân nặng (gram)</label>
            <input v-model.number="form.weight_grams" type="number" class="input" placeholder="VD: 450" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label">Dài (cm)</label>
            <input v-model.number="form.length_cm" type="number" class="input" />
          </div>
          <div>
            <label class="label">Rộng (cm)</label>
            <input v-model.number="form.width_cm" type="number" class="input" />
          </div>
          <div>
            <label class="label">Cao (cm)</label>
            <input v-model.number="form.height_cm" type="number" class="input" />
          </div>
        </div>

        <div>
          <label class="label">Ảnh kiện hàng (URL)</label>
          <input v-model="form.photo_url" class="input" placeholder="https://…" />
        </div>
        <div>
          <label class="label">Ghi chú đóng gói</label>
          <textarea v-model="form.packing_note" rows="2" class="input" placeholder="Ghi chú cho THE…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="!canSubmit || saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> Tạo handoff
        </button>
      </template>
    </UiModal>

    <!-- Mark shipped -->
    <UiModal v-model="shipOpen" :title="shipTarget ? `Đánh dấu đã gửi · ${shipTarget.code}` : 'Đánh dấu đã gửi'">
      <div class="space-y-4">
        <p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Nhập đơn vị vận chuyển và mã vận đơn. Kiện sẽ chuyển sang trạng thái
          <span class="font-medium">Đã gửi đi</span> và seller theo dõi được mã này.
        </p>
        <div>
          <label class="label">Đơn vị vận chuyển <span class="text-destructive">*</span></label>
          <input v-model="shipForm.carrier" class="input" placeholder="VD: GHN, J&T, DHL…" />
        </div>
        <div>
          <label class="label">Mã vận đơn (tracking) <span class="text-destructive">*</span></label>
          <input v-model="shipForm.tracking_number" class="input" placeholder="VD: JT0001234567" />
        </div>
        <div>
          <label class="label">Link nhãn/label (tuỳ chọn)</label>
          <input v-model="shipForm.label_url" class="input" placeholder="https://…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="shipOpen = false">Huỷ</button>
        <button class="btn-primary" :disabled="!canShip || shipping" @click="submitShip">
          <UiSpinner v-if="shipping" :size="16" /> Xác nhận đã gửi
        </button>
      </template>
    </UiModal>
  </div>
</template>
