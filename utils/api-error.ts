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

// Những mã lỗi mà câu tiếng Việt sẵn có ĐÚNG hơn nội dung backend gửi kèm: các
// lỗi hạ tầng/phiên đăng nhập, nơi backend nói tiếng Anh kỹ thuật ("Invalid or
// expired token", "You do not have permission…"). Mọi mã còn lại thì ngược lại
// — backend gửi câu tiếng Việt cụ thể cho đúng nghiệp vụ, hiện nó ra mới có ích.
const CODES_WITH_BETTER_VI = new Set(['NETWORK', 'NO_CLIENT', 'UNAUTHORIZED', 'FORBIDDEN'])

// Vietnamese messages for error codes the app / backend commonly returns.
const VI_BY_CODE: Record<string, string> = {
  NETWORK: 'Không kết nối được máy chủ. Kiểm tra kết nối mạng hoặc backend có đang chạy không.',
  NO_CLIENT: 'Ứng dụng chưa khởi tạo xong, vui lòng tải lại trang.',
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
  [/(seller[ _-]?id).*(not\s*found|invalid|does not exist)|(not\s*found|invalid|does not exist).*(seller[ _-]?id)/i,
    'Seller ID không tồn tại. Hãy nhập đúng ID của seller đã có trong hệ thống.'],
  // Login failures (wrong email/password). Must come BEFORE the password rule
  // below, otherwise a "invalid email or password" 401 gets mistranslated into a
  // password-length validation message.
  [/invalid credentials|bad credentials|authentication failed|(incorrect|wrong|invalid)\s+(email|password)|(email|password)[^.]*\b(incorrect|mismatch|does\s*not\s*match|not\s*match)/i,
    'Sai email hoặc mật khẩu.'],
  // Password *validation* (create/update user) — too short/weak. Narrow so it
  // only fires for length/format complaints, not login credential failures.
  [/password[^.]*(short|least|minimum|at least|char|length|weak|\b8\b)|(short|least|minimum|char|length|weak)[^.]*password/i,
    'Mật khẩu không hợp lệ (thường cần tối thiểu 8 ký tự).'],
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

/** Câu giải thích cho lỗi HTTP mà máy chủ KHÔNG trả kèm envelope lỗi.
 *  Không có nội dung nào từ backend để hiện, nên ít nhất phải nói đúng chuyện
 *  gì đã xảy ra và chỉ hướng xử lý — "Không kết nối được máy chủ" cho một cái
 *  404 là sai sự thật và làm mất cả buổi đi dò mạng. */
function httpStatusMessage(status: number, raw: string): string {
  const tail = raw ? ` — máy chủ trả: ${raw}` : ''
  switch (status) {
    case 404:
      return `Máy chủ không có endpoint này (404)${tail}. Thường là backend đang chạy bản cũ — khởi động lại backend rồi thử lại.`
    case 502:
    case 503:
    case 504:
      return `Máy chủ không phản hồi được (${status})${tail}. Backend đang khởi động lại hoặc bị treo.`
    default:
      return `Máy chủ trả lỗi ${status}${tail}.`
  }
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
    // Lỗi HTTP không có envelope: code do tầng http đặt theo status, nên câu trả
    // lời phải gọi tên status thay vì rơi vào một câu chung nào đó.
    if (e.code.startsWith('HTTP_')) return httpStatusMessage(e.status, raw)
    if (CODES_WITH_BETTER_VI.has(e.code) && VI_BY_CODE[e.code]) return VI_BY_CODE[e.code]
    // Backend nói gì thì hiện đúng cái đó. Câu dịch sẵn theo mã chỉ là phương án
    // cuối: nó chung chung hơn hẳn ("Không tìm thấy dữ liệu." thay cho "Không
    // tìm thấy batch"), nên chỉ dùng khi thật sự không có nội dung nào để hiện.
    if (raw) return raw
    if (VI_BY_CODE[e.code]) return VI_BY_CODE[e.code]
    return 'Đã xảy ra lỗi không xác định.'
  }
  if (e instanceof Error) return e.message
  return 'Đã xảy ra lỗi không xác định.'
}
