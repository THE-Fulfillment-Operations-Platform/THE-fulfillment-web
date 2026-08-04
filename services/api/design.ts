import { apiGet, apiPost, apiDownload } from '../http'
import type { OrderItem, MaterialBucket, SKUBucket, ListParams } from '~/types'

export interface DesignQueueParams extends ListParams {
  batch?: string
  material_id?: number
  // Exact SKU code — the queue's SKU filter picks one of the codes the server
  // reported via queueSkus, so it never needs a partial match.
  sku?: string
  sort?: 'created_at' | 'batch' | 'sku'
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
  queueMaterials: (params?: { batch?: string; sku?: string }) =>
    apiGet<MaterialBucket[]>('/api/design-queue/materials', params),
  // Same idea for the SKU filter: only the SKU codes that actually have items in
  // the queue, with counts. Pass the other filters (batch, NVL) so the two
  // dropdowns stay in step.
  queueSkus: (params?: { batch?: string; material_id?: number }) =>
    apiGet<SKUBucket[]>('/api/design-queue/skus', params),
  // Every design-queue item that already has a design file, matching the filters —
  // unpaginated, so the "Tải ZIP" dialog can filter (mã nội bộ/SKU via q, NVL via
  // material_id, batch) over the WHOLE queue on the server, not just a loaded page.
  downloadable: (params?: { q?: string; material_id?: number; batch?: string }) =>
    apiGet<OrderItem[]>('/api/design-queue/downloadable', params),
  materialBuckets: () => apiGet<MaterialBucket[]>('/api/design-queue/material-buckets'),
  materialItems: (
    materialId: number | string,
    params?: { page?: number; page_size?: number; sort?: string; order?: 'asc' | 'desc' },
  ) => apiGet<OrderItem[]>(`/api/design-queue/material/${materialId}/items`, params),
  // Download ONLY the original design files (front/back, no mockup) of the queue as
  // a ZIP. Every file sits in one folder named "Batch_<code>" when a batch filter is
  // passed, else "Design_<date>", and is named Mã-nội-bộ_SKU_QUANTITY[_SIDE].EXT.
  // Pass itemIds to bundle only the ticked rows; omit them to bundle the whole queue
  // matching the filters (q over mã nội bộ/SKU, materialId, batch) — the same filters
  // as the pick-list, resolved server-side. The batch also names the folder. The .zip
  // file name mirrors the folder (apiDownload sets the browser filename, not server).
  downloadAssetsZip: (opts?: {
    itemIds?: number[]
    batch?: string
    q?: string
    materialId?: number
  }) => {
    const params = new URLSearchParams()
    if (opts?.itemIds?.length) params.set('item_ids', opts.itemIds.join(','))
    const batch = opts?.batch?.trim()
    if (batch) params.set('batch', batch)
    // Filters only bite the whole-queue path; with explicit ids the backend ignores
    // them, so sending them then is harmless but pointless — skip to keep URLs short.
    if (!opts?.itemIds?.length) {
      const q = opts?.q?.trim()
      if (q) params.set('q', q)
      if (opts?.materialId != null) params.set('material_id', String(opts.materialId))
    }
    const qs = params.toString() ? `?${params.toString()}` : ''
    // Mirror the backend's DesignAssetsFolder naming (see design_zip.go).
    const folder = batch
      ? `Batch_${batch.replace(/#/g, '').replace(/\//g, '-').replace(/ /g, '_')}`
      : `Design_${new Date().toISOString().slice(0, 10)}`
    return apiDownload(`/api/design-queue/assets.zip${qs}`, `${folder}.zip`)
  },
}
