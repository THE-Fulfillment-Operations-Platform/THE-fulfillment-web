<script setup lang="ts">
import { usePersistedFilters } from '~/composables/usePersistedFilters'
import { auditApi } from '~/services/api'
import type { AuditLog } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'
import { apiInstantFrom, apiInstantBefore } from '~/utils/dateRange'
import { exportCsv } from '~/utils/csv'
import { auditActionLabel, auditActionClasses, auditEntityLabel, auditSummary } from '~/utils/audit'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'

// Audit log viewer (Wireframe: Users/Audit). Read-only trail of mutating actions
// across the system. The trail grows with every action, so it is paged AND
// searched server-side (mã đơn / mã batch / người làm / khoảng ngày — chủ xưởng
// 25/11: "nhật ký này tìm theo dạng gì? Đơn hàng?"). The quick filter below only
// narrows the page already loaded.
const pager = reactive({
  order: '', // mã nội bộ đơn / mã đơn shop / mã item → dòng của đơn, item và phần batch của đơn
  batch: '', // #103000 hoặc 103000
  actor: '', // một phần email hoặc tên người làm
  date_from: '', // giờ máy (utils/dateRange apiInstantFrom), gồm
  date_to: '', // tới HẾT ngày/phút này — gửi đầu ngày/phút kế tiếp, API lọc < (apiInstantBefore)
  page: 1,
  page_size: 50,
})
usePersistedFilters('audit', pager)
const { data, meta, loading, error, reload } = useApiResource<AuditLog[]>(() =>
  auditApi.list({
    order: pager.order.trim() || undefined,
    batch: pager.batch.trim() || undefined,
    actor: pager.actor.trim() || undefined,
    date_from: apiInstantFrom(pager.date_from),
    date_to: apiInstantBefore(pager.date_to),
    page: pager.page,
    page_size: pager.page_size,
  }),
)

const hasSearch = computed(
  () => !!(pager.order.trim() || pager.batch.trim() || pager.actor.trim() || pager.date_from || pager.date_to),
)
function applySearch() {
  pager.page = 1
  reload()
}
function clearSearch() {
  pager.order = pager.batch = pager.actor = pager.date_from = pager.date_to = ''
  applySearch()
}

function changePage(p: number) {
  pager.page = p
  reload()
}
function changePageSize(size: number) {
  pager.page_size = size
  pager.page = 1
  reload()
}

// Every row is projected to its plain-Vietnamese form once, then filtered — so
// the quick filter matches what the reader actually sees ("kiểm hàng") as well
// as the raw code underneath ("QC_FAIL"), which is what devs paste from logs.
interface AuditRow extends AuditLog {
  actionText: string
  actionClasses: string
  entityText: string
  summaryText: string
}

const rows = computed<AuditRow[]>(() =>
  (data.value ?? []).map((l) => ({
    ...l,
    actionText: auditActionLabel(l.action),
    actionClasses: auditActionClasses(l.action),
    entityText: auditEntityLabel(l.entity_type, l.entity_id),
    summaryText: auditSummary(l.summary),
  })),
)

const query = ref('')
const logs = computed(() => {
  const all = rows.value
  const q = query.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((l) =>
    [l.actionText, l.action, l.actor_email, l.summaryText, l.summary ?? '', l.entityText]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const toast = useToastStore()
// Xuất file = "Thao tác" của màn Nhật ký (tick riêng từ 19/10).
const canExport = computed(() => useAuthStore().can('audit.manage'))
function exportLogs() {
  const rows = logs.value
  if (!rows.length) {
    toast.info('Không có bản ghi nào để xuất.')
    return
  }
  exportCsv(`audit-logs-${new Date().toISOString().slice(0, 10)}`, rows, [
    { label: 'Thời gian', value: (l) => formatDateTime(l.created_at) },
    { label: 'Hành động', value: 'actionText' },
    { label: 'Người thực hiện', value: 'actor_email' },
    { label: 'Đối tượng', value: 'entityText' },
    { label: 'Tóm tắt', value: 'summaryText' },
    // Raw code kept last so a support ticket can still quote the exact action.
    { label: 'Mã hệ thống', value: 'action' },
  ])
  toast.success(`Đã xuất ${rows.length} dòng CSV.`)
}
</script>

<template>
  <div>
    <PageHeader title="Nhật ký hoạt động" subtitle="Ai đã làm gì, lúc nào — ghi lại mọi thay đổi trong hệ thống">
      <template #actions>
        <button v-if="canExport" class="btn-secondary" :disabled="!logs.length" @click="exportLogs">
          <UiIcon name="upload" :size="16" /> Xuất CSV
        </button>
        <button class="btn-secondary" @click="reload"><UiIcon name="refresh" :size="16" /> Làm mới</button>
      </template>
    </PageHeader>

    <!-- Tìm trên TOÀN BỘ nhật ký (server). Gõ mã đơn ra mọi dòng của đơn đó, kể cả của
         sản phẩm và phần batch thuộc đơn. -->
    <div class="card mb-4 p-4" data-testid="audit-search">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label class="label" for="audit-order">Mã đơn</label>
          <input
            id="audit-order"
            v-model="pager.order"
            class="input font-mono"
            placeholder="109853 / mã đơn shop"
            @keyup.enter="applySearch"
          />
        </div>
        <div>
          <label class="label" for="audit-batch">Mã batch</label>
          <input id="audit-batch" v-model="pager.batch" class="input font-mono" placeholder="#103000" @keyup.enter="applySearch" />
        </div>
        <div>
          <label class="label" for="audit-actor">Người làm</label>
          <input id="audit-actor" v-model="pager.actor" class="input" placeholder="email hoặc tên" @keyup.enter="applySearch" />
        </div>
        <div>
          <label class="label">Từ ngày</label>
          <UiDatePicker v-model="pager.date_from" with-time :max="pager.date_to" aria-label="Từ ngày" @change="applySearch" />
        </div>
        <div>
          <label class="label">Đến ngày</label>
          <UiDatePicker v-model="pager.date_to" with-time :min="pager.date_from" aria-label="Đến ngày" @change="applySearch" />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button class="btn-primary" @click="applySearch"><UiIcon name="search" :size="16" /> Tìm trong nhật ký</button>
        <button v-if="hasSearch" class="btn-secondary" @click="clearSearch">Xoá lọc</button>
        <span v-if="meta && hasSearch" class="text-xs text-muted-foreground">Tìm thấy {{ meta.total }} dòng.</span>
      </div>
    </div>

    <div class="card mb-4 p-4">
      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          <UiIcon name="search" :size="16" />
        </span>
        <input
          v-model="query"
          class="input pl-9"
          placeholder="Lọc nhanh trong trang đang xem (việc đã làm, người làm, mã đơn…)"
        />
      </div>
      <p class="mt-2 text-xs text-muted-foreground">
        Ô này chỉ lọc {{ rows.length }} dòng của trang đang xem. Muốn tìm trong toàn bộ nhật ký, dùng các ô tìm phía trên.
      </p>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && logs.length === 0"
        :empty-text="hasSearch ? 'Không có dòng nào khớp ô tìm. Thử bỏ bớt điều kiện, hoặc kiểm lại mã đơn / mã batch.' : 'Chưa có hoạt động nào được ghi lại.'"
        skeleton
        :skeleton-rows="10"
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Thời gian</th>
                <th class="table-th">Hành động</th>
                <th class="table-th">Người thực hiện</th>
                <th class="table-th">Đối tượng</th>
                <th class="table-th">Tóm tắt</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="(l, idx) in logs" :key="idx" class="hover:bg-muted">
                <td class="table-td whitespace-nowrap text-xs text-muted-foreground">{{ formatDateTime(l.created_at) }}</td>
                <td class="table-td">
                  <!-- Plain-Vietnamese verb; the raw code stays on hover for support. -->
                  <span
                    class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="l.actionClasses"
                    :title="l.action"
                  >
                    {{ l.actionText }}
                  </span>
                </td>
                <td class="table-td text-foreground">{{ l.actor_email }}</td>
                <td class="table-td whitespace-nowrap text-xs text-muted-foreground">{{ l.entityText }}</td>
                <td class="table-td max-w-md truncate text-foreground" :title="l.summaryText">{{ l.summaryText }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination
          :meta="meta"
          :page-size="pager.page_size"
          @change="changePage"
          @update:page-size="changePageSize"
        />
      </UiStateBlock>
    </div>
  </div>
</template>
