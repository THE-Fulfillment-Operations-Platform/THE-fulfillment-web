import { apiGet } from '../http'

// Ba con số badge ở sidebar. Trước đây phải gọi 4 endpoint list (mỗi cái chạy
// COUNT + SELECT và chiếm một kết nối DB) chỉ để vẽ 3 con số; giờ 1 request, 1
// câu SQL.
export interface ActionCounts {
  review: number
  cancellations: number
  notes: number
}

export const actionCountsApi = {
  get: () => apiGet<ActionCounts>('/api/action-counts'),
}
