<script setup lang="ts">
import {
  INTERNAL_STATUS,
  SELLER_STATUS,
  DESIGN_STATUS,
  PRIORITY,
  NOTE_SEVERITY,
  NOTE_STATUS,
  REVIEW_STATUS,
  CANCELLATION_STATUS,
  TRACKING_STATUS,
  badgeFrom,
  type BadgeMeta,
} from '~/utils/enums'

type Kind =
  | 'internal'
  | 'seller'
  | 'design'
  | 'priority'
  | 'severity'
  | 'noteStatus'
  | 'review'
  | 'cancellation'
  | 'tracking'

const props = defineProps<{ kind: Kind; value?: string | null }>()

const MAPS: Record<Kind, Record<string, BadgeMeta>> = {
  internal: INTERNAL_STATUS,
  seller: SELLER_STATUS,
  design: DESIGN_STATUS,
  priority: PRIORITY,
  severity: NOTE_SEVERITY,
  noteStatus: NOTE_STATUS,
  review: REVIEW_STATUS,
  cancellation: CANCELLATION_STATUS,
  tracking: TRACKING_STATUS,
}

const meta = computed(() => badgeFrom(MAPS[props.kind], props.value ?? undefined))
</script>

<template>
  <span
    class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
    :class="meta.classes"
  >
    {{ meta.label }}
  </span>
</template>
