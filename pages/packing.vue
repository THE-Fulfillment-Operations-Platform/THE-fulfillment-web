<script setup lang="ts">
import { packingApi, ordersApi, handoffsApi } from '~/services/api'
import type { PackingResult, Order } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'

// Packing station (Wireframe: Packing). Each item scan is posted to the package
// for its order; the backend returns the running package state. When every line
// is fully scanned the package flips to PACKED — ready for shipping handoff.
const toast = useToastStore()

const code = ref('')
const scanInput = ref<HTMLInputElement | null>(null)
const orderLookup = ref('')
const scanning = ref(false)
const loadingOrder = ref(false)
const pkg = ref<PackingResult | null>(null)
const scanError = ref<string | null>(null)

const progress = computed(() => {
  const lines = pkg.value?.lines ?? []
  const expected = lines.reduce((s, l) => s + l.expected, 0)
  const scanned = lines.reduce((s, l) => s + Math.min(l.scanned, l.expected), 0)
  return { expected, scanned, pct: expected ? Math.round((scanned / expected) * 100) : 0 }
})

function focusScan() {
  nextTick(() => scanInput.value?.focus())
}

async function scan() {
  const value = code.value.trim()
  if (!value || scanning.value) return
  scanning.value = true
  scanError.value = null
  try {
    const { data } = await packingApi.scan({ code: value })
    const wasComplete = pkg.value?.fully_packed
    pkg.value = data
    if (data.fully_packed && !wasComplete) {
      toast.success(`${data.order_code} đã đóng gói đủ — package ${data.package_code}`)
      loadPacked()
    }
  } catch (e) {
    scanError.value = errorMessage(e)
  } finally {
    scanning.value = false
    code.value = ''
    focusScan()
  }
}

async function loadOrder() {
  const value = orderLookup.value.trim()
  if (!value || loadingOrder.value) return
  loadingOrder.value = true
  scanError.value = null
  try {
    const { data } = await packingApi.orderPackage(value)
    pkg.value = data
  } catch (e) {
    scanError.value = errorMessage(e)
  } finally {
    loadingOrder.value = false
    focusScan()
  }
}

function clearStation() {
  pkg.value = null
  scanError.value = null
  orderLookup.value = ''
  focusScan()
}

// Packed orders waiting for handoff (seller_status = PACKED). Gives the packing
// station a visible record of what's been fully packed — the scan panel alone
// only ever shows the current package, never a history. Client-side filter guards
// against the backend ignoring the status param.
const packedOrders = ref<Order[]>([])
const loadingPacked = ref(false)
async function loadPacked() {
  loadingPacked.value = true
  try {
    const { data } = await ordersApi.list({ status: 'PACKED', page_size: 50 })
    packedOrders.value = (data ?? []).filter((o) => o.seller_status === 'PACKED')
  } catch {
    packedOrders.value = []
  } finally {
    loadingPacked.value = false
  }
}
// Reopen a packed order's package in the panel above (reuses the Order-ID lookup).
function openPacked(o: Order) {
  orderLookup.value = String(o.id)
  loadOrder()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ---- Bàn giao cho THE -------------------------------------------------------
// Đây là ranh giới giữa hai nửa vòng đời của đơn: mọi thứ trước nó là luồng sản
// xuất của xưởng, sau nó kiện hàng thuộc bên vận chuyển. Bấm nút này mới là lúc
// hệ thống bắt đầu theo dõi hành trình — trước đó backend không gọi 24hTrack,
// vì kiện hàng chưa tồn tại với hãng vận chuyển.
const handingOff = ref<number | null>(null)

async function handOff(orderId: number, orderCode: string) {
  if (handingOff.value) return
  const ok = await useConfirm().confirm({
    title: 'Bàn giao cho THE',
    message: `Bàn giao đơn ${orderCode} cho THE? Sau bước này hệ thống bắt đầu theo dõi hành trình kiện hàng.`,
    confirmText: 'Bàn giao',
  })
  if (!ok) return
  handingOff.value = orderId
  try {
    const { data } = await handoffsApi.create({ order_id: orderId })
    toast.success(`Đã bàn giao ${orderCode} — handoff ${data.code}`)
    // Đơn rời khỏi hàng đợi "chờ bàn giao", và kiện đang mở trên panel cũng phải
    // phản ánh trạng thái mới thay vì tiếp tục mời bàn giao lần nữa.
    await loadPacked()
    if (pkg.value?.order_id === orderId) clearStation()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    handingOff.value = null
  }
}

onMounted(() => {
  focusScan()
  loadPacked()
})
</script>

<template>
  <div>
    <PageHeader
      title="Packing"
      subtitle="Quét từng item vào kiện hàng của đơn — đủ số lượng thì package chuyển PACKED"
    >
      <template #actions>
        <NuxtLink to="/shipping" class="btn-secondary">
          <UiIcon name="shipping" :size="16" /> Tới Shipping
        </NuxtLink>
      </template>
    </PageHeader>

    <!-- Scan + lookup bar -->
    <div class="card mb-5 p-4">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="scan">
        <div class="flex-1">
          <label class="label" for="pack-scan">Quét mã item</label>
          <input
            id="pack-scan"
            ref="scanInput"
            v-model="code"
            class="input font-mono text-base"
            placeholder="Quét mã item rồi Enter…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary sm:w-40" :disabled="scanning || !code.trim()">
          <UiSpinner v-if="scanning" :size="16" />
          <UiIcon v-else name="packing" :size="16" /> Quét
        </button>
      </form>

      <div class="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
        <div class="flex-1">
          <label class="label" for="pack-order">Hoặc mở package theo Order ID</label>
          <input
            id="pack-order"
            v-model="orderLookup"
            class="input"
            placeholder="VD: 1"
            @keyup.enter="loadOrder"
          />
        </div>
        <button class="btn-secondary sm:w-40" :disabled="loadingOrder || !orderLookup.trim()" @click="loadOrder">
          <UiSpinner v-if="loadingOrder" :size="16" />
          <UiIcon v-else name="search" :size="16" /> Mở package
        </button>
      </div>

      <p v-if="scanError" class="mt-3 rounded-md bg-red-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-red-700 dark:text-rose-300">
        {{ scanError }}
      </p>
    </div>

    <!-- Idle -->
    <div v-if="!pkg" class="card flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <div class="rounded-full bg-muted p-4">
        <UiIcon name="packing" :size="32" />
      </div>
      <p class="text-sm">Quét item đầu tiên để mở kiện hàng của đơn.</p>
    </div>

    <!-- Package panel -->
    <div v-else class="card overflow-hidden">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3"
        :class="pkg.fully_packed ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-muted'"
      >
        <div>
          <p class="font-semibold text-foreground">
            {{ pkg.order_code }}
            <span class="ml-2 font-mono text-sm font-normal text-muted-foreground">{{ pkg.package_code }}</span>
          </p>
          <p class="text-xs text-muted-foreground">{{ progress.scanned }} / {{ progress.expected }} sản phẩm đã quét</p>
        </div>
        <span
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold"
          :class="pkg.fully_packed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'"
        >
          <UiIcon :name="pkg.fully_packed ? 'check' : 'box'" :size="14" />
          {{ pkg.fully_packed ? 'Đã đóng đủ (PACKED)' : 'Đang đóng gói' }}
        </span>
      </div>

      <!-- Progress bar -->
      <div class="px-5 pt-4">
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full transition-all"
            :class="pkg.fully_packed ? 'bg-emerald-500' : 'bg-primary'"
            :style="{ width: progress.pct + '%' }"
          />
        </div>
      </div>

      <!-- Lines -->
      <div class="overflow-x-auto p-5">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-card">
            <tr>
              <th class="table-th">Item</th>
              <th class="table-th">SKU</th>
              <th class="table-th text-center">Đã quét</th>
              <th class="table-th text-center">Cần</th>
              <th class="table-th text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="l in pkg.lines"
              :key="l.order_item_id"
              :class="l.scanned >= l.expected ? 'bg-emerald-50/40 dark:bg-emerald-500/10' : ''"
            >
              <td class="table-td font-mono font-medium text-foreground">{{ l.item_code }}</td>
              <td class="table-td">{{ l.sku_code }}</td>
              <td class="table-td text-center font-semibold" :class="l.scanned >= l.expected ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'">
                {{ l.scanned }}
              </td>
              <td class="table-td text-center text-muted-foreground">{{ l.expected }}</td>
              <td class="table-td text-center">
                <UiIcon
                  v-if="l.scanned >= l.expected"
                  name="check"
                  :size="18"
                  class="mx-auto text-emerald-500"
                />
                <span v-else class="text-xs text-amber-600 dark:text-amber-400">Còn {{ l.expected - l.scanned }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <p v-if="pkg.fully_packed" class="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          ✓ Kiện hàng đã đủ — bàn giao cho THE để bắt đầu theo dõi hành trình.
        </p>
        <p v-else class="text-sm text-muted-foreground">Tiếp tục quét cho đến khi đủ số lượng.</p>
        <div class="flex gap-2">
          <button
            v-if="pkg.fully_packed"
            class="btn-primary"
            :disabled="handingOff === pkg.order_id"
            @click="handOff(pkg.order_id, pkg.order_code)"
          >
            <UiSpinner v-if="handingOff === pkg.order_id" :size="16" />
            <UiIcon v-else name="shipping" :size="16" />
            Bàn giao cho THE
          </button>
          <button class="btn-secondary" @click="clearStation">Đơn khác</button>
        </div>
      </div>
    </div>

    <!-- Packed orders (waiting for handoff) — visible record of what's been packed -->
    <div class="card mt-5 overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2.5">
        <div>
          <h3 class="text-sm font-semibold text-foreground">Đơn đã đóng gói (chờ bàn giao)</h3>
          <p class="text-xs text-muted-foreground">{{ packedOrders.length }} đơn đã đóng đủ, chưa bàn giao THE</p>
        </div>
        <button class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline" @click="loadPacked">
          <UiIcon name="refresh" :size="14" /> Làm mới
        </button>
      </div>

      <div v-if="loadingPacked" class="p-8 text-center text-sm text-muted-foreground">Đang tải…</div>
      <div v-else-if="!packedOrders.length" class="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
        <UiIcon name="box" :size="28" />
        <p class="text-sm">Chưa có đơn nào đóng gói xong.</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-border">
          <thead class="bg-card">
            <tr>
              <th class="table-th">Mã đơn</th>
              <th class="table-th hidden sm:table-cell">Store Order</th>
              <th class="table-th hidden md:table-cell">Store</th>
              <th class="table-th">Trạng thái</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="o in packedOrders" :key="o.id" class="hover:bg-muted">
              <td class="table-td font-mono font-medium text-foreground">{{ o.internal_code }}</td>
              <td class="table-td hidden text-muted-foreground sm:table-cell">{{ o.store_order_id }}</td>
              <td class="table-td hidden text-muted-foreground md:table-cell">{{ o.store_name }}</td>
              <td class="table-td"><UiStatusBadge kind="seller" :value="o.seller_status" /></td>
              <td class="table-td text-right">
                <div class="flex items-center justify-end gap-3">
                  <button class="table-action text-primary" @click="openPacked(o)">Mở kiện</button>
                  <!-- Bàn giao thẳng từ hàng đợi: đơn đã đóng đủ rồi, không cần
                       mở lại kiện chỉ để bấm một nút. -->
                  <button
                    class="table-action inline-flex items-center gap-1 text-primary disabled:opacity-50"
                    :disabled="handingOff === o.id"
                    @click="handOff(o.id, o.internal_code)"
                  >
                    <UiSpinner v-if="handingOff === o.id" :size="12" />
                    Bàn giao cho THE
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
