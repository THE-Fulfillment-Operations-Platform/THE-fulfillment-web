<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { ROLE_LABEL } from '~/utils/enums'
import { useSidebar } from '~/composables/useSidebar'

const auth = useAuthStore()
const { toggle } = useSidebar()
</script>

<template>
  <header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4 lg:px-6">
    <div class="flex min-w-0 items-center gap-2 sm:gap-3">
      <!-- Hamburger (mobile / tablet) -->
      <button
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 lg:hidden"
        aria-label="Mở menu"
        @click="toggle"
      >
        <UiIcon name="menu" :size="22" />
      </button>
      <span class="hidden truncate text-sm font-medium text-muted-foreground md:block">
        BGDecor Fulfillment Operations Platform
      </span>
      <span class="truncate text-sm font-semibold text-foreground md:hidden">BGDecor Fulfillment</span>
    </div>

    <div class="flex shrink-0 items-center gap-2 sm:gap-3">
      <div class="hidden max-w-[12rem] text-right lg:block">
        <p class="truncate text-sm font-medium text-foreground">{{ auth.fullName }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ auth.role ? ROLE_LABEL[auth.role] : '' }}</p>
      </div>
      <ThemeToggle />
      <button
        class="btn-secondary h-10 px-2.5 sm:h-auto sm:py-1.5"
        title="Đăng xuất"
        @click="auth.logout()"
      >
        <UiIcon name="logout" :size="16" />
        <span class="hidden sm:inline">Đăng xuất</span>
      </button>
    </div>
  </header>
</template>
