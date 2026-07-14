import { computed, ref } from 'vue'

/**
 * Row-selection state for data tables (checkbox chọn nhiều dòng để thao tác hàng loạt).
 *
 * Pass a getter for the CURRENTLY VISIBLE rows (after search/filter) — the header
 * "select all" checkbox operates on exactly those rows, so ticking it never picks
 * up rows the user can't see. Selection survives filtering: switching the search
 * keeps previously-ticked ids selected even when they scroll out of view.
 *
 *   const sel = useSelection(() => filtered.value)
 *   sel.toggle(id) / sel.toggleAll() / sel.clear() / sel.isSelected(id)
 *   sel.selectedIds.value  // number[] to feed a bulk API loop
 */
export function useSelection<T extends { id: number }>(visibleRows: () => T[]) {
  // A fresh Set is assigned on every mutation so the ref reliably re-triggers.
  const selected = ref<Set<number>>(new Set())

  const selectedIds = computed(() => Array.from(selected.value))
  const count = computed(() => selected.value.size)

  function isSelected(id: number) {
    return selected.value.has(id)
  }
  function toggle(id: number) {
    const next = new Set(selected.value)
    next.has(id) ? next.delete(id) : next.add(id)
    selected.value = next
  }

  const allSelected = computed(() => {
    const rows = visibleRows()
    return rows.length > 0 && rows.every((r) => selected.value.has(r.id))
  })
  const someSelected = computed(() => {
    const rows = visibleRows()
    return rows.some((r) => selected.value.has(r.id)) && !allSelected.value
  })
  function toggleAll() {
    const rows = visibleRows()
    const next = new Set(selected.value)
    if (rows.every((r) => next.has(r.id))) {
      for (const r of rows) next.delete(r.id)
    } else {
      for (const r of rows) next.add(r.id)
    }
    selected.value = next
  }

  function clear() {
    if (selected.value.size) selected.value = new Set()
  }

  return { selected, selectedIds, count, isSelected, toggle, allSelected, someSelected, toggleAll, clear }
}
