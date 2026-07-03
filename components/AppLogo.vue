<script setup lang="ts">
import logoMark from '~/assets/img/logo-mark.png'
import logoThe from '~/assets/img/logo-the.png'

// The logo art is dark-on-white, so it's framed on a small white chip to stay
// legible in both light and dark themes (a tasteful logo badge in dark mode).
const props = withDefaults(defineProps<{ variant?: 'mark' | 'the' }>(), { variant: 'the' })

const src = computed(() => (props.variant === 'mark' ? logoMark : logoThe))
const chipClass = computed(() =>
  props.variant === 'mark' ? 'rounded-2xl p-3' : 'rounded-lg p-1',
)
const imgClass = computed(() =>
  props.variant === 'mark' ? 'h-14 w-auto sm:h-16' : 'h-4 w-auto sm:h-5',
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center bg-white ring-1 ring-slate-900/5"
    :class="chipClass"
  >
    <img :src="src" alt="THE Fulfillment — Operations Platform" :class="imgClass" draggable="false" />
  </span>
</template>
