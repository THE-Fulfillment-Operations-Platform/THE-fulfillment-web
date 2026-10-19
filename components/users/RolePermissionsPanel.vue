<script setup lang="ts">
import { usersApi } from '~/services/api'
import type { PermissionFeature, Role, RolePermission } from '~/types'
import { ROLE_LABEL } from '~/utils/enums'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'

// Quyền theo vai trò: tick một lần cho cả vai trò. Mọi tài khoản "theo vai trò"
// (chưa tick riêng) đổi theo ngay khi lưu; tài khoản đã tick riêng giữ bộ của mình.
// Chủ sở hữu luôn toàn quyền và Seller không vào màn nội bộ — hai vai trò đó không
// có ở đây.
const props = defineProps<{ features: PermissionFeature[] }>()
const emit = defineEmits<{ (e: 'saved'): void }>()

const toast = useToastStore()
const roles = ref<RolePermission[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const selected = ref<Role | null>(null)
const draft = ref<Set<string>>(new Set())
const saving = ref(false)

const current = computed(() => roles.value.find((r) => r.role === selected.value) ?? null)

function sameSet(a: Set<string>, b: string[]): boolean {
  return a.size === b.length && b.every((p) => a.has(p))
}
const dirty = computed(() => !!current.value && !sameSet(draft.value, current.value.permissions))
const draftIsBuiltin = computed(() => !!current.value && sameSet(draft.value, current.value.builtin))

async function load() {
  loading.value = true
  loadError.value = null
  try {
    roles.value = (await usersApi.rolePermissions()).data ?? []
    if (!selected.value && roles.value.length) pick(roles.value[0].role, true)
    else if (current.value) draft.value = new Set(current.value.permissions)
  } catch (e) {
    loadError.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function pick(role: Role, force = false) {
  if (!force && role === selected.value) return
  if (!force && dirty.value) {
    const ok = await useConfirm().confirm({
      title: 'Bỏ thay đổi chưa lưu?',
      message: `Quyền của ${ROLE_LABEL[selected.value as Role]} đang sửa dở, chưa lưu.`,
      confirmText: 'Bỏ thay đổi',
      tone: 'danger',
    })
    if (!ok) return
  }
  selected.value = role
  draft.value = new Set(roles.value.find((r) => r.role === role)?.permissions ?? [])
  // Điện thoại: danh sách vai trò nằm trên bảng tick và chiếm cả màn — chọn xong
  // thì cuộn tới bảng tick, khỏi phải tự kéo xuống tìm.
  if (!force && window.innerWidth < 768) {
    nextTick(() => editor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}
const editor = ref<HTMLElement | null>(null)

function tickAll(on: boolean) {
  const next = new Set<string>()
  if (on) for (const f of props.features) for (const l of f.levels) next.add(`${f.key}.${l}`)
  draft.value = next
}
function toBuiltin() {
  if (current.value) draft.value = new Set(current.value.builtin)
}
function undo() {
  if (current.value) draft.value = new Set(current.value.permissions)
}

async function save() {
  const r = current.value
  if (!r || !dirty.value || saving.value) return
  saving.value = true
  try {
    // Trùng bộ gốc thì gửi null: vai trò về "mặc định gốc", ăn theo bản cập nhật sau này.
    const payload = draftIsBuiltin.value ? null : Array.from(draft.value).sort()
    const { data } = await usersApi.updateRolePermissions(r.role, payload)
    const i = roles.value.findIndex((x) => x.role === r.role)
    if (i >= 0 && data) roles.value[i] = data
    draft.value = new Set(data?.permissions ?? [])
    toast.success(
      `Đã lưu quyền ${ROLE_LABEL[r.role]} — áp ngay cho ${data?.following ?? r.following} tài khoản đang theo vai trò.`,
    )
    emit('saved')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="card overflow-hidden">
    <UiStateBlock :loading="loading" :error="loadError" :empty="!loading && !loadError && roles.length === 0" empty-text="Không có vai trò nào." @retry="load">
      <div class="grid grid-cols-1 md:grid-cols-3">
        <!-- Danh sách vai trò -->
        <ul class="divide-y divide-border border-b border-border md:border-b-0 md:border-r">
          <li v-for="r in roles" :key="r.role">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 border-l-4 px-4 py-2.5 text-left transition-colors hover:bg-muted"
              :class="r.role === selected ? 'border-primary bg-muted' : 'border-transparent'"
              @click="pick(r.role)"
            >
              <span>
                <span class="block text-sm font-medium text-foreground">{{ ROLE_LABEL[r.role] }}</span>
                <span class="block text-[11px] text-muted-foreground">{{ r.following }} tài khoản theo vai trò</span>
              </span>
              <span
                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                :class="r.customized ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'bg-muted text-muted-foreground'"
              >
                {{ r.customized ? 'Đã tuỳ chỉnh' : 'Mặc định gốc' }}
              </span>
            </button>
          </li>
        </ul>

        <!-- Bộ tick của vai trò đang chọn -->
        <div v-if="current" ref="editor" class="scroll-mt-20 md:col-span-2">
          <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <span class="text-sm font-semibold text-foreground">{{ ROLE_LABEL[current.role] }}</span>
            <span v-if="dirty" class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Chưa lưu
            </span>
            <div v-if="current.editable" class="ml-auto flex items-center gap-3 text-xs">
              <button type="button" class="font-medium text-primary hover:underline disabled:opacity-50" :disabled="draftIsBuiltin" @click="toBuiltin">
                Về mặc định gốc
              </button>
              <button type="button" class="font-medium text-primary hover:underline" @click="tickAll(true)">Chọn hết</button>
              <button type="button" class="font-medium text-muted-foreground hover:underline" @click="tickAll(false)">Bỏ hết</button>
            </div>
          </div>
          <p v-if="!current.editable" class="px-4 pt-2 text-xs text-amber-600 dark:text-amber-400">
            {{ current.read_only_reason || 'Bạn không sửa được quyền của vai trò này.' }}
          </p>
          <div class="max-h-[28rem] overflow-y-auto">
            <UsersPermissionTicks v-model="draft" :features="features" :disabled="!current.editable" />
          </div>
          <div class="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
            <p class="flex-1 text-[11px] leading-relaxed text-muted-foreground">
              Lưu là áp ngay cho <b class="text-foreground">{{ current.following }}</b> tài khoản đang theo vai trò này.
              Tài khoản đã tick riêng giữ nguyên quyền của mình (sửa ở tab Tài khoản).
            </p>
            <template v-if="current.editable">
              <button type="button" class="btn-secondary" :disabled="!dirty || saving" @click="undo">Huỷ thay đổi</button>
              <button type="button" class="btn-primary" :disabled="!dirty || saving" @click="save">
                <UiSpinner v-if="saving" :size="16" /> Lưu quyền vai trò
              </button>
            </template>
          </div>
        </div>
      </div>
    </UiStateBlock>
  </div>
</template>
