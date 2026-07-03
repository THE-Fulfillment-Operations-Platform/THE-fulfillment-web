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
  { label: 'Orders / Items', to: '/orders', icon: 'orders', roles: ALL_INTERNAL },
  { label: 'Design Queue', to: '/design', icon: 'design', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Batches', to: '/batches', icon: 'batches', roles: ALL_INTERNAL },
  { label: 'Production Board', to: '/production', icon: 'board', roles: ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'] },
  { label: 'Scan QC', to: '/qc', icon: 'qc', roles: ['OWNER', 'ADMIN', 'OPS', 'QC'] },
  { label: 'Packing', to: '/packing', icon: 'packing', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING'] },
  { label: 'Shipping / Handoff', to: '/shipping', icon: 'shipping', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING'] },
  { label: 'Notes / Attention', to: '/notes', icon: 'notes', roles: ALL_INTERNAL },
  { label: 'Người dùng', to: '/users', icon: 'users', roles: ['OWNER', 'ADMIN'] },
  { label: 'Audit Logs', to: '/audit', icon: 'audit', roles: ['OWNER', 'ADMIN'] },
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
