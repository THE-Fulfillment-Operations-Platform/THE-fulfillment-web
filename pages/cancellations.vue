<script setup lang="ts">
import { cancellationApi } from '~/services/api'
import type { Order, OrderItem } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'

// Cancellation requests — sellers submit these on approved (not-yet-in-production)
// orders. Ops/Admin approve (cancels the order) or reject (order continues).
const toast = useToastStore()
const filters = reactive({ search: '', page: 1 })

const { data, meta, loading, error, reload } = useApiResource<Order[]>(() =>
  cancellationApi.list({
    store_order_id: filters.search || undefined,
    page: filters.page,
    page_size: 20,
  }),
)
const orders = computed(() => data.value ?? [])
const { data: itemData, loading: itemLoading, error: itemError, reload: reloadItems } = useApiResource<OrderItem[]>(() =>
  cancellationApi.itemList({ page: 1, page_size: 100 }),
)
const itemRequests = computed(() => itemData.value ?? [])

function applyFilters() {
  filters.page = 1
  reload()
  reloadItems()
}
function changePage(p: number) {
  filters.page = p
  reload()
}

// Resolution modal
const open = ref(false)
const target = ref<{ kind: 'order'; value: Order } | { kind: 'item'; value: OrderItem } | null>(null)
const mode = ref<'approve' | 'reject'>('approve')
const note = ref('')
const saving = ref(false)

function openResolve(o: Order, m: 'approve' | 'reject') {
  target.value = { kind: 'order', value: o }
  mode.value = m
  note.value = ''
  open.value = true
}

function openItemResolve(it: OrderItem, m: 'approve' | 'reject') {
  target.value = { kind: 'item', value: it }
  mode.value = m
  note.value = ''
  open.value = true
}

async function submit() {
  if (!target.value || saving.value) return
  saving.value = true
  try {
    const id = target.value.value.id
    if (target.value.kind === 'item') {
      if (mode.value === 'approve') await cancellationApi.approveItem(id, note.value.trim() || undefined)
      else await cancellationApi.rejectItem(id, note.value.trim() || undefined)
    } else if (mode.value === 'approve') await cancellationApi.approve(id, note.value.trim() || undefined)
    else await cancellationApi.reject(id, note.value.trim() || undefined)
    toast.success(mode.value === 'approve' ? 'Đã đồng ý huỷ' : 'Đã từ chối yêu cầu huỷ')
    open.value = false
    await reload()
    await reloadItems()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Yêu cầu huỷ đơn"
      subtitle="Seller gửi yêu cầu huỷ với đơn đã duyệt (chưa vào sản xuất) — Ops/Admin xử lý"
    />

    <div class="card mb-4 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <input v-model="filters.search" class="input min-w-[10rem] flex-1" placeholder="Tìm theo mã đơn…" @keyup.enter="applyFilters" />
        <button class="btn-primary shrink-0" @click="applyFilters"><UiIcon name="search" :size="16" /> Tìm</button>
        <button class="btn-secondary shrink-0" @click="reload"><UiIcon name="refresh" :size="16" /></button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && orders.length === 0"
        empty-text="Không có yêu cầu huỷ nào."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Mã đơn</th>
                <th class="table-th">Seller</th>
                <th class="table-th">Lý do</th>
                <th class="table-th">Yêu cầu lúc</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="o in orders"
                :key="o.id"
                class="hover:bg-muted"
                :class="{ 'bg-rose-50/60 dark:bg-rose-500/10': o.store_order_dup }"
              >
                <td class="table-td">
                  <span class="flex items-center gap-1.5">
                    <NuxtLink :to="`/orders/${o.id}`" class="font-medium text-primary hover:underline">{{ o.store_order_id }}</NuxtLink>
                    <span
                      v-if="o.store_order_dup"
                      class="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      title="StoreOrderID này trùng với đơn khác"
                    >
                      <UiIcon name="alert" :size="10" /> Trùng
                    </span>
                  </span>
                  <p class="text-xs text-muted-foreground">{{ o.internal_code }}</p>
                </td>
                <td class="table-td text-foreground">{{ o.seller?.name || o.seller?.code || '—' }}</td>
                <td class="table-td max-w-xs text-sm text-muted-foreground">{{ o.cancellation_reason || '—' }}</td>
                <td class="table-td text-xs text-muted-foreground">{{ formatDateTime(o.cancellation_requested_at || o.created_at) }}</td>
                <td class="table-td">
                  <div class="flex items-center justify-end gap-2">
                    <button class="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400" @click="openResolve(o, 'approve')">
                      Đồng ý huỷ
                    </button>
                    <button class="text-xs font-medium text-rose-500 hover:underline dark:text-rose-400" @click="openResolve(o, 'reject')">
                      Từ chối
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4">
          <UiPagination :meta="meta" @change="changePage" />
        </div>
      </UiStateBlock>
    </div>

    <div class="card mt-4 overflow-hidden">
      <div class="border-b border-border bg-muted px-4 py-3">
        <h2 class="font-semibold text-foreground">Yêu cầu huỷ từng sản phẩm</h2>
      </div>
      <UiStateBlock :loading="itemLoading" :error="itemError" :empty="!itemLoading && !itemError && itemRequests.length === 0" empty-text="Không có yêu cầu huỷ sản phẩm nào." @retry="reloadItems">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted"><tr><th class="table-th">Đơn</th><th class="table-th">Sản phẩm</th><th class="table-th">Lý do</th><th class="table-th"></th></tr></thead>
            <tbody class="divide-y divide-border">
              <tr v-for="it in itemRequests" :key="it.id">
                <td class="table-td"><NuxtLink v-if="it.order" :to="`/orders/${it.order.id}`" class="font-medium text-primary hover:underline">{{ it.order.store_order_id }}</NuxtLink><span v-else>—</span></td>
                <td class="table-td"><p class="font-medium">{{ it.product_name || it.sku_code }}</p><p class="text-xs text-muted-foreground">{{ it.sku_code }} · x{{ it.quantity }}</p></td>
                <td class="table-td text-sm text-muted-foreground">{{ it.cancellation_reason || '—' }}</td>
                <td class="table-td"><div class="flex justify-end gap-2"><button class="text-xs font-medium text-emerald-600 hover:underline" @click="openItemResolve(it, 'approve')">Đồng ý huỷ</button><button class="text-xs font-medium text-rose-500 hover:underline" @click="openItemResolve(it, 'reject')">Từ chối</button></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiStateBlock>
    </div>

    <UiModal v-model="open" :title="mode === 'approve' ? 'Đồng ý huỷ' : 'Từ chối yêu cầu huỷ'">
      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">
          <template v-if="target?.kind === 'item'">Sản phẩm <span class="font-medium text-foreground">{{ target.value.product_name || target.value.sku_code }}</span></template>
          <template v-else-if="target">Đơn <span class="font-medium text-foreground">{{ target.value.store_order_id }}</span></template>
          <template v-if="mode === 'approve'"> sẽ được huỷ và loại khỏi luồng sản xuất.</template>
          <template v-else> sẽ tiếp tục luồng bình thường.</template>
        </p>
        <div>
          <label class="label">Ghi chú xử lý (tuỳ chọn)</label>
          <textarea v-model="note" rows="3" class="input" placeholder="Ghi chú cho seller / nội bộ…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> {{ mode === 'approve' ? 'Đồng ý huỷ' : 'Từ chối' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
