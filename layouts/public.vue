<template>
  <!-- Layout cho trang công khai dài hơn một màn hình (vd /install). Khác
       layouts/auth.vue ở chỗ KHÔNG căn giữa theo chiều dọc: canh giữa bằng flex
       khi nội dung cao hơn viewport sẽ cắt mất phần đầu và không cuộn lên được. -->
  <div class="relative min-h-screen bg-background px-4 py-8">
    <div class="absolute right-4 top-4">
      <ThemeToggle />
    </div>
    <div class="mx-auto w-full max-w-xl">
      <slot />
    </div>
  </div>
</template>
