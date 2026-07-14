import { defineStore } from 'pinia'
import type { Role, User } from '~/types'
import { authApi } from '~/services/api'
import { TOKEN_KEY, USER_KEY, EXPIRES_KEY } from '~/utils/storage'

interface AuthState {
  token: string | null
  user: User | null
  /** RFC3339 token expiry from the login response; null when the API omits it. */
  expiresAt: string | null
  loading: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: null,
    user: null,
    expiresAt: null,
    loading: false,
  }),

  getters: {
    isAuthenticated: (s): boolean => !!s.token && !!s.user,
    role: (s): Role | null => s.user?.role ?? null,
    isSeller: (s): boolean => s.user?.role === 'SELLER',
    fullName: (s): string => s.user?.full_name || s.user?.email || '',
    /** Landing route after login, based on role. */
    homeRoute(): string {
      if (this.user?.role === 'SELLER') return '/seller'
      return '/dashboard'
    },
  },

  actions: {
    /**
     * True once the stored token is past its expiry. Returns false when no
     * expiry is known (older tokens / mock) so we never lock out a valid session
     * we simply can't date — the backend 401 remains the ultimate backstop.
     */
    isExpired(): boolean {
      if (!this.expiresAt) return false
      const t = Date.parse(this.expiresAt)
      return Number.isFinite(t) && Date.now() >= t
    },

    /** Hydrate from localStorage on app start (SPA mode). */
    hydrate() {
      if (import.meta.server) return
      const token = localStorage.getItem(TOKEN_KEY)
      const rawUser = localStorage.getItem(USER_KEY)
      if (token && rawUser) {
        try {
          this.token = token
          this.user = JSON.parse(rawUser) as User
          this.expiresAt = localStorage.getItem(EXPIRES_KEY)
        } catch {
          this.clear()
          return
        }
        // Drop a session that already expired while the tab was closed, so we
        // start from /login instead of flashing an authed UI that 401s at once.
        if (this.isExpired()) this.clear()
      }
    },

    persist() {
      if (import.meta.server) return
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token)
      if (this.user) localStorage.setItem(USER_KEY, JSON.stringify(this.user))
      if (this.expiresAt) localStorage.setItem(EXPIRES_KEY, this.expiresAt)
      else localStorage.removeItem(EXPIRES_KEY)
    },

    clear() {
      this.token = null
      this.user = null
      this.expiresAt = null
      if (import.meta.client) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(EXPIRES_KEY)
      }
    },

    async login(email: string, password: string) {
      this.loading = true
      try {
        const { data } = await authApi.login(email, password)
        this.token = data.token
        this.user = data.user
        this.expiresAt = data.expires_at ?? null
        this.persist()
        return data.user
      } finally {
        this.loading = false
      }
    },

    /** Refresh the current user from /api/me (best-effort). */
    async refreshMe() {
      if (!this.token) return
      try {
        const { data } = await authApi.me()
        this.user = data
        this.persist()
      } catch {
        // token likely invalid; the 401 interceptor handles redirect.
      }
    },

    logout() {
      this.clear()
      navigateTo('/login')
    },
  },
})
