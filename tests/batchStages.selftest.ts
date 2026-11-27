// Bài tự kiểm chặng batch của Bảng sản xuất (utils/batchStages): chạy bằng
// `npm run test:batch-stages`.
import {
  BATCH_LIFECYCLE,
  BATCH_LIFECYCLE_ORDER,
  BATCH_LIST_LEGACY,
  batchStageBadge,
  boardColumns,
  stageFilterOptions,
  cardStageChip,
  columnBreakdown,
  columnParams,
  mergePage,
  stageMeta,
  stagesFromQuery,
} from '../utils/batchStages'
import { INTERNAL_STATUS, SELLER_STATUS } from '../utils/enums'
import { PRODUCTION_FILES_READY } from '../utils/batch'
import { TONE } from '../utils/statusColors'

let failures = 0
let passed = 0
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; return }
  failures++
  console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

// 1) Đủ 11 chặng, đúng thứ tự vòng đời, trùng danh sách của API (AllBatchStages).
eq('thứ tự', BATCH_LIFECYCLE_ORDER, [
  'FILES_MISSING', 'FILES_READY', 'PRINTED', 'CUT', 'QC_PASSED', 'PACKED',
  'HANDED_OFF', 'SHIPPED', 'DELIVERED', 'CLOSED', 'NO_ITEMS',
])
eq('mọi chặng có nhãn', BATCH_LIFECYCLE_ORDER.filter((s) => !BATCH_LIFECYCLE[s].label), [])

// 2) Nhãn + màu lấy từ bảng chung của hệ thống (cùng chữ = cùng màu mọi màn).
eq('Chờ xử lý', [BATCH_LIFECYCLE.FILES_MISSING.label, BATCH_LIFECYCLE.FILES_MISSING.classes], [INTERNAL_STATUS.PENDING.label, INTERNAL_STATUS.PENDING.classes])
eq('Đã có file SX', [BATCH_LIFECYCLE.FILES_READY.label, BATCH_LIFECYCLE.FILES_READY.classes], [PRODUCTION_FILES_READY.label, PRODUCTION_FILES_READY.classes])
eq('Đã in', BATCH_LIFECYCLE.PRINTED.classes, INTERNAL_STATUS.PRINTED.classes)
eq('Đã cắt', BATCH_LIFECYCLE.CUT.classes, INTERNAL_STATUS.CUT.classes)
eq('Đã QC', [BATCH_LIFECYCLE.QC_PASSED.label, BATCH_LIFECYCLE.QC_PASSED.classes], [INTERNAL_STATUS.QC_PASSED.label, INTERNAL_STATUS.QC_PASSED.classes])
for (const s of ['PACKED', 'HANDED_OFF', 'SHIPPED', 'DELIVERED'] as const) {
  eq(`seller ${s}`, [BATCH_LIFECYCLE[s].label, BATCH_LIFECYCLE[s].classes], [SELLER_STATUS[s].label, SELLER_STATUS[s].classes])
}
eq('Đã đóng / Đơn đã huỷ hết dùng tông huỷ', [BATCH_LIFECYCLE.CLOSED.classes, BATCH_LIFECYCLE.NO_ITEMS.classes], [TONE.cancelled, TONE.cancelled])
const tones = new Set(Object.values(TONE))
eq('mọi màu là tông có sẵn', BATCH_LIFECYCLE_ORDER.filter((s) => !tones.has(BATCH_LIFECYCLE[s].classes)), [])
eq('nhãn không trùng nhau', new Set(BATCH_LIFECYCLE_ORDER.map((s) => BATCH_LIFECYCLE[s].label)).size, BATCH_LIFECYCLE_ORDER.length)
eq('chặng lạ: hiện nguyên mã, màu xám', [stageMeta('LEGACY_X').label, stageMeta('LEGACY_X').classes], ['LEGACY_X', TONE.pending])

// 3) URL: chặng hợp lệ, bỏ trùng, theo vòng đời; link cũ đổi sang chặng cùng nghĩa.
eq('URL chặng', stagesFromQuery(['HANDED_OFF', 'FILES_READY', 'HANDED_OFF']), ['FILES_READY', 'HANDED_OFF'])
eq('URL cũ PENDING', stagesFromQuery(['PENDING']), ['FILES_MISSING', 'FILES_READY'])
eq('URL cũ HANDED_OVER', stagesFromQuery(['HANDED_OVER']), ['HANDED_OFF', 'SHIPPED', 'DELIVERED'])
eq('URL cũ HANDOVER_PENDING + CUT', stagesFromQuery(['HANDOVER_PENDING', 'CUT']), ['CUT', 'QC_PASSED', 'PACKED'])
eq('URL rác bị bỏ', stagesFromQuery(['xyz', 'handed_off', '']), [])

// 4) Cột: mặc định = 4 cột cũ (+ trạng thái lạ), chọn = mỗi chặng một cột.
const def = boardColumns([])
eq('mặc định 4 cột', def.map((c) => c.value), ['PENDING', 'PRINTED', 'CUT', 'QC_PASSED'])
eq('mặc định: cột còn việc cũ nhất trước, Đã QC mới nhất trước', def.map((c) => c.sort), ['oldest', 'oldest', 'oldest', 'newest'])
eq('mặc định + trạng thái lạ', boardColumns([], ['PENDING', 'LEGACY_X']).map((c) => c.value), ['PENDING', 'PRINTED', 'CUT', 'QC_PASSED', 'LEGACY_X'])
eq('tham số cột mặc định giữ open=1', columnParams(def[0]), { status: 'PENDING', open: true, sort: 'oldest' })
const picked = boardColumns(['CLOSED', 'FILES_READY', 'HANDED_OFF'])
eq('chọn chặng: theo vòng đời', picked.map((c) => c.value), ['FILES_READY', 'HANDED_OFF', 'CLOSED'])
eq('chọn chặng: xong việc mới nhất trước', picked.map((c) => c.sort), ['oldest', 'newest', 'newest'])
eq('tham số cột chặng (không open)', columnParams(picked[2]), { stage: 'CLOSED', sort: 'newest' })
eq('chọn đủ 11 chặng = 11 cột', boardColumns([...BATCH_LIFECYCLE_ORDER]).length, 11)

// 5) Chip phụ trên thẻ ở cột mặc định.
const qcCol = def[3]
const pendCol = def[0]
eq('Đã bàn giao ở cột Đã QC', cardStageChip({ stage: 'HANDED_OFF', status: 'QC_PASSED' }, qcCol)?.label, 'Đã bàn giao')
eq('Đã QC ở cột Đã QC: không chip', cardStageChip({ stage: 'QC_PASSED', status: 'QC_PASSED' }, qcCol), null)
eq('Đã có file SX ở cột Chờ xử lý', cardStageChip({ stage: 'FILES_READY', status: 'PENDING' }, pendCol)?.label, 'Đã có file SX')
eq('Chờ xử lý ở cột Chờ xử lý: không chip', cardStageChip({ stage: 'FILES_MISSING', status: 'PENDING' }, pendCol), null)
eq('Đơn đã huỷ hết ở cột Đã cắt', cardStageChip({ stage: 'NO_ITEMS', status: 'CUT' }, def[2])?.label, 'Đơn đã huỷ hết')
eq('cột chặng: không chip', cardStageChip({ stage: 'HANDED_OFF', status: 'QC_PASSED' }, picked[1]), null)
const links = [{ id: 1, batch_id: 1, kind: 'PRINT' as const, url: 'a' }, { id: 2, batch_id: 1, kind: 'CUT' as const, url: 'b' }]
eq('API cũ (không stage): vẫn chip Đã có file SX', cardStageChip({ status: 'PENDING', links } as never, pendCol)?.label, 'Đã có file SX')
eq('API cũ, thiếu link: không chip', cardStageChip({ status: 'PENDING', links: links.slice(0, 1) } as never, pendCol), null)

// 6) Dòng tách đầu cột (số prod 27/11).
const byStatus = {
  PENDING: { FILES_MISSING: 19, FILES_READY: 15, CLOSED: 4 },
  CUT: { CUT: 12, NO_ITEMS: 3, CLOSED: 21 },
  PRINTED: { CLOSED: 1 },
  QC_PASSED: { HANDED_OFF: 1699, QC_PASSED: 29, NO_ITEMS: 4, CLOSED: 6 },
}
eq('tách Chờ xử lý', columnBreakdown(byStatus, 'PENDING'), [{ stage: 'FILES_MISSING', count: 19 }, { stage: 'FILES_READY', count: 15 }])
eq('tách Đã QC (bỏ Đã đóng)', columnBreakdown(byStatus, 'QC_PASSED'), [
  { stage: 'QC_PASSED', count: 29 }, { stage: 'HANDED_OFF', count: 1699 }, { stage: 'NO_ITEMS', count: 4 },
])
eq('một phần thì không tách', columnBreakdown({ PRINTED: { PRINTED: 3, CLOSED: 1 } }, 'PRINTED'), [])
eq('không có số', columnBreakdown(undefined, 'CUT'), [])

// 7) Xem thêm: nối trang, bỏ dòng trùng do trang trượt.
eq('mergePage', mergePage([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((x) => x.id), [1, 2, 3])

// 8) Màn Batch dùng chung bộ chặng: bản lưu cũ đổi đúng nghĩa của màn đó.
eq('màn Batch: PENDING cũ = Chờ xử lý (chưa đủ file)', stagesFromQuery(['PENDING'], BATCH_LIST_LEGACY), ['FILES_MISSING'])
eq('màn Batch: FILES_READY / QC_PASSED / HANDED_OVER / PRINTED cũ',
  stagesFromQuery(['FILES_READY', 'QC_PASSED', 'HANDED_OVER', 'PRINTED'], BATCH_LIST_LEGACY),
  ['FILES_READY', 'PRINTED', 'QC_PASSED', 'HANDED_OFF', 'SHIPPED', 'DELIVERED'])
eq('màn Batch: rỗng = Tất cả', stagesFromQuery([], BATCH_LIST_LEGACY), [])
// Ô lọc của hai màn: đủ 11 mục cùng nhãn, số ở bên phải khi có bảng đếm.
const opts = stageFilterOptions({ FILES_MISSING: 19, HANDED_OFF: 1718 })
eq('ô lọc đủ 11 mục theo vòng đời', opts.map((o) => o.value), BATCH_LIFECYCLE_ORDER)
eq('ô lọc: nhãn = nhãn chặng', opts.map((o) => o.label), BATCH_LIFECYCLE_ORDER.map((s) => BATCH_LIFECYCLE[s].label))
eq('ô lọc: số (chặng thiếu = 0)', [opts[0].hint, opts[6].hint, opts[9].hint], ['19', '1.718', '0'])
eq('ô lọc chưa có bảng đếm: không số', stageFilterOptions(null).every((o) => o.hint === undefined), true)
// Nhãn của một batch trong danh sách = nhãn chặng; API cũ rơi về nhãn cũ.
eq('nhãn batch theo stage', batchStageBadge({ id: 1, code: '#1', material_id: 1, status: 'CUT', stage: 'CLOSED' }).label, 'Đã đóng')
eq('nhãn batch: Đơn đã huỷ hết', batchStageBadge({ id: 1, code: '#1', material_id: 1, status: 'QC_PASSED', stage: 'NO_ITEMS' }).classes, TONE.cancelled)
eq('nhãn batch API cũ: Đã bàn giao', batchStageBadge({ id: 1, code: '#1', material_id: 1, status: 'QC_PASSED', handed_over: true }).label, 'Đã bàn giao')
eq('nhãn batch API cũ: Đã cắt', batchStageBadge({ id: 1, code: '#1', material_id: 1, status: 'CUT' }).label, 'Đã cắt')

console.log(`batchStages: ${passed} passed, ${failures} failed`)
if (failures) process.exit(1)
