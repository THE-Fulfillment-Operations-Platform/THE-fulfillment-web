<script setup lang="ts">
// Lưới ô lọc batch dùng chung cho màn Batch sản xuất và Bảng sản xuất: Mã batch,
// Mã nội bộ đơn, Mã đơn shop, Seller, Chất liệu, SKU, Trạng thái, Ưu tiên,
// Từ ngày / Đến ngày (ngày TẠO batch) và nút Lọc. Ô gõ lọc khi Enter, ô chọn lọc
// ngay khi chọn xong. `filters` là reactive của trang cha — ô nào cũng ghi thẳng vào
// đó; cha chỉ cần nghe `apply`. Slot `extra` chèn thêm ô ở đầu lưới (vd ô tìm nhanh).
import type { BatchFilterFields } from '~/utils/batchFilters'

type Opt = { value: string; label: string; sublabel?: string }
defineProps<{
  filters: BatchFilterFields & { status: string[] }
  materialOptions: Opt[]
  sellerOptions: Opt[]
  statusOptions: Opt[]
  priorityOptions: Opt[]
}>()
const emit = defineEmits<{ (e: 'apply'): void }>()
const apply = () => emit('apply')
</script>

<template>
  <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
    <slot name="extra" />
    <div>
      <label class="label">Mã batch</label>
      <input v-model="filters.batch_id" class="input" placeholder="#101001" @keyup.enter="apply" />
    </div>
    <!-- Tìm ngược từ đơn: nhập mã nội bộ đơn / mã tem là ra batch đang sản xuất nó. -->
    <div>
      <label class="label">Mã nội bộ đơn</label>
      <input v-model="filters.code" class="input font-mono" placeholder="100047 / 100047_1/1" @keyup.enter="apply" />
    </div>
    <div>
      <label class="label">Mã đơn shop</label>
      <input v-model="filters.store_order" class="input" placeholder="Etsy-7821…" @keyup.enter="apply" />
    </div>
    <div>
      <label class="label">Seller</label>
      <!-- Chọn nhiều: tick xong, đóng bảng (bấm ra ngoài / Xong) mới lọc một lần. -->
      <UiMultiSelect
        v-model="filters.seller_id"
        :options="sellerOptions"
        all-label="Tất cả seller"
        searchable
        search-placeholder="Tìm seller…"
        aria-label="Seller"
        @change="apply"
      />
    </div>
    <div>
      <label class="label">Chất liệu</label>
      <UiSelect v-model="filters.material_id" :options="materialOptions" aria-label="Chất liệu" @change="apply" />
    </div>
    <div>
      <label class="label">SKU</label>
      <input v-model="filters.sku" class="input" placeholder="WOOD-01" @keyup.enter="apply" />
    </div>
    <div>
      <label class="label">Trạng thái</label>
      <UiMultiSelect v-model="filters.status" :options="statusOptions" aria-label="Trạng thái" @change="apply" />
    </div>
    <div>
      <label class="label">Ưu tiên</label>
      <UiSelect v-model="filters.priority" :options="priorityOptions" aria-label="Ưu tiên" @change="apply" />
    </div>
    <div>
      <label class="label">Từ ngày</label>
      <!-- Hai đầu khoá lẫn nhau: không chọn được khoảng ngược. -->
      <UiDatePicker v-model="filters.date_from" with-time :max="filters.date_to" aria-label="Từ ngày" @change="apply" />
    </div>
    <div>
      <label class="label">Đến ngày</label>
      <UiDatePicker v-model="filters.date_to" with-time :min="filters.date_from" aria-label="Đến ngày" @change="apply" />
    </div>
    <div class="flex items-end">
      <button type="button" class="btn-secondary w-full" @click="apply">
        <UiIcon name="search" :size="16" /> Lọc
      </button>
    </div>
  </div>
</template>
