<script setup lang="ts">
import { adminApi } from '~/services/api'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useAuthStore } from '~/stores/auth'

// System settings. Currently a single "danger zone": wiping all order/production
// data so the operator can re-import from scratch. Route is OWNER-gated in
// utils/navigation.ts; the action itself is guarded again here and on the backend
// (OWNER + ALLOW_DATA_RESET).
const auth = useAuthStore()
const toast = useToastStore()
const isOwner = computed(() => auth.role === 'OWNER')

// What the transactional reset touches — shown to the user before they confirm.
const WILL_DELETE = [
  'Đơn hàng & sản phẩm (orders/items)',
  'Batch sản xuất & dòng batch',
  'Đóng gói & bàn giao (packages/handoffs)',
  'Bản ghi QC',
  'Lịch sử import đơn (import jobs)',
]
const WILL_KEEP = [
  'Nguyên vật liệu (NVL)',
  'SKU & mapping SKU → NVL',
  'Seller & store',
  'Người dùng & phân quyền',
]

const CONFIRM_PHRASE = 'XOA DON HANG'
const open = ref(false)
const typed = ref('')
const resetting = ref(false)
const done = ref(false)
const clearedCount = ref(0)

const canConfirm = computed(() => typed.value.trim().toUpperCase() === CONFIRM_PHRASE && !resetting.value)

function openDialog() {
  typed.value = ''
  done.value = false
  open.value = true
}

async function confirmReset() {
  if (!canConfirm.value) return
  resetting.value = true
  try {
    const { data } = await adminApi.resetData('transactional')
    clearedCount.value = data.cleared?.length ?? 0
    done.value = true
    open.value = false
    toast.success(`Đã xoá sạch dữ liệu đơn hàng (${clearedCount.value} bảng). Import lại từ đầu nhé.`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Cài đặt hệ thống" subtitle="Cấu hình & thao tác quản trị" />

    <div v-if="!isOwner" class="card p-6 text-sm text-muted-foreground">
      Chỉ chủ sở hữu (OWNER) mới truy cập được khu vực này.
    </div>

    <div v-else class="max-w-2xl space-y-4">
      <!-- Danger zone -->
      <div class="card overflow-hidden border-rose-200/70 dark:border-rose-500/30">
        <div class="border-b border-rose-200/70 bg-rose-50 px-5 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
            <UiIcon name="alert" :size="16" /> Vùng nguy hiểm
          </h3>
        </div>
        <div class="p-5">
          <h4 class="text-sm font-semibold text-foreground">Xoá toàn bộ đơn hàng để import lại từ đầu</h4>
          <p class="mt-1 text-xs text-muted-foreground">
            Xoá sạch dữ liệu đơn hàng & sản xuất, đưa hệ thống về trạng thái trống để import lại.
            <span class="font-medium text-rose-600 dark:text-rose-400">Không thể hoàn tác.</span>
            Master data bạn đã khai báo được giữ nguyên.
          </p>

          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-rose-200/60 bg-rose-50/50 p-3 dark:border-rose-500/25 dark:bg-rose-500/5">
              <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Sẽ bị xoá</p>
              <ul class="space-y-1 text-xs text-foreground">
                <li v-for="d in WILL_DELETE" :key="d" class="flex gap-1.5">
                  <span class="text-rose-500">✕</span> {{ d }}
                </li>
              </ul>
            </div>
            <div class="rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/5">
              <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Được giữ lại</p>
              <ul class="space-y-1 text-xs text-foreground">
                <li v-for="k in WILL_KEEP" :key="k" class="flex gap-1.5">
                  <span class="text-emerald-500">✓</span> {{ k }}
                </li>
              </ul>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button class="btn-danger" @click="openDialog">
              <UiIcon name="alert" :size="16" /> Xoá toàn bộ đơn hàng
            </button>
            <p v-if="done" class="text-sm text-emerald-600 dark:text-emerald-400">
              ✓ Đã xoá xong. <NuxtLink to="/import" class="underline">Import đơn ngay</NuxtLink>.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Typed confirmation -->
    <UiModal v-model="open" title="Xác nhận xoá toàn bộ đơn hàng">
      <div class="space-y-3">
        <p class="text-sm text-foreground">
          Thao tác này xoá <span class="font-semibold text-rose-600 dark:text-rose-400">vĩnh viễn</span>
          toàn bộ đơn hàng, batch, đóng gói, QC và lịch sử import. Master data (NVL/SKU/seller) và người dùng được giữ lại.
        </p>
        <p class="text-sm text-muted-foreground">
          Gõ <span class="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground">{{ CONFIRM_PHRASE }}</span>
          để xác nhận:
        </p>
        <input
          v-model="typed"
          class="input font-mono"
          :placeholder="CONFIRM_PHRASE"
          autocomplete="off"
          @keyup.enter="confirmReset"
        />
      </div>
      <template #footer>
        <button class="btn-secondary" :disabled="resetting" @click="open = false">Huỷ</button>
        <button class="btn-danger" :disabled="!canConfirm" @click="confirmReset">
          <UiSpinner v-if="resetting" :size="16" />
          {{ resetting ? 'Đang xoá…' : 'Xoá vĩnh viễn' }}
        </button>
      </template>
    </UiModal>
  </div>
</template>
