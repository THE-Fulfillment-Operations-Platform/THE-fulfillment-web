<script setup lang="ts">
import { avatarColor, initials } from '~/utils/chat'

// Chữ cái đầu trên nền màu theo id (bảng users không có ảnh đại diện). Nhóm thì
// hiện biểu tượng nhóm. online = chấm xanh góc dưới.
const props = withDefaults(
  defineProps<{ id: number; name: string; size?: number; group?: boolean; online?: boolean }>(),
  { size: 40, group: false, online: false },
)
const fontSize = computed(() => `${Math.max(9, Math.round(props.size * 0.38))}px`)
const dot = computed(() => Math.max(8, Math.round(props.size * 0.28)))
</script>

<template>
  <span class="relative inline-flex shrink-0" :style="{ width: `${size}px`, height: `${size}px` }">
    <span
      class="inline-flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white"
      :class="group ? 'bg-gradient-to-br from-sky-500 to-indigo-500' : avatarColor(id)"
      :style="{ fontSize }"
      :title="name"
    >
      <UiIcon v-if="group" name="users" :size="Math.round(size * 0.5)" />
      <template v-else>{{ size < 22 ? initials(name).slice(-1) : initials(name) }}</template>
    </span>
    <span
      v-if="online && !group"
      class="absolute bottom-0 right-0 rounded-full border-2 border-card bg-emerald-500"
      :style="{ width: `${dot}px`, height: `${dot}px` }"
      data-chat-online
    />
  </span>
</template>
