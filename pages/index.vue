<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
// Auth is guaranteed by global middleware; route to the role landing page.
await navigateTo(auth.homeRoute, { replace: true })
</script>

<template>
  <div class="flex h-64 items-center justify-center">
    <UiSpinner :size="28" />
  </div>
</template>
