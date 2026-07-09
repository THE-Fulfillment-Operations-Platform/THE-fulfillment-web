import { apiGet, apiPost, apiDownload } from '../http'
import type { ImportPreview, ImportCommitResult, ImportJob, ImportRow } from '~/types'

export interface ImportInput {
  seller_id: number
  commit: boolean
  filename?: string
  rows: ImportRow[]
}

export const importsApi = {
  // commit=false → preview only; commit=true → preview + commit result.
  preview: (body: ImportInput) => apiPost<ImportPreview>('/api/orders/import', { ...body, commit: false }),
  commitNow: (body: ImportInput) =>
    apiPost<ImportCommitResult>('/api/orders/import', { ...body, commit: true }),
  commitJob: (importJobId: number) =>
    apiPost<ImportCommitResult>('/api/orders/import/commit', { import_job_id: importJobId }),
  // Multipart upload — backend parses the CSV/XLSX file itself.
  previewFile: (file: File, sellerId: number) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('seller_id', String(sellerId))
    fd.append('commit', 'false')
    return apiPost<ImportPreview>('/api/orders/import', fd)
  },
  jobs: () => apiGet<ImportJob[]>('/api/import-jobs'),
  job: (id: number | string) => apiGet<ImportJob>(`/api/import-jobs/${id}`),
  // Download the order-import template as a real .xlsx (columns split cleanly in
  // Excel on any locale, unlike a comma CSV that opened crammed into one column).
  downloadTemplate: () =>
    apiDownload('/api/orders/import/template.xlsx', 'order-import-template.xlsx'),
}
