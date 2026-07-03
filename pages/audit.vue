<script setup lang="ts">
import { auditApi } from '~/services/api'
import type { AuditLog } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { formatDateTime } from '~/utils/format'

// Audit log viewer (Wireframe: Users/Audit). Read-only trail of mutating actions
// across the system. The endpoint returns the full recent set; we filter client
// side for quick triage.
const { data, loading, error, reload } = useApiResource<AuditLog[]>(() => auditApi.list())

const query = ref('')
const logs = computed(() => {
  const all = data.value ?? []
  const q = query.value.trim().toLowerCase()
  if (!q) return all
  return all.filter(
    (l) =>
      l.action.toLowerCase().includes(q) ||
      l.actor_email.toLowerCase().includes(q) ||
      (l.summary ?? '').toLowerCase().includes(q) ||
      (l.entity_type ?? '').toLowerCase().includes(q),
  )
})

// Colour the action verb so create/update/delete read at a glance.
function actionClass(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('create') || a.includes('login')) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (a.includes('delete') || a.includes('fail')) return 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
  if (a.includes('update') || a.includes('status') || a.includes('patch')) return 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
  return 'bg-muted text-foreground'
}
</script>

<template>
  <div>
    <PageHeader title="Audit Logs" subtitle="Nhật ký các thao tác thay đổi dữ liệu trong hệ thống">
      <template #actions>
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
          placeholder="Lọc theo hành động, email, đối tượng…"
        />
      </div>
    </div>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && logs.length === 0"
        empty-text="Không có bản ghi audit nào."
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
                  <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium" :class="actionClass(l.action)">
                    {{ l.action }}
                  </span>
                </td>
                <td class="table-td text-foreground">{{ l.actor_email }}</td>
                <td class="table-td text-xs text-muted-foreground">
                  <span v-if="l.entity_type">{{ l.entity_type }}<span v-if="l.entity_id"> #{{ l.entity_id }}</span></span>
                  <span v-else>—</span>
                </td>
                <td class="table-td max-w-md truncate text-foreground">{{ l.summary }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiStateBlock>
    </div>
  </div>
</template>
