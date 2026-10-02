<script setup lang="ts">
import { sellersApi } from '~/services/api'
import type { Seller, SellerApiKey } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { formatDateTime } from '~/utils/format'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'
import { useConfirm } from '~/composables/useConfirm'
import { useApiDocsUrl } from '~/composables/useApiDocsUrl'

// API key của một seller — chìa khoá để HỆ THỐNG của seller tự đẩy đơn vào xưởng
// qua Open API (/api/open/v1), không cần người đăng nhập.
//
// Hai điều màn này phải làm cho đúng:
//   • Key gốc chỉ tồn tại trong câu trả lời lúc tạo (máy chủ chỉ lưu mã băm). Nên
//     tạo xong là hiện ngay, kèm nút copy, và nói thẳng "đóng lại là mất".
//   • Thu hồi là cắt kết nối của một hệ thống đang chạy — phải hỏi lại, nêu đích
//     danh key nào.
const props = defineProps<{ modelValue: boolean; seller: Seller | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const toast = useToastStore()
const auth = useAuthStore()
// Xem danh sách key = "Thao tác" Master Data. Tạo / thu hồi quyết định ai được
// đẩy đơn dưới tên seller, nên cần thêm vai trò Admin/Owner — khớp với API.
const canIssue = computed(
  () => (auth.role === 'OWNER' || auth.role === 'ADMIN') && auth.can('master_data.manage'),
)

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const docsUrl = useApiDocsUrl()

const keys = ref<SellerApiKey[]>([])
const loading = ref(false)
const error = ref('')

async function load() {
  if (!props.seller) return
  loading.value = true
  error.value = ''
  try {
    const { data } = await sellersApi.apiKeys(props.seller.id)
    keys.value = data ?? []
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

const name = ref('')
const creating = ref(false)
/** Key gốc vừa tạo — chỉ sống trong phiên mở hộp thoại này. */
const fresh = ref<{ id: number; name: string; key: string } | null>(null)

// Mở hộp thoại (hoặc đổi seller) là bắt đầu lại từ đầu: không để key gốc của
// seller trước còn nằm trên màn.
watch(
  () => [props.modelValue, props.seller?.id] as const,
  ([isOpen]) => {
    if (!isOpen) {
      fresh.value = null
      return
    }
    keys.value = []
    name.value = ''
    fresh.value = null
    void load()
  },
  { immediate: true },
)

const activeCount = computed(() => keys.value.filter((k) => !k.revoked_at).length)

async function create() {
  if (!props.seller || !name.value.trim() || creating.value) return
  creating.value = true
  try {
    const { data } = await sellersApi.createApiKey(props.seller.id, name.value.trim())
    if (data?.key) fresh.value = { id: data.id, name: data.name, key: data.key }
    name.value = ''
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

async function copyKey() {
  if (!fresh.value) return
  try {
    await navigator.clipboard.writeText(fresh.value.key)
    toast.success('Đã copy key')
  } catch {
    toast.error('Không copy được — bôi đen key rồi copy tay')
  }
}

const revokingId = ref<number | null>(null)
async function revoke(k: SellerApiKey) {
  if (!props.seller) return
  const ok = await useConfirm().confirm({
    title: 'Thu hồi API key',
    message:
      `Thu hồi key "${k.name}" (${k.prefix}…)?\n` +
      'Hệ thống đang dùng key này sẽ không gửi được đơn nữa, ngay lập tức. Không hoàn tác được — cần thì tạo key mới.',
    tone: 'danger',
    confirmText: 'Thu hồi',
  })
  if (!ok) return
  revokingId.value = k.id
  try {
    await sellersApi.revokeApiKey(props.seller.id, k.id)
    // Key vừa tạo mà bị thu hồi luôn thì đừng để dòng "copy ngay" mời dùng tiếp.
    if (fresh.value?.id === k.id) fresh.value = null
    toast.success('Đã thu hồi key')
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    revokingId.value = null
  }
}
</script>

<template>
  <UiModal v-model="open" :title="`Kết nối API — ${seller?.name ?? ''}`" wide>
    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">
        Cấp key để hệ thống của seller tự đẩy đơn vào xưởng và tra trạng thái. Đơn gửi bằng key nào
        thuộc về seller <span class="font-mono text-foreground">{{ seller?.code }}</span> và vẫn vào hàng chờ duyệt như đơn import.
        <a :href="docsUrl" target="_blank" rel="noopener" class="font-medium text-primary hover:underline">
          Mở tài liệu kết nối
        </a>
        — gửi link này cho đội kỹ thuật của seller.
      </p>

      <!-- Key vừa tạo: lần duy nhất nhìn thấy key gốc. -->
      <div
        v-if="fresh"
        class="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10"
      >
        <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Key "{{ fresh.name }}" — copy ngay, đóng hộp thoại là không xem lại được
        </p>
        <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code class="min-w-0 flex-1 select-all break-all rounded-md bg-background px-2.5 py-2 font-mono text-xs text-foreground">{{ fresh.key }}</code>
          <button class="btn-primary shrink-0" @click="copyKey"><UiIcon name="link" :size="16" /> Copy key</button>
        </div>
        <p class="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
          Gửi key cho seller qua kênh riêng. Hệ thống chỉ lưu mã băm — mất key thì thu hồi và tạo key mới.
        </p>
      </div>

      <form v-if="canIssue" class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="create">
        <div class="flex-1">
          <label class="label" for="api-key-name">Tên key mới</label>
          <input
            id="api-key-name"
            v-model="name"
            class="input"
            maxlength="120"
            placeholder="VD: Hệ thống đơn hàng của ABC"
          />
        </div>
        <button type="submit" class="btn-primary shrink-0" :disabled="!name.trim() || creating">
          <UiSpinner v-if="creating" :size="16" />
          <UiIcon v-else name="plus" :size="16" />
          Tạo key
        </button>
      </form>
      <p v-else class="text-xs text-muted-foreground">Chỉ Admin/Owner tạo và thu hồi được key.</p>

      <UiStateBlock
        :loading="loading"
        :error="error"
        :empty="!loading && !error && keys.length === 0"
        empty-text="Seller này chưa có API key nào."
        @retry="load"
      >
        <!-- Bảng phải vừa khít hộp thoại: nút "Thu hồi" nằm cột cuối, mà phải cuộn
             ngang mới thấy thì coi như không có. Nên mã key nằm dưới tên và ngày thu
             hồi xuống dòng, thay vì thêm cột. -->
        <div class="overflow-x-auto rounded-lg border border-border">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">Key</th>
                <th class="table-th hidden sm:table-cell">Tạo lúc</th>
                <th class="table-th hidden sm:table-cell">Dùng gần nhất</th>
                <th class="table-th">Trạng thái</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="k in keys" :key="k.id">
                <td class="table-td whitespace-normal" :class="k.revoked_at ? 'opacity-60' : ''">
                  <p class="break-words font-medium text-foreground">{{ k.name }}</p>
                  <p class="font-mono text-xs text-muted-foreground">{{ k.prefix }}…</p>
                </td>
                <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">{{ formatDateTime(k.created_at) }}</td>
                <td class="table-td hidden text-xs text-muted-foreground sm:table-cell">
                  {{ k.last_used_at ? formatDateTime(k.last_used_at) : 'Chưa dùng' }}
                </td>
                <td class="table-td text-xs">
                  <template v-if="k.revoked_at">
                    <p class="text-muted-foreground">Đã thu hồi</p>
                    <p class="text-muted-foreground/80">{{ formatDateTime(k.revoked_at) }}</p>
                  </template>
                  <span v-else class="font-medium text-emerald-600 dark:text-emerald-400">Đang hoạt động</span>
                </td>
                <td class="table-td text-right">
                  <button
                    v-if="canIssue && !k.revoked_at"
                    class="table-action text-rose-600 disabled:opacity-50 dark:text-rose-400"
                    :disabled="revokingId === k.id"
                    @click="revoke(k)"
                  >
                    Thu hồi
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          {{ activeCount }}/5 key đang hoạt động. "Dùng gần nhất" cập nhật mỗi vài phút, không theo từng lần gọi.
        </p>
      </UiStateBlock>
    </div>
    <template #footer>
      <button class="btn-secondary" @click="open = false">Đóng</button>
    </template>
  </UiModal>
</template>
