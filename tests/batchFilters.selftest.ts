// Bài tự kiểm bộ lọc batch dùng chung (utils/batchFilters): chạy bằng
// `npm run test:batch-filters`, dưới nhiều múi giờ (TZ=… đặt ngoài).
import { batchFilterParams, batchFiltersFromQuery, batchFiltersToQuery, type BatchFilterFields } from '../utils/batchFilters'

let failures = 0
let passed = 0
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; return }
  failures++
  console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}
const blank = (): BatchFilterFields => ({
  batch_id: '', code: '', store_order: '', seller_id: [], material_id: '', sku: '', priority: '', date_from: '', date_to: '',
})

// Ô trống: không gửi tham số nào.
eq('rỗng', Object.values(batchFilterParams(blank())).filter((v) => v !== undefined), [])

// Đầy đủ: bỏ dấu #, cắt khoảng trắng, seller nối phẩy, material thành số.
const full = { ...blank(), batch_id: ' #101602 ', code: ' 100047_1/1 ', store_order: ' Etsy-7821 ', seller_id: ['3', '7'], material_id: '2460', sku: ' wood-01 ', priority: 'HIGH' }
const p = batchFilterParams(full)
eq('batch', p.batch, '101602')
eq('code giữ _1/1', p.code, '100047_1/1')
eq('store_order', p.store_order, 'Etsy-7821')
eq('seller', p.seller_id, '3,7')
eq('material', p.material_id, 2460)
eq('sku', p.sku, 'wood-01')
eq('priority', p.priority, 'HIGH')

// Ngày: đến-ngày là đầu ngày KẾ (loại trừ); từ-ngày là đầu ngày. Ngày sai bị bỏ.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
if (tz === 'Asia/Saigon' || tz === 'Asia/Ho_Chi_Minh') {
  const d = batchFilterParams({ ...blank(), date_from: '2026-11-24', date_to: '2026-11-24' })
  eq('từ 24/11 VN', d.date_from, '2026-11-23T17:00:00Z')
  eq('đến hết 24/11 VN', d.date_to, '2026-11-24T17:00:00Z')
  const t = batchFilterParams({ ...blank(), date_from: '2026-11-24T00:00', date_to: '2026-11-24T23:59' })
  eq('có giờ: từ', t.date_from, '2026-11-23T17:00:00Z')
  eq('có giờ: đến hết phút 23:59', t.date_to, '2026-11-24T17:00:00Z')
}
eq('ngày sai', batchFilterParams({ ...blank(), date_from: '2026-02-30' }).date_from, undefined)

// URL: khứ hồi giữ nguyên; khoá rỗng không ghi; giá trị bậy bị bỏ.
const f = { ...full, batch_id: '101602', code: '100047_1/1', date_from: '2026-11-24', date_to: '2026-11-25T10:30', q: 'abc', status: ['CUT', 'PRINTED'] }
const q = batchFiltersToQuery(f)
eq('query', q, {
  batch: '101602', code: '100047_1/1', store_order: 'Etsy-7821', sku: 'wood-01', material_id: '2460', priority: 'HIGH',
  date_from: '2026-11-24', date_to: '2026-11-25T10:30', seller_id: '3,7', status: 'CUT,PRINTED', q: 'abc',
})
const back = batchFiltersFromQuery(q)
eq('khứ hồi', batchFiltersToQuery({ ...blank(), ...back } as never), q)
eq('rỗng → query rỗng', batchFiltersToQuery({ ...blank(), q: '', status: [] }), {})
const bad = batchFiltersFromQuery({ material_id: 'abc', date_from: '24/11/2026', seller_id: ['x', '4', '4'], status: ['', 'CUT'] })
eq('bậy bị bỏ', [bad.material_id, bad.date_from, bad.seller_id, bad.status], [undefined, undefined, ['4'], ['CUT']])
eq('khoá lặp / mảng', batchFiltersFromQuery({ seller_id: ['1,2', '3'] }).seller_id, ['1', '2', '3'])

if (failures) { console.log(`${failures} phép thử hỏng, ${passed} đạt`); process.exit(1) }
console.log(`[${tz}] Tất cả ${passed} phép thử đạt`)
