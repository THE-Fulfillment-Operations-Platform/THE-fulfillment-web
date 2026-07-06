<script setup lang="ts">
import { cancellationApi } from '~/services/api'
import type { Order } from '~/types'
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

function applyFilters() {
  filters.page = 1
  reload()
}
function changePage(p: number) {
  filters.page = p
  reload()
}

// Resolution modal
const open = ref(false)
const target = ref<Order | null>(null)
const mode = ref<'approve' | 'reject'>('approve')
const note = ref('')
const saving = ref(false)

function openResolve(o: Order, m: 'approve' | 'reject') {
  target.value = o
  mode.value = m
  note.value = ''
  open.value = true
}

async function submit() {
  if (!target.value || saving.value) return
  saving.value = true
  try {
    if (mode.value === 'approve') await cancellationApi.approve(target.value.id, note.value.trim() || undefined)
    else await cancellationApi.reject(target.value.id, note.value.trim() || undefined)
    toast.success(mode.value === 'approve' ? 'Đã đồng ý huỷ đơn' : 'Đã từ chối yêu cầu huỷ')
    open.value = false
    await reload()
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
      <div class="flex gap-2">
        <input v-model="filters.search" class="input" placeholder="Tìm theo mã đơn…" @keyup.enter="applyFilters" />
        <button class="btn-primary" @click="applyFilters"><UiIcon name="search" :size="16" /> Tìm</button>
        <button class="btn-secondary" @click="reload"><UiIcon name="refresh" :size="16" /></button>
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
              <tr v-for="o in orders" :key="o.id" class="hover:bg-muted">
                <td class="table-td">
                  <NuxtLink :to="`/orders/${o.id}`" class="font-medium text-primary hover:underline">{{ o.store_order_id }}</NuxtLink>
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

    <UiModal v-model="open" :title="mode === 'approve' ? 'Đồng ý huỷ đơn' : 'Từ chối yêu cầu huỷ'">
      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">
          Đơn <span class="font-medium text-foreground">{{ target?.store_order_id }}</span>
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
