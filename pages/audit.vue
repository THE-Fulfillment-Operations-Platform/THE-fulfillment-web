<script setup lang="ts">
import { auditApi } from '~/services/api'
import type { AuditLog } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'
import { exportCsv } from '~/utils/csv'
import { auditActionLabel, auditActionClasses, auditEntityLabel, auditSummary } from '~/utils/audit'
import { useToastStore } from '~/stores/toast'

// Audit log viewer (Wireframe: Users/Audit). Read-only trail of mutating actions
// across the system. The trail grows with every action, so it is paged
// server-side; the quick filter narrows the loaded page.
const pager = reactive({ page: 1, page_size: 50 })
const { data, meta, loading, error, reload } = useApiResource<AuditLog[]>(() =>
  auditApi.list({ page: pager.page, page_size: pager.page_size }),
)

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
        <button class="btn-secondary" :disabled="!logs.length" @click="exportLogs">
          <UiIcon name="upload" :size="16" /> Xuất CSV
        </button>
        <button class="btn-secondary" @click="reload"><UiIcon name="refresh" :size="16" /> Làm mới</button>
      </template>
    </PageHeader>

    <div class="card mb-4 p-4">
      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          <UiIcon name="search" :size="16" />
        </span>
        <input
          v-model="query"
          class="input pl-9"
          placeholder="Tìm nhanh trong trang này (việc đã làm, người làm, mã đơn…)"
        />
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && logs.length === 0"
        empty-text="Chưa có hoạt động nào được ghi lại."
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
