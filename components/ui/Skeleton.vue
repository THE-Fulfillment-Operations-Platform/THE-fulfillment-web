<script setup lang="ts">
// A single shimmer placeholder bar. Compose several (or use the `table` variant
// on UiStateBlock) to preview a list/detail region while its data loads.
withDefaults(
  defineProps<{ height?: string; width?: string; rounded?: string }>(),
  { height: '1rem', width: '100%', rounded: 'rounded-md' },
)
</script>

<template>
  <div class="animate-pulse bg-muted" :class="rounded" :style="{ height, width }" />
</template>
