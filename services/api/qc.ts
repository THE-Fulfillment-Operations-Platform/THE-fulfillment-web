import { apiPost } from '../http'
import type { QcScanResult, OrderItem, Note } from '~/types'

export interface QcScanInput {
  code?: string
  item_id?: number
}

export interface QcPassInput extends QcScanInput {
  batch_item_id?: number
  note?: string
}

export interface QcFailInput extends QcScanInput {
  batch_item_id?: number
  defect_code?: string
  note?: string
}

export const qcApi = {
  scan: (input: QcScanInput) => apiPost<QcScanResult>('/api/qc/scan', input),
  pass: (input: QcPassInput) => apiPost<OrderItem>('/api/qc/pass', input),
  fail: (input: QcFailInput) => apiPost<Note>('/api/qc/fail', input),
}
