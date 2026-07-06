<script setup lang="ts">
import logo from '~/assets/img/logo1.jpg'

// The BGDecor Fulfillment logo art is dark-on-white, so it's framed on a small
// white chip to stay legible in both light and dark themes.
const props = withDefaults(defineProps<{ variant?: 'mark' | 'the' }>(), { variant: 'the' })

const chipClass = computed(() =>
  props.variant === 'mark' ? 'rounded-2xl p-2' : 'rounded-lg p-1',
)
const imgClass = computed(() =>
  props.variant === 'mark' ? 'h-20 w-auto sm:h-24' : 'h-8 w-auto sm:h-9',
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center bg-white ring-1 ring-slate-900/5"
    :class="chipClass"
  >
    <img :src="logo" alt="BGDecor Fulfillment" :class="imgClass" draggable="false" />
  </span>
</template>
