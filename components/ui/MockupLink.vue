<script setup lang="ts">
import { isValidUrl } from '~/utils/format'

const props = withDefaults(
  // iconOnly: chỉ hiện icon (tooltip + aria-label = label) — cho bảng chật chỗ.
  defineProps<{ url?: string | null; label?: string; small?: boolean; iconOnly?: boolean }>(),
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
    :title="iconOnly ? label : undefined"
    :aria-label="iconOnly ? label : undefined"
  >
    <UiIcon name="link" :size="small ? 13 : 15" />
    <template v-if="!iconOnly">{{ label }}</template>
  </a>
  <span
    v-else
    class="inline-flex items-center gap-1 text-xs text-muted-foreground"
    :title="iconOnly ? 'Thiếu mockup' : undefined"
  >
    <UiIcon name="alert" :size="13" /> <template v-if="!iconOnly">Thiếu mockup</template>
  </span>
</template>
