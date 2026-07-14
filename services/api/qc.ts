import { apiPost } from '../http'
import type { QcScanResult, OrderItem, Note } from '~/types'

export interface QcScanInput {
  code?: string
  item_id?: number
}

// QC là cổng cấp sản phẩm: PASS/FAIL áp cho cả item (mọi NVL), không QC lẻ theo
// từng batch-item — nên không còn batch_item_id.
export interface QcPassInput extends QcScanInput {
  note?: string
}

export interface QcFailInput extends QcScanInput {
  defect_code?: string
  note?: string
}

export const qcApi = {
  scan: (input: QcScanInput) => apiPost<QcScanResult>('/api/qc/scan', input),
  pass: (input: QcPassInput) => apiPost<OrderItem>('/api/qc/pass', input),
  fail: (input: QcFailInput) => apiPost<Note>('/api/qc/fail', input),
}
