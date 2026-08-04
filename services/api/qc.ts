import { apiGet, apiPost } from '../http'
import type {
  QcScanResult,
  OrderItem,
  QcFailResult,
  QcResultsPayload,
  ListParams,
} from '~/types'

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
  // Phần NVL bị lỗi. Bắt buộc với SKU combo — không chỉ rõ thì server chặn, để
  // không huỷ oan phần đạt.
  batch_item_id?: number
  // Nơi trả sản phẩm về: PRODUCTION (làm lại) hoặc DESIGN (sửa file trước).
  rework_route?: 'PRODUCTION' | 'DESIGN'
}

export interface QcResultsParams extends ListParams {
  // done = đã QC đủ | partial = đạt một phần | none = chưa cái nào | rework = có hàng làm lại
  state?: string
  q?: string
  seller_id?: number
  date_from?: string
  date_to?: string
  /**
   * false = hàng đợi "chờ gửi cho THE" (đã QC, chưa gửi);
   * true  = đơn đã gửi, dùng cho màn Hành trình đơn hàng.
   */
  handed_over?: boolean
}

export const qcApi = {
  scan: (input: QcScanInput) => apiPost<QcScanResult>('/api/qc/scan', input),
  pass: (input: QcPassInput) => apiPost<OrderItem>('/api/qc/pass', input),
  fail: (input: QcFailInput) => apiPost<QcFailResult>('/api/qc/fail', input),
  // Kết quả QC theo đơn: mỗi đơn kèm trạng thái QC của từng sản phẩm trong đó.
  results: (params?: QcResultsParams) => apiGet<QcResultsPayload>('/api/qc/results', params),
}
