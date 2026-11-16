<script setup lang="ts">
import { avatarColor, initials } from '~/utils/chat'

// Chữ cái đầu trên nền màu theo id (bảng users không có ảnh đại diện).
const props = withDefaults(defineProps<{ id: number; name: string; size?: number }>(), { size: 40 })
const fontSize = computed(() => `${Math.max(10, Math.round(props.size * 0.38))}px`)
</script>

<template>
  <span
    class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
    :class="avatarColor(id)"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize }"
    :title="name"
  >
    {{ initials(name) }}
  </span>
</template>
