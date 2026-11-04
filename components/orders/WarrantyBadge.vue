<script setup lang="ts">
// Badge "BH1", "BH2"… của đơn bảo hành (số = warranty_seq, lần bảo hành thứ mấy,
// khớp hậu tố mã đơn SON1-BH1). Không render gì với đơn thường (seq <= 0).
defineProps<{ seq?: number | null }>()
</script>

<template>
  <span
    v-if="(seq ?? 0) > 0"
    class="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200"
    :title="`Đơn bảo hành lần ${seq}`"
  >
    BH{{ seq }}
  </span>
</template>
