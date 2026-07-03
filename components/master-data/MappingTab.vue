<script setup lang="ts">
import { skusApi } from '~/services/api'
import type { Material, Sku } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{ skus: Sku[]; materials: Material[]; loading?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToastStore()

type FilterKey = 'all' | 'unmapped' | 'multi'
const filter = ref<FilterKey>('all')
const search = ref('')

function matCount(s: Sku) {
  return (s.materials ?? []).length
}
function materialNames(s: Sku): string[] {
  return (s.materials ?? []).map((m) => m.material?.name ?? m.material?.code ?? `#${m.material_id}`)
}

const unmapped = computed(() => props.skus.filter((s) => matCount(s) === 0))
const multi = computed(() => props.skus.filter((s) => matCount(s) > 1))

const filtered = computed(() => {
  let rows = props.skus
  if (filter.value === 'unmapped') rows = unmapped.value
  else if (filter.value === 'multi') rows = multi.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        materialNames(s).some((n) => n.toLowerCase().includes(q)),
    )
  }
  return rows
})

// Quick-edit mapping for one SKU.
const open = ref(false)
const editing = ref<Sku | null>(null)
const saving = ref(false)
const selectedMats = ref<number[]>([])

function openEdit(s: Sku) {
  editing.value = s
  selectedMats.value = (s.materials ?? []).map((m) => m.material_id)
  open.value = true
}
function toggleMat(id: number) {
  const i = selectedMats.value.indexOf(id)
  if (i >= 0) selectedMats.value.splice(i, 1)
  else selectedMats.value.push(id)
}

async function save() {
  if (!editing.value || saving.value) return
  saving.value = true
  try {
    await skusApi.update(editing.value.id, {
      materials: selectedMats.value.map((id) => ({ material_id: id, quantity_per_unit: 1 })),
    })
    toast.success('Đã cập nhật mapping nguyên vật liệu')
    open.value = false
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Summary -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        class="card p-4 text-left transition-colors hover:border-primary"
        :class="filter === 'all' ? 'border-primary ring-1 ring-ring/30' : ''"
        @click="filter = 'all'"
      >
        <p class="text-2xl font-semibold text-foreground">{{ skus.length }}</p>
        <p class="text-xs text-muted-foreground">Tổng SKU</p>
      </button>
      <button
        class="card p-4 text-left transition-colors hover:border-primary"
        :class="filter === 'unmapped' ? 'border-primary ring-1 ring-ring/30' : ''"
        @click="filter = 'unmapped'"
      >
        <p class="text-2xl font-semibold text-rose-600 dark:text-rose-400">{{ unmapped.length }}</p>
        <p class="text-xs text-muted-foreground">Chưa có nguyên vật liệu</p>
      </button>
      <button
        class="card p-4 text-left transition-colors hover:border-primary"
        :class="filter === 'multi' ? 'border-primary ring-1 ring-ring/30' : ''"
        @click="filter = 'multi'"
      >
        <p class="text-2xl font-semibold text-violet-600 dark:text-violet-400">{{ multi.length }}</p>
        <p class="text-xs text-muted-foreground">Nhiều nguyên vật liệu (combo)</p>
      </button>
    </div>

    <div class="card overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex gap-1 rounded-xl bg-muted p-1 text-sm">
          <button
            v-for="f in (['all', 'unmapped', 'multi'] as const)"
            :key="f"
            class="rounded-lg px-3 py-1.5 font-medium transition-colors"
            :class="filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="filter = f"
          >
            {{ f === 'all' ? 'Tất cả' : f === 'unmapped' ? 'Chưa map' : 'Nhiều NVL' }}
          </button>
        </div>
        <div class="relative sm:w-72">
          <UiIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input v-model="search" class="input pl-9" placeholder="Tìm SKU / nguyên vật liệu…" />
        </div>
      </div>

      <UiStateBlock :loading="loading" :empty="!loading && filtered.length === 0" empty-text="Không có SKU nào khớp bộ lọc.">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border">
            <thead class="bg-muted">
              <tr>
                <th class="table-th">SKU</th>
                <th class="table-th">Nguyên vật liệu đã map</th>
                <th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="s in filtered"
                :key="s.id"
                class="hover:bg-muted"
                :class="matCount(s) === 0 ? 'bg-rose-50/40 dark:bg-rose-500/5' : ''"
              >
                <td class="table-td">
                  <span class="font-mono text-xs font-medium text-foreground">{{ s.code }}</span>
                  <span class="block text-xs text-muted-foreground">{{ s.product_name || s.name }}</span>
                </td>
                <td class="table-td whitespace-normal">
                  <div v-if="matCount(s)" class="flex flex-wrap gap-1">
                    <span
                      v-for="n in materialNames(s)"
                      :key="n"
                      class="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
                    >
                      {{ n }}
                    </span>
                    <span v-if="matCount(s) > 1" class="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      {{ matCount(s) }} NVL
                    </span>
                  </div>
                  <span v-else class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                    <UiIcon name="alert" :size="12" /> Chưa có nguyên vật liệu
                  </span>
                </td>
                <td class="table-td text-right">
                  <button class="btn-secondary px-2.5 py-1 text-xs" @click="openEdit(s)">
                    <UiIcon name="link" :size="14" /> {{ matCount(s) ? 'Sửa mapping' : 'Gán NVL' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiStateBlock>
    </div>

    <UiModal v-model="open" :title="`Map nguyên vật liệu — ${editing?.code ?? ''}`">
      <div>
        <p class="mb-3 text-xs text-muted-foreground">
          Chọn nguyên vật liệu cho SKU này. Chọn nhiều = combo. Bỏ chọn hết để để trống (không tự đoán).
        </p>
        <div v-if="!materials.length" class="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          Chưa có nguyên vật liệu nào. Tạo material trước ở tab “Materials”.
        </div>
        <div v-else class="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          <label v-for="m in materials" :key="m.id" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              :checked="selectedMats.includes(m.id)"
              @change="toggleMat(m.id)"
            />
            <span class="text-sm text-foreground">{{ m.name }} <span class="text-xs text-muted-foreground">({{ m.code }})</span></span>
          </label>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="open = false">Huỷ</button>
        <button class="btn-primary" :disabled="saving" @click="save">
          <UiSpinner v-if="saving" :size="16" /> Lưu mapping
        </button>
      </template>
    </UiModal>
  </div>
</template>
