/* =============================================================================
 * Service worker — BGDecor Fulfillment
 *
 * Mục đích chính: đủ điều kiện "installable" của Chrome/Edge (manifest + SW có
 * fetch handler) để Android hiện được nút "Cài ứng dụng", và giữ app mở được
 * khi mạng chập chờn ở xưởng.
 *
 * Chiến lược — cố tình tối giản để KHÔNG bao giờ phục vụ dữ liệu cũ:
 *   - /api/*            → luôn ra mạng, không cache (dữ liệu vận hành).
 *   - điều hướng (HTML) → network-first; offline mới lấy app shell trong cache.
 *   - /_nuxt/* & ảnh    → cache-first (tên file có hash nên không thể stale).
 *   - còn lại           → ra mạng.
 *
 * Đổi CACHE_VERSION khi muốn ép mọi máy xoá cache cũ.
 * ========================================================================== */
const CACHE_VERSION = 'v1'
const SHELL_CACHE = `ffm-shell-${CACHE_VERSION}`
const ASSET_CACHE = `ffm-assets-${CACHE_VERSION}`
// Mỗi lần deploy sinh tên file /_nuxt/* mới nên cache tài nguyên chỉ phình lên.
// Giữ tối đa ngần này entry, cũ nhất bị loại trước (Cache API trả key theo đúng
// thứ tự đã ghi).
const ASSET_CACHE_LIMIT = 150

// App shell: SPA nên mọi route đều dựng từ "/" — cache đúng nó là đủ để mở
// offline. Icon nằm cùng để màn hình offline không bị vỡ ảnh.
const SHELL_URLS = ['/', '/offline.html', '/pwa-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll() fail-all nếu một URL lỗi → thêm từng cái, hỏng cái nào bỏ cái đó.
      .then((cache) => Promise.all(SHELL_URLS.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function putCapped(cacheName, req, res) {
  const cache = await caches.open(cacheName)
  await cache.put(req, res)
  const keys = await cache.keys()
  const excess = keys.length - ASSET_CACHE_LIMIT
  for (let i = 0; i < excess; i++) await cache.delete(keys[i])
}

// Cho phép trang chủ động ép SW mới lên ngay (dùng ở plugins/pwa.client.ts).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Chỉ can thiệp same-origin; bỏ qua API và mọi thứ của backend.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return

  // --- Điều hướng: network-first, offline mới dùng app shell ---
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {})
          return res
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match('/')) || (await cache.match('/offline.html')) || Response.error()
        }),
    )
    return
  }

  // --- Tài nguyên build (tên có hash) + ảnh tĩnh: cache-first ---
  const isHashedAsset = url.pathname.startsWith('/_nuxt/')
  const isStaticImg = /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)
  if (isHashedAsset || isStaticImg) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              void putCapped(ASSET_CACHE, req, res.clone()).catch(() => {})
            }
            return res
          }),
      ),
    )
  }
})
