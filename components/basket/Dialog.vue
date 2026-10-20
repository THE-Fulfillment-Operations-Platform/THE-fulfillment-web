<script setup lang="ts">
// Hộp thoại giỏ chờ dùng chung cho trạm QC và màn Giỏ chờ:
//   - created: vừa tạo giỏ → số giỏ to + nút in tem giỏ để ghép cùng hàng;
//   - full:    vừa QC đạt sản phẩm CUỐI của đơn → giỏ đã đủ, hướng dẫn đi nhặt.
import type { Basket } from '~/types'
import { printBasketLabel } from '~/utils/basketLabel'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{ modelValue: boolean; basket: Basket | null; mode: 'created' | 'existing' | 'full' }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
const toast = useToastStore()

const open = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })
const title = computed(() =>
  props.mode === 'full' ? 'Đơn đã đủ hàng — đi nhặt giỏ' : props.mode === 'existing' ? 'Đơn đã có giỏ chờ' : 'Đã tạo giỏ chờ',
)
const qtyNote = computed(() => {
  const b = props.basket
  return b && b.total_qty && b.total_qty !== b.total_items ? ` (${b.total_qty} cái)` : ''
})

function print() {
  if (props.basket && !printBasketLabel(props.basket)) {
    toast.error('Trình duyệt chặn cửa sổ in — cho phép popup cho trang này rồi bấm lại.')
  }
}
</script>

<template>
  <UiModal v-model="open" :title="title">
    <div v-if="basket" class="space-y-4 text-center">
      <div
        class="mx-auto inline-flex flex-col items-center rounded-2xl border-2 px-10 py-4"
        :class="mode === 'full' ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-500/10' : 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'"
      >
        <span class="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Giỏ chờ</span>
        <span class="text-7xl font-extrabold leading-none tabular-nums text-foreground">#{{ basket.number }}</span>
      </div>
      <p class="text-sm text-muted-foreground">
        Đơn <span class="font-mono font-semibold text-foreground">{{ basket.order_code }}</span> · {{ basket.store_order_id }}
        · {{ basket.total_items }} sản phẩm{{ qtyNote }}
      </p>
      <p v-if="mode === 'full'" class="rounded-lg bg-muted px-4 py-3 text-left text-base font-medium leading-relaxed text-foreground">
        Cầm sản phẩm này ra <b>giỏ #{{ basket.number }}</b>, đếm đủ <b>{{ basket.total_items }} sản phẩm{{ qtyNote }}</b>
        của đơn, bó lại thành một bó — rồi vào màn <b>Giỏ chờ</b> quét tem giỏ để xác nhận thả giỏ.
      </p>
      <p v-else class="rounded-lg bg-muted px-4 py-3 text-left text-base font-medium leading-relaxed text-foreground">
        Bỏ sản phẩm vừa QC vào <b>giỏ #{{ basket.number }}</b> và in tem giỏ để ghép cùng hàng. Các sản phẩm sau của đơn
        quét QC sẽ tự báo giỏ #{{ basket.number }}.
      </p>
    </div>
    <template #footer>
      <NuxtLink v-if="mode === 'full'" :to="`/baskets?code=${basket?.code ?? ''}`" class="btn-secondary" @click="open = false">
        Mở màn Giỏ chờ
      </NuxtLink>
      <!-- Vừa tạo giỏ: in tem là việc chính (tem đi cùng hàng vào giỏ). -->
      <template v-if="mode === 'created'">
        <button class="btn-secondary" @click="open = false">Xong</button>
        <button class="btn-primary" @click="print"><UiIcon name="print" :size="16" /> In tem giỏ</button>
      </template>
      <template v-else>
        <button class="btn-secondary" @click="print"><UiIcon name="print" :size="16" /> In lại tem giỏ</button>
        <button class="btn-primary" @click="open = false">{{ mode === 'full' ? 'Đã hiểu' : 'Xong' }}</button>
      </template>
    </template>
  </UiModal>
</template>
