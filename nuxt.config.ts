// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  // Internal ops dashboard behind JWT login — SPA mode keeps token/localStorage
  // handling simple and avoids SSR hydration concerns for an authenticated tool.
  ssr: false,
  // Tắt Nuxt DevTools trong dev: overlay + client plugin của devtools làm nặng
  // HMR/reload rõ rệt. Bật lại (enabled: true) khi cần debug bằng devtools.
  devtools: { enabled: false },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'BGDecor Fulfillment',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'BGDecor Fulfillment Operations Platform' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
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
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'http://localhost:8090',
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
