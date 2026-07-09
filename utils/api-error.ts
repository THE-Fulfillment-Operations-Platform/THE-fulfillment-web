/** Normalised API error thrown by the service layer. */
export class ApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(message: string, code = 'INTERNAL', status = 0, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

// Vietnamese messages for error codes the app / backend commonly returns.
const VI_BY_CODE: Record<string, string> = {
  NETWORK: 'Không kết nối được máy chủ. Kiểm tra kết nối mạng hoặc backend có đang chạy không.',
  NO_CLIENT: 'Ứng dụng chưa khởi tạo xong, vui lòng tải lại trang.',
  MOCK_MISS: 'Chức năng này chưa được hỗ trợ ở chế độ demo (mock).',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn hoặc thông tin đăng nhập không đúng.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  CONFLICT: 'Dữ liệu bị trùng hoặc đã tồn tại.',
  VALIDATION: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại.',
}

// Best-effort translation of common English backend messages → Vietnamese.
// First match wins; keep patterns specific so we don't mistranslate.
const VI_BY_PHRASE: Array<[RegExp, string]> = [
  [/(email).*(exist|taken|duplicate|unique)|(exist|taken|duplicate|unique).*(email)|đã tồn tại/i,
    'Email này đã được dùng cho tài khoản khác. Hãy nhập email khác.'],
  [/seller.*(not\s*found|invalid|exist)|foreign key|violates foreign/i,
    'Seller ID không tồn tại. Hãy nhập đúng ID của seller đã có trong hệ thống.'],
  [/password/i, 'Mật khẩu không hợp lệ (thường cần tối thiểu 8 ký tự).'],
  [/could not create user|create user failed/i,
    'Không tạo được người dùng. Nguyên nhân thường gặp: email đã tồn tại, Seller ID không hợp lệ, hoặc mật khẩu quá ngắn.'],
  [/could not update user|update user failed/i, 'Không cập nhật được người dùng. Vui lòng kiểm tra lại thông tin.'],
]

/** Render error `details` to a readable string. The backend sometimes sends an
 *  object (e.g. field→reason validation map); naively joining that yields the
 *  useless "[object Object]", so stringify it as "key: value" (or JSON), and never
 *  append an unhelpful object stringification. */
function detailText(d: unknown): string {
  if (d == null) return ''
  if (typeof d === 'string') return d
  if (typeof d === 'object') {
    const parts = Object.entries(d as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    return parts.join('; ')
  }
  return String(d)
}

/** Human-friendly Vietnamese message for an arbitrary thrown error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // Consider both the backend message and its details — the specific reason
    // often lives in `details`, which we must not hide.
    const raw = [e.message, detailText(e.details)].filter(Boolean).join(' — ').trim()
    for (const [re, vi] of VI_BY_PHRASE) {
      if (re.test(raw)) return vi
    }
    if (VI_BY_CODE[e.code]) return VI_BY_CODE[e.code]
    // Unknown error: relay whatever the backend said so nothing is lost.
    return raw || 'Đã xảy ra lỗi không xác định.'
  }
  if (e instanceof Error) return e.message
  return 'Đã xảy ra lỗi không xác định.'
}
