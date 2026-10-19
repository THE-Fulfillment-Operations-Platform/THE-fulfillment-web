<script setup lang="ts">
import type { PermissionFeature } from '~/types'

// Bảng tick Xem / Thao tác theo từng màn — dùng chung cho form người dùng (tick
// riêng một tài khoản) và màn Quyền theo vai trò (tick cả vai trò). Tick Thao tác
// là tự có Xem; bỏ Xem là mất luôn Thao tác — khớp NormalizePerms ở backend.
const props = defineProps<{
  features: PermissionFeature[]
  modelValue: Set<string>
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Set<string>): void }>()

function hasLevel(feature: string, level: 'view' | 'manage'): boolean {
  return !!props.features.find((f) => f.key === feature)?.levels.includes(level)
}

function setTick(feature: string, level: 'view' | 'manage', on: boolean) {
  const next = new Set(props.modelValue)
  const key = `${feature}.${level}`
  if (on) {
    next.add(key)
    if (level === 'manage' && hasLevel(feature, 'view')) next.add(`${feature}.view`)
  } else {
    next.delete(key)
    if (level === 'view') next.delete(`${feature}.manage`)
  }
  emit('update:modelValue', next)
}
</script>

<template>
  <table class="min-w-full text-sm">
    <thead class="sticky top-0 bg-card">
      <tr class="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
        <th class="px-3 py-1.5 font-semibold">Màn hình</th>
        <th class="w-14 px-2 py-1.5 text-center font-semibold">Xem</th>
        <th class="w-20 px-2 py-1.5 text-center font-semibold">Thao tác</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      <tr v-for="f in features" :key="f.key">
        <td class="px-3 py-1.5">
          <p class="text-foreground">{{ f.label }}</p>
          <p v-if="f.manage_hint" class="text-[11px] text-muted-foreground">Thao tác: {{ f.manage_hint }}</p>
        </td>
        <td class="px-2 py-1.5 text-center">
          <input
            v-if="f.levels.includes('view')"
            type="checkbox"
            class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
            :checked="modelValue.has(`${f.key}.view`)"
            :disabled="disabled"
            :aria-label="`Xem ${f.label}`"
            @change="setTick(f.key, 'view', ($event.target as HTMLInputElement).checked)"
          />
          <span v-else class="text-muted-foreground">—</span>
        </td>
        <td class="px-2 py-1.5 text-center">
          <input
            v-if="f.levels.includes('manage')"
            type="checkbox"
            class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
            :checked="modelValue.has(`${f.key}.manage`)"
            :disabled="disabled"
            :aria-label="`Thao tác ${f.label}`"
            @change="setTick(f.key, 'manage', ($event.target as HTMLInputElement).checked)"
          />
          <span v-else class="text-muted-foreground">—</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
