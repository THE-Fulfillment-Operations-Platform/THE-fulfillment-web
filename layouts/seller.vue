<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { SELLER_NAV } from '~/utils/navigation'
const auth = useAuthStore()
const route = useRoute()

function isActive(to: string) {
  if (to === '/seller') {
    return route.path === '/seller' || (route.path.startsWith('/seller/') && !route.path.startsWith('/seller/import'))
  }
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4 lg:px-6">
      <div class="flex min-w-0 items-center gap-2.5 sm:gap-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <AppLogo variant="the" />
          <span class="hidden truncate text-sm font-semibold text-foreground sm:inline">Seller Portal</span>
        </div>
        <nav class="flex items-center gap-1">
          <NuxtLink
            v-for="item in SELLER_NAV"
            :key="item.to"
            :to="item.to"
            class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors"
            :class="isActive(item.to) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          >
            <UiIcon :name="item.icon" :size="16" />
            <span class="hidden sm:inline">{{ item.label }}</span>
          </NuxtLink>
        </nav>
      </div>
      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        <span class="hidden max-w-[10rem] truncate text-sm text-foreground sm:inline">{{ auth.fullName }}</span>
        <ThemeToggle />
        <button class="btn-secondary h-10 px-2.5 sm:h-auto sm:py-1.5" title="Đăng xuất" @click="auth.logout()">
          <UiIcon name="logout" :size="16" />
          <span class="hidden sm:inline">Đăng xuất</span>
        </button>
      </div>
    </header>
    <main class="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
      <div class="mx-auto w-full max-w-5xl">
        <slot />
      </div>
    </main>
  </div>
</template>
