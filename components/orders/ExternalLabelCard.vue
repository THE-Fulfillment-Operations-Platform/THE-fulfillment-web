<script setup lang="ts">
// Label mua ngoài của đơn (link PDF nhập bằng Excel ở Hành trình đơn hàng).
// Có link: "In label" (server tải PDF về, in khổ 4×6) và "Mở link gốc". Chưa có:
// nói rõ "chưa có label" để kho biết phải xin CS nhập, không đoán.
import { printExternalLabels } from '~/utils/theLabels'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { ordersApi } from '~/services/api/orders'

const props = defineProps<{ orderId: number; internalCode: string; labelUrl?: string }>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToastStore()
const auth = useAuthStore()
const printing = ref(false)
const clearing = ref(false)
const canClear = computed(() => auth.can('orders.manage'))

async function clearLink() {
  if (clearing.value) return
  const ok = await useConfirm().confirm({
    title: 'Gỡ link label mua ngoài',
    message:
      `Gỡ link label ngoài của đơn ${props.internalCode}? Đơn sẽ không còn in được label này bằng "In label" / "Quét in label", ` +
      'và từ lúc đó "Tạo label THE" sẽ tạo label THE (tốn phí). Nếu label ngoài đã được dán lên kiện thì đừng gỡ — sẽ có 2 label cho 1 kiện. ' +
      'Muốn có lại link phải nhập lại bằng Excel.',
    confirmText: 'Gỡ link',
    tone: 'danger',
  })
  if (!ok) return
  clearing.value = true
  try {
    await ordersApi.clearExternalLabel(props.orderId)
    toast.success(`Đã gỡ link label ngoài của đơn ${props.internalCode}`)
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    clearing.value = false
  }
}

async function print() {
  if (printing.value) return
  printing.value = true
  try {
    const res = await printExternalLabels([{ id: props.orderId, code: props.internalCode }])
    if (res.failed.length) toast.error(`${res.failed[0]!.reason}. Thử "Mở link gốc" để kiểm tra link.`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    printing.value = false
  }
}
</script>

<template>
  <div class="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
    <div class="min-w-0">
      <p class="font-semibold text-foreground">Label mua ngoài</p>
      <p v-if="labelUrl" class="truncate text-xs text-muted-foreground" :title="labelUrl">{{ labelUrl }}</p>
      <p v-else class="text-xs text-muted-foreground">
        Chưa có label — nhập link label bằng Excel ở Hành trình đơn hàng (Gắn mã từ Excel).
      </p>
    </div>
    <div v-if="labelUrl" class="flex shrink-0 items-center gap-2">
      <a :href="labelUrl" target="_blank" rel="noopener noreferrer" class="btn-secondary px-3 py-1.5 text-xs">Mở link gốc</a>
      <button v-if="canClear" class="btn-secondary px-3 py-1.5 text-xs" :disabled="clearing" @click="clearLink">
        <UiSpinner v-if="clearing" :size="14" />
        Gỡ link label
      </button>
      <button class="btn-primary px-3 py-1.5 text-xs" :disabled="printing" @click="print">
        <UiSpinner v-if="printing" :size="14" />
        <UiIcon v-else name="print" :size="14" />
        In label
      </button>
    </div>
  </div>
</template>
