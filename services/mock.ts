import type { ApiResult, HttpMethod, RequestOptions } from './http'
import { ApiError } from '~/utils/api-error'
import type {
  Batch,
  LoginResponse,
  MaterialBucket,
  Note,
  Order,
  OrderItem,
  QcScanResult,
  SellerOrder,
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

const SELLER_ORDERS: SellerOrder[] = ORDERS.map((o) => ({
  id: o.id,
  internal_code: o.internal_code,
  store_order_id: o.store_order_id,
  store_name: o.store_name,
  status: o.seller_status,
  review_status: o.review_status ?? 'APPROVED',
  cancellation_status: o.cancellation_status ?? 'NONE',
  can_cancel: false,
  can_request_cancellation: false,
  item_count: o.items?.length ?? 0,
  created_at: o.created_at,
}))

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
  if (method === 'GET' && path === '/api/handoffs') return list([]) as ApiResult<T>
  if (method === 'GET' && path === '/api/audit-logs') return list([]) as ApiResult<T>
  if (method === 'GET' && path === '/api/import-jobs') return list([]) as ApiResult<T>

  return null
}
