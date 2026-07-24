import { apiGet, apiPost, apiDownload } from '../http'
import type { OrderItem, MaterialBucket, ListParams } from '~/types'

export interface DesignQueueParams extends ListParams {
  batch?: string
  material_id?: number
  sort?: 'created_at' | 'batch'
  order?: 'asc' | 'desc'
}

export interface BulkSetReadyResult {
  ready_ids: number[]
  skipped: { item_id: number; item_code: string; reason: string }[]
}

export const designApi = {
  queue: (params?: DesignQueueParams) => apiGet<OrderItem[]>('/api/design-queue', params),
  // Set many queue items design-ready at once. Backend flips the eligible ones and
  // returns the rest as skipped-with-reason (missing mockup, cancelled, …).
  bulkSetReady: (itemIds: number[]) =>
    apiPost<BulkSetReadyResult>('/api/design-queue/set-ready', { item_ids: itemIds }),
  // Materials that actually have items in the queue (with counts) — this backs the
  // NVL filter, so it never offers a material that would return an empty table.
  // Pass the queue's other filters (e.g. batch) to keep the two in step.
  queueMaterials: (params?: { batch?: string }) =>
    apiGet<MaterialBucket[]>('/api/design-queue/materials', params),
  materialBuckets: () => apiGet<MaterialBucket[]>('/api/design-queue/material-buckets'),
  materialItems: (
    materialId: number | string,
    params?: { page?: number; page_size?: number; sort?: string; order?: 'asc' | 'desc' },
  ) => apiGet<OrderItem[]>(`/api/design-queue/material/${materialId}/items`, params),
  // Download ONLY the original design files (front/back, no mockup) of the queue as
  // a ZIP. Every file sits in one folder named "Batch_<code>" when a batch filter is
  // passed, else "Design_<date>", and is named STT_SKU_QUANTITY[_SIDE].EXT. Pass
  // item ids to bundle only the ticked rows; omit for the whole (batch-filtered)
  // queue. The batch also names the folder even when ids are given. The .zip file
  // name mirrors the folder (apiDownload sets the browser filename, not the server).
  downloadAssetsZip: (opts?: { itemIds?: number[]; batch?: string }) => {
    const params = new URLSearchParams()
    if (opts?.itemIds?.length) params.set('item_ids', opts.itemIds.join(','))
    const batch = opts?.batch?.trim()
    if (batch) params.set('batch', batch)
    const qs = params.toString() ? `?${params.toString()}` : ''
    // Mirror the backend's DesignAssetsFolder naming (see design_zip.go).
    const folder = batch
      ? `Batch_${batch.replace(/#/g, '').replace(/\//g, '-').replace(/ /g, '_')}`
      : `Design_${new Date().toISOString().slice(0, 10)}`
    return apiDownload(`/api/design-queue/assets.zip${qs}`, `${folder}.zip`)
  },
}
