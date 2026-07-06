<script setup lang="ts">
import { usersApi } from '~/services/api'
import type { UserInput } from '~/services/api'
import type { Role, User } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { ROLE_LABEL } from '~/utils/enums'

// User management (Wireframe: Users/Audit). Owner/Admin create staff & seller
// accounts and assign roles. Passwords are write-only — edit leaves it blank to
// keep the current one.
const toast = useToastStore()
const { data, loading, error, reload } = useApiResource<User[]>(() => usersApi.list())
const users = computed(() => data.value ?? [])

const open = ref(false)
const editing = ref<User | null>(null)
const saving = ref(false)
const form = reactive<UserInput>({
  email: '',
  password: '',
  full_name: '',
  role: 'OPS',
  seller_id: undefined,
  is_active: true,
})

const isSellerRole = computed(() => form.role === 'SELLER')

const roleOptions = (Object.entries(ROLE_LABEL) as [Role, string][]).map(
  ([value, label]) => ({ value, label }),
)

function openCreate() {
  editing.value = null
  form.email = ''
  form.password = ''
  form.full_name = ''
  form.role = 'OPS'
  form.seller_id = undefined
  form.is_active = true
  open.value = true
}

function openEdit(u: User) {
  editing.value = u
  form.email = u.email
  form.password = ''
  form.full_name = u.full_name
  form.role = u.role
  form.seller_id = u.seller_id ?? undefined
  form.is_active = u.is_active
  open.value = true
}

const canSubmit = computed(() => {
  if (!form.email.trim() || !form.full_name.trim()) return false
  // Password required only when creating.
  if (!editing.value && !form.password) return false
  if (isSellerRole.value && !form.seller_id) return false
  return true
})

async function submit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    if (editing.value) {
      const payload: Partial<UserInput> = {
        full_name: form.full_name.trim(),
        role: form.role,
        seller_id: isSellerRole.value ? form.seller_id : undefined,
        is_active: form.is_active,
      }
      if (form.password) payload.password = form.password
      await usersApi.update(editing.value.id, payload)
      toast.success('Đã cập nhật người dùng')
    } else {
      await usersApi.create({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role,
        seller_id: isSellerRole.value ? form.seller_id : undefined,
        is_active: form.is_active,
      })
      toast.success('Đã tạo người dùng')
    }
    open.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

const togglingId = ref<number | null>(null)
async function toggleActive(u: User) {
  togglingId.value = u.id
  try {
    await usersApi.update(u.id, { is_active: !u.is_active })
    toast.success(u.is_active ? `Đã khoá ${u.email}` : `Đã kích hoạt ${u.email}`)
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    togglingId.value = null
  }
}

const ROLE_BADGE: Record<Role, string> = {
  OWNER: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  ADMIN: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  OPS: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  DESIGNER: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  PRODUCTION: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  QC: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  PACKING: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  SHIPPING: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  SELLER: 'bg-muted text-foreground',
}
</script>

<template>
  <div>
    <PageHeader title="Người dùng" subtitle="Quản lý tài khoản nhân sự nội bộ và seller, phân quyền theo vai trò">
      <template #actions>
        <NuxtLink to="/audit" class="btn-secondary"><UiIcon name="audit" :size="16" /> Audit Logs</NuxtLink>
        <button class="btn-primary" @click="openCreate"><UiIcon name="plus" :size="16" /> Thêm người dùng</button>
      </template>
    </PageHeader>

    <div class="card overflow-hidden">
      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && users.length === 0"
        empty-text="Chưa có người dùng nào."
        @retry="reload"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Họ tên</th>
                <th class="table-th">Email</th>
                <th class="table-th">Vai trò</th>
                <th class="table-th">Seller</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="u in users" :key="u.id" class="hover:bg-muted">
                <td class="table-td font-medium text-foreground">{{ u.full_name }}</td>
                <td class="table-td text-foreground">{{ u.email }}</td>
                <td class="table-td">
                  <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium" :class="ROLE_BADGE[u.role]">
                    {{ ROLE_LABEL[u.role] }}
                  </span>
                </td>
                <td class="table-td text-xs text-muted-foreground">{{ u.seller_id ? '#' + u.seller_id : '—' }}</td>
                <td class="table-td">
                  <span
                    class="inline-flex items-center gap-1 text-xs font-medium"
                    :class="u.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'"
                  >
                    <span class="h-1.5 w-1.5 rounded-full" :class="u.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'" />
                    {{ u.is_active ? 'Hoạt động' : 'Đã khoá' }}
                  </span>
                </td>
                <td class="table-td">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      class="text-xs font-medium hover:underline disabled:opacity-50"
                      :class="u.is_active ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'"
                      :disabled="togglingId === u.id"
                      @click="toggleActive(u)"
                    >
                      {{ u.is_active ? 'Khoá' : 'Mở khoá' }}
                    </button>
                    <button class="text-xs font-medium text-primary hover:underline" @click="openEdit(u)">Sửa</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiStateBlock>
    </div>

    <!-- Create / edit -->
    <UiModal v-model="open" :title="editing ? 'Sửa người dùng' : 'Thêm người dùng'">
      <div class="space-y-4">
        <div>
          <label class="label">Email *</label>
          <input v-model="form.email" type="email" class="input" :disabled="!!editing" placeholder="user@the.local" />
        </div>
        <div>
          <label class="label">Họ tên *</label>
          <input v-model="form.full_name" class="input" placeholder="Nguyễn Văn A" />
        </div>
        <div>
          <label class="label">
            Mật khẩu {{ editing ? '(để trống nếu không đổi)' : '*' }}
          </label>
          <input v-model="form.password" type="password" class="input" autocomplete="new-password" placeholder="••••••••" />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Vai trò</label>
            <UiSelect v-model="form.role" :options="roleOptions" aria-label="Vai trò" />
          </div>
          <div v-if="isSellerRole">
            <label class="label">Seller ID *</label>
            <input v-model.number="form.seller_id" type="number" class="input" placeholder="VD: 1" />
          </div>
        </div>
        <label class="flex cursor-pointer items-center gap-2">
          <input v-model="form.is_active" type="checkbox" class="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
          <span class="text-sm text-foreground">Tài khoản hoạt động</span>
        </label>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="!canSubmit || saving" @click="submit">
          <UiSpinner v-if="saving" :size="16" /> {{ editing ? 'Lưu' : 'Tạo' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
