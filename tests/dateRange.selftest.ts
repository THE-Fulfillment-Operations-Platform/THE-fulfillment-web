// Bài tự kiểm mốc lọc khoảng ngày (utils/dateRange): chạy bằng
// `npm run test:date-range`, script đó chạy file này dưới nhiều múi giờ (TZ=…).
// API lọc NỬA MỞ [from, to): date_from >= apiInstantFrom, date_to < apiInstantBefore.
import { apiInstantFrom, apiInstantBefore, pickerValueLabel } from '../utils/dateRange'

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
let failures = 0
let passed = 0
function eq(name: string, got: unknown, want: unknown) {
  if (got === want) {
    passed++
    return
  }
  failures++
  console.log(`FAIL [${tz}] ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

type Row = [input: string, from: string | undefined, before: string | undefined]

// Đáp án theo từng múi. VN: +07 không đổi giờ mùa hè; LA: có DST (08/03/2026 chỉ
// dài 23 giờ) — kiểm chỗ cộng ngày theo lịch chứ không cộng 86 400 000 ms.
const expected: Record<string, Row[]> = {
  'Asia/Ho_Chi_Minh': [
    // Ngày trơn: 00:00 VN → 00:00 VN ngày kế (= 17:00Z hôm trước).
    ['2026-11-23', '2026-11-22T17:00:00Z', '2026-11-23T17:00:00Z'],
    ['2026-12-01', '2026-11-30T17:00:00Z', '2026-12-01T17:00:00Z'], // đầu tháng: cận dưới rơi vào tháng trước theo UTC
    ['2026-11-30', '2026-11-29T17:00:00Z', '2026-11-30T17:00:00Z'], // cuối tháng → 01/12
    ['2026-12-31', '2026-12-30T17:00:00Z', '2026-12-31T17:00:00Z'], // cuối năm → 01/01/2027
    ['2027-01-01', '2026-12-31T17:00:00Z', '2027-01-01T17:00:00Z'], // đầu năm
    ['2028-02-28', '2028-02-27T17:00:00Z', '2028-02-28T17:00:00Z'], // → 29/02 năm nhuận
    ['2028-02-29', '2028-02-28T17:00:00Z', '2028-02-29T17:00:00Z'], // → 01/03
    // Có giờ: đúng phút đó → đầu phút kế tiếp.
    ['2026-11-23T10:30', '2026-11-23T03:30:00Z', '2026-11-23T03:31:00Z'],
    ['2026-11-23T00:00', '2026-11-22T17:00:00Z', '2026-11-22T17:01:00Z'],
    ['2026-12-31T23:59', '2026-12-31T16:59:00Z', '2026-12-31T17:00:00Z'], // phút cuối năm → 00:00 01/01
    ['2026-11-30T23:59', '2026-11-30T16:59:00Z', '2026-11-30T17:00:00Z'], // phút cuối tháng
  ],
  UTC: [
    ['2026-11-23', '2026-11-23T00:00:00Z', '2026-11-24T00:00:00Z'],
    ['2026-12-01', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'],
    ['2026-11-30', '2026-11-30T00:00:00Z', '2026-12-01T00:00:00Z'],
    ['2026-12-31', '2026-12-31T00:00:00Z', '2027-01-01T00:00:00Z'],
    ['2028-02-28', '2028-02-28T00:00:00Z', '2028-02-29T00:00:00Z'],
    ['2026-11-23T10:30', '2026-11-23T10:30:00Z', '2026-11-23T10:31:00Z'],
    ['2026-12-31T23:59', '2026-12-31T23:59:00Z', '2027-01-01T00:00:00Z'],
  ],
  'America/Los_Angeles': [
    ['2026-03-07', '2026-03-07T08:00:00Z', '2026-03-08T08:00:00Z'], // PST −8
    ['2026-03-08', '2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z'], // ngày đổi giờ: 23 giờ
    ['2026-11-01', '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z'], // ngày về giờ chuẩn: 25 giờ
    ['2026-12-31', '2026-12-31T08:00:00Z', '2027-01-01T08:00:00Z'],
    ['2026-12-31T23:59', '2027-01-01T07:59:00Z', '2027-01-01T08:00:00Z'],
  ],
}

// ICU có thể trả tên cũ "Asia/Saigon" cho TZ=Asia/Ho_Chi_Minh (cùng một múi).
const rows = expected[tz === 'Asia/Saigon' ? 'Asia/Ho_Chi_Minh' : tz]
if (!rows) {
  console.log(`Múi ${tz} chưa có bảng đáp án — chỉ chạy phần bất biến.`)
} else {
  for (const [input, from, before] of rows) {
    eq(`apiInstantFrom(${input})`, apiInstantFrom(input), from)
    eq(`apiInstantBefore(${input})`, apiInstantBefore(input), before)
  }
}

// Không hợp lệ / rỗng = không gửi tham số (undefined), không gửi chuỗi rỗng.
for (const bad of ['', '2026-02-30', '2026-13-01', '23/11/2026', '2026-11-23T10:30:00', 'abc']) {
  eq(`apiInstantFrom(${JSON.stringify(bad)})`, apiInstantFrom(bad), undefined)
  eq(`apiInstantBefore(${JSON.stringify(bad)})`, apiInstantBefore(bad), undefined)
}

// Bất biến mọi múi: cận trên của ngày D = cận dưới của ngày D+1 (không hở, không
// chồng), và cận trên của phút 23:59 = 00:00 ngày kế. Quét qua cuối tháng, cuối
// năm, tháng 2 năm nhuận và hai ngày đổi giờ của Mỹ.
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
function scan(y: number, m: number, d: number, days: number) {
  for (let i = 0; i < days; i++) {
    const a = new Date(Date.UTC(y, m - 1, d + i))
    const b = new Date(Date.UTC(y, m - 1, d + i + 1))
    const dayA = ymd(a.getUTCFullYear(), a.getUTCMonth() + 1, a.getUTCDate())
    const dayB = ymd(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate())
    eq(`liền ngày ${dayA}→${dayB}`, apiInstantBefore(dayA), apiInstantFrom(dayB))
    eq(`phút 23:59 ${dayA}`, apiInstantBefore(`${dayA}T23:59`), apiInstantFrom(`${dayB}T00:00`))
    eq(`00:00 ${dayA} = ngày trơn`, apiInstantFrom(`${dayA}T00:00`), apiInstantFrom(dayA))
  }
}
scan(2026, 3, 1, 15)
scan(2026, 10, 25, 14)
scan(2026, 12, 25, 12)
scan(2028, 2, 25, 6)

// Chữ hiển thị giữ đúng giá trị đã chọn (không đổi múi).
eq('label ngày', pickerValueLabel('2026-12-31'), '31/12/2026')
eq('label giờ', pickerValueLabel('2026-12-31T23:59'), '31/12/2026 23:59')

console.log(failures ? `[${tz}] ${failures} phép thử HỎNG, ${passed} đạt` : `[${tz}] Tất cả ${passed} phép thử đạt`)
process.exit(failures ? 1 : 0)
