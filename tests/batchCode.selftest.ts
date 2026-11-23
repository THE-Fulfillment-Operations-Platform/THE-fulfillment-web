// Bài tự kiểm mã batch ở màn Đơn hàng (utils/item): chạy bằng `npm run test:batch-code`.
// Luật (Nghĩa 23/11/2026): luôn hiện MÃ batch (#102909), KHÔNG BAO GIỜ "#" + batch_id
// (id nội bộ 1909 viết thành "#1909" trông y mã #101909 — một batch khác hẳn).
import type { OrderItem } from '../types'
import { batchRefCode, batchRefLabel, itemBatches, itemBatchesText, itemBatchFilterParams } from '../utils/item'

let failures = 0
let passed = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    passed++
    return
  }
  failures++
  console.log(`FAIL ${name}: got ${g}, want ${w}`)
}

const item = (batch_items: OrderItem['batch_items']) => ({ id: 1, batch_items }) as OrderItem

// ---- Một phần: API mới (batch_code), API cũ (chỉ batch.code), thiếu mã ----
eq('batch_code', batchRefLabel({ batch_id: 1909, batch_code: '#102909' }), '#102909')
eq('API cũ: batch.code', batchRefLabel({ batch_id: 1909, batch: { id: 1909, code: '#102909' } as never }), '#102909')
eq('thiếu mã → id rõ ràng', batchRefLabel({ batch_id: 1909 }), 'id 1909')
eq('không có gì → —', batchRefLabel({}), '—')
eq('mã rỗng không dựng từ id', batchRefCode({ batch_id: 1909 }), '')

// ---- Cột Batch: mọi nhãn đều là mã, không có "#<id>" ----
const real = item([{ id: 10, batch_id: 1909, batch_code: '#102909', material_code: 'BW3' }])
eq('1 batch', itemBatches(real).map((b) => b.label), ['#102909'])
eq('1 batch: batchId để dựng link', itemBatches(real)[0].batchId, 1909)
eq('không batch', itemBatches(item([])).length, 0)
eq('không batch: text', itemBatchesText(item(undefined)), '—')

const combo = item([
  { id: 11, batch_id: 1909, batch_code: '#102909', material_code: 'BW3' },
  { id: 12, batch_id: 1902, batch_code: '#102902', material_code: 'MC2' },
  { id: 13, batch_id: 1950, batch_code: '#102950', material_code: 'AC1' },
])
eq('3 batch: thứ tự tạo phần', itemBatches(combo).map((b) => b.label), ['#102909', '#102902', '#102950'])
eq('tooltip đủ mã + NVL', itemBatchesText(combo), '#102909 (BW3), #102902 (MC2), #102950 (AC1)')
eq('CSV đủ mã, không NVL', itemBatchesText(combo, false), '#102909, #102902, #102950')

// Phần đã huỷ xếp sau phần còn sống và được đánh dấu.
const reworked = item([
  { id: 20, batch_id: 909, batch_code: '#101909', material_code: 'BW3', scrapped_at: '2026-11-01T00:00:00Z' },
  { id: 21, batch_id: 1909, batch_code: '#102909', material_code: 'BW3' },
])
eq('huỷ xếp sau', itemBatches(reworked).map((b) => [b.label, b.scrapped]), [['#102909', false], ['#101909', true]])
eq('CSV ghi đã huỷ', itemBatchesText(reworked, false), '#102909, #101909 (đã huỷ)')

// Hai phần cùng một batch (huỷ rồi làm lại trong chính batch đó) → một mã, còn sống.
const sameBatch = item([
  { id: 30, batch_id: 1909, batch_code: '#102909', scrapped_at: '2026-11-01T00:00:00Z' },
  { id: 31, batch_id: 1909, batch_code: '#102909' },
])
eq('gộp trùng batch', itemBatches(sameBatch).map((b) => [b.label, b.scrapped]), [['#102909', false]])

// Bất biến: không nhãn nào có dạng "#<batch_id>" khi id ≠ mã.
for (const it of [real, combo, reworked, sameBatch, item([{ id: 40, batch_id: 1909 }])]) {
  for (const b of itemBatches(it)) {
    if (b.batchId && b.label === `#${b.batchId}`) {
      failures++
      console.log(`FAIL nhãn là id nội bộ: ${b.label}`)
    } else passed++
  }
}

// ---- Ô Batch ID màn Đơn hàng → tham số API ----
eq('mã không #', itemBatchFilterParams('102909'), { batch: '102909' })
eq('mã có #', itemBatchFilterParams('#102909'), { batch: '102909' })
eq('khoảng trắng + ##', itemBatchFilterParams('  ##102909 '), { batch: '102909' })
eq('id rõ ràng', itemBatchFilterParams('id 1909'), { batch_id: 1909 })
eq('id: / ID#', [itemBatchFilterParams('id:1909'), itemBatchFilterParams('ID#1909')], [{ batch_id: 1909 }, { batch_id: 1909 }])
eq('số trần là MÃ, không phải id', itemBatchFilterParams('1909'), { batch: '1909' })
eq('trống', itemBatchFilterParams('   '), {})
eq('chỉ #', itemBatchFilterParams('#'), {})

console.log(failures ? `${failures} phép thử HỎNG, ${passed} đạt` : `Tất cả ${passed} phép thử đạt`)
process.exit(failures ? 1 : 0)
