import { apiGet, apiPost } from '../http'
import type { Order, OrderTrackingEvent } from '~/types'

/** What one full provider pass did — returned by the manual "sync all" trigger. */
export interface TrackingSyncStats {
  /** Orders that had no tracking number and were matched to a parcel by store order id. */
  resolved: number
  synced: number
  /** Of those synced, how many actually changed status. */
  changed: number
  failed: number
  skipped: number
}

export interface OrderTrackingResponse {
  events: OrderTrackingEvent[]
  /** False when the 24hTrack integration is off — lets the UI explain an empty journey. */
  enabled: boolean
}

export const trackingApi = {
  events: (orderId: number | string) =>
    apiGet<OrderTrackingResponse>(`/api/orders/${orderId}/tracking/events`),
  /** Pull one order straight from the provider (resolves its number first if needed). */
  syncOrder: (orderId: number | string) =>
    apiPost<Order>(`/api/orders/${orderId}/tracking/sync`, {}),
  /** Run one full pass by hand instead of waiting for the scheduler. */
  syncAll: (limit?: number) =>
    apiPost<TrackingSyncStats>(`/api/tracking/sync${limit ? `?limit=${limit}` : ''}`, {}),
}
