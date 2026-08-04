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
  // Tra cứu CS: ô tìm kiếm một dòng để CS tìm đơn theo mã đơn/tên khách rồi gắn
  // mã vận đơn. Ops/Admin cũng dùng được — cùng một việc, cùng một màn.
  { label: 'Tra cứu CS', to: '/cs', icon: 'search', roles: ['OWNER', 'ADMIN', 'OPS', 'CS'] },
  { label: 'Master Data', to: '/master-data', icon: 'layers', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Import đơn', to: '/import', icon: 'upload', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Chờ duyệt', to: '/review', icon: 'inbox', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Đơn hàng / Sản phẩm', to: '/orders', icon: 'orders', roles: ALL_INTERNAL },
  { label: 'Yêu cầu huỷ', to: '/cancellations', icon: 'alert', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Chờ thiết kế', to: '/design', icon: 'design', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Batch sản xuất', to: '/batches', icon: 'batches', roles: ALL_INTERNAL },
  { label: 'Bảng sản xuất', to: '/production', icon: 'board', roles: ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'] },
  { label: 'Quét QC', to: '/qc', icon: 'qc', roles: ['OWNER', 'ADMIN', 'OPS', 'QC'] },
  // Kết quả QC là màn ĐỌC: đóng gói và OPS cần biết đơn nào đã QC đủ để lấy hàng,
  // không riêng tổ QC — nên mở cho mọi vai trò nội bộ.
  { label: 'Kết quả QC', to: '/qc-results', icon: 'check', roles: ALL_INTERNAL },
  // QC là việc cuối của xưởng. Từ đây là nửa vận chuyển: chọn đơn đã QC đủ gửi
  // cho THE, rồi theo dõi kiện hàng. Hai màn này thay cho luồng Đóng gói →
  // Tạo handoff → Bàn giao cũ (route /packing và /shipping vẫn còn, chỉ không
  // nằm trên menu nữa).
  { label: 'Chờ gửi hàng', to: '/ship-queue', icon: 'packing', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING'] },
  { label: 'Hành trình đơn hàng', to: '/journeys', icon: 'shipping', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING', 'CS'] },
  // CS logs what a customer reported against the order, so notes are part of
  // their surface too.
  { label: 'Ghi chú / Cần xử lý', to: '/notes', icon: 'notes', roles: [...ALL_INTERNAL, 'CS'] },
  { label: 'Người dùng', to: '/users', icon: 'users', roles: ['OWNER', 'ADMIN'] },
  { label: 'Nhật ký hoạt động', to: '/audit', icon: 'audit', roles: ['OWNER', 'ADMIN'] },
  { label: 'Cài đặt', to: '/settings', icon: 'alert', roles: ['OWNER'] },
]

// Seller sidebar — intentionally minimal, no internal operations.
export const SELLER_NAV: NavItem[] = [
  { label: 'Đơn của tôi', to: '/seller', icon: 'orders', roles: ['SELLER'] },
  { label: 'Tải đơn lên', to: '/seller/import', icon: 'upload', roles: ['SELLER'] },
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
