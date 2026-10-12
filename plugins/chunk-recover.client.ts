// Tự cứu khi máy đang chạy bản web CŨ sau một lần deploy.
//
// Mỗi bản build sinh tên file /_nuxt/*.js mới (có hash) và bản cũ bị xoá khỏi
// server. Máy nào đang mở sẵn tab / app đã cài (hoặc bị service worker trả về
// index.html cũ khi mạng chập chờn) vẫn trỏ tới tên file cũ → tải trang con
// (vd /batches/new) hụt → vue-router báo `Couldn't resolve component "default"`
// và hiện trang 500. Cơ chế reload có sẵn của Nuxt chỉ bắt lỗi preload của Vite
// nên KHÔNG bắt trường hợp này.
//
// Ở đây: gặp lỗi tải chunk khi chuyển trang → tải lại thẳng trang đó (lấy bản
// mới). Chặn lặp: tối đa 1 lần / 30 giây, để lỗi thật không kẹt vòng reload.
const CHUNK_ERROR = /Couldn't resolve component|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
const KEY = 'ffm:chunk-reload-at'

function canReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // sessionStorage bị chặn: vẫn cho reload một lần, rủi ro lặp chấp nhận được.
  }
  return true
}

export default defineNuxtPlugin(() => {
  const router = useRouter()

  router.onError((error, to) => {
    const msg = error instanceof Error ? error.message : String(error)
    if (CHUNK_ERROR.test(msg) && canReload()) {
      window.location.assign(to.fullPath)
    }
  })

  // Lỗi preload của Vite (module/CSS) cũng cùng nguyên nhân.
  window.addEventListener('vite:preloadError', () => {
    if (canReload()) window.location.reload()
  })
})
