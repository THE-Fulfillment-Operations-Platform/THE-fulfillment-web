// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  // Internal ops dashboard behind JWT login — SPA mode keeps token/localStorage
  // handling simple and avoids SSR hydration concerns for an authenticated tool.
  ssr: false,
  // Tắt Nuxt DevTools trong dev: overlay + client plugin của devtools làm nặng
  // HMR/reload rõ rệt. Bật lại (enabled: true) khi cần debug bằng devtools.
  devtools: { enabled: false },

  // Port dev cố định 3001 (backend giữ 8081). Đặt ở đây — không chỉ ở cờ
  // --port trong package.json — để `nuxt dev` chạy trần cũng ra đúng port.
  devServer: { port: 3001 },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  // BẮT BUỘC giữ nguyên — nếu bỏ, dev server rơi vào vòng lặp vô tận và ngốn
  // 100% CPU liên tục (mỗi lần reload trang mất 9–15 giây).
  //
  // Vòng lặp: @nuxtjs/tailwindcss móc `pages:extend` → gọi lại loadConfigs() +
  // updateTemplates() → Nuxt bắn `app:templates` → resolvePagesRoutes() →
  // `pages:extend` → lặp lại mãi. Mỗi vòng quét lại toàn bộ pages/ và deep-merge
  // lại config Tailwind bằng defu (~60% CPU) nên event loop của Node bị đói,
  // MỌI request dev (kể cả file tĩnh) phải xếp hàng vài giây.
  //
  // - strictScanContentPaths: đổi handler `pages:extend` sang nhánh chỉ nạp lại
  //   khi SỐ file page/component đổi → vòng lặp đứt sau lần đầu.
  // - viewer: tắt tailwind-config-viewer (/_tailwind/) — không dùng, chỉ tốn RAM.
  tailwindcss: {
    experimental: { strictScanContentPaths: true },
    viewer: false,
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'BGDecor Fulfillment',
      meta: [
        { charset: 'utf-8' },
        // viewport-fit=cover: khi chạy dạng app đã cài (standalone) trên iPhone
        // tai thỏ, nội dung mới phủ hết màn hình thay vì chừa 2 dải đen.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'BGDecor Fulfillment Operations Platform' },
        // --- PWA ---
        { name: 'theme-color', content: '#4e5fa8' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        // iOS chưa đọc manifest: 3 thẻ apple-* dưới đây mới là thứ quyết định
        // app mở toàn màn hình (không thanh địa chỉ) và tên hiện dưới icon.
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'BGDecor FFM' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      htmlAttrs: { lang: 'vi' },
      // No-flash theme boot: runs synchronously in <head> before first paint, so
      // the saved (or system-preferred) theme is applied before the app mounts.
      script: [
        {
          innerHTML:
            "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme:dark)').matches;var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();",
          tagPosition: 'head',
        },
      ],
    },
  },

  runtimeConfig: {
    public: {
      // Base URL of the Go/Gin backend. Business routes use the /api prefix.
      // Empty string ⇒ same-origin (relative) requests, so one build runs behind
      // any host — LAN IP, Cloudflare tunnel, real domain — with no per-origin
      // rebuild. Nullish coalescing (not ||) so an explicit "" is preserved and
      // only an UNSET var falls back to the dev default.
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8090',

      // Địa chỉ CÔNG KHAI của hệ thống, dùng cho những thứ rời khỏi trình duyệt:
      // mã QR cài app và tờ QR in dán ở xưởng (/install). Cố tình KHÔNG lấy
      // window.location.origin — in từ máy dev sẽ ra http://localhost:3001 và
      // điện thoại quét vào không tới đâu. Đổi bằng NUXT_PUBLIC_APP_BASE_URL
      // lúc build nếu domain thay đổi.
      appBaseUrl: process.env.NUXT_PUBLIC_APP_BASE_URL ?? 'https://fulfillment.bacgiangdecor.com',
    },
  },

  // Dev-server performance: pre-bundle runtime deps and warm up first-party
  // files so Vite serves already-transformed modules on first load. This cuts
  // the per-file latency that shows up as a slow full-reload in dev.
  vite: {
    optimizeDeps: {
      include: ['pinia'],
    },
    server: {
      warmup: {
        clientFiles: [
          './pages/**/*.vue',
          './components/**/*.vue',
          './layouts/**/*.vue',
        ],
      },
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
    // The generated tsconfig sets `types: []`; re-add Node types so `process.env`
    // (used above) and other Node globals resolve during `nuxt typecheck`.
    tsConfig: {
      compilerOptions: {
        types: ['node'],
      },
    },
  },
})
