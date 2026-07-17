<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { Batch, InternalStatus } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useApiResource } from '~/composables/useApiResource'
import { INTERNAL_STATUS, PRODUCTION_STATUS_ORDER } from '~/utils/enums'
import { errorMessage } from '~/utils/api-error'
import { formatDate } from '~/utils/format'
import { isBatchOverdue, overdueDays } from '~/utils/batch'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'

const route = useRoute()
const id = route.params.id as string
const auth = useAuthStore()
const toast = useToastStore()

const { data: batch, loading, error, reload } = useApiResource<Batch>(() => batchesApi.get(id))
const items = computed(() =>
  (batch.value?.items ?? []).filter(
    (item) => item.order_item?.cancellation_status !== 'SELLER_CANCELLED' && item.order_item?.cancellation_status !== 'APPROVED',
  ),
)

// Roles allowed to advance batch status (production + supervisors). Mirrors the
// backend PATCH /batches/:id/status guard (Owner/Admin/Ops/Production/Designer).
const canChangeStatus = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'].includes(auth.role ?? ''),
)

// Batch đã QC (roll-up từ item đã QC ở trạm QC) → khoá board, không cho hạ cấp
// trạng thái sản xuất. QC_PASSED chỉ do trạm QC đặt, 1 lần cho cả sản phẩm.
const qcLocked = computed(() => batch.value?.status === 'QC_PASSED')

// Sản xuất tiến 1 chiều: một chặng ĐỨNG TRƯỚC trạng thái hiện tại đã qua rồi → làm
// mờ + không cho bấm (lùi về sẽ hạ cấp batch-item và phá cổng QC "mọi NVL đã cắt").
function isPastStep(s: InternalStatus): boolean {
  if (!batch.value) return false
  return PRODUCTION_STATUS_ORDER.indexOf(s) < PRODUCTION_STATUS_ORDER.indexOf(batch.value.status)
}

// Chỉ OWNER được hạ trạng thái (sửa khi bấm nhầm) — khớp guard BE. Các role khác
// chỉ tiến. Item đã QC trong batch không bị đụng tới dù có hạ (BE bảo vệ).
const isOwner = computed(() => auth.role === 'OWNER')

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

// Từ nút board: nếu là hạ trạng thái (OWNER sửa bấm nhầm) thì xác nhận trước —
// vì nó cascade xuống item. Tiến tới thì cập nhật thẳng.
async function chooseStatus(status: InternalStatus) {
  if (!batch.value) return
  if (isPastStep(status)) {
    const ok = await useConfirm().confirm({
      title: 'Hạ trạng thái sản xuất',
      message: `Batch đang ở "${INTERNAL_STATUS[batch.value.status].label}". Hạ về "${INTERNAL_STATUS[status].label}"? Chỉ dùng khi bấm nhầm — item đã QC sẽ không bị ảnh hưởng.`,
      tone: 'danger',
      confirmText: 'Hạ trạng thái',
    })
    if (!ok) return
  }
  setStatus(status)
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

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string | number) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESC[c])

// Google Drive share links (…/file/d/ID/view, open?id=ID, uc?id=ID) don't render
// in <img>; rewrite to the public thumbnail endpoint so the design preview shows.
// Other URLs are returned as-is (assumed direct image links).
function toImageSrc(url: string): string {
  if (!url) return ''
  const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600` : url
}

const downloadingZip = ref(false)
async function downloadBatchAssets() {
  if (!batch.value || downloadingZip.value) return
  downloadingZip.value = true
  try {
    await batchesApi.downloadAssetsZip(batch.value.id, batch.value.code)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingZip.value = false
  }
}

const printingLabels = ref(false)
async function printLabels() {
  if (!batch.value || printingLabels.value) return
  // Open the print window synchronously (before any await) so popup blockers
  // don't kill it; fill in the real content once QR codes are generated.
  const w = window.open('', '_blank')
  if (!w) {
    toast.error('Trình duyệt chặn cửa sổ in. Hãy cho phép popup rồi thử lại.')
    return
  }
  w.document.write('<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif;padding:24px">Đang tạo tem…</body>')

  printingLabels.value = true
  try {
    const { code, created_at } = batch.value
    // Ngày trên tem = ngày tạo batch sản xuất; batch cũ thiếu created_at thì lấy ngày in.
    const labelDate = created_at
      ? formatDate(created_at)
      : new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const QRCode = (await import('qrcode')).default
    const labels = await Promise.all(
      prodRows.value.map(async (r) => {
        const payload = r.internal_code || code
        let qr = ''
        try {
          qr = await QRCode.toDataURL(payload, { margin: 1, width: 240 })
        } catch { /* QR optional — fall through to text-only label */ }
        const img = toImageSrc(r.design_url)
        return `
          <div class="label">
            <div class="top">
              ${qr ? `<img class="qr" src="${esc(qr)}" alt="QR ${esc(payload)}" />` : ''}
              <div class="meta">
                <div class="sub">${esc(code)} · ${esc(r.sku_code || '—')}</div>
                <div class="code">${esc(r.internal_code || '—')}</div>
                <div class="sub">SL: ${esc(r.quantity || '—')} · Ngày: ${esc(labelDate)}</div>
                <div class="desc">${esc(r.qc_description || '')}</div>
              </div>
            </div>
            ${img ? `<img class="design" src="${esc(img)}" alt="design" onerror="this.style.display='none'" />` : ''}
          </div>`
      }),
    )
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(code)} labels</title>
      <style>
        body { margin: 16px; font-family: ui-monospace, monospace; }
        .label { display: inline-block; box-sizing: border-box; width: 340px; vertical-align: top;
          border: 1px solid #ccc; border-radius: 8px; padding: 14px; margin: 8px; page-break-inside: avoid; }
        .top { display: flex; gap: 12px; align-items: center; }
        .qr { width: 96px; height: 96px; flex: 0 0 auto; }
        .meta { min-width: 0; }
        .sub { font-size: 12px; color: #666; }
        .code { font-size: 20px; font-weight: bold; margin-top: 4px; word-break: break-all; }
        .desc { font-size: 11px; color: #888; margin-top: 4px; }
        .design { display: block; width: 100%; max-height: 180px; object-fit: contain; margin-top: 12px;
          border-top: 1px dashed #ddd; padding-top: 12px; }
        @media print { .label { border-color: #999; } }
      </style></head>
      <body>${labels.join('')}
      <script>
        (function () {
          var printed = false;
          function go() { if (!printed) { printed = true; window.print(); } }
          window.addEventListener('load', go);
          setTimeout(go, 3000); // fallback if a design image never loads
        })();
      <\/script></body></html>`
    w.document.open()
    w.document.write(html)
    w.document.close()
  } catch (e) {
    w.close()
    toast.error(errorMessage(e))
  } finally {
    printingLabels.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-4">
      <NuxtLink to="/batches" class="text-sm text-primary hover:underline">← Về danh sách batch</NuxtLink>
      <NuxtLink
        v-if="batch?.parent_batch_id"
        :to="`/batches/${batch.parent_batch_id}`"
        class="text-sm text-primary hover:underline"
      >
        ↑ Về batch mẹ
      </NuxtLink>
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
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <UiStatusBadge kind="internal" :value="batch.status" />
                <UiStatusBadge kind="priority" :value="batch.priority || 'NORMAL'" />
                <span class="text-xs text-muted-foreground">{{ batch.item_count ?? items.length }} item</span>
                <span v-if="batch.due_date" class="text-xs text-muted-foreground">· Hạn: {{ formatDate(batch.due_date) }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary" :disabled="printingLabels" @click="printLabels">
                <UiSpinner v-if="printingLabels" :size="16" />
                <UiIcon v-else name="qc" :size="16" /> In tem QR
              </button>
              <button class="btn-primary" :disabled="exporting" @click="exportProduction">
                <UiSpinner v-if="exporting" :size="16" />
                <UiIcon v-else name="upload" :size="16" /> Xuất Excel (.xlsx)
              </button>
              <button class="btn-secondary" :disabled="downloadingZip" @click="downloadBatchAssets">
                <UiSpinner v-if="downloadingZip" :size="16" />
                <UiIcon v-else name="box" :size="16" /> Download ZIP
              </button>
            </div>
          </div>

          <!-- Overdue warning -->
          <div
            v-if="isBatchOverdue(batch)"
            class="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
          >
            <UiIcon name="alert" :size="16" />
            Batch đã trễ hạn {{ overdueDays(batch) }} ngày (hạn {{ formatDate(batch.due_date) }}) mà chưa hoàn tất QC.
          </div>

          <!-- Status control -->
          <div v-if="canChangeStatus" class="mt-4 border-t border-border pt-4">
            <div v-if="qcLocked" class="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <UiIcon name="check" :size="16" />
              Đã QC ở trạm QC — batch hoàn tất, không cần cập nhật trạng thái sản xuất nữa.
            </div>
            <div v-else class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-medium text-muted-foreground">Cập nhật trạng thái sản xuất:</span>
              <button
                v-for="s in PRODUCTION_STATUS_ORDER"
                :key="s"
                class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                :class="batch.status === s
                  ? 'border-primary bg-accent text-primary'
                  : isPastStep(s)
                    ? (isOwner ? 'border-dashed border-border text-muted-foreground hover:bg-muted' : 'border-border text-muted-foreground opacity-40')
                    : 'border-border text-foreground hover:bg-muted'"
                :disabled="updating || batch.status === s || (isPastStep(s) && !isOwner)"
                :title="isPastStep(s) ? (isOwner ? 'Chặng đã qua — bấm để hạ về (sửa nhầm)' : 'Chặng đã qua — sản xuất chỉ tiến, không lùi') : ''"
                @click="chooseStatus(s)"
              >
                {{ INTERNAL_STATUS[s].label }}
              </button>
              <span class="text-[11px] text-muted-foreground">
                (cascade xuống item · QC làm 1 lần ở trạm QC{{ isOwner ? ' · OWNER được hạ để sửa nhầm' : '' }})
              </span>
            </div>
          </div>
        </div>

        <!-- Batch mẹ: danh sách batch con -->
        <div v-if="batch.is_parent" class="card mb-5 overflow-hidden">
          <div class="border-b border-border bg-muted px-4 py-2.5">
            <h3 class="text-sm font-semibold text-foreground">
              Batch con ({{ batch.child_batches?.length ?? batch.child_count ?? 0 }}) — chẻ theo định mức NVL
            </h3>
          </div>
          <UiStateBlock :empty="!(batch.child_batches && batch.child_batches.length)" empty-text="Chưa có batch con.">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-border">
                <thead class="bg-card">
                  <tr>
                    <th class="table-th">Batch con</th>
                    <th class="table-th">Số item</th>
                    <th class="table-th">Trạng thái</th>
                    <th class="table-th"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="c in batch.child_batches" :key="c.id" class="hover:bg-muted">
                    <td class="table-td font-medium text-foreground">{{ c.code }}</td>
                    <td class="table-td">{{ c.item_count ?? c.items?.length ?? 0 }}</td>
                    <td class="table-td"><UiStatusBadge kind="internal" :value="c.status" /></td>
                    <td class="table-td text-right">
                      <NuxtLink :to="`/batches/${c.id}`" class="text-xs font-medium text-primary hover:underline">Open</NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UiStateBlock>
        </div>

        <!-- Items (production template fields) — batch mẹ không giữ item trực tiếp -->
        <div v-if="!batch.is_parent" class="card overflow-hidden">
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
