<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const handleClear = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-6">
    <div class="card w-full max-w-md p-8 text-center shadow-soft">
      <p class="text-5xl font-bold text-primary">{{ error.statusCode || 500 }}</p>
      <h1 class="mt-3 text-lg font-semibold text-foreground">Đã xảy ra lỗi</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ error.message || 'Lỗi không xác định' }}</p>
      <button class="btn-primary mt-6 w-full" @click="handleClear">Về trang chủ</button>
    </div>
  </div>
</template>
