import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiDownload } from '../http'
import type {
  Batch, BatchLink, BatchLinkKind, CreateBatchResult, InternalStatus, Priority, ListParams,
  ScrapBatchInput, ScrapBatchResult,
} from '~/types'

// ---- Tự tạo batch (hệ thống tự gom cả pool, tự sinh mã) ---------------------

/** Kết quả gom của MỘT nguyên vật liệu trong một lần tự tạo. */
export interface AutoCreatedBatch {
  material_id: number
  material_code: string
  material_name: string
  /** Batch đầu tiên đã tạo (để bấm mở nhanh). */
  batch_id: number
  batch_code: string
  /** Mã mọi batch đã tạo cho NVL này — mỗi tấm một batch. */
  batch_codes: string[]
  item_count: number
  skipped_item_ids: number[]
}

/** Nguyên vật liệu hệ thống KHÔNG tự gom được, kèm lý do — không đoán mò. */
export interface AutoCreateSkip {
  material_code: string
  material_name: string
  reason: string
}

export interface AutoCreateBatchesResult {
  created: AutoCreatedBatch[]
  skipped: AutoCreateSkip[]
  total_batches: number
  total_items: number
}

// ---- Nộp bộ file sản xuất (cặp link in + cắt nguyên tử) ---------------------

export type BatchLinkPairAction = 'ASSIGN' | 'REPLACE' | 'UNCHANGED'

export interface SetBatchLinkPairInput {
  print_url: string
  cut_url: string
  /** Bắt buộc khi thay link hiện có bằng URL khác. */
  reason?: string
}

export interface BatchLinkPairResult {
  links: BatchLink[]
  action: BatchLinkPairAction
}

// ---- Excel link in/cắt: export → designer điền → preview → commit -----------

export type BatchLinkImportSeverity = 'OK' | 'WARNING' | 'ERROR'

export type BatchLinkImportIssueCode =
  | 'BAD_TEMPLATE'
  | 'MISSING_BATCH_ID'
  | 'MISSING_CODE'
  | 'NOT_FOUND'
  | 'CODE_MISMATCH'
  | 'CLOSED'
  | 'ALREADY_STARTED'
  | 'NO_ITEMS'
  | 'DUPLICATE_BATCH'
  | 'MISSING_PRINT'
  | 'MISSING_CUT'
  | 'INVALID_URL'
  | 'REPLACE'

/** Một dòng file sau đối chiếu: dữ liệu hiện tại vs dữ liệu sẽ ghi. */
export interface BatchLinkImportPreviewRow {
  row: number
  batch_id: number
  batch_code: string
  material?: string
  status?: InternalStatus
  item_count: number
  current_print_url: string
  current_cut_url: string
  new_print_url: string
  new_cut_url: string
  action?: BatchLinkPairAction
  severity: BatchLinkImportSeverity
  code?: BatchLinkImportIssueCode
  reason?: string
}

export interface BatchLinkImportSummary {
  total_rows: number
  ok: number
  warnings: number
  errors: number
  assign: number
  replace: number
  unchanged: number
}

export interface BatchLinkImportPreview {
  summary: BatchLinkImportSummary
  rows: BatchLinkImportPreviewRow[]
  /** false ngay khi CÓ MỘT dòng lỗi chặn — không nhập một nửa file. */
  can_commit: boolean
}

export interface BatchLinkImportCommitRow {
  batch_id: number
  batch_code: string
  print_url: string
  cut_url: string
  /** Link hiện tại đã THẤY ở preview — backend so lại, lệch là huỷ cả lần nhập. */
  expected_print_url: string
  expected_cut_url: string
}

export interface BatchLinkImportCommitInput {
  source_filename: string
  /** Bắt buộc khi có dòng REPLACE. */
  reason?: string
  rows: BatchLinkImportCommitRow[]
}

export interface BatchLinkImportCommitResult {
  updated: number
  unchanged: number
  updated_batch_codes: string[]
}

export interface BatchListParams extends ListParams {
  material_id?: number
  status?: string
  priority?: string
  date_from?: string
  date_to?: string
  // open=true: chỉ batch còn việc — bỏ batch đã đóng vì toàn bộ hàng bị huỷ ở QC.
  open?: boolean
  // Mã nội bộ đơn ("100047") hoặc mã tem item ("100047_1/1") — trả về (các)
  // batch đang sản xuất đơn đó.
  code?: string
}

export interface CreateBatchInput {
  material_id: number
  order_item_ids: number[]
  priority?: Priority
  due_date?: string
  note?: string
}

export const batchesApi = {
  list: (params?: BatchListParams) => apiGet<Batch[]>('/api/batches', params),
  get: (id: number | string) => apiGet<Batch>(`/api/batches/${id}`),
  create: (body: CreateBatchInput) => apiPost<CreateBatchResult>('/api/batches', body),
  setStatus: (id: number | string, status: InternalStatus, note?: string) =>
    apiPatch<Batch>(`/api/batches/${id}/status`, { status, note }),
  // Xoá batch CHƯA sản xuất (PENDING toàn bộ, chưa QC/scrap) — item được thả về
  // màn gom batch. Batch đã in/cắt bị BE từ chối (422).
  remove: (id: number | string) => apiDelete<{ deleted: boolean }>(`/api/batches/${id}`),
  // Huỷ batch ĐÃ sản xuất: ngược lại với remove(). Xoá là undo của lệnh gom
  // batch (chưa ai đụng vào, xoá sạch dấu vết); huỷ ghi nhận một tấm đã in/cắt
  // hỏng thật — phần sản xuất được đánh dấu huỷ kèm lý do, batch đóng lại, sản
  // phẩm quay về hàng chờ gom batch (hoặc hàng chờ thiết kế nếu lỗi từ file).
  scrap: (id: number | string, body: ScrapBatchInput) =>
    apiPost<ScrapBatchResult>(`/api/batches/${id}/scrap`, body),
  // Hệ thống tự gom CẢ pool design-ready thành batch (phân theo NVL, chia theo
  // định mức, tự sinh mã) — người vận hành chỉ bấm một nút và đọc kết quả.
  autoCreate: () => apiPost<AutoCreateBatchesResult>('/api/batches/auto', {}),
  // Attach/replace the batch's print or cut link (đường dự phòng một-link;
  // thay bằng URL khác bắt buộc reason — BE từ chối nếu thiếu).
  setLink: (id: number | string, kind: BatchLinkKind, url: string, reason?: string) =>
    apiPatch<BatchLink>(`/api/batches/${id}/links`, { kind, url, reason }),
  // Nộp BỘ file sản xuất: cặp link in + cắt lưu nguyên tử trong một transaction
  // (không bao giờ có link in mới + link cắt cũ), fan-out cả hai xuống item.
  setLinkPair: (id: number | string, body: SetBatchLinkPairInput) =>
    apiPut<BatchLinkPairResult>(`/api/batches/${id}/links`, body),
  // Excel bàn làm việc designer: mỗi dòng một batch chờ file (Batch ID bất biến
  // + mã batch + link hiện tại). Designer điền Link in/Link cắt rồi upload lại.
  downloadLinksExport: () =>
    apiDownload('/api/batches/links/export.xlsx', 'batch-production-links.xlsx'),
  /** Preview import link: backend đối chiếu theo Batch ID, KHÔNG ghi gì. */
  previewLinkImport: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiPost<BatchLinkImportPreview>('/api/batches/links/import/preview', fd)
  },
  /** Commit import link: MỘT transaction cho cả file — lỗi bất kỳ huỷ toàn bộ. */
  commitLinkImport: (body: BatchLinkImportCommitInput) =>
    apiPost<BatchLinkImportCommitResult>('/api/batches/links/import/commit', body),
  // Download the legacy-compatible production template as a real .xlsx workbook
  // (columns split cleanly in Excel on any locale, unlike a comma CSV).
  exportProductionTemplate: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/production-template.xlsx`,
      `production-${(code ?? String(id)).replace('#', '')}.xlsx`,
    ),
  // Download all asset files for the batch as a ZIP bundle (design+mockup+print+cut).
  downloadAssetsZip: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/assets.zip`,
      `batch-${(code ?? String(id)).replace('#', '')}-assets.zip`,
    ),
  // Download ONLY the original design files (front/back, no mockup) named
  // STT_SKU_QUANTITY[_SIDE].EXT, bundled as Batch_<code>.zip.
  downloadDesignZip: (id: number | string, code?: string) =>
    apiDownload(
      `/api/batches/${id}/assets.zip?assets=design`,
      `Batch_${(code ?? String(id)).replace('#', '')}.zip`,
    ),
}
