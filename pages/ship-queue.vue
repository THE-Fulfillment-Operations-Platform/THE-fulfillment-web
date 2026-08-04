<script setup lang="ts">
import { qcApi, handoffsApi } from '~/services/api'
import type { QcResultOrder } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'

// Chờ gửi hàng — điểm nối giữa hai nửa vòng đời của đơn.
//
//   QC là việc cuối của xưởng. Xong QC, đơn rơi vào màn này.
//   Người phụ trách tick những đơn cần gửi → "Gửi hàng đi cho THE".
//   Từ đó đơn sang màn Hành trình đơn hàng để CS gắn mã vận đơn.
//
// Màn này CỐ Ý chỉ hiện đơn đã QC đủ và chưa gửi: nó là một hàng đợi công việc,
// không phải bảng tra cứu. Đơn còn thiếu sản phẩm chưa QC nằm ở màn Kết quả QC.

const toast = useToastStore()

const filters = reactive({ q: '', page: 1, page_size: 20 })

const { data, meta, loading, error, reload } = useApiResource(() =>
  qcApi.results({
    state: 'done',
    handed_over: false,
    q: filters.q.trim() || undefined,
    page: filters.page,
    page_size: filters.page_size,
  }),
)
const orders = computed<QcResultOrder[]>(() => data.value?.orders ?? [])

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
function resetSearch() {
  filters.q = ''
  applyFilters()
}

// ---- Chọn đơn ---------------------------------------------------------------
// Giữ lựa chọn theo id chứ không theo chỉ số dòng: người dùng lọc lại hoặc sang
// trang khác thì những đơn đã tick vẫn còn nguyên.
const selected = ref<Set<number>>(new Set())
const selectedCount = computed(() => selected.value.size)

function toggle(orderId: number) {
  const next = new Set(selected.value)
  next.has(orderId) ? next.delete(orderId) : next.add(orderId)
  selected.value = next
}
function isSelected(orderId: number) {
  return selected.value.has(orderId)
}
const allOnPageSelected = computed(
  () => orders.value.length > 0 && orders.value.every((o) => selected.value.has(o.order_id)),
)
function togglePage() {
  const next = new Set(selected.value)
  if (allOnPageSelected.value) {
    orders.value.forEach((o) => next.delete(o.order_id))
  } else {
    orders.value.forEach((o) => next.add(o.order_id))
  }
  selected.value = next
}
function clearSelection() {
  selected.value = new Set()
}

// ---- Gửi hàng đi cho THE ----------------------------------------------------
const shipping = ref(false)

async function shipSelected() {
  if (shipping.value || selectedCount.value === 0) return
  const ids = [...selected.value]
  const ok = await useConfirm().confirm({
    title: 'Gửi hàng đi cho THE',
    message: `Gửi ${ids.length} đơn cho THE? Sau bước này hệ thống bắt đầu theo dõi hành trình, và đơn chuyển sang màn Hành trình đơn hàng.`,
    confirmText: 'Gửi hàng',
  })
  if (!ok) return

  shipping.value = true
  try {
    const { data: res } = await handoffsApi.shipToCarrier(ids)
    const sent = res?.shipped?.length ?? 0
    const skipped = res?.skipped ?? []
    if (sent > 0) toast.success(`Đã gửi ${sent} đơn cho THE`)
    // Đơn bị bỏ qua phải nói rõ vì sao, không im lặng biến mất khỏi lựa chọn.
    if (skipped.length) {
      const detail = skipped
        .slice(0, 3)
        .map((s) => `${s.internal_code || s.order_id}: ${s.reason}`)
        .join(' · ')
      toast.error(
        `${skipped.length} đơn chưa gửi được — ${detail}${skipped.length > 3 ? '…' : ''}`,
      )
    }
    // Chỉ bỏ tick những đơn đã đi; đơn bị bỏ qua giữ nguyên để xử lý tiếp.
    const stillSelected = new Set(skipped.map((s) => s.order_id))
    selected.value = new Set([...selected.value].filter((id) => stillSelected.has(id)))
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
      title="Chờ gửi hàng"
      subtitle="Đơn đã QC đủ và chưa gửi — chọn rồi gửi cho THE để bắt đầu theo dõi hành trình"
    >
      <template #actions>
        <button class="btn-secondary" @click="reload">
          <UiIcon name="refresh" :size="16" /> Làm mới
        </button>
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
            placeholder="Mã đơn shop, mã nội bộ, mã sản phẩm hoặc SKU…"
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
    </div>

    <div class="card overflow-hidden">
      <UiBulkBar :count="selectedCount" noun="đơn" @clear="clearSelection">
        <button class="btn-primary ml-auto" :disabled="shipping" @click="shipSelected">
          <UiSpinner v-if="shipping" :size="16" />
          <UiIcon v-else name="shipping" :size="16" />
          Gửi hàng đi cho THE
        </button>
      </UiBulkBar>

      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && orders.length === 0"
        empty-text="Không có đơn nào chờ gửi. Đơn sẽ xuất hiện ở đây ngay khi QC đủ sản phẩm."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th w-10">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-border"
                    :checked="allOnPageSelected"
                    aria-label="Chọn tất cả đơn trong trang"
                    @change="togglePage"
                  />
                </th>
                <th class="table-th">Mã đơn shop</th>
                <th class="table-th">Mã nội bộ</th>
                <th class="table-th hidden md:table-cell">Seller</th>
                <th class="table-th">Sản phẩm</th>
                <th class="table-th hidden sm:table-cell">QC xong lúc</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="o in orders"
                :key="o.order_id"
                class="cursor-pointer transition-colors hover:bg-muted/60"
                :class="isSelected(o.order_id) ? 'bg-accent/40' : ''"
                @click="toggle(o.order_id)"
              >
                <td class="table-td" @click.stop>
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-border"
                    :checked="isSelected(o.order_id)"
                    :aria-label="`Chọn đơn ${o.store_order_id}`"
                    @change="toggle(o.order_id)"
                  />
                </td>
                <td class="table-td font-medium text-foreground">{{ o.store_order_id }}</td>
                <td class="table-td font-mono text-xs text-muted-foreground">{{ o.internal_code }}</td>
                <td class="table-td hidden text-muted-foreground md:table-cell">{{ o.seller_name || '—' }}</td>
                <td class="table-td">
                  <span class="text-emerald-700 dark:text-emerald-300">{{ o.passed_items }}</span>
                  <span class="text-muted-foreground">/{{ o.total_items }} đã QC</span>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">
                  {{ formatDateTime(o.created_at) }}
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
  </div>
</template>
