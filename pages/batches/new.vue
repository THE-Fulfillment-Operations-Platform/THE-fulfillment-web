<script setup lang="ts">
import { designApi, batchesApi } from '~/services/api'
import type { MaterialBucket, OrderItem, Priority } from '~/types'
import { PRIORITY_OPTIONS, PRIORITY } from '~/utils/enums'
import { errorMessage } from '~/utils/api-error'
import { itemStoreOrderId } from '~/utils/item'
import { useToastStore } from '~/stores/toast'

const toast = useToastStore()
const router = useRouter()

const buckets = ref<MaterialBucket[]>([])
const bucketsLoading = ref(true)
const bucketsError = ref<string | null>(null)

const activeMaterial = ref<MaterialBucket | null>(null)
const items = ref<OrderItem[]>([])
const itemsLoading = ref(false)
const itemsError = ref<string | null>(null)
const selectedIds = ref<Set<number>>(new Set())

const priority = ref<Priority>('NORMAL')
const dueDate = ref('')
const note = ref('')
const creating = ref(false)

async function loadBuckets() {
  bucketsLoading.value = true
  bucketsError.value = null
  try {
    const { data } = await designApi.materialBuckets()
    buckets.value = data ?? []
  } catch (e) {
    bucketsError.value = errorMessage(e)
  } finally {
    bucketsLoading.value = false
  }
}

async function selectMaterial(b: MaterialBucket) {
  activeMaterial.value = b
  selectedIds.value = new Set()
  itemsLoading.value = true
  itemsError.value = null
  items.value = []
  try {
    const { data } = await designApi.materialItems(b.material_id)
    items.value = data ?? []
  } catch (e) {
    itemsError.value = errorMessage(e)
  } finally {
    itemsLoading.value = false
  }
}

function toggle(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function toggleAll() {
  if (selectedIds.value.size === items.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(items.value.map((i) => i.id))
  }
}

const selectedCount = computed(() => selectedIds.value.size)

async function createBatch() {
  if (!activeMaterial.value || selectedCount.value === 0) return
  creating.value = true
  try {
    const { data } = await batchesApi.create({
      material_id: activeMaterial.value.material_id,
      order_item_ids: Array.from(selectedIds.value),
      priority: priority.value,
      due_date: dueDate.value || undefined,
      note: note.value || undefined,
    })
    const skipped = data.skipped_item_ids?.length ?? 0
    toast.success(
      `Đã tạo batch ${data.batch.code}` + (skipped ? ` (bỏ qua ${skipped} item)` : ''),
    )
    router.push(`/batches/${data.batch.id}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

onMounted(loadBuckets)
</script>

<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/batches" class="text-sm text-primary hover:underline">← Về danh sách batch</NuxtLink>
    </div>
    <PageHeader
      title="Tạo Batch theo nguyên vật liệu"
      subtitle="SKU cố định theo material. Combo nhiều NVL: tạo batch riêng cho từng material với cùng item."
    />

    <!-- Material buckets -->
    <UiStateBlock :loading="bucketsLoading" :error="bucketsError" @retry="loadBuckets">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          v-for="b in buckets"
          :key="b.material_id"
          class="card p-4 text-left transition-colors hover:border-primary/60"
          :class="activeMaterial?.material_id === b.material_id ? '!border-primary bg-accent' : ''"
          @click="selectMaterial(b)"
        >
          <p class="text-sm font-semibold text-foreground">{{ b.material_name }}</p>
          <p class="text-xs text-muted-foreground">{{ b.material_code }}</p>
          <p class="mt-2 text-2xl font-semibold text-primary">{{ b.item_count }}</p>
          <p class="text-xs text-muted-foreground">item sẵn sàng</p>
        </button>
      </div>
    </UiStateBlock>

    <!-- Item selection -->
    <div v-if="activeMaterial" class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div class="card overflow-hidden lg:col-span-2">
        <div class="flex items-center justify-between border-b border-border bg-muted px-4 py-2.5">
          <h3 class="text-sm font-semibold text-foreground">
            Item NVL {{ activeMaterial.material_name }} (chưa vào batch)
          </h3>
          <button class="text-xs font-medium text-primary hover:underline" @click="toggleAll">
            {{ selectedIds.size === items.length && items.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
          </button>
        </div>
        <UiStateBlock
          :loading="itemsLoading"
          :error="itemsError"
          :empty="!itemsLoading && !itemsError && items.length === 0"
          empty-text="Không còn item design-ready cho material này."
          @retry="() => selectMaterial(activeMaterial!)"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
              <thead class="bg-card">
                <tr>
                  <th class="table-th w-10"></th>
                  <th class="table-th">Item</th>
                  <th class="table-th">Store Order</th>
                  <th class="table-th">SKU</th>
                  <th class="table-th">SL</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="it in items" :key="it.id" class="hover:bg-muted" @click="toggle(it.id)">
                  <td class="table-td">
                    <input type="checkbox" :checked="selectedIds.has(it.id)" class="h-4 w-4 rounded border-border" @click.stop="toggle(it.id)" />
                  </td>
                  <td class="table-td font-medium text-foreground">{{ it.internal_code }}</td>
                  <td class="table-td">{{ itemStoreOrderId(it) }}</td>
                  <td class="table-td">{{ it.sku_code }}</td>
                  <td class="table-td">{{ it.quantity }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiStateBlock>
      </div>

      <!-- Preview / create -->
      <div class="card h-fit p-5">
        <h3 class="mb-3 text-sm font-semibold text-foreground">Batch preview</h3>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-muted-foreground">Material</dt><dd class="font-medium">{{ activeMaterial.material_name }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted-foreground">Số item đã chọn</dt><dd class="font-medium">{{ selectedCount }}</dd></div>
        </dl>

        <div class="mt-4 space-y-3">
          <div>
            <label class="label">Priority</label>
            <select v-model="priority" class="input">
              <option v-for="p in PRIORITY_OPTIONS" :key="p" :value="p">{{ PRIORITY[p].label }}</option>
            </select>
          </div>
          <div>
            <label class="label">Due date</label>
            <input v-model="dueDate" type="date" class="input" />
          </div>
          <div>
            <label class="label">Ghi chú</label>
            <textarea v-model="note" rows="2" class="input" placeholder="Tuỳ chọn" />
          </div>
        </div>

        <button class="btn-primary mt-4 w-full" :disabled="selectedCount === 0 || creating" @click="createBatch">
          <UiSpinner v-if="creating" :size="16" />
          {{ creating ? 'Đang tạo…' : `CREATE BATCH (${selectedCount})` }}
        </button>
      </div>
    </div>
  </div>
</template>
