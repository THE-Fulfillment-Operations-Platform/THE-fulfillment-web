import { apiGet, apiPost, apiDownload } from '../http'
import type { MasterImportPreview, MasterImportJob, ParentSkuImportPreview } from '~/types'

// Một dòng file SKU cha, gửi lại nguyên văn khi áp dụng (server phân tích lại).
export interface ParentSkuRowInput {
  sku: string
  product_name?: string
  description?: string
  row_number?: number
}

export interface LegacyRowInput {
  sku: string
  material: string
}

// Master-data setup: import the factory's legacy operational spreadsheet to seed
// Materials, SKUs and the SKU↔Material mapping (preview → commit).
export const masterDataApi = {
  // Multipart upload — backend parses the CSV/XLSX and auto-detects SKU + Loại VL.
  previewFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiPost<MasterImportPreview>('/api/master-data/import/preview', fd)
  },
  // JSON rows — used by the paste flow / tests.
  previewRows: (rows: LegacyRowInput[], filename?: string) =>
    apiPost<MasterImportPreview>('/api/master-data/import/preview', { filename, rows }),
  commit: (importJobId: number) =>
    apiPost<MasterImportPreview>('/api/master-data/import/commit', { import_job_id: importJobId }),
  jobs: () => apiGet<MasterImportJob[]>('/api/master-data/import-jobs'),
  job: (id: number | string) => apiGet<MasterImportPreview>(`/api/master-data/import-jobs/${id}`),
  // Download the sample template as a real .xlsx workbook (SKU + Loại VL columns
  // split cleanly in Excel on any locale, unlike a comma CSV that came out garbled).
  downloadTemplate: () =>
    apiDownload('/api/master-data/template.xlsx', 'master-data-template.xlsx'),

  // Bước 1 của thiết lập cha → con: import SKU cha. Bước 2 là import SKU ở trên
  // (cột "SKU cha" phải trỏ tới SKU cha đã có).
  parentsPreviewFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiPost<ParentSkuImportPreview>('/api/master-data/parents/import/preview', fd)
  },
  parentsCommit: (rows: ParentSkuRowInput[]) =>
    apiPost<ParentSkuImportPreview>('/api/master-data/parents/import/commit', { rows }),
  downloadParentTemplate: () =>
    apiDownload('/api/master-data/parents/template.xlsx', 'sku-cha-template.xlsx'),
}
