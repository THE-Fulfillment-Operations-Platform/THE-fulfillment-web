import { apiGet, apiDownload } from '../http'
import type { OrderItem, MaterialBucket } from '~/types'

export const designApi = {
  queue: (params?: { page?: number; page_size?: number }) => apiGet<OrderItem[]>('/api/design-queue', params),
  materialBuckets: () => apiGet<MaterialBucket[]>('/api/design-queue/material-buckets'),
  materialItems: (materialId: number | string) =>
    apiGet<OrderItem[]>(`/api/design-queue/material/${materialId}/items`),
  // Download design + mockup files of the queue as a ZIP (one folder per internal
  // code). Pass a list of item ids to bundle only the ticked rows; omit for all.
  downloadAssetsZip: (itemIds?: number[]) => {
    const qs = itemIds && itemIds.length ? `?item_ids=${itemIds.join(',')}` : ''
    return apiDownload(`/api/design-queue/assets.zip${qs}`, 'design-assets.zip')
  },
}
