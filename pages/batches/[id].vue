<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { Batch, InternalStatus } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useApiResource } from '~/composables/useApiResource'
import { INTERNAL_STATUS, INTERNAL_STATUS_ORDER } from '~/utils/enums'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const route = useRoute()
const id = route.params.id as string
const auth = useAuthStore()
const toast = useToastStore()

const { data: batch, loading, error, reload } = useApiResource<Batch>(() => batchesApi.get(id))
const items = computed(() => batch.value?.items ?? [])

// Roles allowed to advance batch status (production + supervisors).
const canChangeStatus = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION'].includes(auth.role ?? ''),
)

const updating = ref(false)
async function setStatus(status: InternalStatus) {
  if (!batch.value) return
  updating.value = true
  try {
    await batchesApi.setStatus(batch.value.id, status)
    toast.success(`Đã cập nhật batch → ${INTERNAL_STATUS[status].label}`)
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    updating.value = false
  }
}

function exportCsv() {
  if (!batch.value) return
  const header = ['item_code', 'order_code', 'sku_code', 'status', 'mockup_url', 'print_file_url', 'cut_file_url']
  const lines = items.value.map((i) =>
    [i.item_code, i.order_code, i.sku_code, i.status, i.mockup_url, i.print_file_url, i.cut_file_url]
      .map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
      .join(','),
  )
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${batch.value.code.replace('#', 'batch-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function printLabels() {
  // No QR generator in MVP — print the scannable item codes as labels.
  const w = window.open('', '_blank')
  if (!w || !batch.value) return
  const labels = items.value
    .map(
      (i) =>
        `<div style="border:1px solid #ccc;padding:16px;margin:8px;display:inline-block;text-align:center;width:200px;font-family:monospace">
          <div style="font-size:12px;color:#666">${batch.value!.code} · ${i.sku_code ?? ''}</div>
          <div style="font-size:20px;font-weight:bold;margin-top:8px">${i.item_code ?? ''}</div>
        </div>`,
    )
    .join('')
  w.document.write(`<html><head><title>${batch.value.code} labels</title></head><body>${labels}<script>window.print()<\/script></body></html>`)
  w.document.close()
}
</script>

<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/batches" class="text-sm text-primary hover:underline">← Về danh sách batch</NuxtLink>
    </div>

    <UiStateBlock :loading="loading" :error="error" @retry="reload">
      <template v-if="batch">
        <!-- Header -->
        <div class="card mb-5 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-foreground">
                Batch {{ batch.code }}
                <span class="ml-2 text-sm font-normal text-muted-foreground">
                  Material: {{ batch.material_name || batch.material?.name || batch.material_code }}
                </span>
              </h1>
              <div class="mt-2 flex items-center gap-2">
                <UiStatusBadge kind="internal" :value="batch.status" />
                <UiStatusBadge kind="priority" :value="batch.priority || 'NORMAL'" />
                <span class="text-xs text-muted-foreground">{{ batch.item_count ?? items.length }} item</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary" @click="printLabels"><UiIcon name="qc" :size="16" /> Print QR</button>
              <button class="btn-secondary" @click="exportCsv"><UiIcon name="upload" :size="16" /> Export CSV</button>
              <button class="btn-secondary" title="Phase sau khi có storage" @click="toast.info('Download ZIP là phase sau (chưa có storage).')">
                <UiIcon name="box" :size="16" /> Download ZIP
              </button>
            </div>
          </div>

          <!-- Status control -->
          <div v-if="canChangeStatus" class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span class="text-xs font-medium text-muted-foreground">Cập nhật trạng thái sản xuất:</span>
            <button
              v-for="s in INTERNAL_STATUS_ORDER"
              :key="s"
              class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              :class="batch.status === s ? 'border-primary bg-accent text-primary' : 'border-border text-foreground hover:bg-muted'"
              :disabled="updating || batch.status === s"
              @click="setStatus(s)"
            >
              {{ INTERNAL_STATUS[s].label }}
            </button>
            <span class="text-[11px] text-muted-foreground">(cascade xuống item)</span>
          </div>
        </div>

        <!-- Items -->
        <div class="card overflow-hidden">
          <div class="border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Items trong batch</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-card">
                <tr>
                  <th class="table-th">Item</th>
                  <th class="table-th">Order</th>
                  <th class="table-th">SKU</th>
                  <th class="table-th">Mockup</th>
                  <th class="table-th">Print/Cut</th>
                  <th class="table-th">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="it in items" :key="it.id" class="hover:bg-muted">
                  <td class="table-td font-medium text-foreground">{{ it.item_code }}</td>
                  <td class="table-td">{{ it.order_code || it.store_order_id || '—' }}</td>
                  <td class="table-td">{{ it.sku_code }}</td>
                  <td class="table-td"><UiMockupLink :url="it.mockup_url" small label="Mockup" /></td>
                  <td class="table-td text-xs text-muted-foreground">
                    {{ it.print_file_url ? 'In ✓' : 'In ✗' }} · {{ it.cut_file_url ? 'Cắt ✓' : 'Cắt ✗' }}
                  </td>
                  <td class="table-td"><UiStatusBadge kind="internal" :value="it.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p class="mt-4 text-xs text-muted-foreground">
          Lịch sử thao tác: Designer tạo batch → thợ in/cắt sản xuất → QC mở mockup đối chiếu → scan cập nhật Đã QC.
        </p>
      </template>
    </UiStateBlock>
  </div>
</template>
