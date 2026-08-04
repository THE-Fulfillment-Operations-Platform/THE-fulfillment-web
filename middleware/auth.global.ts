import { useAuthStore } from '~/stores/auth'
import { canAccessPath } from '~/utils/navigation'

// Chỉ dành cho khách: đã đăng nhập mà vào đây thì đá về trang chủ theo vai trò.
const GUEST_ROUTES = new Set(['/login'])
// Mở cho tất cả — kể cả đã đăng nhập. /install là trang hướng dẫn cài app vào
// màn hình chính, quét QR từ điện thoại chưa đăng nhập cũng phải xem được.
const OPEN_ROUTES = new Set(['/install'])

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  const isGuestOnly = GUEST_ROUTES.has(to.path)

  if (OPEN_ROUTES.has(to.path)) return

  // Proactively end an expired session on navigation rather than letting the
  // first API call 401. Drops through to the not-logged-in branch below.
  if (auth.isAuthenticated && auth.isExpired()) {
    auth.clear()
  }

  // Not logged in → only public routes allowed.
  if (!auth.isAuthenticated) {
    if (isGuestOnly) return
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  // Logged in but visiting /login → send to role home.
  if (isGuestOnly) {
    return navigateTo(auth.homeRoute)
  }

  // Sellers are confined to /seller/*.
  if (auth.isSeller) {
    if (!to.path.startsWith('/seller')) return navigateTo('/seller')
    return
  }

  // Internal staff must not land on the seller area.
  if (to.path.startsWith('/seller')) {
    return navigateTo('/dashboard')
  }

  // Role-based nav gating (detail pages without a nav root are allowed; the API
  // still enforces RBAC server-side).
  if (!canAccessPath(auth.role, to.path)) {
    return navigateTo(auth.homeRoute)
  }
})
