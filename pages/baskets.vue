<script setup lang="ts">
import { basketsApi } from '~/services/api'
import type { Basket, BasketLookup, BasketStatus, QcResultItem } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { errorMessage } from '~/utils/api-error'
import { printBasketLabel } from '~/utils/basketLabel'
import { formatDateTime } from '~/utils/format'

// Giỏ chờ — màn của người QC và người nhặt giỏ (anh Kiên, 20/10/2026).
//
//   - Quét bất cứ mã nào đang cầm (tem giỏ, mã đơn, tem sản phẩm) → biết ngay hàng
//     của đơn đang ở giỏ số mấy (bước 3), hoặc tạo giỏ nếu đơn cần mà chưa có.
//   - Giỏ ĐỦ (sản phẩm cuối QC đạt) thì TỰ XOÁ ngay lúc PASS — không ai phải bấm gì
//     (20/10/2026). Số giỏ trống ra, giỏ mới lấy số trống thấp nhất. Màn này chỉ còn
//     hai nút xoá tay: giỏ của đơn đã HUỶ (lấy hàng ra) và admin xoá giỏ chưa đủ.
//   - Đơn chưa đủ sản phẩm thì không gửi được cho THE: sang đóng hàng là chắc chắn đủ.
const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const canManage = computed(() => auth.can('qc.manage') || auth.can('ship_queue.manage'))

// ---- Danh sách giỏ đang dùng -------------------------------------------------
const baskets = ref<Basket[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)
async function loadList() {
  listLoading.value = true
  listError.value = null
  try {
    const { data } = await basketsApi.list()
    baskets.value = data ?? []
    // Giỏ đang mở trên màn cũng phải theo trạng thái mới nhất.
    if (current.value?.basket) {
      const fresh = baskets.value.find((b) => b.id === current.value?.basket?.id)
      if (fresh) current.value = { ...current.value, basket: fresh }
    }
  } catch (e) {
    listError.value = errorMessage(e)
  } finally {
    listLoading.value = false
  }
}

const filter = ref<'all' | BasketStatus>('all')
const counts = computed(() => ({
  all: baskets.value.length,
  FULL: baskets.value.filter((b) => b.status === 'FULL').length,
  OPEN: baskets.value.filter((b) => b.status === 'OPEN').length,
  CANCELLED: baskets.value.filter((b) => b.status === 'CANCELLED').length,
}))
const shown = computed(() => (filter.value === 'all' ? baskets.value : baskets.value.filter((b) => b.status === filter.value)))
const FILTERS: { key: 'all' | BasketStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'OPEN', label: 'Đang gom' },
  { key: 'CANCELLED', label: 'Đơn huỷ' },
]

const STATUS: Record<BasketStatus, { label: string; chip: string; card: string }> = {
  OPEN: {
    label: 'Đang gom',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    card: 'border-amber-300 dark:border-amber-500/40',
  },
  FULL: {
    label: 'Đủ hàng',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    card: 'border-emerald-400 ring-2 ring-emerald-400/30 dark:border-emerald-500/60',
  },
  CANCELLED: {
    label: 'Đơn đã huỷ',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    card: 'border-rose-300 dark:border-rose-500/40',
  },
}
const ITEM_QC: Record<string, { label: string; chip: string }> = {
  PASSED: { label: 'Đã QC', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  REWORK: { label: 'Đang làm lại', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  WAITING: { label: 'Chưa QC', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
}
const itemQc = (it: QcResultItem) => ITEM_QC[it.qc_status] ?? ITEM_QC.WAITING
const pct = (b: Basket) => (b.total_items ? Math.round((b.passed_items / b.total_items) * 100) : 0)

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} phút`
  const h = Math.floor(mins / 60)
  if (h < 48) return `${h} giờ`
  return `${Math.floor(h / 24)} ngày`
}

// ---- Quét ------------------------------------------------------------------
const code = ref('')
const scanInput = ref<HTMLInputElement | null>(null)
const scanning = ref(false)
const scanError = ref<string | null>(null)
const current = ref<BasketLookup | null>(null)

function focusScan() {
  nextTick(() => scanInput.value?.focus())
}

async function scan(value = code.value.trim()) {
  if (!value || scanning.value) return
  scanning.value = true
  scanError.value = null
  try {
    const { data } = await basketsApi.lookup(value)
    current.value = data
  } catch (e) {
    current.value = null
    scanError.value = errorMessage(e)
  } finally {
    scanning.value = false
    code.value = ''
    focusScan()
  }
}

function select(b: Basket) {
  current.value = { basket: b, needs_basket: false }
  window.scrollTo?.({ top: 0, behavior: 'smooth' })
  focusScan()
}

// ---- Tạo giỏ / xoá giỏ ---------------------------------------------------
const createdOpen = ref(false)
const createdBasket = ref<Basket | null>(null)
const creating = ref(false)
async function createFor(orderId: number) {
  if (creating.value) return
  creating.value = true
  try {
    const { data } = await basketsApi.create(orderId)
    current.value = { basket: data.basket, needs_basket: false }
    createdBasket.value = data.basket
    createdOpen.value = true
    void loadList()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

const releasing = ref(false)
// Vừa xoá tay xong (giỏ của đơn huỷ): giữ lại để hiện thông báo "giỏ X đã trống".
const released = ref<Basket | null>(null)
async function release(b: Basket) {
  if (releasing.value) return
  releasing.value = true
  try {
    const { data } = await basketsApi.release(b.id)
    released.value = data
    current.value = null
    toast.success(`Đã xoá giỏ #${data.number} — giỏ trống`)
    void loadList()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    releasing.value = false
    focusScan()
  }
}

// Admin xoá giỏ khi đơn CHƯA đủ (hàng phải lấy ra vì lý do khác) — bắt ghi lý do.
const forceOpen = ref(false)
const forceReason = ref('')
const forcing = ref(false)
function openForce() {
  forceReason.value = ''
  forceOpen.value = true
}
async function submitForce() {
  const b = current.value?.basket
  if (!b || forcing.value || !forceReason.value.trim()) return
  forcing.value = true
  try {
    const { data } = await basketsApi.release(b.id, { force: true, reason: forceReason.value.trim() })
    forceOpen.value = false
    current.value = null
    toast.success(`Đã xoá giỏ #${data.number} — giỏ trống`)
    void loadList()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    forcing.value = false
  }
}

function print(b: Basket) {
  if (!printBasketLabel(b)) toast.error('Trình duyệt chặn cửa sổ in — cho phép popup cho trang này rồi bấm lại.')
}

const missing = computed(() => (current.value?.basket?.items ?? []).filter((i) => i.qc_status !== 'PASSED'))

// Lối tắt từ trạm QC ("Mở màn Giỏ chờ"): /baskets?code=GIO-37 mở luôn giỏ đó.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await loadList()
  const q = typeof route.query.code === 'string' ? route.query.code : ''
  if (q) {
    void router.replace({ query: {} })
    await scan(q)
  }
  focusScan()
  // Trạm QC khác vừa PASS → giỏ đổi trạng thái; làm mới định kỳ cho bảng khỏi cũ.
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void loadList()
  }, 30000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div>
    <PageHeader
      title="Giỏ chờ"
      subtitle="Đơn nhiều sản phẩm gom ở giỏ tới khi đủ. Quét tem giỏ / mã đơn / tem sản phẩm để biết giỏ số mấy. Sản phẩm cuối QC đạt là giỏ tự xoá, số giỏ trống ra cho đơn khác."
    >
      <template #actions>
        <button class="btn-secondary whitespace-nowrap" :disabled="listLoading" @click="loadList">
          <UiSpinner v-if="listLoading" :size="14" /><UiIcon v-else name="refresh" :size="16" /> Làm mới
        </button>
      </template>
    </PageHeader>

    <!-- Ô quét -->
    <div class="card mb-5 p-4">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="scan()">
        <div class="flex-1">
          <label class="label" for="basket-scan">Tem giỏ / mã đơn / tem sản phẩm</label>
          <input
            id="basket-scan"
            ref="scanInput"
            v-model="code"
            class="input font-mono text-base"
            placeholder="Quét hoặc nhập mã rồi Enter… (vd GIO-12, 102431, 102431_1/2)"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary sm:w-40" :disabled="scanning || !code.trim()">
          <UiSpinner v-if="scanning" :size="16" /><UiIcon v-else name="search" :size="16" /> Quét
        </button>
      </form>
      <p v-if="scanError" class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-rose-500/10 dark:text-rose-300">
        {{ scanError }}
      </p>
    </div>

    <!-- Vừa xoá giỏ -->
    <div
      v-if="released && !current"
      class="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5 dark:border-emerald-500/60 dark:bg-emerald-500/10"
    >
      <UiIcon name="check" :size="32" class="text-emerald-600 dark:text-emerald-400" />
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold text-emerald-900 dark:text-emerald-100">Đã xoá giỏ #{{ released.number }} — giỏ trống</p>
        <p class="text-sm text-emerald-800 dark:text-emerald-200">
          Đơn <span class="font-mono font-semibold">{{ released.order_code }}</span> đã được lấy hàng ra. Giỏ #{{ released.number }} đã trống,
          giỏ mới sẽ dùng lại số này.
        </p>
      </div>
      <button class="btn-secondary" @click="released = null">Đóng</button>
    </div>

    <!-- Kết quả quét: một giỏ -->
    <div v-if="current?.basket" class="card mb-5 overflow-hidden">
      <div class="flex flex-wrap items-start gap-5 p-5">
        <div
          class="flex shrink-0 flex-col items-center rounded-2xl border-2 px-6 py-3"
          :class="current.basket.status === 'FULL' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : current.basket.status === 'CANCELLED' ? 'border-rose-300 bg-rose-50 dark:bg-rose-500/10' : 'border-amber-400 bg-amber-50 dark:bg-amber-500/10'"
        >
          <span class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Giỏ chờ</span>
          <span class="text-6xl font-extrabold leading-none tabular-nums text-foreground">#{{ current.basket.number }}</span>
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-md px-2.5 py-1 text-xs font-semibold" :class="STATUS[current.basket.status].chip">
              {{ STATUS[current.basket.status].label }}
            </span>
            <span class="text-xs text-muted-foreground">tạo {{ formatDateTime(current.basket.created_at) }} · {{ ago(current.basket.created_at) }} trước</span>
          </div>
          <p class="text-sm text-muted-foreground">
            Đơn <NuxtLink :to="`/orders/${current.basket.order_id}`" class="font-mono text-base font-semibold text-primary hover:underline">{{ current.basket.order_code }}</NuxtLink>
            · {{ current.basket.store_order_id }}<template v-if="current.basket.seller_name"> · {{ current.basket.seller_name }}</template>
          </p>
          <p class="text-2xl font-bold tabular-nums text-foreground">
            {{ current.basket.passed_items }}/{{ current.basket.total_items }}
            <span class="text-sm font-medium text-muted-foreground">sản phẩm đã QC đạt<template v-if="current.basket.total_qty !== current.basket.total_items"> · {{ current.basket.total_qty }} cái</template></span>
          </p>
          <p v-if="current.basket.status === 'CANCELLED'" class="text-sm font-semibold text-rose-700 dark:text-rose-300">
            Đơn đã huỷ: lấy hàng ra khỏi giỏ rồi xoá giỏ.
          </p>
          <p v-else class="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Còn thiếu {{ missing.length }} sản phẩm — sản phẩm nào QC đạt thì bỏ vào giỏ #{{ current.basket.number }}.
          </p>
        </div>
        <div class="flex w-full flex-col gap-2 sm:w-auto">
          <button
            v-if="canManage && current.basket.status === 'CANCELLED'"
            class="btn-success px-5 py-3 text-base"
            :disabled="releasing"
            @click="release(current.basket)"
          >
            <UiSpinner v-if="releasing" :size="16" /><UiIcon v-else name="check" :size="18" />
            Đã lấy hàng ra — xoá giỏ #{{ current.basket.number }}
          </button>
          <button class="btn-secondary" @click="print(current.basket)"><UiIcon name="print" :size="16" /> In lại tem giỏ</button>
          <button
            v-if="auth.hasAdminRights && current.basket.status === 'OPEN'"
            class="btn-secondary text-rose-600 dark:text-rose-400"
            @click="openForce"
          >
            Xoá giỏ khi đơn chưa đủ…
          </button>
        </div>
      </div>
      <div class="overflow-x-auto border-t border-border">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-muted">
            <tr>
              <th class="table-th">Mã tem</th>
              <th class="table-th">SKU</th>
              <th class="table-th">Sản phẩm</th>
              <th class="table-th">SL</th>
              <th class="table-th">QC</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="it in current.basket.items" :key="it.item_id" :class="it.qc_status !== 'PASSED' ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''">
              <td class="table-td font-mono">{{ it.internal_code }}</td>
              <td class="table-td font-semibold">{{ it.sku_code }}</td>
              <td class="table-td text-muted-foreground">{{ it.product_name || '—' }}</td>
              <td class="table-td tabular-nums" :class="it.quantity > 1 ? 'font-bold text-amber-600 dark:text-amber-400' : ''">{{ it.quantity }}</td>
              <td class="table-td">
                <span class="rounded-md px-2 py-0.5 text-xs font-semibold" :class="itemQc(it).chip">{{ itemQc(it).label }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Kết quả quét: đơn chưa có giỏ -->
    <div v-else-if="current?.order" class="card mb-5 flex flex-wrap items-center gap-4 p-5">
      <div class="min-w-0 flex-1">
        <p class="text-sm text-muted-foreground">Đơn <span class="font-mono text-base font-semibold text-foreground">{{ current.order.internal_code }}</span> · {{ current.order.store_order_id }}</p>
        <p class="mt-1 text-lg font-bold text-foreground">
          {{ current.order.passed_items }}/{{ current.order.total_items }} sản phẩm đã QC đạt — {{ current.message }}
        </p>
      </div>
      <button v-if="current.needs_basket && canManage" class="btn-primary" :disabled="creating" @click="createFor(current.order.order_id)">
        <UiSpinner v-if="creating" :size="16" /><UiIcon v-else name="box" :size="16" /> Tạo giỏ chờ
      </button>
    </div>

    <!-- Bảng giỏ đang dùng -->
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">
        Đang dùng <b class="text-foreground">{{ counts.all }}</b>/100 giỏ ·
        <b class="text-amber-600 dark:text-amber-400">{{ counts.OPEN }}</b> đang gom
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          :class="filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'"
          @click="filter = f.key"
        >
          {{ f.label }} ({{ counts[f.key] }})
        </button>
      </div>
    </div>

    <p v-if="listError" class="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-rose-500/10 dark:text-rose-300">{{ listError }}</p>
    <div v-if="!shown.length && !listLoading" class="card py-12 text-center text-sm text-muted-foreground">
      {{ baskets.length ? 'Không có giỏ nào ở nhóm này.' : 'Chưa có giỏ nào đang dùng.' }}
    </div>
    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <button
        v-for="b in shown"
        :key="b.id"
        type="button"
        class="card flex flex-col gap-2 border-2 p-3 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
        :class="[STATUS[b.status].card, current?.basket?.id === b.id ? 'bg-muted' : '']"
        @click="select(b)"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="text-4xl font-extrabold leading-none tabular-nums text-foreground">#{{ b.number }}</span>
          <span class="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" :class="STATUS[b.status].chip">{{ STATUS[b.status].label }}</span>
        </div>
        <p class="truncate font-mono text-sm font-semibold text-foreground">{{ b.order_code }}</p>
        <div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full" :class="b.status === 'FULL' ? 'bg-emerald-500' : 'bg-amber-500'" :style="{ width: pct(b) + '%' }" />
          </div>
          <p class="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{{ b.passed_items }}/{{ b.total_items }} SP</span><span>{{ ago(b.created_at) }}</span>
          </p>
        </div>
      </button>
    </div>

    <BasketDialog v-model="createdOpen" :basket="createdBasket" mode="created" />

    <UiModal v-model="forceOpen" title="Xoá giỏ khi đơn chưa đủ">
      <div class="space-y-3">
        <p class="text-sm text-foreground">
          Giỏ <b>#{{ current?.basket?.number }}</b> mới QC đạt {{ current?.basket?.passed_items }}/{{ current?.basket?.total_items }} sản phẩm.
          Chỉ dùng khi phải lấy hàng ra khỏi giỏ dù đơn chưa đủ (tạo giỏ nhầm đơn, đơn bị huỷ bớt sản phẩm…).
          Xoá xong giỏ <b>#{{ current?.basket?.number }}</b> trống cho đơn khác; khi QC tiếp các sản phẩm còn lại của
          đơn, hệ thống sẽ mời tạo giỏ mới.
        </p>
        <div>
          <label class="label" for="force-reason">Lý do (bắt buộc)</label>
          <input id="force-reason" v-model="forceReason" class="input" maxlength="200" placeholder="vd: khách đổi ý, gom ở chỗ khác…" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="forceOpen = false">Huỷ</button>
        <button class="btn-danger" :disabled="forcing || !forceReason.trim()" @click="submitForce">
          <UiSpinner v-if="forcing" :size="16" /> Xoá giỏ
        </button>
      </template>
    </UiModal>
  </div>
</template>
