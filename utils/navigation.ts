import type { Role } from '~/types'

export interface NavItem {
  label: string
  to: string
  icon: string
  /** Roles allowed to see this entry. */
  roles: Role[]
}

const ALL_INTERNAL: Role[] = [
  'OWNER',
  'ADMIN',
  'OPS',
  'DESIGNER',
  'PRODUCTION',
  'QC',
  'PACKING',
  'SHIPPING',
]

// Sidebar for internal staff. Order follows the operational flow.
export const INTERNAL_NAV: NavItem[] = [
  { label: 'Tổng quan', to: '/dashboard', icon: 'dashboard', roles: ALL_INTERNAL },
  { label: 'Master Data', to: '/master-data', icon: 'layers', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Import đơn', to: '/import', icon: 'upload', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Chờ duyệt', to: '/review', icon: 'inbox', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Đơn hàng / Sản phẩm', to: '/orders', icon: 'orders', roles: ALL_INTERNAL },
  { label: 'Yêu cầu huỷ', to: '/cancellations', icon: 'alert', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Chờ thiết kế', to: '/design', icon: 'design', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Batch sản xuất', to: '/batches', icon: 'batches', roles: ALL_INTERNAL },
  { label: 'Bảng sản xuất', to: '/production', icon: 'board', roles: ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'] },
  { label: 'Quét QC', to: '/qc', icon: 'qc', roles: ['OWNER', 'ADMIN', 'OPS', 'QC'] },
  { label: 'Đóng gói', to: '/packing', icon: 'packing', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING'] },
  { label: 'Xuất kho / Bàn giao', to: '/shipping', icon: 'shipping', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING'] },
  { label: 'Ghi chú / Cần xử lý', to: '/notes', icon: 'notes', roles: ALL_INTERNAL },
  { label: 'Người dùng', to: '/users', icon: 'users', roles: ['OWNER', 'ADMIN'] },
  { label: 'Nhật ký hệ thống', to: '/audit', icon: 'audit', roles: ['OWNER', 'ADMIN'] },
]

// Seller sidebar — intentionally minimal, no internal operations.
export const SELLER_NAV: NavItem[] = [
  { label: 'Đơn của tôi', to: '/seller', icon: 'orders', roles: ['SELLER'] },
]

export function navForRole(role: Role | null): NavItem[] {
  if (!role) return []
  if (role === 'SELLER') return SELLER_NAV
  return INTERNAL_NAV.filter((item) => item.roles.includes(role))
}

export function canAccessPath(role: Role | null, path: string): boolean {
  if (!role) return false
  const items = role === 'SELLER' ? SELLER_NAV : INTERNAL_NAV
  // Match the most specific nav root for the path.
  const match = items
    .filter((i) => path === i.to || path.startsWith(i.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0]
  if (!match) return true // pages without a nav entry (e.g. detail) are governed by API RBAC
  return match.roles.includes(role)
}
