<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

// Tài khoản không được tick màn nào: không có trang chủ để đưa về, nên dừng ở
// đây thay vì chuyển hướng vòng tròn.
const auth = useAuthStore()
</script>

<template>
  <div class="card mx-auto mt-10 max-w-md p-6 text-center">
    <UiIcon name="alert" :size="28" class="mx-auto text-amber-500" />
    <h1 class="mt-3 text-base font-semibold text-foreground">Tài khoản chưa được cấp quyền màn nào</h1>
    <p class="mt-2 text-sm text-muted-foreground">
      Nhờ quản trị mở màn Người dùng và tick quyền cho tài khoản {{ auth.user?.email }}, rồi tải lại trang.
    </p>
    <button class="btn-secondary mt-4" @click="auth.logout()">Đăng xuất</button>
  </div>
</template>
