import type { ApiResult, HttpMethod, RequestOptions } from './http'
import { ApiError } from '~/utils/api-error'
import type {
  Batch,
  CancellationStatus,
  LoginResponse,
  MaterialBucket,
  Note,
  Order,
  OrderItem,
  QcScanResult,
  SellerOrder,
  SellerOrderItem,
  User,
} from '~/types'

// ---------------------------------------------------------------------------
// Lightweight mock layer used when NUXT_PUBLIC_USE_MOCK=true. It mirrors the
// backend seed data so the operational screens are demoable without a live API.
// Only the read-heavy demo-flow endpoints are covered; everything else falls
// through to a MOCK_MISS so it is obvious the route still needs a real backend.
// ---------------------------------------------------------------------------

const SELLER_ID = 1
const ts = '2026-06-26T22:15:28+07:00'

const USERS: Record<string, User> = {
  'owner@the.local': { id: 1, email: 'owner@the.local', full_name: 'Owner', role: 'OWNER', is_active: true },
  'admin@the.local': { id: 2, email: 'admin@the.local', full_name: 'Admin', role: 'ADMIN', is_active: true },
  'ops@the.local': { id: 3, email: 'ops@the.local', full_name: 'Ops', role: 'OPS', is_active: true },
  'designer@the.local': { id: 4, email: 'designer@the.local', full_name: 'Designer', role: 'DESIGNER', is_active: true },
  'production@the.local': { id: 5, email: 'production@the.local', full_name: 'Production', role: 'PRODUCTION', is_active: true },
  'qc@the.local': { id: 6, email: 'qc@the.local', full_name: 'QC', role: 'QC', is_active: true },
  'packing@the.local': { id: 7, email: 'packing@the.local', full_name: 'Packing', role: 'PACKING', is_active: true },
  'shipping@the.local': { id: 8, email: 'shipping@the.local', full_name: 'Shipping', role: 'SHIPPING', is_active: true },
  'seller@the.local': { id: 9, email: 'seller@the.local', full_name: 'Seller One', role: 'SELLER', seller_id: SELLER_ID, is_active: true },
}

function makeItem(id: number, code: string, sku: string, material: string, status: OrderItem['internal_status'], design: OrderItem['design_status']): OrderItem {
  return {
    id,
    internal_code: code,
    sku_code: sku,
    product_name: 'Personalized ' + sku,
    quantity: 1,
    internal_status: status,
    design_status: design,
    mockup_url: design === 'MISSING' ? undefined : `https://mockups.example.com/${code}.png`,
    material_code: material,
    material_name: material === 'WOOD' ? 'Gỗ' : material === 'MICA' ? 'Mica' : material === 'ACRYLIC' ? 'Acrylic' : 'Metal',
    print_file_url: design === 'READY' ? `https://files.example.com/${code}-print.pdf` : undefined,
  }
}

const ORDERS: Order[] = [
  {
    id: 1, internal_code: '100001', store_order_id: 'Etsy-7821', seller_id: SELLER_ID, store_name: 'Etsy-Demo',
    seller_status: 'PRODUCTION', shipping_name: 'John Doe', shipping_country: 'US', shipping_address1: '12 Main St',
    shipping_city: 'Austin', created_at: ts,
    items: [makeItem(1, '100001_1/1', 'WOOD-01', 'WOOD', 'CUT', 'READY')],
  },
  {
    id: 2, internal_code: '100002', store_order_id: 'Etsy-7822', seller_id: SELLER_ID, store_name: 'Etsy-Demo',
    seller_status: 'PRODUCTION', shipping_name: 'Jane Smith', shipping_country: 'US', created_at: ts,
    items: [makeItem(2, '100002_1/1', 'MICA-02', 'MICA', 'PRINTED', 'READY')],
  },
  {
    id: 3, internal_code: '100003', store_order_id: 'Etsy-7823', seller_id: SELLER_ID, store_name: 'Etsy-Demo',
    seller_status: 'PRODUCTION', shipping_name: 'Bob Lee', shipping_country: 'CA', created_at: ts,
    items: [makeItem(3, '100003_1/1', 'COMBO-01', 'WOOD', 'PENDING', 'IN_PROGRESS')],
  },
  {
    id: 4, internal_code: '100004', store_order_id: 'Etsy-7824', seller_id: SELLER_ID, store_name: 'Etsy-Demo',
    seller_status: 'PRODUCTION', shipping_name: 'Alice Wong', shipping_country: 'AU', created_at: ts,
    items: [makeItem(4, '100004_1/1', 'ACR-05', 'ACRYLIC', 'PENDING', 'MISSING')],
  },
]

const BATCHES: Batch[] = [
  {
    id: 101001, code: '#101001', material_id: 1, material_code: 'WOOD', material_name: 'Gỗ',
    status: 'PRINTED', priority: 'NORMAL', item_count: 1, created_at: ts,
    created_by: { id: 4, email: 'designer@the.local', full_name: 'Designer Demo', role: 'DESIGNER', is_active: true },
    items: [{ id: 1, item_code: '100001_1/1', order_code: '100001', sku_code: 'WOOD-01', status: 'PRINTED', mockup_url: 'https://mockups.example.com/100001_1/1.png', print_file_url: 'https://files.example.com/100001_1/1-print.pdf' }],
  },
]

const BUCKETS: MaterialBucket[] = [
  { material_id: 1, material_code: 'WOOD', material_name: 'Gỗ', item_count: 1 },
  { material_id: 2, material_code: 'MICA', material_name: 'Mica', item_count: 0 },
  { material_id: 3, material_code: 'ACRYLIC', material_name: 'Acrylic', item_count: 1 },
  { material_id: 4, material_code: 'METAL', material_name: 'Metal', item_count: 0 },
]

const NOTES: Note[] = [
  { id: 1, title: 'Thiếu mockup ACR-05', body: 'Seller chưa gửi mockup', reason_code: 'ART_MISSING', severity: 'HIGH', status: 'OPEN', is_required_attention: true, entity_type: 'ORDER_ITEM', entity_id: 4, owner_role: 'DESIGNER', created_at: ts },
]

function sellerItem(
  id: number,
  sku: string,
  name: string,
  quantity: number,
  cancellation: CancellationStatus = 'NONE',
): SellerOrderItem {
  return { id, sku_code: sku, product_name: name, quantity, cancellation_status: cancellation }
}

// Seller-facing fixtures. Kept mutable (module singleton) so the mock cancel
// handlers below can flip item / order state and the UI reflects it on reload.
// Order 1 is still in the review flow (per-item DIRECT cancel); orders 2 & 3 are
// approved (per-item cancel is a REQUEST ops must approve); order 3 also seeds a
// pending request + an already-cancelled product to show those states.
const SELLER_ORDERS: SellerOrder[] = [
  {
    id: 1, internal_code: '100001', store_order_id: 'US-0925-008', store_name: 'CrochetedChari',
    status: 'PRODUCTION', review_status: 'PENDING_REVIEW', cancellation_status: 'NONE',
    can_cancel: true, can_request_cancellation: false, item_count: 3, created_at: ts,
    items: [
      sellerItem(11, 'BR-SH-2-KEP', 'Móc khoá len Cải bó xôi', 1),
      sellerItem(12, 'BR-SH-2-KEP', 'Móc khoá len Bắp cải', 1),
      sellerItem(13, 'BR-SH-2-KEP', 'Móc khoá len Dưa leo', 2),
    ],
  },
  {
    id: 2, internal_code: '100002', store_order_id: 'US-0925-011', store_name: 'CrochetedChari',
    status: 'PRODUCTION', review_status: 'APPROVED', cancellation_status: 'NONE',
    can_cancel: false, can_request_cancellation: true, item_count: 2, created_at: ts,
    items: [
      sellerItem(21, 'WOOD-01', 'Personalized Wood Sign', 1),
      sellerItem(22, 'MICA-02', 'Mica Name Plate', 1),
    ],
  },
  {
    id: 3, internal_code: '100003', store_order_id: 'US-0925-014', store_name: 'CrochetedChari',
    status: 'PRODUCTION', review_status: 'APPROVED', cancellation_status: 'NONE',
    can_cancel: false, can_request_cancellation: true, item_count: 3, created_at: ts,
    items: [
      sellerItem(31, 'ACR-05', 'Acrylic Keychain', 1, 'REQUESTED'),
      sellerItem(32, 'ACR-06', 'Acrylic Stand', 1),
      sellerItem(33, 'WOOD-02', 'Wood Ornament', 1, 'SELLER_CANCELLED'),
    ],
  },
]

// An item counts as "gone" once cancelled outright or approved-for-cancel.
function itemGone(it: SellerOrderItem): boolean {
  return it.cancellation_status === 'SELLER_CANCELLED' || it.cancellation_status === 'APPROVED'
}

function list<T>(data: T[]): ApiResult<T[]> {
  return { data, meta: { page: 1, page_size: 20, total: data.length, total_pages: 1 } }
}

export async function resolveMock<T>(
  method: HttpMethod,
  url: string,
  opts: RequestOptions,
): Promise<ApiResult<T> | null> {
  const path = url.split('?')[0]

  if (method === 'POST' && path === '/api/auth/login') {
    const body = opts.body as { email?: string; password?: string }
    const user = body?.email ? USERS[body.email] : undefined
    if (!user || body?.password !== 'Password123!') {
      throw new ApiError('Email hoặc mật khẩu không đúng', 'UNAUTHORIZED', 401)
    }
    const payload: LoginResponse = { token: 'mock-token-' + user.role, expires_at: ts, user }
    return { data: payload as T }
  }

  if (method === 'GET' && path === '/api/me') {
    return { data: USERS['ops@the.local'] as T }
  }
  if (method === 'GET' && path === '/api/orders') return list(ORDERS) as ApiResult<T>
  if (method === 'GET' && /^\/api\/orders\/\d+$/.test(path)) {
    const id = Number(path.split('/').pop())
    const o = ORDERS.find((x) => x.id === id)
    return o ? ({ data: o as T }) : null
  }
  if (method === 'GET' && path === '/api/items') {
    return list(ORDERS.flatMap((o) => (o.items ?? []).map((it) => ({ ...it, order: o })))) as ApiResult<T>
  }
  if (method === 'GET' && path === '/api/design-queue') {
    return list(ORDERS.flatMap((o) => o.items ?? []).filter((it) => it.design_status !== 'READY')) as ApiResult<T>
  }
  if (method === 'GET' && path === '/api/design-queue/material-buckets') {
    return { data: BUCKETS as T }
  }
  if (method === 'GET' && path === '/api/batches') return list(BATCHES) as ApiResult<T>
  if (method === 'GET' && /^\/api\/batches\/\d+$/.test(path)) {
    const id = Number(path.split('/').pop())
    const b = BATCHES.find((x) => x.id === id)
    return b ? ({ data: b as T }) : null
  }
  if (method === 'POST' && path === '/api/qc/scan') {
    const result: QcScanResult = {
      item_id: 1, item_code: '100001_1/1', order_code: '100001', store_order_id: 'Etsy-7821',
      sku_code: 'WOOD-01', product_name: 'Personalized Wood Sign', engrave_text: '',
      mockup_url: 'https://mockups.example.com/100001_1/1.png', internal_status: 'CUT',
      batches: [{ batch_item_id: 1, batch_code: '#101001', material_code: 'WOOD', status: 'CUT' }],
    }
    return { data: result as T }
  }
  if (method === 'GET' && path === '/api/notes') return list(NOTES) as ApiResult<T>
  if (method === 'GET' && path === '/api/seller/orders') return list(SELLER_ORDERS) as ApiResult<T>
  if (method === 'GET' && /^\/api\/seller\/orders\/\d+$/.test(path)) {
    const o = SELLER_ORDERS.find((x) => x.id === Number(path.split('/').pop()))
    // Return a fresh copy each read (like a real backend) so a reload after a
    // cancel yields a new object reference — otherwise Vue keeps the same ref and
    // computed values derived from it (e.g. the cancelled count) go stale.
    return o ? ({ data: structuredClone(o) as T }) : null
  }
  // Whole-order cancel: kill every still-active product and lock the order.
  {
    const m = path.match(/^\/api\/seller\/orders\/(\d+)\/cancel$/)
    if (method === 'POST' && m) {
      const o = SELLER_ORDERS.find((x) => x.id === Number(m[1]))
      if (!o) return null
      o.cancellation_status = 'SELLER_CANCELLED'
      o.review_status = 'CANCELLED'
      o.can_cancel = false
      o.can_request_cancellation = false
      o.items?.forEach((it) => {
        if (!itemGone(it)) it.cancellation_status = 'SELLER_CANCELLED'
      })
      o.item_count = 0
      return { data: o as T }
    }
  }
  // Whole-order cancellation request (approved/in-production order).
  {
    const m = path.match(/^\/api\/seller\/orders\/(\d+)\/cancellation-request$/)
    if (method === 'POST' && m) {
      const o = SELLER_ORDERS.find((x) => x.id === Number(m[1]))
      if (!o) return null
      o.cancellation_status = 'REQUESTED'
      o.can_request_cancellation = false
      return { data: o as T }
    }
  }
  // Per-item direct cancel; if it empties the order, cancel the order too.
  {
    const m = path.match(/^\/api\/seller\/orders\/(\d+)\/items\/(\d+)\/cancel$/)
    if (method === 'POST' && m) {
      const o = SELLER_ORDERS.find((x) => x.id === Number(m[1]))
      const it = o?.items?.find((x) => x.id === Number(m[2]))
      if (!o || !it) return null
      if (!o.can_cancel || itemGone(it) || it.cancellation_status === 'REQUESTED') {
        throw new ApiError('Sản phẩm không còn ở trạng thái có thể huỷ trực tiếp.', 'CONFLICT', 409)
      }
      it.cancellation_status = 'SELLER_CANCELLED'
      o.item_count = o.items?.filter((item) => !itemGone(item)).length ?? 0
      if (o.items?.every(itemGone)) {
        o.cancellation_status = 'SELLER_CANCELLED'
        o.review_status = 'CANCELLED'
        o.can_cancel = false
        o.can_request_cancellation = false
      }
      return { data: o as T }
    }
  }
  // Per-item cancellation request (waits on ops).
  {
    const m = path.match(/^\/api\/seller\/orders\/(\d+)\/items\/(\d+)\/cancellation-request$/)
    if (method === 'POST' && m) {
      const o = SELLER_ORDERS.find((x) => x.id === Number(m[1]))
      const it = o?.items?.find((x) => x.id === Number(m[2]))
      if (!o || !it) return null
      if (!o.can_request_cancellation || itemGone(it) || it.cancellation_status === 'REQUESTED') {
        throw new ApiError('Sản phẩm không còn ở trạng thái có thể yêu cầu huỷ.', 'CONFLICT', 409)
      }
      it.cancellation_status = 'REQUESTED'
      return { data: o as T }
    }
  }
  if (method === 'GET' && path === '/api/handoffs') return list([]) as ApiResult<T>
  if (method === 'GET' && path === '/api/audit-logs') return list([]) as ApiResult<T>
  if (method === 'GET' && path === '/api/import-jobs') return list([]) as ApiResult<T>

  return null
}
