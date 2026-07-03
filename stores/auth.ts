import { defineStore } from 'pinia'
import type { Role, User } from '~/types'
import { authApi } from '~/services/api'
import { TOKEN_KEY, USER_KEY } from '~/utils/storage'

interface AuthState {
  token: string | null
  user: User | null
  loading: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: null,
    user: null,
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
    /** Hydrate from localStorage on app start (SPA mode). */
    hydrate() {
      if (import.meta.server) return
      const token = localStorage.getItem(TOKEN_KEY)
      const rawUser = localStorage.getItem(USER_KEY)
      if (token && rawUser) {
        try {
          this.token = token
          this.user = JSON.parse(rawUser) as User
        } catch {
          this.clear()
        }
      }
    },

    persist() {
      if (import.meta.server) return
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token)
      if (this.user) localStorage.setItem(USER_KEY, JSON.stringify(this.user))
    },

    clear() {
      this.token = null
      this.user = null
      if (import.meta.client) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    },

    async login(email: string, password: string) {
      this.loading = true
      try {
        const { data } = await authApi.login(email, password)
        this.token = data.token
        this.user = data.user
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
