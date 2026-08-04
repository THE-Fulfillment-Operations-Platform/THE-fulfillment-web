import { actionCountsApi } from '~/services/api'
import { useAuthStore } from '~/stores/auth'

// Pull-based "work waiting for you" counters that drive the sidebar badges, so
// actionable queues (orders to review, cancellations to resolve, notes flagged
// for attention) are visible without opening each screen.
//
// MỘT request cho cả ba con số (server gộp thành 1 câu SQL). Bản cũ gọi 4
// endpoint list — mỗi cái chạy COUNT + SELECT và chiếm một kết nối DB — nên chỉ
// vẽ 3 con số mà tốn 4 request / 8 câu lệnh, lặp lại mỗi lần đổi tab.
//
// ---------------------------------------------------------------------------
// State đặt ở CẤP MODULE, không phải bên trong hàm.
//
// Bản cũ tạo `reactive({...})` mới mỗi lần gọi useActionCounts(), nên mỗi màn có
// một bộ số riêng và không màn nào chạm được vào bộ số của sidebar. Hệ quả: duyệt
// hết đơn xong badge "Chờ duyệt 3" vẫn đứng nguyên tới lần poll sau (90 giây) hoặc
// tới khi F5 — người dùng đọc ra là hệ thống chưa ghi nhận việc mình vừa làm.
//
// Giờ chỉ có MỘT bộ số cho cả app, và refreshActionCounts() gọi được từ bất kỳ
// đâu — kể cả trong một event handler, không cần lifecycle hook.
// ---------------------------------------------------------------------------

// Chỉ poll khi tab ĐANG được xem, và khi đó thì poll dày hơn.
//
// Bản cũ bắn 90 giây một lần bất kể tab có được nhìn hay không — một tab bỏ quên
// cả buổi vẫn đều đặn gọi API. Dừng hẳn khi tab ẩn giải phóng đủ ngân sách để hạ
// xuống 30 giây khi đang xem: nhanh gấp 3 mà TỔNG số request còn ÍT hơn trước.
// Đáng kể vì pooler Supabase chỉ cho 15 kết nối dùng chung cho mọi app.
const POLL_INTERVAL_MS = 30 * 1000
// Quay lại tab / đổi route bắn tín hiệu liên tục; không nạp lại nếu vừa nạp xong
// trong khoảng này. Thao tác của người dùng thì luôn force nên không bị chặn.
const MIN_REFRESH_GAP_MS = 10 * 1000

// Các route có badge — mở màn nào thì nạp lại số của màn đó cho khớp danh sách.
const BADGE_PATHS = new Set(['/review', '/cancellations', '/notes'])

const counts = reactive({ review: 0, cancellations: 0, notes: 0 })
let lastRefreshAt = 0
let inFlight: Promise<void> | null = null

// Đếm số component đang dùng, để timer/listener chỉ dựng một lần và được dọn khi
// consumer cuối cùng unmount (sidebar sống suốt phiên, nhưng HMR trong dev thì
// mount/unmount liên tục — không đếm là mỗi lần sửa file lại thêm một timer).
let subscribers = 0
let timer: ReturnType<typeof setInterval> | null = null

// ---- Đồng bộ giữa các tab --------------------------------------------------
// Một người mở 2–3 tab là chuyện thường (danh sách một bên, chi tiết một bên).
// Duyệt đơn ở tab A thì tab B phải đổi theo — nhưng KHÔNG cần tab B gọi API:
// tab A phát luôn con số nó vừa nhận được. Đồng bộ tức thì, 0 chi phí server.
const CHANNEL_NAME = 'action-counts'
type Snapshot = { review: number; cancellations: number; notes: number }
let channel: BroadcastChannel | null = null

function applySnapshot(s: Snapshot) {
  counts.review = s.review
  counts.cancellations = s.cancellations
  counts.notes = s.notes
}

function openChannel() {
  // Safari cũ / môi trường không có BroadcastChannel: bỏ qua, poll vẫn chạy.
  if (channel || typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (ev: MessageEvent<Snapshot>) => {
    const s = ev.data
    if (!s || typeof s.review !== 'number') return
    applySnapshot(s)
    // Coi như vừa nạp: tab này không cần gọi API nữa trong cửa sổ chống dội.
    lastRefreshAt = Date.now()
  }
}

function closeChannel() {
  channel?.close()
  channel = null
}

// Cũng phải ở cấp module: nếu tạo mới trong mỗi useActionCounts() thì instance
// unmount sau sẽ gọi removeEventListener với một hàm KHÁC hàm đã add, và listener
// thật ở lại vĩnh viễn.
const onVisible = () => {
  if (document.visibilityState === 'visible') {
    // Quay lại tab: nạp ngay cho tươi, rồi bật lại nhịp poll.
    void refreshActionCounts(false)
    startTimer()
  } else {
    stopTimer()
  }
}

function startTimer() {
  if (timer) return
  timer = setInterval(() => void refreshActionCounts(), POLL_INTERVAL_MS)
}

function stopTimer() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

/**
 * Nạp lại ba con số badge.
 *
 * `force` bỏ qua cửa sổ chống dội. Sau một thao tác của người dùng thì LUÔN
 * force: đó chính là lúc con số vừa đổi, và đây là thứ mà "vừa duyệt xong badge
 * đã hết" phụ thuộc vào.
 */
export async function refreshActionCounts(force = true): Promise<void> {
  // Hàm này được gọi từ trong event handler của các thao tác chính (duyệt đơn,
  // xử lý yêu cầu huỷ, QC fail…). Badge chỉ là thông tin phụ, nên KHÔNG được
  // phép làm vỡ thao tác chính: kể cả khi không lấy được store thì cũng chỉ
  // im lặng bỏ qua.
  let auth: ReturnType<typeof useAuthStore>
  try {
    auth = useAuthStore()
  } catch {
    return
  }
  if (!auth.isAuthenticated || auth.isSeller) {
    // Đăng xuất rồi thì xoá số, không để người đăng nhập sau thấy hàng đợi của
    // người trước nhấp nháy một nhịp.
    counts.review = 0
    counts.cancellations = 0
    counts.notes = 0
    return
  }
  const now = Date.now()
  if (!force && now - lastRefreshAt < MIN_REFRESH_GAP_MS) return
  // Gộp các lời gọi chồng nhau (đổi tab liên tục, hoặc duyệt hàng loạt) vào cùng
  // một request.
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { data } = await actionCountsApi.get()
      if (data) {
        // Giữ giá trị cũ khi lỗi, không nháy về 0.
        applySnapshot(data)
        // Phát cho các tab khác của cùng người dùng — họ khỏi phải gọi API.
        channel?.postMessage({
          review: data.review,
          cancellations: data.cancellations,
          notes: data.notes,
        } satisfies Snapshot)
      }
      lastRefreshAt = Date.now()
    } catch {
      /* badge là thông tin phụ — im lặng, giữ số cũ */
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function countForPath(path: string): number {
  if (path === '/review') return counts.review
  if (path === '/cancellations') return counts.cancellations
  if (path === '/notes') return counts.notes
  return 0
}

/**
 * Dùng ở component cần ĐỌC badge (sidebar). Màn chỉ cần bắn tín hiệu sau một
 * thao tác thì gọi thẳng refreshActionCounts(), không cần hook này.
 */
export function useActionCounts() {
  const route = useRoute()

  // Mở màn có badge thì nạp lại ngay, để con số trên sidebar và danh sách trên
  // màn không bao giờ nói hai điều khác nhau — đúng tình huống "danh sách rỗng mà
  // badge vẫn còn số".
  watch(
    () => route.path,
    (path) => {
      if (BADGE_PATHS.has(path)) void refreshActionCounts(false)
    },
  )

  onMounted(() => {
    subscribers++
    void refreshActionCounts()
    if (subscribers === 1) {
      openChannel()
      document.addEventListener('visibilitychange', onVisible)
      // Chỉ chạy nhịp poll khi tab đang được xem.
      if (document.visibilityState === 'visible') startTimer()
    }
  })
  onBeforeUnmount(() => {
    subscribers--
    if (subscribers <= 0) {
      subscribers = 0
      stopTimer()
      closeChannel()
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  return { counts, countForPath, refresh: refreshActionCounts }
}
