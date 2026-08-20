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
    label: 'Thiếu mã đơn (ORDER ID)',
    detail: 'Dòng này chưa có mã đơn của cửa hàng.',
    suggestion: 'Điền cột ORDER ID cho dòng này rồi import lại.',
  },
  QTY_INVALID: {
    label: 'Số lượng không hợp lệ',
    detail: 'Số lượng phải là số nguyên từ 1 trở lên.',
    suggestion: 'Sửa cột SỐ LƯỢNG thành số ≥ 1.',
  },
  SKU_MISSING: {
    label: 'Thiếu SKU',
    detail: 'Dòng này chưa có mã SKU.',
    suggestion: 'Điền cột MÃ SKU cho dòng này.',
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
    detail: 'Thiếu tên người nhận, Địa chỉ nhận hoặc Quốc Gia.',
    suggestion: 'Bổ sung đủ 3 cột: name, Địa chỉ nhận, Quốc Gia.',
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
  ADDR_ZIP_STATE_SWAPPED: {
    label: 'ZIP và Bang có vẻ bị đảo cột',
    detail:
      'Cột Zipcode đang chứa mã bang (2 chữ cái) còn Mã vùng chứa toàn số — KHÔNG chặn, nhưng nếu đúng là đảo thì kiện sẽ bị trả về.',
    suggestion:
      'Đổi chỗ hai cột trong file: Zipcode là mã bưu chính (số), Mã vùng là bang/tỉnh.',
  },
  ORD_DUPLICATE: {
    label: 'Trùng mã đơn (ORDER ID)',
    detail: 'ORDER ID này đã tồn tại cho seller — KHÔNG chặn, đơn vẫn được import với mã nội bộ riêng.',
    suggestion: 'Kiểm tra kẻo up nhầm; nếu đúng là đơn mới thì bỏ qua, nếu nghi trùng thì báo lại khách.',
  },
  SELLER_MISMATCH: {
    label: 'Sai seller',
    detail: 'Cột "Seller ID" trong file trỏ tới một seller khác với seller đang chọn ở trên.',
    suggestion:
      'Chọn đúng seller ở ô Seller, hoặc sửa cột Seller ID trong file. Import nhầm seller sẽ tạo đơn dưới tài khoản không bán chúng.',
  },
  DATE_INVALID: {
    label: 'Ngày đặt (DATE) không đọc được',
    detail: 'Giá trị trong cột DATE không phải một ngày hợp lệ.',
    suggestion: 'Dùng dạng 20/08/2026 hoặc 2026-08-20.',
  },
  DATE_AMBIGUOUS: {
    label: 'Ngày đặt có thể hiểu 2 kiểu',
    detail:
      'Cả ngày và tháng đều ≤ 12 nên không biết chắc là ngày/tháng hay tháng/ngày — hệ thống đọc theo ngày/tháng.',
    suggestion: 'Ghi rõ dạng 2026-08-20 trong file để không nhầm.',
  },
  DATE_EMPTY: {
    label: 'Dòng này để trống DATE',
    detail: 'Đơn sẽ nằm ở ngày import thay vì ngày khách đặt.',
    suggestion: 'Điền cột DATE nếu muốn đơn nằm đúng ngày của nó.',
  },
  DATE_COLUMN_MISSING: {
    label: 'File không có cột DATE',
    detail: 'Toàn bộ đơn trong file sẽ nằm ở ngày import.',
    suggestion: 'Thêm cột DATE vào file nếu muốn đơn nằm đúng ngày khách đặt.',
  },
  DATE_FUTURE: {
    label: 'Ngày đặt ở tương lai',
    detail: 'Ngày trong cột DATE lớn hơn ngày hôm nay — thường là gõ nhầm năm hoặc tháng.',
    suggestion: 'Kiểm tra lại giá trị trong file.',
  },
  DATE_TOO_OLD: {
    label: 'Ngày đặt quá cũ',
    detail: 'Ngày trong cột DATE cách đây hơn 1 năm.',
    suggestion: 'Kiểm tra lại năm trong file.',
  },
  DATE_CONFLICT: {
    label: 'Cùng ORDER ID nhưng khác DATE',
    detail: 'Các dòng của cùng một đơn ghi ngày khác nhau — đơn chỉ nằm được ở một ngày, hệ thống lấy dòng đầu.',
    suggestion: 'Sửa cho mọi dòng cùng ORDER ID có cùng ngày.',
  },
  PHONE_MISSING: {
    label: 'Thiếu số điện thoại người nhận',
    detail: 'Dòng này không có số ở cả cột ShippingPhone lẫn Phone.',
    suggestion: 'Nhiều hãng vận chuyển bắt buộc có số điện thoại — bổ sung nếu có.',
  },
  PHONE_COLUMN_MISSING: {
    label: 'File không có số điện thoại',
    detail: 'Không dòng nào trong file có số điện thoại người nhận.',
    suggestion: 'Bổ sung cột ShippingPhone.',
  },
  COL_RETIRED: {
    label: 'Cột không còn dùng',
    detail: 'File có những cột hệ thống đã ngừng nhập — dữ liệu trong đó được bỏ qua.',
    suggestion: 'Có thể xoá các cột này khỏi file cho gọn.',
  },
  COL_UNKNOWN: {
    label: 'Cột không nhận diện được',
    detail: 'Dữ liệu trong các cột này KHÔNG được nhập vào hệ thống.',
    suggestion: 'Kiểm tra chính tả tên cột, hoặc tải lại file mẫu mới nhất.',
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
