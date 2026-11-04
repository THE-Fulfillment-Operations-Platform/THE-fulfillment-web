<script setup lang="ts">
// Badge "Bảo hành" của đơn bảo hành; số nhỏ phía trên bên phải = warranty_seq
// (lần bảo hành thứ mấy). Không render gì với đơn thường (seq <= 0).
defineProps<{ seq?: number | null }>()
</script>

<template>
  <span
    v-if="(seq ?? 0) > 0"
    class="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
    :title="`Đơn bảo hành lần ${seq}`"
  >
    Bảo hành<sup class="ml-0.5 text-[9px] font-bold leading-none">{{ seq }}</sup>
  </span>
</template>
