<script setup lang="ts">
// Đơn THE của một đơn FFM: mã THE, mã USPS chặng cuối, cước, label để in lại,
// lịch sử (đơn đã huỷ / tạo hỏng), và nút huỷ cho Owner/Admin. Không hiện gì nếu
// đơn chưa từng được tạo trên THE.
import { carrierApi } from '~/services/api'
import type { THEShipment, THEShipmentStatus } from '~/services/api/carrier'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { printTHELabels } from '~/utils/theLabels'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'

const props = defineProps<{ orderId: number; internalCode?: string }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const auth = useAuthStore()
const toast = useToastStore()
const canCancel = computed(() => auth.role === 'OWNER' || auth.role === 'ADMIN')

const rows = ref<THEShipment[]>([])
const loaded = ref(false)
async function load() {
  try {
    const { data } = await carrierApi.shipments(props.orderId)
    rows.value = data ?? []
  } catch {
    rows.value = [] // phụ trợ: hỏng thì màn đơn vẫn phải mở được
  } finally {
    loaded.value = true
  }
}
onMounted(load)
watch(() => props.orderId, load)

const LIVE: THEShipmentStatus[] = ['CREATING', 'CREATED', 'LABELED']
const live = computed(() => rows.value.find((r) => LIVE.includes(r.status)) ?? null)
const history = computed(() => rows.value.filter((r) => r !== live.value))

const STATUS_LABEL: Record<THEShipmentStatus, string> = {
  CREATING: 'Đang tạo',
  CREATED: 'Đã tạo, chưa chốt (chưa trừ tiền)',
  LABELED: 'Đã chốt — có label',
  CANCELLED: 'Đã huỷ',
  FAILED: 'Tạo không được',
}
const STATUS_CLASS: Record<THEShipmentStatus, string> = {
  CREATING: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  CREATED: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  LABELED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  CANCELLED: 'bg-muted text-muted-foreground',
  FAILED: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

const printing = ref(false)
async function print() {
  if (printing.value) return
  printing.value = true
  try {
    const res = await printTHELabels([{ id: props.orderId, code: props.internalCode }])
    if (res.failed.length) toast.error(res.failed[0]!.reason)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    printing.value = false
  }
}

const cancelling = ref(false)
async function cancel() {
  const sh = live.value
  if (!sh || cancelling.value) return
  const paid = sh.status === 'LABELED'
  const ok = await useConfirm().confirm({
    title: 'Huỷ đơn THE',
    message: paid
      ? `Huỷ đơn THE ${sh.tracking_code}? THE hoàn tiền theo quy định của THE (có thể không hoàn ngay). ` +
        'Đơn FFM quay lại màn Chờ gửi hàng để gửi lại. Chỉ huỷ được khi THE chưa nhận kiện.'
      : 'Huỷ đơn THE chưa chốt này? Chưa trừ tiền nên không có gì để hoàn.',
    confirmText: 'Huỷ đơn THE',
    tone: 'danger',
  })
  if (!ok) return
  cancelling.value = true
  try {
    await carrierApi.cancel(props.orderId, paid ? 'Huỷ từ chi tiết đơn' : 'Huỷ đơn chưa chốt')
    toast.success('Đã huỷ đơn THE')
    await load()
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div v-if="loaded && rows.length" class="card p-4">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-foreground">Đơn THE</h3>
      <div class="flex items-center gap-3">
        <button
          v-if="live?.has_label"
          class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
          :disabled="printing"
          @click="print"
        >
          <UiSpinner v-if="printing" :size="12" /> In label
        </button>
        <button
          v-if="live && canCancel"
          class="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
          :disabled="cancelling"
          @click="cancel"
        >
          Huỷ đơn THE
        </button>
      </div>
    </div>

    <dl v-if="live" class="space-y-1.5 text-sm">
      <div class="flex justify-between gap-3">
        <dt class="text-muted-foreground">Trạng thái</dt>
        <dd><span class="rounded-md px-2 py-0.5 text-xs font-medium" :class="STATUS_CLASS[live.status]">{{ STATUS_LABEL[live.status] }}</span></dd>
      </div>
      <div v-if="live.tracking_code" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">Mã THE</dt>
        <dd class="font-mono font-medium text-foreground">{{ live.tracking_code }}</dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-muted-foreground">Mã chặng cuối</dt>
        <dd class="font-mono text-foreground">
          <template v-if="live.last_mile_tracking">{{ live.last_mile_tracking }}<span v-if="live.last_mile_carrier" class="text-muted-foreground"> · {{ live.last_mile_carrier }}</span></template>
          <span v-else class="font-sans text-xs text-muted-foreground">chưa có — hệ thống tự lấy</span>
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-muted-foreground">Kiện khai báo</dt>
        <dd class="text-right text-xs tabular-nums text-foreground">
          {{ live.weight_g }} g · {{ live.length_cm }}×{{ live.width_cm }}×{{ live.height_cm }} cm · ${{ live.declared_value }} · HS {{ live.hs_code }}
        </dd>
      </div>
      <div v-if="live.cost" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">Cước ước tính</dt>
        <dd class="tabular-nums text-foreground">${{ live.cost.toFixed(2) }}</dd>
      </div>
      <div v-if="live.labeled_at" class="flex justify-between gap-3">
        <dt class="text-muted-foreground">Chốt lúc</dt>
        <dd class="text-xs text-foreground">{{ formatDateTime(live.labeled_at) }}</dd>
      </div>
      <p v-if="live.error" class="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        {{ live.error }}
      </p>
    </dl>

    <details v-if="history.length" class="mt-3 text-xs">
      <summary class="cursor-pointer text-muted-foreground">Lịch sử ({{ history.length }})</summary>
      <ul class="mt-2 space-y-1">
        <li v-for="h in history" :key="h.id" class="rounded-md bg-muted px-2 py-1.5">
          <span class="rounded px-1.5 py-0.5 font-medium" :class="STATUS_CLASS[h.status]">{{ STATUS_LABEL[h.status] }}</span>
          <span v-if="h.tracking_code" class="ml-1 font-mono">{{ h.tracking_code }}</span>
          <span class="ml-1 text-muted-foreground">{{ formatDateTime(h.created_at) }}</span>
          <div v-if="h.error" class="mt-0.5 text-muted-foreground">{{ h.error }}</div>
        </li>
      </ul>
    </details>
  </div>
</template>
