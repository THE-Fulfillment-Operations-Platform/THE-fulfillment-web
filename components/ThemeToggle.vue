<script setup lang="ts">
import { useThemeStore } from '~/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <button
    type="button"
    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
    :title="theme.isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'"
    :aria-label="theme.isDark ? 'Giao diện sáng' : 'Giao diện tối'"
    @click="theme.toggle()"
  >
    <ClientOnly>
      <UiIcon :name="theme.isDark ? 'sun' : 'moon'" :size="18" />
      <template #fallback><UiIcon name="moon" :size="18" /></template>
    </ClientOnly>
  </button>
</template>
