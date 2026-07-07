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

// Roles allowed to advance batch status (production + supervisors). Mirrors the
// backend PATCH /batches/:id/status guard (Owner/Admin/Ops/Production/Designer).
const canChangeStatus = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'].includes(auth.role ?? ''),
)

// Production rows for the batch table — mirrors the legacy production template.
// Reads from the preloaded order item (real API); falls back to the flat fields
// some mock/list shapes carry.
interface ProdRow {
  internal_code: string
  sku_code: string
  material: string
  qc_description: string
  image_code: string
  production_sequence: number | string
  quantity: number | string
  design_url: string
  mockup_url: string
  production_file_name: string
  print_file_url: string
  cut_file_url: string
  status: InternalStatus
}
const prodRows = computed<ProdRow[]>(() =>
  items.value.map((bi) => {
    const oi = bi.order_item
    return {
      internal_code: oi?.internal_code ?? bi.item_code ?? '—',
      sku_code: oi?.sku_code ?? bi.sku_code ?? '—',
      material: bi.material?.name ?? batch.value?.material_name ?? batch.value?.material?.name ?? '—',
      qc_description: oi?.qc_description ?? '',
      image_code: oi?.image_code ?? '',
      production_sequence: oi?.production_sequence ?? '',
      quantity: oi?.quantity ?? '',
      design_url: oi?.design_url ?? '',
      mockup_url: oi?.mockup_url ?? bi.mockup_url ?? '',
      production_file_name: oi?.production_file_name ?? '',
      print_file_url: oi?.print_file_url ?? bi.print_file_url ?? '',
      cut_file_url: oi?.cut_file_url ?? bi.cut_file_url ?? '',
      status: bi.status,
    }
  }),
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

// Download the legacy-compatible production template as a real .xlsx workbook
// (server-generated so columns split cleanly in Excel on any locale and the
// Vietnamese headers match the workshop's spreadsheet exactly).
const exporting = ref(false)
async function exportProduction() {
  if (!batch.value || exporting.value) return
  exporting.value = true
  try {
    await batchesApi.exportProductionTemplate(batch.value.id, batch.value.code)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    exporting.value = false
  }
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
              <button class="btn-primary" :disabled="exporting" @click="exportProduction">
                <UiSpinner v-if="exporting" :size="16" />
                <UiIcon v-else name="upload" :size="16" /> Xuất Excel (.xlsx)
              </button>
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

        <!-- Items (production template fields) -->
        <div class="card overflow-hidden">
          <div class="border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">Items trong batch (dữ liệu sản xuất)</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-card">
                <tr>
                  <th class="table-th sticky left-0 z-20 bg-card">Mã nội bộ</th>
                  <th class="table-th hidden sm:table-cell">SKU</th>
                  <th class="table-th hidden md:table-cell">Loại VL</th>
                  <th class="table-th hidden lg:table-cell">Mô tả QC</th>
                  <th class="table-th hidden lg:table-cell">Mã ảnh</th>
                  <th class="table-th hidden lg:table-cell">STT</th>
                  <th class="table-th hidden sm:table-cell">SL</th>
                  <th class="table-th hidden lg:table-cell">Link ảnh</th>
                  <th class="table-th hidden md:table-cell">Mockup</th>
                  <th class="table-th hidden lg:table-cell">Tên file</th>
                  <th class="table-th hidden md:table-cell">Link in</th>
                  <th class="table-th hidden md:table-cell">Link cắt</th>
                  <th class="table-th">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(r, idx) in prodRows" :key="idx" class="group hover:bg-muted">
                  <td class="table-td sticky left-0 z-10 bg-card font-medium text-foreground group-hover:bg-muted">{{ r.internal_code }}</td>
                  <td class="table-td hidden sm:table-cell">{{ r.sku_code }}</td>
                  <td class="table-td hidden md:table-cell">{{ r.material }}</td>
                  <td class="table-td hidden max-w-[16rem] truncate text-xs text-muted-foreground lg:table-cell" :title="r.qc_description">
                    {{ r.qc_description || '—' }}
                  </td>
                  <td class="table-td hidden text-xs lg:table-cell">{{ r.image_code || '—' }}</td>
                  <td class="table-td hidden text-xs lg:table-cell">{{ r.production_sequence === '' ? '—' : r.production_sequence }}</td>
                  <td class="table-td hidden text-xs sm:table-cell">{{ r.quantity === '' ? '—' : r.quantity }}</td>
                  <td class="table-td hidden lg:table-cell">
                    <a v-if="r.design_url" :href="r.design_url" target="_blank" class="text-primary hover:underline"><UiIcon name="link" :size="14" /></a>
                    <span v-else class="text-xs text-muted-foreground">—</span>
                  </td>
                  <td class="table-td hidden md:table-cell"><UiMockupLink :url="r.mockup_url" small label="Mockup" /></td>
                  <td class="table-td hidden max-w-[10rem] truncate text-xs text-muted-foreground lg:table-cell" :title="r.production_file_name">
                    {{ r.production_file_name || '—' }}
                  </td>
                  <td class="table-td hidden md:table-cell">
                    <a v-if="r.print_file_url" :href="r.print_file_url" target="_blank" class="text-primary hover:underline"><UiIcon name="link" :size="14" /></a>
                    <span v-else class="text-xs text-muted-foreground">—</span>
                  </td>
                  <td class="table-td hidden md:table-cell">
                    <a v-if="r.cut_file_url" :href="r.cut_file_url" target="_blank" class="text-primary hover:underline"><UiIcon name="link" :size="14" /></a>
                    <span v-else class="text-xs text-muted-foreground">—</span>
                  </td>
                  <td class="table-td"><UiStatusBadge kind="internal" :value="r.status" /></td>
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
