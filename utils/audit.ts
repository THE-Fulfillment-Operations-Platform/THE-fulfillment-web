import { INTERNAL_STATUS, DESIGN_STATUS, reasonCodeLabel } from './enums'
import type { InternalStatus, DesignStatus } from '~/types'

// Display layer for the audit trail. The backend writes machine codes
// (BATCH_STATUS_UPDATE) and English summaries ("Batch #101001 -> CUT") because
// those are stable and greppable in logs — but the audit screen is read by
// workshop staff, not developers. Everything here turns the stored row into
// plain Vietnamese at render time, so old rows read the same as new ones and no
// migration is needed. The raw code stays available as a tooltip / CSV column.

type Tone = 'neutral' | 'green' | 'blue' | 'red' | 'amber' | 'violet'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-muted text-foreground',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  red: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}

interface ActionMeta {
  label: string
  tone: Tone
}

// ---- Action codes ----------------------------------------------------------
// Keep in sync with the audit.Log() call sites in the API (services/*.go).
export const AUDIT_ACTION: Record<string, ActionMeta> = {
  // Tài khoản & đăng nhập
  AUTH_LOGIN: { label: 'Đăng nhập', tone: 'green' },
  USER_CREATE: { label: 'Thêm tài khoản', tone: 'green' },
  USER_UPDATE: { label: 'Sửa tài khoản', tone: 'blue' },
  USER_DELETE: { label: 'Xoá tài khoản', tone: 'red' },

  // Đơn hàng
  ORDER_CREATE_DIRECT: { label: 'Tạo đơn hàng', tone: 'green' },
  ORDER_EDIT: { label: 'Sửa đơn hàng', tone: 'blue' },
  ORDER_EDIT_SELLER: { label: 'Khách sửa đơn', tone: 'blue' },
  ORDER_OPS_CANCEL: { label: 'Huỷ đơn hàng', tone: 'red' },
  ORDER_DELETE: { label: 'Xoá đơn hàng', tone: 'red' },
  ORDER_TRACKING_UPDATE: { label: 'Cập nhật vận chuyển', tone: 'blue' },

  // Duyệt đơn
  REVIEW_APPROVE: { label: 'Duyệt đơn', tone: 'green' },
  REVIEW_BULK_APPROVE: { label: 'Duyệt nhiều đơn', tone: 'green' },
  REVIEW_REJECT: { label: 'Từ chối đơn', tone: 'red' },
  REVIEW_REQUEST_CORRECTION: { label: 'Yêu cầu sửa đơn', tone: 'amber' },

  // Yêu cầu huỷ
  ORDER_SELLER_CANCEL: { label: 'Khách huỷ đơn', tone: 'red' },
  ORDER_CANCEL_REQUEST: { label: 'Khách xin huỷ đơn', tone: 'amber' },
  ORDER_ITEM_SELLER_CANCEL: { label: 'Khách huỷ 1 sản phẩm', tone: 'red' },
  ORDER_ITEM_CANCEL_REQUEST: { label: 'Khách xin huỷ 1 sản phẩm', tone: 'amber' },
  CANCEL_APPROVE: { label: 'Đồng ý huỷ đơn', tone: 'green' },
  CANCEL_REJECT: { label: 'Không đồng ý huỷ đơn', tone: 'red' },
  CANCEL_ITEM_APPROVE: { label: 'Đồng ý huỷ sản phẩm', tone: 'green' },
  CANCEL_ITEM_REJECT: { label: 'Không đồng ý huỷ sản phẩm', tone: 'red' },

  // Thiết kế
  ITEM_DESIGN_UPDATE: { label: 'Cập nhật file thiết kế', tone: 'blue' },
  ITEM_DESIGN_READY_BULK: { label: 'Báo xong thiết kế (nhiều sản phẩm)', tone: 'green' },

  // Sản xuất
  BATCH_CREATE: { label: 'Tạo lô sản xuất', tone: 'green' },
  BATCH_STATUS_UPDATE: { label: 'Đổi trạng thái lô', tone: 'blue' },
  BATCH_LINK_ADD: { label: 'Gắn file in/cắt cho lô', tone: 'blue' },
  BATCH_LINK_UPDATE: { label: 'Đổi file in/cắt của lô', tone: 'blue' },

  // Kiểm hàng (QC)
  QC_SCAN: { label: 'Quét kiểm hàng', tone: 'neutral' },
  QC_PASS: { label: 'Kiểm hàng đạt', tone: 'green' },
  QC_FAIL: { label: 'Kiểm hàng lỗi', tone: 'red' },

  // Đóng gói & giao hàng
  PACKING_SCAN: { label: 'Đóng gói', tone: 'violet' },
  HANDOFF_CREATE: { label: 'Tạo phiếu bàn giao', tone: 'violet' },
  HANDOFF_SHIP: { label: 'Gửi hàng đi', tone: 'green' },

  // Nhập dữ liệu từ file
  IMPORT_PREVIEW: { label: 'Xem trước file đơn', tone: 'neutral' },
  IMPORT_COMMIT: { label: 'Nhập đơn từ file', tone: 'green' },
  MASTER_IMPORT_PREVIEW: { label: 'Xem trước dữ liệu gốc', tone: 'neutral' },
  MASTER_IMPORT_COMMIT: { label: 'Nhập dữ liệu gốc', tone: 'green' },
  MATERIAL_IMPORT_COMMIT: { label: 'Nhập định mức vật liệu', tone: 'green' },

  // Dữ liệu nền
  MATERIAL_CREATE: { label: 'Thêm vật liệu', tone: 'green' },
  MATERIAL_UPDATE: { label: 'Sửa vật liệu', tone: 'blue' },
  MATERIAL_DELETE: { label: 'Xoá vật liệu', tone: 'red' },
  SKU_CREATE: { label: 'Thêm mã sản phẩm', tone: 'green' },
  SKU_UPDATE: { label: 'Sửa mã sản phẩm', tone: 'blue' },
  SKU_DELETE: { label: 'Xoá mã sản phẩm', tone: 'red' },
  SELLER_CREATE: { label: 'Thêm khách bán hàng', tone: 'green' },
  SELLER_UPDATE: { label: 'Sửa khách bán hàng', tone: 'blue' },
  SELLER_DELETE: { label: 'Xoá khách bán hàng', tone: 'red' },
  STORE_CREATE: { label: 'Thêm gian hàng', tone: 'green' },
  STORE_UPDATE: { label: 'Sửa gian hàng', tone: 'blue' },
  STORE_DELETE: { label: 'Xoá gian hàng', tone: 'red' },

  // Ghi chú & hệ thống
  NOTE_CREATE: { label: 'Tạo ghi chú', tone: 'green' },
  NOTE_UPDATE: { label: 'Sửa ghi chú', tone: 'blue' },
  NOTE_DELETE: { label: 'Xoá ghi chú', tone: 'red' },
  DATA_RESET: { label: 'Xoá sạch dữ liệu', tone: 'red' },
}

/** Vietnamese label for an action code; unknown/legacy codes fall back to raw. */
export const auditActionLabel = (action?: string | null): string =>
  (action && AUDIT_ACTION[action]?.label) || action || '—'

/** Badge classes for an action code, by meaning (thêm / sửa / xoá / cảnh báo). */
export const auditActionClasses = (action?: string | null): string =>
  TONE_CLASSES[(action && AUDIT_ACTION[action]?.tone) || 'neutral']

// ---- Đối tượng bị tác động -------------------------------------------------
const ENTITY_LABEL: Record<string, string> = {
  order: 'Đơn hàng',
  order_item: 'Sản phẩm trong đơn',
  batch: 'Lô sản xuất',
  batch_item: 'Sản phẩm trong lô',
  package: 'Kiện hàng',
  handoff: 'Phiếu bàn giao',
  import_job: 'Lần nhập file đơn',
  master_import_job: 'Lần nhập dữ liệu gốc',
  material: 'Vật liệu',
  sku: 'Mã sản phẩm (SKU)',
  seller: 'Khách bán hàng',
  store: 'Gian hàng',
  user: 'Tài khoản',
  note: 'Ghi chú',
  system: 'Hệ thống',
}

/** "batch #2" → "Lô sản xuất #2". Returns "—" when there is no entity. */
export function auditEntityLabel(type?: string | null, id?: number | null): string {
  if (!type) return '—'
  const name = ENTITY_LABEL[type.toLowerCase()] || type
  return id ? `${name} #${id}` : name
}

// ---- Tóm tắt ---------------------------------------------------------------
const internalStatusLabel = (s: string): string =>
  INTERNAL_STATUS[s as InternalStatus]?.label || s
const designStatusLabel = (s: string): string => DESIGN_STATUS[s as DesignStatus]?.label || s
const linkKindLabel = (kind: string): string =>
  kind.toUpperCase() === 'PRINT' ? 'file in' : kind.toUpperCase() === 'CUT' ? 'file cắt' : `file ${kind}`

// Ordered rewrite rules for the English summaries written by the API. First
// match wins; anything unmatched is shown as-is so nothing is ever swallowed.
const SUMMARY_RULES: { re: RegExp; to: (m: RegExpMatchArray) => string }[] = [
  // Đăng nhập
  { re: /^User logged in$/, to: () => 'Đăng nhập vào hệ thống' },

  // Đơn hàng
  { re: /^Created order (.+)$/, to: (m) => `Tạo đơn hàng ${m[1]}` },
  { re: /^Edited order (.+)$/, to: (m) => `Sửa đơn hàng ${m[1]}` },
  { re: /^Cancelled order (.+)$/, to: (m) => `Huỷ đơn hàng ${m[1]}` },
  { re: /^Soft-deleted order (.+)$/, to: (m) => `Xoá đơn hàng ${m[1]} (vẫn khôi phục được)` },
  { re: /^Updated tracking for (.+)$/, to: (m) => `Cập nhật thông tin vận chuyển đơn ${m[1]}` },

  // Duyệt đơn
  { re: /^Approved order (.+)$/, to: (m) => `Duyệt đơn hàng ${m[1]}` },
  { re: /^Rejected order (.+)$/, to: (m) => `Từ chối đơn hàng ${m[1]}` },
  { re: /^Requested correction on order (.+)$/, to: (m) => `Yêu cầu sửa lại đơn hàng ${m[1]}` },
  {
    re: /^Bulk approve: (\d+) duyệt, (\d+) bỏ qua$/,
    to: (m) => `Duyệt nhiều đơn cùng lúc: ${m[1]} đơn được duyệt, ${m[2]} đơn bỏ qua`,
  },

  // Yêu cầu huỷ
  { re: /^Seller cancelled order (.+)$/, to: (m) => `Khách bán hàng đã huỷ đơn ${m[1]}` },
  { re: /^Seller cancelled item (.+)$/, to: (m) => `Khách bán hàng đã huỷ sản phẩm ${m[1]}` },
  { re: /^Seller requested cancellation of (.+)$/, to: (m) => `Khách bán hàng xin huỷ ${m[1]}` },
  { re: /^Approved cancellation of (.+)$/, to: (m) => `Đồng ý cho huỷ ${m[1]}` },
  { re: /^Rejected cancellation of (.+)$/, to: (m) => `Không đồng ý cho huỷ ${m[1]}` },
  { re: /^Resolved cancellation of (.+)$/, to: (m) => `Đã xử lý xong yêu cầu huỷ ${m[1]}` },

  // Thiết kế
  {
    re: /^Updated design for item (.+) \(status=(.+)\)$/,
    to: (m) => `Cập nhật file thiết kế cho sản phẩm ${m[1]} (${designStatusLabel(m[2])})`,
  },
  {
    re: /^Bulk set (\d+) item\(s\) design-ready$/,
    to: (m) => `Báo đã xong thiết kế cho ${m[1]} sản phẩm`,
  },

  // Sản xuất
  {
    re: /^Created batch (.+) \(material=(.+)\)$/,
    to: (m) => `Tạo lô sản xuất ${m[1]} — vật liệu ${m[2]}`,
  },
  {
    re: /^Batch (.+) -> (.+)$/,
    to: (m) => `Lô sản xuất ${m[1]} chuyển sang "${internalStatusLabel(m[2])}"`,
  },
  {
    re: /^Set (\w+) link on batch (\d+)$/,
    to: (m) => `Gắn ${linkKindLabel(m[1])} cho lô sản xuất #${m[2]}`,
  },

  // Kiểm hàng (QC)
  { re: /^Scanned item (.+) for QC$/, to: (m) => `Quét sản phẩm ${m[1]} để kiểm hàng` },
  { re: /^QC pass for item (.+)$/, to: (m) => `Sản phẩm ${m[1]} kiểm hàng ĐẠT` },
  {
    re: /^QC fail for item (.+) \((.+)\)$/,
    to: (m) => `Sản phẩm ${m[1]} kiểm hàng LỖI — ${reasonCodeLabel(m[2])}`,
  },

  // Đóng gói & giao hàng
  { re: /^Packed item (.+)$/, to: (m) => `Đã đóng gói sản phẩm ${m[1]}` },
  {
    re: /^Handoff (.+) for order (.+) to (.+)$/,
    to: (m) => `Tạo phiếu bàn giao ${m[1]} cho đơn ${m[2]}, giao cho ${m[3]}`,
  },
  {
    re: /^Handoff (.+) shipped via (.+) \((.+)\)$/,
    to: (m) => `Phiếu bàn giao ${m[1]} đã gửi qua ${m[2]} — mã vận đơn ${m[3]}`,
  },

  // Nhập dữ liệu từ file
  {
    re: /^Previewed import: (\d+) rows, (\d+) valid, (\d+) errors$/,
    to: (m) => `Xem trước file đơn: ${m[1]} dòng — ${m[2]} dòng dùng được, ${m[3]} dòng lỗi`,
  },
  { re: /^Committed import: created (\d+) orders$/, to: (m) => `Nhập file xong: tạo mới ${m[1]} đơn hàng` },
  {
    re: /^Preview legacy master data: (\d+) rows, (\d+) new materials, (\d+) new SKUs, (\d+) new mappings, (\d+) review, (\d+) missing, (\d+) errors$/,
    to: (m) =>
      `Xem trước dữ liệu gốc: ${m[1]} dòng — thêm mới ${m[2]} vật liệu, ${m[3]} mã sản phẩm, ${m[4]} ghép nối; ${m[5]} cần xem lại, ${m[6]} thiếu dữ liệu, ${m[7]} lỗi`,
  },
  {
    re: /^Committed legacy master data: created (\d+) materials, (\d+) SKUs, (\d+) mappings$/,
    to: (m) => `Nhập dữ liệu gốc xong: thêm ${m[1]} vật liệu, ${m[2]} mã sản phẩm, ${m[3]} ghép nối`,
  },
  {
    re: /^Material quota import: (\d+) created, (\d+) updated$/,
    to: (m) => `Nhập định mức vật liệu: thêm mới ${m[1]}, cập nhật ${m[2]}`,
  },

  // Dữ liệu nền
  { re: /^Created material (.+)$/, to: (m) => `Thêm vật liệu ${m[1]}` },
  { re: /^Updated material (.+)$/, to: (m) => `Sửa vật liệu ${m[1]}` },
  { re: /^Deleted material$/, to: () => 'Xoá một vật liệu' },
  { re: /^Created SKU (.+)$/, to: (m) => `Thêm mã sản phẩm ${m[1]}` },
  { re: /^Updated SKU (.+)$/, to: (m) => `Sửa mã sản phẩm ${m[1]}` },
  { re: /^Deleted SKU$/, to: () => 'Xoá một mã sản phẩm' },
  { re: /^Created seller (.+)$/, to: (m) => `Thêm khách bán hàng ${m[1]}` },
  { re: /^Updated seller (.+)$/, to: (m) => `Sửa khách bán hàng ${m[1]}` },
  { re: /^Deleted seller$/, to: () => 'Xoá một khách bán hàng' },
  { re: /^Created store (.+)$/, to: (m) => `Thêm gian hàng ${m[1]}` },
  { re: /^Updated store (.+)$/, to: (m) => `Sửa gian hàng ${m[1]}` },
  { re: /^Deleted store$/, to: () => 'Xoá một gian hàng' },
  { re: /^Created user (.+)$/, to: (m) => `Thêm tài khoản ${m[1]}` },
  { re: /^Updated user (.+)$/, to: (m) => `Sửa tài khoản ${m[1]}` },
  { re: /^Deleted user$/, to: () => 'Xoá một tài khoản' },

  // Ghi chú & hệ thống
  { re: /^Created note: (.+)$/, to: (m) => `Tạo ghi chú: ${m[1]}` },
  { re: /^Updated note: (.+)$/, to: (m) => `Sửa ghi chú: ${m[1]}` },
  { re: /^Deleted note$/, to: () => 'Xoá một ghi chú' },
  {
    re: /^Reset transactional data \(orders\/production\)$/,
    to: () => 'Xoá sạch dữ liệu đơn hàng và sản xuất để làm lại từ đầu',
  },
]

/** Rewrites an API summary into plain Vietnamese; unknown text is kept as-is. */
export function auditSummary(summary?: string | null): string {
  const raw = (summary ?? '').trim()
  if (!raw) return ''
  for (const rule of SUMMARY_RULES) {
    const m = raw.match(rule.re)
    if (m) return rule.to(m)
  }
  return raw
}
