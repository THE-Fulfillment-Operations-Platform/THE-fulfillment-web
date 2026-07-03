<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { isMockEnabled } from '~/services/http'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()

const email = ref('ops@the.local')
const password = ref('Password123!')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const mock = isMockEnabled()

const demoAccounts = [
  'owner@the.local',
  'ops@the.local',
  'designer@the.local',
  'production@the.local',
  'qc@the.local',
  'packing@the.local',
  'shipping@the.local',
  'seller@the.local',
]

async function submit() {
  submitting.value = true
  errorMsg.value = null
  try {
    const user = await auth.login(email.value.trim(), password.value)
    toast.success(`Xin chào ${user.full_name || user.email}`)
    const redirect = (route.query.redirect as string) || auth.homeRoute
    // Sellers always go to the seller area regardless of redirect target.
    await navigateTo(user.role === 'SELLER' ? '/seller' : redirect)
  } catch (e) {
    errorMsg.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="card w-full max-w-md p-6 shadow-soft sm:p-8">
    <div class="mb-6 text-center">
      <div class="mb-4 flex justify-center">
        <AppLogo variant="mark" />
      </div>
      <h1 class="sr-only">THE Fulfillment</h1>
      <p class="text-sm text-muted-foreground">Đăng nhập hệ thống vận hành xưởng</p>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="email">Email</label>
        <input id="email" v-model="email" type="email" class="input" autocomplete="username" required />
      </div>
      <div>
        <label class="label" for="password">Mật khẩu</label>
        <input id="password" v-model="password" type="password" class="input" autocomplete="current-password" required />
      </div>

      <p v-if="errorMsg" class="rounded-md bg-red-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-red-700 dark:text-rose-300">
        {{ errorMsg }}
      </p>

      <button type="submit" class="btn-primary w-full" :disabled="submitting">
        <UiSpinner v-if="submitting" :size="16" />
        {{ submitting ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
    </form>

    <div class="mt-6 border-t border-border pt-4">
      <p class="mb-2 text-xs font-medium text-muted-foreground">
        Tài khoản demo (mật khẩu: <code class="rounded bg-muted px-1">Password123!</code>)
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="acc in demoAccounts"
          :key="acc"
          type="button"
          class="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
          @click="email = acc; password = 'Password123!'"
        >
          {{ acc.split('@')[0] }}
        </button>
      </div>
      <p v-if="mock" class="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
        Đang chạy chế độ MOCK — dữ liệu cục bộ, không gọi backend.
      </p>
    </div>
  </div>
</template>
