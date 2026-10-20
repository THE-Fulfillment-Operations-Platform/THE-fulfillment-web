import { apiGet, apiPost } from '../http'
import type { Basket, BasketForOrder, BasketLookup } from '~/types'

// Giỏ chờ: đơn nhiều sản phẩm gom ở một giỏ đánh số (1–100) tới khi đủ, bó lại rồi
// quét xác nhận mới thả giỏ. Trạng thái giỏ đọc từ đơn (xem BasketService ở API).
export const basketsApi = {
  list: () => apiGet<Basket[]>('/api/baskets'),
  // Đơn có đang nằm giỏ không / có cần giỏ không — trạm QC hỏi khi mở một sản phẩm.
  forOrder: (orderId: number) => apiGet<BasketForOrder>(`/api/baskets/order/${orderId}`),
  // Một ô quét nhận tem giỏ (GIO-37), mã đơn, mã người bán hoặc tem sản phẩm.
  lookup: (code: string) => apiPost<BasketLookup>('/api/baskets/lookup', { code }),
  // Giỏ trống thấp nhất; đơn đã có giỏ thì trả lại giỏ đó (created=false).
  create: (orderId: number) => apiPost<{ basket: Basket; created: boolean }>('/api/baskets', { order_id: orderId }),
  // Quét xác nhận đã bó đủ → thả giỏ. force + reason: admin thả giỏ chưa đủ.
  release: (id: number, input: { force?: boolean; reason?: string } = {}) =>
    apiPost<Basket>(`/api/baskets/${id}/release`, input),
}
