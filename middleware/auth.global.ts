import { useAuthStore } from '~/stores/auth'
import { canAccessPath } from '~/utils/navigation'

const PUBLIC_ROUTES = new Set(['/login'])

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  const isPublic = PUBLIC_ROUTES.has(to.path)

  // Not logged in → only public routes allowed.
  if (!auth.isAuthenticated) {
    if (isPublic) return
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  // Logged in but visiting /login → send to role home.
  if (isPublic) {
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
