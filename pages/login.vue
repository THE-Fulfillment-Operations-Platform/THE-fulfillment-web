<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { ApiError, errorMessage } from '~/utils/api-error'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

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
    // During login a 401 always means the email/password combo was rejected —
    // show that plainly instead of the generic "session expired" copy.
    errorMsg.value =
      e instanceof ApiError && (e.code === 'UNAUTHORIZED' || e.status === 401)
        ? 'Sai email hoặc mật khẩu.'
        : errorMessage(e)
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
      <h1 class="sr-only">BGDecor Fulfillment</h1>
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
  </div>
</template>
