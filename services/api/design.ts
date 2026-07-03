import { apiGet } from '../http'
import type { OrderItem, MaterialBucket } from '~/types'

export const designApi = {
  queue: () => apiGet<OrderItem[]>('/api/design-queue'),
  materialBuckets: () => apiGet<MaterialBucket[]>('/api/design-queue/material-buckets'),
  materialItems: (materialId: number | string) =>
    apiGet<OrderItem[]>(`/api/design-queue/material/${materialId}/items`),
}
