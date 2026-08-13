<script setup lang="ts">
import { materialsApi, skusApi, sellersApi } from '~/services/api'
import type { Material, Sku, Seller } from '~/types'
import { errorMessage } from '~/utils/api-error'
import { useToastStore } from '~/stores/toast'

// Master Data / SKU-NVL Setup. Single page with four tabs: Materials, SKUs,
// SKU → Material mapping and Seller. The catalog is loaded once here and shared
// with every tab so a create/import in one reflects across the others. Cả hai
// đường import Excel (định mức NVL, file vận hành cũ) đều là nút ngay trong tab
// sở hữu dữ liệu đó, không còn tab riêng.
const route = useRoute()
const router = useRouter()

type TabKey = 'materials' | 'skus' | 'mapping' | 'sellers'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'materials', label: 'Materials', icon: 'box' },
  { key: 'skus', label: 'SKUs', icon: 'orders' },
  { key: 'mapping', label: 'SKU → Material', icon: 'link' },
  { key: 'sellers', label: 'Seller', icon: 'users' },
]

const VALID: TabKey[] = ['materials', 'skus', 'mapping', 'sellers']
// ?tab=import là link cũ (tab import Excel vận hành) — đưa về tab SKUs, nơi chứa
// nút import bây giờ, thay vì rơi về Materials.
const requested = route.query.tab === 'import' ? 'skus' : (route.query.tab as TabKey)
const tab = ref<TabKey>(VALID.includes(requested) ? requested : 'materials')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }))

const materials = ref<Material[]>([])
const skus = ref<Sku[]>([])
const sellers = ref<Seller[]>([])
const loadingMaterials = ref(false)
const loadingSkus = ref(false)
const loadingSellers = ref(false)

async function loadMaterials() {
  loadingMaterials.value = true
  try {
    materials.value = (await materialsApi.list()).data ?? []
  } catch (e) {
    useToastStore().error(errorMessage(e))
  } finally {
    loadingMaterials.value = false
  }
}
async function loadSkus() {
  loadingSkus.value = true
  try {
    skus.value = (await skusApi.list()).data ?? []
  } catch (e) {
    useToastStore().error(errorMessage(e))
  } finally {
    loadingSkus.value = false
  }
}
async function loadSellers() {
  loadingSellers.value = true
  try {
    sellers.value = (await sellersApi.list()).data ?? []
  } catch (e) {
    useToastStore().error(errorMessage(e))
  } finally {
    loadingSellers.value = false
  }
}
function reloadAll() {
  loadMaterials()
  loadSkus()
  loadSellers()
}
onMounted(reloadAll)

// Targeted reloads: a change in one tab only refetches the list(s) it can
// actually affect, instead of re-downloading the whole catalog three times.
// Materials edits also refresh SKUs (mapping rows embed material data); the
// legacy import seeds both materials and SKUs.
function reloadMaterials() {
  loadMaterials()
  loadSkus()
}
function reloadSkus() {
  loadSkus()
}
function reloadSellers() {
  loadSellers()
}
function reloadImported() {
  loadMaterials()
  loadSkus()
}

const unmappedCount = computed(() => skus.value.filter((s) => !(s.materials && s.materials.length)).length)
</script>

<template>
  <div>
    <PageHeader
      title="Master Data / SKU–NVL Setup"
      subtitle="Khai báo nguyên vật liệu, SKU và mapping SKU → nguyên vật liệu — nền tảng để gom batch và import đơn"
    >
      <template #actions>
        <NuxtLink to="/import" class="btn-secondary"><UiIcon name="upload" :size="16" /> Import đơn</NuxtLink>
      </template>
    </PageHeader>

    <!-- Tabs -->
    <div class="mb-4 flex flex-wrap gap-1 border-b border-border">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="relative -mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors"
        :class="tab === t.key
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = t.key"
      >
        <UiIcon :name="t.icon" :size="16" />
        {{ t.label }}
        <span
          v-if="t.key === 'mapping' && unmappedCount > 0"
          class="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
        >
          {{ unmappedCount }}
        </span>
      </button>
    </div>

    <MasterDataMaterialsTab
      v-if="tab === 'materials'"
      :materials="materials"
      :skus="skus"
      :loading="loadingMaterials"
      @changed="reloadMaterials"
    />
    <MasterDataSkusTab
      v-else-if="tab === 'skus'"
      :skus="skus"
      :materials="materials"
      :loading="loadingSkus"
      @changed="reloadSkus"
      @imported="reloadImported"
    />
    <MasterDataMappingTab
      v-else-if="tab === 'mapping'"
      :skus="skus"
      :materials="materials"
      :loading="loadingSkus"
      @changed="reloadSkus"
    />
    <MasterDataSellersTab
      v-else
      :sellers="sellers"
      :loading="loadingSellers"
      @changed="reloadSellers"
    />
  </div>
</template>
