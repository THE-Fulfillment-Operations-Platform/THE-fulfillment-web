// mapPool runs an async fn over items with BOUNDED concurrency and never rejects.
// Used by bulk actions (xoá/ẩn hàng loạt): the catalog has no bulk endpoint, so we
// fan out single-item calls a few at a time and summarise partial success instead
// of failing the whole batch on the first error.
export async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
): Promise<{ ok: number; fail: number }> {
  let ok = 0
  let fail = 0
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      try {
        await fn(item)
        ok++
      } catch {
        fail++
      }
    }
  })
  await Promise.all(workers)
  return { ok, fail }
}
