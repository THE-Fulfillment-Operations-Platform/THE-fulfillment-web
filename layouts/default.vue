<script setup lang="ts">
import { useSidebar } from '~/composables/useSidebar'

const { open, close } = useSidebar()

// Close the drawer when the route changes (e.g. nav link tapped on mobile).
const route = useRoute()
watch(() => route.fullPath, close)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <!-- Backdrop (mobile only) -->
    <div
      class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
      :class="open ? 'opacity-100' : 'pointer-events-none opacity-0'"
      aria-hidden="true"
      @click="close"
    />

    <!-- Sidebar: off-canvas drawer below lg, static column from lg up -->
    <div
      class="fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out lg:static lg:z-auto lg:translate-x-0"
      :class="open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    >
      <AppSidebar @navigate="close" @close="close" />
    </div>

    <!-- Content column -->
    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader />
      <main class="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div class="mx-auto w-full max-w-7xl">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
