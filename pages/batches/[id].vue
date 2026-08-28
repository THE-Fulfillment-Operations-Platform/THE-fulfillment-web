<script setup lang="ts">
import { batchesApi } from '~/services/api'
import type { Batch, BatchLink, BatchLinkKind, InternalStatus } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useApiResource } from '~/composables/useApiResource'
import { INTERNAL_STATUS, PRODUCTION_STATUS_ORDER } from '~/utils/enums'
import { errorMessage } from '~/utils/api-error'
import { formatDate, formatDateTime, isValidUrl } from '~/utils/format'
import { isBatchOverdue, overdueDays } from '~/utils/batch'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { refreshActionCounts } from '~/composables/useActionCounts'

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
// Phần đã ghi bỏ vẫn nằm trong batch làm bằng chứng "tấm này đã làm ra những gì"
// (BE trả kèm khi batch đã đóng). Chúng không còn là việc phải làm, nên bảng
// dưới đánh dấu rõ thay vì để lẫn với hàng đang sản xuất.
const liveItemCount = computed(() => items.value.filter((i) => !i.scrapped_at).length)

// Roles allowed to advance batch status (production + supervisors). Mirrors the
// backend PATCH /batches/:id/status guard (Owner/Admin/Ops/Production/Designer).
const canChangeStatus = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'].includes(auth.role ?? ''),
)

// Batch đã QC (roll-up từ item đã QC ở trạm QC) → khoá board, không cho hạ cấp
// trạng thái sản xuất. QC_PASSED chỉ do trạm QC đặt, 1 lần cho cả sản phẩm.
const qcLocked = computed(() => batch.value?.status === 'QC_PASSED')

// Batch đã đóng: hoặc mọi phần bị huỷ lẻ ở QC, hoặc cả tấm bị huỷ. Không còn gì
// để sản xuất — hàng làm lại nằm ở batch MỚI — nên mọi nút sửa đều tắt và màn
// này chỉ còn là lịch sử của tấm đó.
const closed = computed(() => !!batch.value?.closed_at)

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
  // Phần đã ghi bỏ (QC fail lẻ hoặc huỷ cả batch) — dòng vẫn hiện để truy vết.
  scrapped: boolean
  scrap_reason: string
  // Đơn gốc — hiện ở cột "Mã đơn shop" (orderID đi xuyên suốt vòng đời đơn,
  // từ import tới hành trình) và in trên tem QR cùng người nhận + seller.
  order_id: number | null
  store_order_id: string
  shipping_name: string
  seller_name: string
}
const prodRows = computed<ProdRow[]>(() =>
  items.value.map((bi) => {
    const oi = bi.order_item
    // BatchLink is the canonical production link shared by every row. Keep the
    // old per-item URL as a fallback for legacy batches that have no shared link.
    const sharedPrintUrl = batchLink('PRINT')?.url
    const sharedCutUrl = batchLink('CUT')?.url
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
      print_file_url: sharedPrintUrl || oi?.print_file_url || bi.print_file_url || '',
      cut_file_url: sharedCutUrl || oi?.cut_file_url || bi.cut_file_url || '',
      status: bi.status,
      scrapped: !!bi.scrapped_at,
      scrap_reason: bi.scrap_reason ?? '',
      // Batch detail preload kèm order_item.order; hai nhánh sau là dự phòng cho
      // các shape phẳng (list endpoint / mock) không có object order lồng bên trong.
      order_id: oi?.order_id ?? oi?.order?.id ?? null,
      store_order_id: oi?.order?.store_order_id || oi?.store_order_id || bi.store_order_id || '',
      shipping_name: oi?.order?.shipping_name ?? '',
      seller_name: oi?.order?.seller?.name ?? '',
    }
  }),
)

// Chặng đang chờ server xác nhận (null = rảnh). Giữ chính status thay vì cờ
// boolean để nút vừa bấm hiện spinner đúng chỗ và màn hình chờ gọi tên chặng.
const pendingStatus = ref<InternalStatus | null>(null)
const updating = computed(() => pendingStatus.value !== null)
// 0 = đang gọi PATCH (BE cascade xuống item), 1 = đang áp dữ liệu trả về.
const busyStep = ref(0)
const busySubtitle = computed(() => {
  if (!batch.value) return ''
  return batch.value.is_parent
    ? `Batch mẹ ${batch.value.code} — cập nhật lan sang các batch con.`
    : `Batch ${batch.value.code} · ${items.value.length} item cập nhật theo.`
})

async function setStatus(status: InternalStatus) {
  if (!batch.value || updating.value) return
  pendingStatus.value = status
  busyStep.value = 0
  try {
    const { data: updated } = await batchesApi.setStatus(batch.value.id, status)
    // PATCH trả về đúng payload của GET /batches/:id (BE dùng chung FindByID sau
    // khi commit) nên gán thẳng. Gọi reload() ở đây là tốn thêm một vòng ~0.5s
    // chỉ để lấy lại y hệt dữ liệu vừa nhận.
    batch.value = updated
    busyStep.value = 1
    toast.success(`Đã cập nhật batch → ${INTERNAL_STATUS[status].label}`)
  } catch (e) {
    toast.error(errorMessage(e))
    // Chỉ khi lỗi mới cần hỏi lại server: có thể BE đã đổi một phần trước khi hỏng.
    await reload()
  } finally {
    pendingStatus.value = null
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

// Tải riêng file Design gốc (front/back, KHÔNG kèm mockup) — tách khỏi bundle đầy đủ.
const downloadingDesignZip = ref(false)
async function downloadBatchDesign() {
  if (!batch.value || downloadingDesignZip.value) return
  downloadingDesignZip.value = true
  try {
    await batchesApi.downloadDesignZip(batch.value.id, batch.value.code)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    downloadingDesignZip.value = false
  }
}

// ---- Link sản xuất theo Batch (Print/Cut) ----------------------------------
// Link dùng chung cho cả batch (nhập 1 lần, mọi design trong batch dùng chung).
// Chỉ OWNER/ADMIN/OPS/DESIGNER được thêm/sửa — BE guard giống hệt.
const LINK_LABELS: Record<BatchLinkKind, string> = { PRINT: 'Link in', CUT: 'Link cắt' }
const canEditLinks = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'].includes(auth.role ?? '') && !closed.value,
)

function batchLink(kind: BatchLinkKind): BatchLink | undefined {
  return batch.value?.links?.find((l) => l.kind === kind)
}
const linkRows = computed<{ kind: BatchLinkKind; label: string; link: BatchLink | undefined }[]>(() => [
  { kind: 'PRINT', label: LINK_LABELS.PRINT, link: batchLink('PRINT') },
  { kind: 'CUT', label: LINK_LABELS.CUT, link: batchLink('CUT') },
])

// Entering fabrication needs both shared files: nobody can have printed or cut
// without them, and the backend refuses the transition. Mirrored here so the buttons
// explain themselves instead of failing on click. Parent batches hold no items and
// carry no links, so the rule doesn't apply to them (backend skips them too).
const missingProductionLinks = computed(() => {
  if (batch.value?.is_parent) return []
  return linkRows.value.filter((r) => !r.link).map((r) => r.label.toLowerCase())
})
function statusNeedsLinks(s: InternalStatus) {
  return s === 'PRINTED' || s === 'CUT'
}
function statusBlockedReason(s: InternalStatus) {
  if (!statusNeedsLinks(s) || !missingProductionLinks.value.length) return ''
  return `Batch chưa có ${missingProductionLinks.value.join(' và ')} — thêm link sản xuất dùng chung trước.`
}

const linkModalOpen = ref(false)
const linkModalKind = ref<BatchLinkKind>('PRINT')
const linkUrl = ref('')
const savingLink = ref(false)
// Link hiện có của kind đang mở — quyết định "Thêm" vs "Sửa/thay thế".
const editingLink = computed(() => batchLink(linkModalKind.value))
const normalizedLinkUrl = computed(() => linkUrl.value.trim())
const linkUrlValid = computed(() => isValidUrl(normalizedLinkUrl.value))
const linkUnchanged = computed(() => normalizedLinkUrl.value === (editingLink.value?.url ?? ''))

function openLinkModal(kind: BatchLinkKind) {
  linkModalKind.value = kind
  linkUrl.value = batchLink(kind)?.url ?? ''
  linkModalOpen.value = true
}

async function saveLink() {
  if (!batch.value || savingLink.value) return
  const url = normalizedLinkUrl.value
  if (!linkUrlValid.value) {
    toast.error('Link không hợp lệ — cần URL bắt đầu bằng http:// hoặc https://')
    return
  }
  const label = LINK_LABELS[linkModalKind.value].toLowerCase()
  // Nhập lại khi đã có link → thay thế link cũ, xác nhận trước.
  if (editingLink.value) {
    const ok = await useConfirm().confirm({
      title: `Thay thế ${label}`,
      message: `Batch đã có ${label}. Lưu link mới sẽ thay thế link hiện tại. Tiếp tục?`,
      tone: 'warning',
      confirmText: 'Thay thế',
    })
    if (!ok) return
  }
  savingLink.value = true
  try {
    const { data: saved } = await batchesApi.setLink(batch.value.id, linkModalKind.value, url)
    // Update immediately so all item rows switch to the shared link without a
    // visible stale interval; reload still refreshes updater/timestamps from BE.
    batch.value.links = [
      ...(batch.value.links ?? []).filter((link) => link.kind !== saved.kind),
      saved,
    ]
    toast.success(`Đã lưu ${label}`)
    linkModalOpen.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    savingLink.value = false
  }
}

// ---- Huỷ batch ĐÃ sản xuất --------------------------------------------------
// Hai lệnh khác hẳn nhau, đừng lẫn:
//   Xoá  = undo của lệnh gom batch. Chưa ai đụng vào, xoá sạch dấu vết.
//   Huỷ  = tấm đã in/cắt hỏng thật. Vật liệu đã tiêu, nên bản ghi phải ở lại:
//          từng phần đánh dấu huỷ kèm lý do, batch đóng, sản phẩm về hàng chờ
//          để làm lại ở một batch MỚI.
// Hiện nút khi batch đã vào sản xuất (hoặc còn PENDING nhưng đã có phần bị huỷ
// ở QC — trường hợp đó xoá cũng từ chối, không có nút này thì batch kẹt).
// Role khớp guard BE: sản xuất và QC là người đứng cạnh cái tấm đó; DESIGNER thì
// không — họ gom batch, không ghi bỏ vật liệu đã tiêu.
const canScrap = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'QC'].includes(auth.role ?? '') &&
  !!batch.value &&
  !closed.value &&
  (batch.value.status !== 'PENDING' || (batch.value.scrapped_count ?? 0) > 0),
)
const scrapOpen = ref(false)
const scrapping = ref(false)
const scrapForm = reactive({ reason: '', route: 'PRODUCTION' as 'PRODUCTION' | 'DESIGN' })
const scrapReason = computed(() => scrapForm.reason.trim())
// 60 ký tự là đúng sức chứa cột lý do ở BE — chặn ngay ở đây để không mất công gõ.
const scrapReasonValid = computed(() => scrapReason.value.length > 0 && scrapReason.value.length <= 60)
const scrapRouteOptions = [
  { value: 'PRODUCTION', label: 'Làm lại sản xuất (file design giữ nguyên)' },
  { value: 'DESIGN', label: 'Trả về Chờ thiết kế (cả tấm sai vì file sai)' },
]
const openChildCount = computed(
  () => (batch.value?.child_batches ?? []).filter((c) => !c.closed_at).length,
)

function openScrap() {
  scrapForm.reason = ''
  scrapForm.route = 'PRODUCTION'
  scrapOpen.value = true
}

async function submitScrap() {
  if (!batch.value || scrapping.value || !scrapReasonValid.value) return
  scrapping.value = true
  try {
    const { data } = await batchesApi.scrap(batch.value.id, {
      reason: scrapReason.value,
      route: scrapForm.route,
    })
    const where = data.route === 'DESIGN' ? 'hàng chờ thiết kế' : 'hàng chờ gom batch'
    toast.success(
      `Đã huỷ ${data.batch_codes.join(', ')} — ${data.scrapped_parts} phần sản xuất ghi bỏ, sản phẩm về ${where} để làm lại.`,
    )
    scrapOpen.value = false
    await reload()
    // Huỷ batch mở một ghi chú "cần xử lý" ở BE → badge sidebar vừa tăng.
    void refreshActionCounts()
  } catch (e) {
    toast.error(errorMessage(e))
    await reload()
  } finally {
    scrapping.value = false
  }
}

// ---- Xoá batch chưa sản xuất ------------------------------------------------
// Chỉ hiện khi còn xoá được: PENDING toàn bộ, chưa đóng, không phải batch con
// (con xoá qua batch mẹ — cụm chia định mức đi cùng nhau). Role khớp guard BE
// (roleDesignOps). BE còn chặn lần cuối trong transaction nên bấm trễ sau khi
// xưởng đã chuyển trạng thái chỉ nhận 422, không mất dữ liệu.
const canDelete = computed(() =>
  ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'].includes(auth.role ?? '') &&
  !!batch.value &&
  batch.value.status === 'PENDING' &&
  !batch.value.parent_batch_id &&
  !batch.value.closed_at,
)
const deleting = ref(false)
async function deleteBatch() {
  if (!batch.value || deleting.value) return
  const childCount = batch.value.child_batches?.length ?? batch.value.child_count ?? 0
  const scopeNote = batch.value.is_parent && childCount
    ? ` (gồm cả ${childCount} batch con)`
    : ''
  const ok = await useConfirm().confirm({
    title: `Xoá batch ${batch.value.code}`,
    message: `Xoá batch${scopeNote}? Sản phẩm trong batch sẽ quay về màn gom batch để gom lại; tem QR đã in cho batch này (nếu có) phải bỏ, gom batch mới in tem mới. Chỉ xoá được batch chưa sản xuất.`,
    tone: 'danger',
    confirmText: 'Xoá batch',
  })
  if (!ok) return
  deleting.value = true
  try {
    await batchesApi.remove(batch.value.id)
    toast.success(`Đã xoá batch ${batch.value.code} — sản phẩm đã trả về hàng chờ gom batch`)
    navigateTo('/batches')
  } catch (e) {
    toast.error(errorMessage(e))
    // BE từ chối thường vì batch vừa đổi trạng thái — tải lại cho khớp thực tế.
    await reload()
  } finally {
    deleting.value = false
  }
}

// Tem chỉ in cho phần CÒN SỐNG. Batch đã đóng vẫn trả về cả phần đã huỷ để màn
// chi tiết kể được tấm đó đã làm ra những gì, nhưng in tem cho một sản phẩm đã
// vứt đi là dán nhãn lên hàng không tồn tại — và số trên tem lô sẽ sai theo.
const labelRows = computed(() => prodRows.value.filter((r) => !r.scrapped))

// Số trên tem lô là số SẢN PHẨM, không phải số dòng: một dòng có thể mang SL > 1,
// mà người ở xưởng đếm hàng chứ không đếm dòng. Dữ liệu thiếu SL thì rơi về số
// dòng để tem không hiện con số 0 vô nghĩa.
const labelProductCount = computed(() => {
  const total = labelRows.value.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  return total > 0 ? total : labelRows.value.length
})

const printingLabels = ref(false)
async function printLabels() {
  if (!batch.value || printingLabels.value) return
  const rows = labelRows.value
  // Kiểm tra TRƯỚC khi mở popup: mở rồi mới phát hiện không có gì để in thì
  // người dùng phải tự đóng một cửa sổ trắng.
  if (!rows.length) {
    toast.info(
      batch.value.is_parent
        ? 'Batch mẹ không giữ sản phẩm — mở từng batch con để in tem.'
        : 'Batch không còn sản phẩm nào để in tem.',
    )
    return
  }
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
      rows.map(async (r) => {
        const payload = r.internal_code || code
        let qr = ''
        try {
          // 25mm ở 300dpi ≈ 300px — render 512px cho nét khi in nhiệt.
          qr = await QRCode.toDataURL(payload, { margin: 1, width: 512 })
        } catch { /* QR optional — fall through to text-only label */ }
        return `
          <div class="label">
            <div class="top">
              ${qr ? `<img class="qr" src="${esc(qr)}" alt="QR ${esc(payload)}" />` : ''}
              <div class="meta">
                <div class="code">${esc(r.internal_code || '—')}</div>
                <div class="sub">${esc(code)} · ${esc(r.sku_code || '—')}</div>
                <div class="sub">SL: ${esc(r.quantity || '—')} · ${esc(labelDate)}</div>
              </div>
            </div>
            <div class="info">
              ${r.seller_name ? `<div class="row"><span class="key">Seller</span><span class="val">${esc(r.seller_name)}</span></div>` : ''}
              <div class="row"><span class="key">Order</span><span class="val">${esc(r.store_order_id || '—')}</span></div>
              <div class="row"><span class="key">Nhận</span><span class="val">${esc(r.shipping_name || '—')}</span></div>
              ${r.qc_description ? `<div class="desc">${esc(r.qc_description)}</div>` : ''}
            </div>
          </div>`
      }),
    )
    // ---- Tem lô: tờ đầu tiên, dán lên khay/chồng hàng của cả batch ----------
    //
    // Đọc bằng MẮT TỪ XA, không phải để quét: nó nằm trên kệ, trên xe đẩy, và
    // câu hỏi duy nhất người ta hỏi nó là "lô nào, bao nhiêu cái". Nên hai con
    // số đó chiếm gần hết tem, phần còn lại chỉ đủ để không phải mở máy tra.
    //
    // Cố tình KHÔNG có QR: mã batch không tra được ở trạm QC (trạm đó quét mã
    // tem sản phẩm), nên một ô QR ở đây chỉ mời người ta quét nhầm rồi nhận
    // "không tìm thấy item". Khung viền + chữ "TEM LÔ" là để trong chồng tem
    // vừa in ra, tờ này không bao giờ bị nhặt nhầm thành tem sản phẩm.
    // Cỡ mã batch theo số ký tự. Mã thường là "#101041" (7); batch con thêm hậu
    // tố thành "#101041-10" (10). Ở cỡ lớn nhất, mã 10 ký tự tràn chiều ngang
    // giấy A4 và bị đẩy xuống dòng — nên mã càng dài thì hạ cỡ, thay vì để nó vỡ.
    const batchCodeSize = (len: number): string => {
      if (len <= 8) return '21vmin'
      if (len <= 10) return '16.5vmin'
      if (len <= 12) return '14vmin'
      return '11vmin'
    }
    const materialName = batch.value.material_name || batch.value.material?.name || batch.value.material_code || ''
    const productCount = labelProductCount.value
    const sheetNote = productCount !== rows.length ? `${rows.length} tem sản phẩm` : ''
    const batchLabel = `
      <div class="label batch-label">
        <div class="frame">
          <div class="kind">Tem lô sản xuất</div>
          <div class="bcode" style="font-size:${batchCodeSize(code.length)}">${esc(code)}</div>
          <div class="bcount"><span class="num">${productCount}</span><span class="unit">sản phẩm</span></div>
          <div class="bfoot">
            ${materialName ? esc(materialName) + ' · ' : ''}${esc(labelDate)}${sheetNote ? ' · ' + esc(sheetNote) : ''}
          </div>
        </div>
      </div>`

    // Cửa sổ in không phân giải được đường dẫn tương đối → nhúng origin vào @font-face.
    const origin = window.location.origin
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(code)} labels</title>
      <style>
        /* Tem tự co giãn PHỦ KÍN tờ giấy được chọn trong hộp thoại in. Không khoá
           @page size cứng nữa: bản cũ ghim trang 70x50mm nên hễ hộp thoại in để
           khổ khác (A4…) là tem 65x45mm nằm lọt một góc, chỉnh mãi không hết.
           Mọi kích thước dùng vmin (tỷ lệ theo cạnh ngắn của giấy) nên chữ/QR giữ
           đúng tỷ lệ thiết kế 70x50mm gốc trên bất kỳ khổ giấy nào — decal 70x50
           tràn kín decal, A4 phóng to kín A4. Khi in vẫn cần: margins = None và
           tắt headers/footers trong hộp thoại in.
           Bố cục: QR bên trái + mã nội bộ/thông tin phụ bên cạnh, các trường
           Seller/Order/Người nhận chạy full chiều ngang bên dưới. */
        @page { margin: 0; }
        html, body { margin: 0; padding: 0; }
        /* Font tem — KHÔNG được để số 0 có gạch chéo, CS đọc nhầm mã đơn.
           Cửa sổ in là about:blank mở bằng window.open nên KHÔNG kế thừa CSS của
           app: phải khai lại @font-face ở đây, và phải dùng URL tuyệt đối
           (${origin}) vì đường dẫn tương đối không phân giải được trên
           about:blank. Ba lớp bảo hiểm chồng nhau:
             1. Inter tự host — số 0 trơn, không gạch chéo, có đủ dấu tiếng Việt;
             2. chain dự phòng chỉ toàn font sans, chốt bằng sans-serif, tuyệt đối
                không có font monospace nào (mono là thứ đẻ ra 0-gạch-chéo);
             3. font-feature-settings "zero" 0 khoá biến thể 0-gạch-chéo ở bất kỳ
                font nào có sẵn feature ấy.
           Mất mạng hay font lỗi thì rơi xuống lớp 2 — vẫn không gạch chéo. */
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900;
          font-display: block; src: url('${origin}/fonts/inter-vietnamese.woff2') format('woff2');
          unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900;
          font-display: block; src: url('${origin}/fonts/inter-latin-ext.woff2') format('woff2');
          unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900;
          font-display: block; src: url('${origin}/fonts/inter-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
        body { font-family: 'Inter', "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif;
          color: #000; -webkit-font-smoothing: antialiased;
          font-variant-numeric: normal; font-feature-settings: "zero" 0; }
        .label { display: block; box-sizing: border-box; width: 100vw; height: 100vh;
          padding: 4vmin; overflow: hidden; page-break-inside: avoid; page-break-after: always; }
        .label:last-child { page-break-after: auto; }
        .top { display: flex; gap: 5vmin; align-items: center; }
        .qr { width: 36vmin; height: 36vmin; flex: 0 0 auto; }
        .meta { min-width: 0; flex: 1; }
        /* Phân cấp: mã nội bộ to đậm nhất, thông tin phụ nhẹ hơn. Bản cũ bold
           tất cả mọi dòng nên mắt không bám được vào đâu.
           Chỉ dùng 3 nấc 400/600/700 vì Segoe UI đúng có ngần ấy nét thật —
           đặt 500 hay 800 là trình duyệt tự kéo béo chữ, in nhiệt ra nhoè. */
        .code { font-size: 10.5vmin; font-weight: 700; letter-spacing: -0.02em;
          line-height: 1.05; word-break: break-all; }
        .sub { font-size: 5.2vmin; font-weight: 400; line-height: 1.25;
          margin-top: 1.6vmin; overflow-wrap: anywhere; }
        /* Các trường chạy hết chiều ngang tem nên giá trị dài vẫn đọc được;
           xuống dòng thay vì cắt cụt. Nhãn thành cột trái nhỏ, giá trị to đậm —
           mắt nhảy thẳng vào tên/mã mà không phải đọc lại chữ "Seller:".
           Dùng nét liền đen thay dashed xám: máy in nhiệt chỉ có đen/trắng nên
           mọi sắc xám đều bị rỗ, khó nhìn. */
        .info { margin-top: 3vmin; border-top: 0.5vmin solid #000; padding-top: 2.4vmin; }
        .row { display: flex; gap: 2vmin; align-items: baseline; font-size: 6.6vmin;
          font-weight: 600; line-height: 1.2; margin-top: 1.8vmin; }
        .key { flex: 0 0 26vmin; font-size: 4.4vmin; font-weight: 400;
          letter-spacing: 0.06em; text-transform: uppercase; }
        .val { min-width: 0; overflow-wrap: anywhere; }
        .desc { font-size: 5.2vmin; font-weight: 400; margin-top: 1.8vmin;
          overflow-wrap: anywhere; }

        /* ---- Tem lô (tờ đầu) --------------------------------------------
           Khung viền nằm TRONG padding của .label chứ không đặt border thẳng
           lên .label: viền sát mép hay rơi vào vùng máy in không in được, ra
           tem cụt một cạnh. Nội dung căn giữa cả hai chiều để đọc được ở tư
           thế bất kỳ khi tem nằm trên khay.
           Không dùng xám ở đâu cả — máy in nhiệt chỉ có đen/trắng, mọi sắc xám
           đều rỗ. Phân cấp làm bằng cỡ chữ và nét, không bằng độ đậm màu. */
        .batch-label { padding: 3vmin; }
        .batch-label .frame { box-sizing: border-box; height: 100%; width: 100%;
          border: 1.1vmin solid #000; border-radius: 2vmin; padding: 3.4vmin;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center; overflow: hidden; }
        /* Nhãn loại tem: nhỏ, giãn chữ — đọc lướt là biết ngay tờ này không
           phải tem sản phẩm, mà không cạnh tranh với mã batch bên dưới. */
        .kind { font-size: 5.4vmin; font-weight: 400; letter-spacing: 0.22em;
          text-transform: uppercase; line-height: 1; }
        /* Mã batch: thứ to nhất trên tem, và KHÔNG BAO GIỜ được ngắt dòng —
           "#101041-10" rớt thành "#101041" / "-10" đọc ra hai thứ khác nhau, đúng
           kiểu nhầm lẫn mà tem lô sinh ra để dập tắt. Vì thế nowrap, và cỡ chữ do
           JS chọn theo số ký tự (xem batchCodeSize): CSS không đo được chuỗi, mà
           tem lại co giãn theo khổ giấy nên không có một cỡ nào vừa cho mọi mã. */
        .bcode { font-weight: 700; letter-spacing: -0.02em; line-height: 1.02;
          margin-top: 2.4vmin; max-width: 100%; white-space: nowrap; }
        /* Số lượng: con số to ngang mã batch, đơn vị nhỏ hơn hẳn và đứng cùng
           dòng — mắt bắt được "3" trước, "sản phẩm" chỉ để xác nhận đơn vị. */
        .bcount { margin-top: 2.6vmin; display: flex; align-items: baseline;
          justify-content: center; gap: 2.2vmin; flex-wrap: wrap; }
        .bcount .num { font-size: 18vmin; font-weight: 700; line-height: 1; }
        .bcount .unit { font-size: 7vmin; font-weight: 400; letter-spacing: 0.04em; }
        /* Chân tem: NVL + ngày, đủ để đối chiếu mà không phải mở máy. */
        .bfoot { margin-top: 3vmin; font-size: 5.2vmin; font-weight: 400;
          line-height: 1.3; overflow-wrap: anywhere; }
      </style></head>
      <body>${batchLabel}${labels.join('')}
      <script>
        (function () {
          var printed = false;
          function go() { if (!printed) { printed = true; window.print(); } }
          // Đợi Inter tải xong rồi mới bung hộp thoại in: in sớm thì tem ra font
          // dự phòng, mỗi máy một kiểu chữ. document.fonts.ready có thể không
          // bao giờ resolve nếu font lỗi nên chặn trần 3s.
          if (document.fonts && document.fonts.ready) {
            Promise.race([
              document.fonts.ready,
              new Promise(function (r) { setTimeout(r, 3000); }),
            ]).then(go);
          } else {
            window.addEventListener('load', go);
          }
          setTimeout(go, 5000); // fallback cuối nếu mọi thứ trên đều câm
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

    <!-- Chỉ blank cả trang ở lần tải đầu; reload sau thao tác giữ nguyên nội dung
         (màn hình chờ ở trên đã báo trạng thái rồi) nên không bị nháy trắng. -->
    <UiStateBlock :loading="loading && !batch" :error="error" @retry="reload">
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
                <span
                  v-if="closed"
                  class="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                >
                  <UiIcon name="alert" :size="13" /> Đã đóng
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ liveItemCount }} item còn lại
                  <template v-if="batch.scrapped_count"> · {{ batch.scrapped_count }} đã huỷ</template>
                </span>
                <span v-if="batch.due_date" class="text-xs text-muted-foreground">· Hạn: {{ formatDate(batch.due_date) }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn-secondary"
                :disabled="printingLabels"
                title="In 1 tem lô (mã batch + số sản phẩm) ở tờ đầu, rồi tem QR của từng sản phẩm"
                @click="printLabels"
              >
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
              <button class="btn-secondary" :disabled="downloadingDesignZip" @click="downloadBatchDesign">
                <UiSpinner v-if="downloadingDesignZip" :size="16" />
                <UiIcon v-else name="download" :size="16" /> Tải Design (ZIP)
              </button>
              <button
                v-if="canScrap"
                class="btn-danger"
                title="Huỷ cả tấm đã sản xuất — sản phẩm quay về hàng chờ để làm lại ở batch mới"
                @click="openScrap"
              >
                <UiIcon name="alert" :size="16" /> Huỷ batch
              </button>
              <button
                v-if="canDelete"
                class="btn-danger"
                :disabled="deleting"
                title="Xoá batch chưa sản xuất — sản phẩm quay về màn gom batch"
                @click="deleteBatch"
              >
                <UiSpinner v-if="deleting" :size="16" />
                <UiIcon v-else name="trash" :size="16" /> Xoá batch
              </button>
            </div>
          </div>

          <!-- Batch đã đóng: kể lý do ngay, nếu không màn này trông như một batch
               trống rỗng không ai hiểu vì sao. -->
          <div
            v-if="closed"
            class="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
          >
            <UiIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
            <div>
              <p class="font-semibold">
                Batch đã đóng{{ batch.close_reason ? ` — ${batch.close_reason}` : '' }}
              </p>
              <p class="mt-0.5 text-xs">
                Không còn gì để sản xuất ở batch này. Sản phẩm đã quay về hàng chờ và được làm lại ở
                một batch MỚI; bảng dưới giữ lại để truy vết tấm này đã làm ra những gì. Tem QR đã in
                cho batch này bỏ đi, batch mới in tem mới.
              </p>
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
          <div v-if="canChangeStatus && !closed" class="mt-4 border-t border-border pt-4">
            <div v-if="qcLocked" class="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <UiIcon name="check" :size="16" />
              Đã QC ở trạm QC — batch hoàn tất, không cần cập nhật trạng thái sản xuất nữa.
            </div>
            <div v-else class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-medium text-muted-foreground">Cập nhật trạng thái sản xuất:</span>
              <button
                v-for="s in PRODUCTION_STATUS_ORDER"
                :key="s"
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                :class="[
                  batch.status === s
                    ? 'border-primary bg-accent text-primary'
                    : isPastStep(s)
                      ? (isOwner ? 'border-dashed border-border text-muted-foreground hover:bg-muted' : 'border-border text-muted-foreground opacity-40')
                      : 'border-border text-foreground hover:bg-muted',
                  pendingStatus === s ? 'border-primary bg-accent text-primary' : '',
                  updating && pendingStatus !== s ? 'opacity-50' : '',
                ]"
                :disabled="updating || batch.status === s || (isPastStep(s) && !isOwner) || Boolean(statusBlockedReason(s))"
                :title="statusBlockedReason(s) || (isPastStep(s) ? (isOwner ? 'Chặng đã qua — bấm để hạ về (sửa nhầm)' : 'Chặng đã qua — sản xuất chỉ tiến, không lùi') : '')"
                @click="chooseStatus(s)"
              >
                <UiSpinner v-if="pendingStatus === s" :size="12" />
                {{ INTERNAL_STATUS[s].label }}
              </button>
              <span class="text-[11px] text-muted-foreground">
                (cascade xuống item · QC làm 1 lần ở trạm QC{{ isOwner ? ' · OWNER được hạ để sửa nhầm' : '' }})
              </span>
            </div>
            <p
              v-if="!qcLocked && missingProductionLinks.length"
              class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              Chưa thêm {{ missingProductionLinks.join(' và ') }} — cần đủ cả hai link mới chuyển được
              sang “Đã in” / “Đã cắt”.
            </p>
          </div>
        </div>

        <!-- Link sản xuất theo Batch (Print/Cut) — nhập 1 lần, dùng chung cả batch -->
        <div v-if="!batch.is_parent" class="card mb-5 p-5">
          <div class="mb-3">
            <h3 class="text-sm font-semibold text-foreground">Link sản xuất dùng chung</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Lưu một lần và áp dụng cho toàn bộ {{ items.length }} item trong batch, gồm bảng bên dưới, file Excel và ZIP sản xuất.
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div v-for="row in linkRows" :key="row.kind" class="rounded-lg border border-border p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-foreground">{{ row.label }}</p>
                  <a
                    v-if="row.link"
                    :href="row.link.url"
                    target="_blank"
                    rel="noopener"
                    class="mt-1 block truncate text-sm text-primary hover:underline"
                    :title="row.link.url"
                  >
                    {{ row.link.url }}
                  </a>
                  <p v-else class="mt-1 text-sm text-muted-foreground">Chưa có</p>
                  <p v-if="row.link" class="mt-1 text-xs text-muted-foreground">
                    Người cập nhật: {{ row.link.updated_by?.full_name || row.link.updated_by?.email || '—' }}
                    <span v-if="row.link.link_updated_at"> · {{ formatDateTime(row.link.link_updated_at) }}</span>
                  </p>
                </div>
                <button
                  v-if="canEditLinks"
                  class="btn-secondary shrink-0"
                  @click="openLinkModal(row.kind)"
                >
                  <UiIcon :name="row.link ? 'link' : 'plus'" :size="16" />
                  {{ row.link ? 'Sửa link' : 'Thêm link' }}
                </button>
              </div>
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
                  <th class="table-th">Mã đơn shop</th>
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
                  <td class="table-td whitespace-nowrap">
                    <!-- OrderID theo đơn từ import tới hành trình — bấm là sang
                         thẳng trang đơn, khỏi tra lại bằng mã nội bộ. -->
                    <NuxtLink
                      v-if="r.order_id && r.store_order_id"
                      :to="`/orders/${r.order_id}`"
                      class="text-primary hover:underline"
                    >{{ r.store_order_id }}</NuxtLink>
                    <span v-else>{{ r.store_order_id || '—' }}</span>
                  </td>
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
                  <td class="table-td">
                    <span
                      v-if="r.scrapped"
                      class="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      :title="r.scrap_reason ? `Đã huỷ: ${r.scrap_reason}` : 'Đã huỷ'"
                    >
                      <UiIcon name="alert" :size="12" /> Đã huỷ
                    </span>
                    <UiStatusBadge v-else kind="internal" :value="r.status" />
                  </td>
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

    <!-- Màn hình chờ khi đổi trạng thái: PATCH cascade xuống từng item nên hay
         mất vài giây — che thao tác lại để không ai bấm chồng chặng khác. -->
    <UiBusyOverlay
      :open="updating"
      icon="batches"
      :title="pendingStatus ? `Đang chuyển batch sang “${INTERNAL_STATUS[pendingStatus].label}”` : 'Đang cập nhật batch…'"
      :subtitle="busySubtitle"
      :steps="['Ghi trạng thái & cascade xuống item', 'Cập nhật lại bảng']"
      :active-step="busyStep"
    />

    <!-- Huỷ batch đã sản xuất -->
    <UiModal v-model="scrapOpen" :title="`Huỷ batch ${batch?.code ?? ''}`">
      <div class="space-y-3">
        <div class="rounded-md border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <p class="font-semibold">Đây là huỷ hàng đã sản xuất, không phải xoá batch.</p>
          <p class="mt-1 text-xs">
            {{ liveItemCount }} phần sản xuất trong batch sẽ được đánh dấu huỷ (vẫn lưu ở batch này để
            truy vết), batch đóng lại và sản phẩm quay về hàng chờ để làm lại ở một batch MỚI. Tem QR
            đã in cho batch này bỏ đi.
            <template v-if="batch?.is_parent">
              Đây là batch mẹ: huỷ cả {{ openChildCount }} batch con đang mở.
            </template>
          </p>
          <p class="mt-1 text-xs">
            Sản phẩm nhiều NVL (combo): các phần NVL khác của cùng sản phẩm nếu đang “đã QC” sẽ được
            hạ về “đã cắt” — sản phẩm còn phần đang làm lại thì chưa QC xong.
          </p>
        </div>
        <div>
          <label class="label" for="scrap-reason">Lý do huỷ <span class="text-rose-600">*</span></label>
          <input
            id="scrap-reason"
            v-model="scrapForm.reason"
            class="input"
            maxlength="60"
            placeholder="VD: cắt lệch cả tấm, máy in nhoè nửa tấm…"
            @keyup.enter="submitScrap"
          />
          <p class="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Lý do đi vào lịch sử sản xuất — tháng sau còn tra được vì sao mất tấm này.</span>
            <span>{{ scrapReason.length }}/60</span>
          </p>
        </div>
        <div>
          <label class="label">Trả về đâu để làm lại</label>
          <UiSelect v-model="scrapForm.route" :options="scrapRouteOptions" aria-label="Hướng xử lý" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Cả tấm sai vì file sai thì phải sửa file trước, nếu không lần in lại hỏng y hệt.
          </p>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="scrapOpen = false">Không huỷ</button>
        <button class="btn-danger" :disabled="scrapping || !scrapReasonValid" @click="submitScrap">
          <UiSpinner v-if="scrapping" :size="16" /> Xác nhận huỷ batch
        </button>
      </template>
    </UiModal>

    <!-- Thêm/Sửa link sản xuất (Print/Cut) -->
    <UiModal
      v-model="linkModalOpen"
      :title="editingLink ? `Sửa ${LINK_LABELS[linkModalKind]}` : `Thêm ${LINK_LABELS[linkModalKind]}`"
    >
      <div class="space-y-3">
        <div>
          <label class="label">{{ LINK_LABELS[linkModalKind] }} (URL)</label>
          <input
            v-model="linkUrl"
            class="input"
            :class="linkUrl && !linkUrlValid ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''"
            placeholder="https://…"
            autocomplete="url"
            @keyup.enter="saveLink"
          />
          <p v-if="linkUrl && !linkUrlValid" class="mt-1 text-xs text-red-600 dark:text-red-400">
            Link phải bắt đầu bằng http:// hoặc https://
          </p>
        </div>
        <p v-if="editingLink" class="text-xs text-amber-600 dark:text-amber-400">
          Batch đã có {{ LINK_LABELS[linkModalKind].toLowerCase() }}. Lưu link mới sẽ thay thế link hiện tại.
        </p>
        <p class="text-[11px] text-muted-foreground">
          Link dùng chung cho cả batch (nhập 1 lần). Cần URL bắt đầu bằng http:// hoặc https://.
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="linkModalOpen = false">Huỷ</button>
        <button class="btn-primary" :disabled="savingLink || !linkUrlValid || linkUnchanged" @click="saveLink">
          <UiSpinner v-if="savingLink" :size="16" />
          {{ editingLink ? 'Thay thế' : 'Lưu link' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
