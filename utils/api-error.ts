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

// Mã lỗi mà `details` là dữ liệu cho một UI riêng (vd. bảng từng link design
// hỏng), không phải câu chữ: nối nó vào toast chỉ ra một mớ JSON dài.
const CODES_WITH_STRUCTURED_DETAILS = new Set(['DESIGN_DOWNLOAD_FAILED'])

// Vietnamese messages for error codes the app / backend commonly returns.
const VI_BY_CODE: Record<string, string> = {
  NETWORK: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
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
    'Email này đã được dùng cho tài khoản khác.'],
  [/(seller[ _-]?id).*(not\s*found|invalid|does not exist)|(not\s*found|invalid|does not exist).*(seller[ _-]?id)/i,
    'Seller ID không tồn tại trong hệ thống.'],
  // Login failures (wrong email/password). Must come BEFORE the password rule
  // below, otherwise a "invalid email or password" 401 gets mistranslated into a
  // password-length validation message.
  [/invalid credentials|bad credentials|authentication failed|(incorrect|wrong|invalid)\s+(email|password)|(email|password)[^.]*\b(incorrect|mismatch|does\s*not\s*match|not\s*match)/i,
    'Sai email hoặc mật khẩu.'],
  // Password *validation* (create/update user) — too short/weak. Narrow so it
  // only fires for length/format complaints, not login credential failures.
  [/password[^.]*(short|least|minimum|at least|char|length|weak)|(short|least|minimum|char|length|weak)[^.]*password/i,
    'Mật khẩu phải có tối thiểu 6 ký tự.'],
  [/could not create user|create user failed/i,
    'Không tạo được người dùng. Kiểm tra lại email, Seller ID và mật khẩu.'],
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
 *  Vẫn phải gọi tên status — "Không kết nối được máy chủ" cho một cái 404 là sai
 *  sự thật — nhưng chỉ một câu. Chuỗi thô của ofetch ([POST] "http://…": 404 Not
 *  Found) lộ URL nội bộ và không giúp người dùng làm gì, nên nó ở lại tab Network
 *  cho người phát triển, không lên màn hình. */
function httpStatusMessage(status: number): string {
  switch (status) {
    case 404:
      return 'Máy chủ không có chức năng này (404).'
    case 500:
      return 'Máy chủ gặp lỗi (500). Vui lòng thử lại.'
    case 502:
    case 503:
    case 504:
      return `Máy chủ đang bận hoặc khởi động lại (${status}). Thử lại sau ít phút.`
    default:
      return `Máy chủ trả lỗi ${status}.`
  }
}

/** Human-friendly Vietnamese message for an arbitrary thrown error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // Consider both the backend message and its details — the specific reason
    // often lives in `details`, which we must not hide.
    const details = CODES_WITH_STRUCTURED_DETAILS.has(e.code) ? '' : detailText(e.details)
    const raw = [e.message, details].filter(Boolean).join(' — ').trim()
    for (const [re, vi] of VI_BY_PHRASE) {
      if (re.test(raw)) return vi
    }
    // Lỗi HTTP không có envelope: code do tầng http đặt theo status, nên câu trả
    // lời phải gọi tên status thay vì rơi vào một câu chung nào đó.
    if (e.code.startsWith('HTTP_')) return httpStatusMessage(e.status)
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
