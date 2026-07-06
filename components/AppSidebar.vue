<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { navForRole } from '~/utils/navigation'
import { ROLE_LABEL } from '~/utils/enums'

defineEmits<{ (e: 'navigate'): void; (e: 'close'): void }>()

const auth = useAuthStore()
const items = computed(() => navForRole(auth.role))
</script>

<template>
  <aside class="flex h-full w-[17rem] max-w-[85vw] shrink-0 flex-col border-r border-border bg-card sm:w-60">
    <div class="flex items-center gap-2.5 border-b border-border px-4 py-4">
      <AppLogo variant="the" />
      <div class="min-w-0 leading-tight">
        <p class="truncate text-sm font-semibold text-foreground">BGDecor</p>
        <p class="text-[11px] text-muted-foreground">Fulfillment Operations</p>
      </div>
      <!-- Close (mobile drawer only) -->
      <button
        class="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Đóng menu"
        @click="$emit('close')"
      >
        <UiIcon name="close" :size="20" />
      </button>
    </div>

    <nav class="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex min-h-[2.75rem] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        active-class="!bg-accent !text-primary"
        @click="$emit('navigate')"
      >
        <UiIcon :name="item.icon" :size="18" class="shrink-0" />
        <span class="truncate">{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="border-t border-border px-4 py-3">
      <p class="truncate text-sm font-medium text-foreground">{{ auth.fullName }}</p>
      <p class="truncate text-xs text-muted-foreground">{{ auth.role ? ROLE_LABEL[auth.role] : '' }}</p>
    </div>
  </aside>
</template>
