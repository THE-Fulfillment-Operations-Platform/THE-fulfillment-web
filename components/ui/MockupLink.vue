<script setup lang="ts">
import { isValidUrl } from '~/utils/format'

const props = withDefaults(
  defineProps<{ url?: string | null; label?: string; small?: boolean }>(),
  { label: 'Mở mockup' },
)
const valid = computed(() => isValidUrl(props.url))
</script>

<template>
  <a
    v-if="valid"
    :href="url || undefined"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-1 font-medium text-primary hover:text-primary hover:underline"
    :class="small ? 'text-xs' : 'text-sm'"
  >
    <UiIcon name="link" :size="small ? 13 : 15" />
    {{ label }}
  </a>
  <span v-else class="inline-flex items-center gap-1 text-xs text-muted-foreground">
    <UiIcon name="alert" :size="13" /> Thiếu mockup
  </span>
</template>
