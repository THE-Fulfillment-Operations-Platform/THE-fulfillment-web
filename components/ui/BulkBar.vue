<script setup lang="ts">
// Thanh thao tác hàng loạt — trượt xuống + mờ dần khi có dòng được tick. Actions
// do tab bơm vào qua slot mặc định; nút "Bỏ chọn" luôn có sẵn.
defineProps<{ count: number; noun?: string }>()
defineEmits<{ (e: 'clear'): void }>()
</script>

<template>
  <Transition name="bulkbar">
    <!-- Lớp ngoài chỉ để animate chiều cao (grid 0fr→1fr = auto height mượt). -->
    <div v-if="count > 0" class="bulkbar-collapse">
      <div class="flex flex-wrap items-center gap-2 overflow-hidden border-b border-border bg-accent/60 px-4 py-2.5">
        <span class="text-sm font-medium text-foreground">
          Đã chọn {{ count }} {{ noun || 'mục' }}
        </span>
        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <slot />
          <button class="table-action text-muted-foreground" @click="$emit('clear')">Bỏ chọn</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* grid-template-rows 0fr→1fr cho phép animate từ 0 tới chiều cao auto mà không cần
   biết trước chiều cao (kể cả khi thanh xuống dòng trên mobile). */
.bulkbar-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.22s ease;
}
.bulkbar-collapse > div {
  min-height: 0;
}
.bulkbar-enter-from,
.bulkbar-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .bulkbar-collapse {
    transition: none;
  }
}
</style>
