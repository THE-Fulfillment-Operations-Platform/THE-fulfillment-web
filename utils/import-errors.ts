import type { ImportError } from '~/types'

// Customer-facing Vietnamese for order-import row errors. The backend returns a
// stable ErrorCode (+ an often technical/English message); here we present a
// clear Vietnamese label, a plain explanation, and an actionable suggestion —
// keyed off the code so it survives backend wording changes. Any unmapped code
// falls back to the backend text so nothing is ever hidden.
export interface ImportErrorVi {
  label: string
  detail: string
  suggestion: string
}

const IMPORT_ERROR_VI: Record<string, ImportErrorVi> = {
  ORD_MISSING_ID: {
    label: 'Thiếu mã đơn (StoreOrderID)',
    detail: 'Dòng này chưa có mã đơn của cửa hàng.',
    suggestion: 'Điền StoreOrderID cho dòng này rồi import lại.',
  },
  QTY_INVALID: {
    label: 'Số lượng không hợp lệ',
    detail: 'Số lượng phải là số nguyên từ 1 trở lên.',
    suggestion: 'Sửa cột Quantity thành số ≥ 1.',
  },
  SKU_MISSING: {
    label: 'Thiếu SKU',
    detail: 'Dòng này chưa có mã SKU.',
    suggestion: 'Điền SKU cho dòng này.',
  },
  SKU_UNMAPPED: {
    label: 'SKU chưa khai báo',
    detail: 'SKU này chưa có trong Master Data (chưa được gán nguyên vật liệu).',
    suggestion: 'Vào Master Data → Import Excel vận hành cũ, hoặc tạo SKU và gán NVL, rồi Validate lại.',
  },
  SKU_NO_MATERIAL: {
    label: 'SKU chưa gán nguyên vật liệu',
    detail: 'SKU đã có nhưng chưa gán Loại VL (nguyên vật liệu).',
    suggestion: 'Vào Master Data → Mapping để gán NVL cho SKU này, rồi Validate lại.',
  },
  ADDR_INVALID: {
    label: 'Thiếu địa chỉ giao hàng',
    detail: 'Thiếu Tên người nhận, Địa chỉ (Address1) hoặc Quốc gia.',
    suggestion: 'Bổ sung đủ ShippingName, ShippingAddress1 và ShippingCountry.',
  },
  MOCKUP_INVALID: {
    label: 'Link mockup không hợp lệ',
    detail: 'Link mockup không phải một địa chỉ http(s) hợp lệ.',
    suggestion: 'Yêu cầu seller gửi lại link mockup đúng định dạng.',
  },
  DESIGN_INVALID: {
    label: 'Link design không hợp lệ',
    detail: 'Link design không phải một địa chỉ http(s) hợp lệ.',
    suggestion: 'Sửa lại link design, hoặc để trống nếu chưa có.',
  },
  ORD_DUPLICATE: {
    label: 'Trùng mã đơn (StoreOrderID)',
    detail: 'StoreOrderID này đã tồn tại cho seller — KHÔNG chặn, đơn vẫn được import với mã nội bộ riêng.',
    suggestion: 'Kiểm tra kẻo up nhầm; nếu đúng là đơn mới thì bỏ qua, nếu nghi trùng thì báo lại khách.',
  },
  LOOKUP_FAILED: {
    label: 'Không kiểm tra được trùng đơn',
    detail: 'Hệ thống tạm thời chưa kiểm tra được đơn có trùng hay không.',
    suggestion: 'Thử import lại sau ít phút.',
  },
}

/** Resolve a Vietnamese, customer-friendly view of an import row error. */
export function importErrorVi(err: ImportError): ImportErrorVi {
  const mapped = err.error_code ? IMPORT_ERROR_VI[err.error_code] : undefined
  if (mapped) return mapped
  return {
    label: err.error_code || 'Lỗi',
    detail: err.message || '',
    suggestion: err.suggestion || '',
  }
}
