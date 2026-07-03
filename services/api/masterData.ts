import { apiGet, apiPost } from '../http'
import type { MasterImportPreview, MasterImportJob } from '~/types'

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
}
