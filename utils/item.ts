import type { OrderItem } from '~/types'

/** Resolve the parent order id from either the flat field or nested order. */
export function itemOrderId(it: OrderItem): number | undefined {
  return it.order_id ?? it.order?.id
}

export function itemStoreOrderId(it: OrderItem): string {
  return it.store_order_id ?? it.order?.store_order_id ?? '—'
}

/** True when this item's StoreOrderID is shared by more than one order (a repeated
 *  store order id worth flagging), as computed by the backend list endpoints. */
export function itemStoreOrderDup(it: OrderItem): boolean {
  return it.store_order_dup ?? it.order?.store_order_dup ?? false
}

export function itemMaterial(it: OrderItem): string {
  if (it.material_name) return it.material_name
  if (it.material_code) return it.material_code
  const codes = (it.batch_items ?? [])
    .map((b) => b.material_code || b.material?.code)
    .filter(Boolean)
  if (codes.length) return Array.from(new Set(codes)).join(' + ')
  return '—'
}

/** Short label for the batch column (e.g. "#101001" or "2 batches"). */
export function itemBatchLabel(it: OrderItem): string {
  const batches = it.batch_items ?? []
  if (!batches.length) return '—'
  if (batches.length === 1) return batches[0].batch_code || '#' + (batches[0].batch_id ?? '')
  return `${batches.length} batches`
}
