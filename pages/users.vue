<script setup lang="ts">
import { usersApi, sellersApi, ERR_USER_DELETED_EMAIL } from '~/services/api'
import type { UserInput } from '~/services/api'
import type { Role, User, Seller } from '~/types'
import { useApiResource } from '~/composables/useApiResource'
import { ApiError, errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { ROLE_LABEL } from '~/utils/enums'

// User management (Wireframe: Users/Audit). Owner/Admin create staff & seller
// accounts and assign roles. Passwords are write-only — edit leaves it blank to
// keep the current one.
const toast = useToastStore()
const pager = reactive({ page: 1, page_size: 20 })
const { data, meta, loading, error, reload } = useApiResource<User[]>(() =>
  usersApi.list({ page: pager.page, page_size: pager.page_size }),
)
const users = computed(() => data.value ?? [])

function changePage(p: number) {
  pager.page = p
  reload()
}

// Đổi số dòng/trang thì phải về trang 1: trang hiện tại có thể không còn tồn tại
// ở kích thước mới.
function changePageSize(size: number) {
  pager.page_size = size
  pager.page = 1
  reload()
}

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

// Sellers for the "Vai trò = Seller" dropdown. A SELLER user must link to an
// existing seller entity (its id), so we offer a picker instead of a free-text
// id that invites typing a non-existent number.
const sellers = ref<Seller[]>([])
const loadingSellers = ref(false)
const sellerOptions = computed(() =>
  sellers.value.map((s) => ({ value: s.id, label: `${s.name} (${s.code}) — #${s.id}` })),
)
async function loadSellers() {
  loadingSellers.value = true
  try {
    sellers.value = (await sellersApi.list()).data ?? []
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    loadingSellers.value = false
  }
}
onMounted(loadSellers)

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

// Fast client-side checks so obvious mistakes get an instant, clear Vietnamese
// message instead of a round-trip to the backend.
function validate(): string | null {
  if (!form.email.trim()) return 'Vui lòng nhập email.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Email không đúng định dạng (ví dụ: ten@congty.com).'
  if (!form.full_name.trim()) return 'Vui lòng nhập họ tên.'
  if (!editing.value && !form.password) return 'Vui lòng nhập mật khẩu.'
  if (isSellerRole.value && !form.seller_id)
    return 'Vui lòng chọn Seller cho tài khoản này. Nếu chưa có, hãy tạo seller ở Master data → Seller.'
  return null
}

async function submit() {
  if (saving.value) return
  const problem = validate()
  if (problem) {
    toast.error(problem)
    return
  }
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
      await createUser(false)
    }
    open.value = false
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

// Tạo tài khoản. Nếu email đang thuộc một tài khoản ĐÃ XOÁ, backend từ chối với
// code USER_DELETED_EMAIL và nói rõ tài khoản cũ là ai — khôi phục nghĩa là
// nhận lại toàn bộ lịch sử công việc của người đó, nên phải hỏi chứ không tự
// quyết. Người dùng đồng ý thì gọi lại kèm cờ xác nhận.
async function createUser(restoreDeleted: boolean) {
  try {
    await usersApi.create({
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      role: form.role,
      seller_id: isSellerRole.value ? form.seller_id : undefined,
      is_active: form.is_active,
      ...(restoreDeleted ? { restore_deleted: true } : {}),
    })
    toast.success(restoreDeleted ? 'Đã khôi phục tài khoản cũ' : 'Đã tạo người dùng')
  } catch (e) {
    if (!restoreDeleted && e instanceof ApiError && e.code === ERR_USER_DELETED_EMAIL) {
      const ok = await useConfirm().confirm({
        title: 'Email thuộc một tài khoản đã xoá',
        message: `${e.message}\n\nKhôi phục tài khoản cũ với thông tin vừa nhập?`,
        tone: 'warning',
        confirmText: 'Khôi phục tài khoản',
      })
      if (!ok) throw e
      await createUser(true)
      return
    }
    throw e
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

// Xoá người dùng: xoá MỀM ở backend — tài khoản biến khỏi danh sách và không
// đăng nhập được nữa, nhưng mọi dấu vết người đó để lại (batch đã tạo, lượt QC,
// nhật ký) vẫn trỏ đúng người. Tuyển lại đúng email này về sau thì hệ thống
// khôi phục chính tài khoản cũ.
//
// Backend còn từ chối ba trường hợp và trả message tiếng Việt: tự xoá chính
// mình, xoá OWNER cuối cùng, và ADMIN xoá OWNER. Nút dưới đây ẩn sẵn trường hợp
// tự xoá cho đỡ bấm nhầm, phần còn lại để backend quyết.
const deletingId = ref<number | null>(null)
const auth = useAuthStore()
function isSelf(u: User): boolean {
  return auth.user?.id === u.id
}

async function removeUser(u: User) {
  if (deletingId.value) return
  const ok = await useConfirm().confirm({
    title: 'Xoá người dùng',
    message:
      `Xoá tài khoản ${u.full_name || u.email} (${u.email})?\n\n` +
      'Người này sẽ không đăng nhập được nữa. Lịch sử công việc của họ vẫn được giữ ' +
      'để truy vết. Nếu chỉ muốn tạm dừng, hãy dùng "Khoá" thay vì xoá.',
    tone: 'danger',
    confirmText: 'Xoá người dùng',
  })
  if (!ok) return
  deletingId.value = u.id
  try {
    await usersApi.remove(u.id)
    toast.success(`Đã xoá ${u.email}`)
    await reload()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    deletingId.value = null
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
  CS: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
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
                    <button
                      v-if="!isSelf(u)"
                      class="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                      :disabled="deletingId === u.id"
                      title="Xoá tài khoản — người này không đăng nhập được nữa, lịch sử công việc vẫn giữ"
                      @click="removeUser(u)"
                    >
                      {{ deletingId === u.id ? 'Đang xoá…' : 'Xoá' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination
          :meta="meta"
          :page-size="pager.page_size"
          @change="changePage"
          @update:page-size="changePageSize"
        />
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
            <label class="label">Seller *</label>
            <UiSelect
              v-model="form.seller_id"
              :options="sellerOptions"
              aria-label="Seller"
              :placeholder="loadingSellers ? 'Đang tải…' : 'Chọn seller…'"
            />
          </div>
        </div>
        <p v-if="isSellerRole && !loadingSellers && sellerOptions.length === 0" class="text-xs text-amber-600 dark:text-amber-400">
          Chưa có seller nào trong hệ thống.
          <NuxtLink to="/master-data?tab=sellers" class="font-medium underline">Tạo seller mới</NuxtLink>
          rồi quay lại chọn.
        </p>
        <p v-else-if="isSellerRole" class="text-[11px] text-muted-foreground">
          Tài khoản Seller phải gắn với một seller đã có. Chưa có thì
          <NuxtLink to="/master-data?tab=sellers" class="underline">tạo seller mới</NuxtLink>.
        </p>
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
