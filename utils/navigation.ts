import type { Role, User } from '~/types'

export interface NavItem {
  label: string
  to: string
  icon: string
  /**
   * Màn tương ứng trong danh mục quyền: thấy mục này khi có "<feature>.view".
   * Mục không có feature (Người dùng, Cài đặt) chỉ đi theo vai trò.
   */
  feature?: string
  /**
   * Vai trò được thấy mục này. Với mục có feature, đây chỉ là dự phòng khi phiên
   * đăng nhập cũ chưa có danh sách quyền (trước khi /me làm mới xong).
   */
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
  { label: 'Tổng quan', to: '/dashboard', feature: 'dashboard', icon: 'dashboard', roles: ALL_INTERNAL },
  // Tra cứu CS: ô tìm kiếm một dòng để CS tìm đơn theo mã đơn/tên khách rồi gắn
  // mã vận đơn. Ops/Admin cũng dùng được — cùng một việc, cùng một màn.
  { label: 'Tra cứu CS', to: '/cs', feature: 'cs', icon: 'search', roles: ['OWNER', 'ADMIN', 'OPS', 'CS'] },
  { label: 'Master Data', to: '/master-data', feature: 'master_data', icon: 'layers', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Import đơn', to: '/import', feature: 'import', icon: 'upload', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Chờ duyệt', to: '/review', feature: 'review', icon: 'inbox', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Đơn hàng / Sản phẩm', to: '/orders', feature: 'orders', icon: 'orders', roles: ALL_INTERNAL },
  { label: 'Yêu cầu huỷ', to: '/cancellations', feature: 'cancellations', icon: 'alert', roles: ['OWNER', 'ADMIN', 'OPS'] },
  { label: 'Chờ thiết kế', to: '/design', feature: 'design', icon: 'design', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  // Công cụ tạo file in + file cắt từ ảnh sản phẩm. Chạy hẳn trong trình duyệt,
  // không đụng dữ liệu đơn, nên đi chung quyền với màn Chờ thiết kế — ai làm
  // design thì dùng được, không phải khai thêm quyền mới.
  { label: 'Thiết kế', to: '/design-tool', feature: 'design', icon: 'scissors', roles: ['OWNER', 'ADMIN', 'OPS', 'DESIGNER'] },
  { label: 'Batch sản xuất', to: '/batches', feature: 'batches', icon: 'batches', roles: ALL_INTERNAL },
  { label: 'Bảng sản xuất', to: '/production', feature: 'production', icon: 'board', roles: ['OWNER', 'ADMIN', 'OPS', 'PRODUCTION', 'DESIGNER'] },
  { label: 'Quét QC', to: '/qc', feature: 'qc', icon: 'qc', roles: ['OWNER', 'ADMIN', 'OPS', 'QC'] },
  // Kết quả QC là màn ĐỌC: đóng gói và OPS cần biết đơn nào đã QC đủ để lấy hàng,
  // không riêng tổ QC — nên mở cho mọi vai trò nội bộ.
  { label: 'Kết quả QC', to: '/qc-results', feature: 'qc_results', icon: 'check', roles: ALL_INTERNAL },
  // QC là việc cuối của xưởng. Từ đây là nửa vận chuyển: chọn đơn đã QC đủ gửi
  // cho THE, rồi theo dõi kiện hàng. Hai màn này thay cho luồng Đóng gói →
  // Tạo handoff → Bàn giao cũ (route /packing và /shipping vẫn còn, chỉ không
  // nằm trên menu nữa).
  { label: 'Chờ gửi hàng', to: '/ship-queue', feature: 'ship_queue', icon: 'packing', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING'] },
  { label: 'Hành trình đơn hàng', to: '/journeys', feature: 'journeys', icon: 'shipping', roles: ['OWNER', 'ADMIN', 'OPS', 'PACKING', 'SHIPPING', 'CS'] },
  // CS logs what a customer reported against the order, so notes are part of
  // their surface too.
  { label: 'Ghi chú / Cần xử lý', to: '/notes', feature: 'notes', icon: 'notes', roles: [...ALL_INTERNAL, 'CS'] },
  { label: 'Người dùng', to: '/users', icon: 'users', roles: ['OWNER', 'ADMIN'] },
  { label: 'Nhật ký hoạt động', to: '/audit', feature: 'audit', icon: 'audit', roles: ['OWNER', 'ADMIN'] },
  { label: 'Cài đặt', to: '/settings', icon: 'alert', roles: ['OWNER'] },
]

// Seller sidebar — intentionally minimal, no internal operations.
export const SELLER_NAV: NavItem[] = [
  { label: 'Đơn của tôi', to: '/seller', icon: 'orders', roles: ['SELLER'] },
  { label: 'Tải đơn lên', to: '/seller/import', icon: 'upload', roles: ['SELLER'] },
]

/**
 * Có quyền `perm` không. OWNER có tất cả. Phiên cũ chưa có
 * effective_permissions (đăng nhập trước bản phân quyền, /me chưa làm mới) thì
 * trả null để nơi gọi rơi về kiểm tra theo vai trò như trước.
 */
function permCheck(user: User | null | undefined, perm: string): boolean | null {
  if (!user) return false
  if (user.role === 'OWNER') return true
  if (!user.effective_permissions) return null
  return user.effective_permissions.includes(perm)
}

/** Có quyền `perm` ("orders.manage"…) — chỉ để ẩn/hiện giao diện. */
export function userCan(user: User | null | undefined, perm: string): boolean {
  const ok = permCheck(user, perm)
  if (ok !== null) return ok
  // Phiên cũ: như trước khi có phân quyền — ai vào được màn thì thao tác được.
  const feature = perm.split('.')[0]
  const item = INTERNAL_NAV.find((i) => i.feature === feature)
  return !!item && !!user && item.roles.includes(user.role)
}

function canSee(user: User | null | undefined, item: NavItem): boolean {
  if (!user) return false
  if (!item.feature) return item.roles.includes(user.role)
  const ok = permCheck(user, `${item.feature}.view`)
  return ok ?? item.roles.includes(user.role)
}

export function navForUser(user: User | null | undefined): NavItem[] {
  if (!user) return []
  if (user.role === 'SELLER') return SELLER_NAV
  return INTERNAL_NAV.filter((item) => canSee(user, item))
}

/** Màn đầu tiên người này mở được (trang chủ sau đăng nhập), hoặc null. */
export function firstAccessiblePath(user: User | null | undefined): string | null {
  return navForUser(user)[0]?.to ?? null
}

export function canAccessPath(user: User | null | undefined, path: string): boolean {
  if (!user) return false
  const items = user.role === 'SELLER' ? SELLER_NAV : INTERNAL_NAV
  // Match the most specific nav root for the path.
  const match = items
    .filter((i) => path === i.to || path.startsWith(i.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0]
  if (!match) return true // pages without a nav entry (e.g. detail) are governed by API RBAC
  return user.role === 'SELLER' ? match.roles.includes(user.role) : canSee(user, match)
}
