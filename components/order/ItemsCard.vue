<script setup lang="ts">
import type { OrderItem } from '~/types'
import { itemCancelled, liveItems, liveItemQty } from '~/utils/item'

// Danh sách sản phẩm của một đơn, dạng gọn để nhét vào panel bên phải các màn
// CS / Hành trình.
//
// Ở những màn đó người dùng đang cầm một kiện hàng hoặc đang nói chuyện với
// khách: câu hỏi đầu tiên luôn là "đơn này gồm những gì, mấy món". Trước đây
// panel chỉ có địa chỉ và mã vận đơn nên phải mở sang màn chi tiết đơn mới trả
// lời được.
//
// Dòng đã huỷ vẫn hiện (mờ, có nhãn) chứ không ẩn: khách hỏi "sao thiếu một
// món" thì câu trả lời nằm đúng ở đó. Nhưng chúng KHÔNG được tính vào tổng —
// tổng là số món thực sự nằm trong kiện.
const props = defineProps<{ items?: OrderItem[]; title?: string }>()

const cancelled = itemCancelled

const rows = computed(() =>
  [...(props.items ?? [])].sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0)),
)
const liveCount = computed(() => liveItems(props.items).length)
const totalQty = computed(() => liveItemQty(props.items))

// "2 dòng · 3 sản phẩm" chỉ có ích khi hai con số khác nhau; đơn một-món-một-cái
// thì nói gọn một lần.
const summary = computed(() => {
  const lines = liveCount.value
  if (lines === 0) return '—'
  return lines === totalQty.value
    ? `${totalQty.value} sản phẩm`
    : `${lines} dòng · ${totalQty.value} sản phẩm`
})
</script>

<template>
  <div class="card p-4">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-foreground">{{ title || 'Sản phẩm trong đơn' }}</h3>
      <span class="shrink-0 text-xs font-medium text-muted-foreground">{{ summary }}</span>
    </div>

    <p v-if="!rows.length" class="text-sm text-muted-foreground">Đơn chưa có dòng sản phẩm nào.</p>

    <ul v-else class="space-y-2.5 text-sm">
      <li
        v-for="(it, idx) in rows"
        :key="it.id"
        class="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0"
        :class="cancelled(it) ? 'opacity-60' : ''"
      >
        <div class="min-w-0">
          <p class="truncate font-medium text-foreground" :title="it.product_name || it.sku_code">
            <span class="text-muted-foreground">{{ it.line_no ?? idx + 1 }}.</span>
            {{ it.product_name || it.sku_code }}
            <span
              v-if="cancelled(it)"
              class="ml-1 rounded bg-rose-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
            >
              đã huỷ
            </span>
          </p>
          <p class="mt-0.5 break-all font-mono text-xs text-muted-foreground">
            {{ it.sku_code }}
            <span v-if="it.variant_code"> · {{ it.variant_code }}</span>
          </p>
          <!-- Nội dung khắc là thứ khách hay gọi hỏi lại nhất, và cũng là thứ
               không thể tra ở đâu khác ngoài dòng hàng. -->
          <p v-if="it.engrave_text" class="mt-0.5 break-words text-xs text-foreground">
            Khắc: “{{ it.engrave_text }}”
          </p>
          <UiMockupLink v-if="it.mockup_url" :url="it.mockup_url" label="Mockup" small class="mt-0.5" />
        </div>
        <span class="shrink-0 font-mono text-sm font-semibold text-foreground">×{{ it.quantity }}</span>
      </li>
    </ul>
  </div>
</template>
