import { defineStore } from 'pinia'
import { chatApi, chatSocketUrl } from '~/services/api/chat'
import { useAuthStore } from '~/stores/auth'
import type { ChatConfig, ChatConversation, ChatMessage, ChatReaction } from '~/types/chat'
import { convTitle, messagePreview } from '~/utils/chat'

// ---------------------------------------------------------------------------
// Chat nội bộ — MỘT store và MỘT WebSocket cho cả app: bong bóng nổi, ô chat
// nhỏ và trang Tin nhắn đầy đủ đều đọc chung ở đây.
//
// plugins/chat.client.ts gọi start() khi đăng nhập, stop() khi đăng xuất. API
// trả 403 cho tài khoản chưa được mở chat (seller, vai trò ngoài CHAT_ROLES) →
// enabled=false, không mở WebSocket, giao diện ẩn hẳn.
//
// Tin đi bằng REST (client_id để gửi lại không ra hai tin; file tải lên trước
// rồi gửi kèm id), tin về bằng WebSocket: message.new / message.updated (sửa,
// thu hồi) / reaction / read (đã xem) / typing / presence / conversation.* /
// pin. Rớt WebSocket: tự nối lại (lùi dần 1s → 30s); mỗi lần thử lại và mỗi lần
// nối được đều kéo bù danh sách cuộc + tin mới của cuộc đang mở qua REST.
// ---------------------------------------------------------------------------

type WsState = 'idle' | 'connecting' | 'open' | 'closed'

// Đối tượng WebSocket / timer để ở cấp module: không phải state cần phản ứng,
// và chỉ được có MỘT bản cho cả app.
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let watchdogTimer: ReturnType<typeof setInterval> | null = null
let typingTimer: ReturnType<typeof setInterval> | null = null
let backoff = 1000
let lastFrameAt = 0
let wanted = false
let tempSeq = 0
const readTimers = new Map<number, ReturnType<typeof setTimeout>>()
const typingSentAt = new Map<number, number>()
let audioCtx: AudioContext | null = null
/** Mở một cuộc từ thông báo trình duyệt (plugin gắn router vào đây). */
let openFromNotification: ((convId: number) => void) | null = null

const MUTE_KEY = 'ffm.chat.muted'
const NOTIFY_KEY = 'ffm.chat.notify'

export function setChatNotificationOpener(fn: (convId: number) => void) {
  openFromNotification = fn
}

/** Mở khoá âm thanh sau cú bấm đầu tiên của người dùng (luật autoplay của trình duyệt). */
export function unlockChatAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (Ctx) audioCtx = new Ctx()
    }
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume()
  } catch {
    /* không có âm thanh thì thôi */
  }
}

/** Số lần đã phát âm báo (để kiểm thử tự động đọc được qua window.__ffmChatDings). */
let dings = 0

/** Âm báo nhẹ: hai nốt ngắn, nhỏ tiếng. */
function playDing() {
  dings++
  ;(window as any).__ffmChatDings = dings
  try {
    unlockChatAudio()
    const ctx = audioCtx
    if (!ctx || ctx.state !== 'running') return
    const t0 = ctx.currentTime
    ;[880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const s = t0 + i * 0.12
      g.gain.setValueAtTime(0.0001, s)
      g.gain.exponentialRampToValueAtTime(0.08, s + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22)
      o.connect(g).connect(ctx.destination)
      o.start(s)
      o.stop(s + 0.25)
    })
  } catch {
    /* bỏ qua */
  }
}

function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function writeFlag(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* chế độ riêng tư: không lưu được thì thôi */
  }
}

export interface SendOptions {
  replyTo?: ChatMessage | null
  files?: File[]
}

interface State {
  enabled: boolean
  config: ChatConfig | null
  conversations: ChatConversation[]
  listLoaded: boolean
  messages: Record<number, ChatMessage[]>
  hasMore: Record<number, boolean>
  /** Cuộc đang mở trên màn hình (trang đầy đủ hoặc ô chat nhỏ); null nếu không. */
  activeId: number | null
  wsState: WsState
  /** Ai đang soạn: cuộc → người → hết hạn (ms). */
  typing: Record<number, Record<number, number>>
  /** Nhịp đồng hồ cho "đang soạn" / "hoạt động X phút trước". */
  tick: number
  online: Record<number, boolean>
  lastSeen: Record<number, string>
  /** Tắt âm báo (lưu trên máy). */
  muted: boolean
  /** Bật thông báo trình duyệt (lưu trên máy; quyền do trình duyệt giữ). */
  notify: boolean
  /** Đang ở trang Tin nhắn đầy đủ (plugin cập nhật theo route). */
  onChatPage: boolean
  /** Tin cần cuộn tới + nháy sáng (từ kết quả tìm kiếm). */
  highlight: { convId: number; id: number } | null
}

export const useChatStore = defineStore('chat', {
  state: (): State => ({
    enabled: false,
    config: null,
    conversations: [],
    listLoaded: false,
    messages: {},
    hasMore: {},
    activeId: null,
    wsState: 'idle',
    typing: {},
    tick: Date.now(),
    online: {},
    lastSeen: {},
    muted: false,
    notify: false,
    onChatPage: false,
    highlight: null,
  }),

  getters: {
    me(): number {
      return useAuthStore().user?.id ?? 0
    },
    /** Tổng tin chưa đọc — số trên menu và trên bong bóng. */
    totalUnread: (s): number => s.conversations.reduce((n, c) => n + (c.unread || 0), 0),
    byId: (s) => (id: number) => s.conversations.find((c) => c.id === id),
    reactionSet: (s): string[] =>
      s.config?.reactions?.length ? s.config.reactions : ['👍', '❤️', '😂', '😮', '😢', '🙏'],
    editMinutes: (s): number => s.config?.edit_minutes || 15,
    filesEnabled: (s): boolean => !!s.config?.files,
    fileMaxBytes: (s): number => s.config?.file_max_bytes || 20 * 1024 * 1024,
    notifySupported: (): boolean => typeof window !== 'undefined' && 'Notification' in window,
    /** Tên những người đang soạn trong cuộc (trừ mình). */
    typingNames(s) {
      return (convId: number): string[] => {
        const now = s.tick
        const conv = s.conversations.find((c) => c.id === convId)
        const map = s.typing[convId] || {}
        return Object.entries(map)
          .filter(([, exp]) => exp > now)
          .map(([uid]) => conv?.members.find((m) => m.id === Number(uid))?.full_name || 'Ai đó')
      }
    },
  },

  actions: {
    // ---------------- vòng đời ----------------

    async start() {
      wanted = true
      try {
        const { data } = await chatApi.config()
        this.config = data
        this.enabled = !!data?.enabled
      } catch {
        this.enabled = false // 403: chat chưa mở cho tài khoản này
      }
      if (!this.enabled || !wanted) return
      this.muted = readFlag(MUTE_KEY)
      this.notify = readFlag(NOTIFY_KEY) && this.notifySupported && Notification.permission === 'granted'
      void this.connect()
      if (!watchdogTimer) {
        // WebSocket im quá lâu (mạng chết mà trình duyệt chưa biết): cắt để nối lại.
        // Cùng nhịp đó làm mới "hoạt động X phút trước".
        watchdogTimer = setInterval(() => {
          if (socket && this.wsState === 'open' && Date.now() - lastFrameAt > 75_000) socket.close()
          this.tick = Date.now()
        }, 15_000)
      }
    },

    stop() {
      wanted = false
      this.disconnect()
      if (watchdogTimer) clearInterval(watchdogTimer)
      watchdogTimer = null
      if (typingTimer) clearInterval(typingTimer)
      typingTimer = null
      readTimers.forEach((t) => clearTimeout(t))
      readTimers.clear()
      typingSentAt.clear()
      this.$reset()
    },

    // ---------------- WebSocket ----------------

    async connect() {
      if (!wanted || !this.enabled) return
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
      this.wsState = 'connecting'
      let ticket = ''
      try {
        ticket = (await chatApi.ticket()).data.ticket
      } catch {
        this.scheduleReconnect()
        return
      }
      if (!wanted || socket) return
      const ws = new WebSocket(chatSocketUrl(ticket))
      socket = ws
      ws.onopen = () => {
        if (socket !== ws) return
        this.wsState = 'open'
        backoff = 1000
        lastFrameAt = Date.now()
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}')
        }, 25_000)
      }
      ws.onmessage = (ev) => {
        lastFrameAt = Date.now()
        try {
          this.handleEvent(JSON.parse(ev.data))
        } catch {
          /* khung lạ: bỏ qua */
        }
      }
      ws.onclose = () => {
        if (socket !== ws) return
        socket = null
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        heartbeatTimer = null
        this.scheduleReconnect()
      }
    },

    disconnect() {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = null
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = null
      const ws = socket
      socket = null
      ws?.close()
      this.wsState = 'idle'
    },

    scheduleReconnect() {
      this.wsState = 'closed'
      if (!wanted || reconnectTimer) return
      const wait = backoff
      backoff = Math.min(backoff * 2, 30_000)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        // Trong lúc chưa nối lại được: vẫn kéo tin qua REST để không lỡ.
        void this.catchUp()
        void this.connect()
      }, wait)
    },

    /** Mạng có lại / quay lại tab: nối lại ngay, không chờ hết lượt lùi. */
    reconnectNow() {
      if (!wanted || !this.enabled) return
      if (socket && socket.readyState === WebSocket.OPEN) return
      backoff = 1000
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = null
      void this.catchUp()
      void this.connect()
    },

    handleEvent(ev: Record<string, any>) {
      switch (ev.type) {
        case 'hello':
          // Vừa nối (lại): kéo bù những gì lỡ trong lúc mất kết nối.
          void this.catchUp()
          void this.loadPresence()
          break
        case 'message.new':
          this.onMessage(ev.message as ChatMessage, true)
          break
        case 'message.updated':
          this.onUpdated(ev.message as ChatMessage)
          break
        case 'reaction':
          this.setReactions(ev.conversation_id, ev.message_id, ev.reactions || [])
          break
        case 'read':
          if (!ev.user_id || ev.user_id === this.me) this.onRead(ev.conversation_id, ev.message_id)
          else this.onPeerRead(ev.conversation_id, ev.user_id, ev.message_id, ev.read_at)
          break
        case 'typing':
          this.onTyping(ev.conversation_id, ev.user_id)
          break
        case 'presence':
          this.online = { ...this.online, [ev.user_id]: !!ev.online }
          if (ev.last_seen_at) this.lastSeen = { ...this.lastSeen, [ev.user_id]: ev.last_seen_at }
          break
        case 'conversation.updated':
          void this.refreshConversation(ev.conversation_id)
          break
        case 'conversation.removed':
          this.dropConversation(ev.conversation_id)
          break
        case 'pin': {
          const c = this.byId(ev.conversation_id)
          if (c) {
            c.pinned_at = ev.pinned_at || null
            this.sortConversations()
          }
          break
        }
      }
    },

    // ---------------- dữ liệu ----------------

    async loadConversations() {
      try {
        const { data } = await chatApi.conversations()
        this.conversations = data || []
        this.sortConversations()
        this.listLoaded = true
      } catch {
        /* giữ danh sách cũ */
      }
    },

    async loadPresence() {
      try {
        const { data } = await chatApi.presence()
        const online: Record<number, boolean> = {}
        for (const id of data.online || []) online[id] = true
        const seen: Record<number, string> = {}
        for (const [k, v] of Object.entries(data.last_seen || {})) seen[Number(k)] = v
        this.online = online
        this.lastSeen = seen
      } catch {
        /* không có thì thôi */
      }
    },

    async refreshConversation(id: number) {
      try {
        const { data } = await chatApi.conversation(id)
        this.upsertConversation(data)
      } catch (e: any) {
        // 404: mình không còn ở trong cuộc này nữa.
        if (e?.status === 404) this.dropConversation(id)
      }
    },

    upsertConversation(c: ChatConversation) {
      const i = this.conversations.findIndex((x) => x.id === c.id)
      if (i >= 0) this.conversations.splice(i, 1, c)
      else this.conversations.unshift(c)
      this.sortConversations()
    },

    dropConversation(id: number) {
      this.conversations = this.conversations.filter((c) => c.id !== id)
      const rest = { ...this.messages }
      delete rest[id]
      this.messages = rest
      if (this.activeId === id) this.activeId = null
    },

    /** Cuộc ghim trước (ghim sau lên trên), rồi cuộc có tin mới nhất. */
    sortConversations() {
      this.conversations.sort((a, b) => {
        const pa = a.pinned_at || ''
        const pb = b.pinned_at || ''
        if (!!pa !== !!pb) return pa ? -1 : 1
        if (pa !== pb) return pb.localeCompare(pa)
        return (b.last_message_at || '').localeCompare(a.last_message_at || '')
      })
    },

    /**
     * Kéo bù sau khi (nối lại) WebSocket: danh sách cuộc, tin mới nhất của cuộc
     * đang mở. Tin đã tải của các cuộc khác bỏ đi, mở lại thì tải mới.
     */
    async catchUp() {
      await this.loadConversations()
      const id = this.activeId
      const keep: Record<number, ChatMessage[]> = {}
      if (id && this.messages[id]) keep[id] = this.messages[id]
      this.messages = keep
      if (id) await this.syncLatest(id)
    },

    /**
     * Tải trang tin mới nhất và gộp vào danh sách đang có. Lỡ nhiều tin tới mức
     * trang mới không nối liền với danh sách cũ thì thay hẳn (cuộn lên để tải tiếp).
     */
    async syncLatest(id: number) {
      try {
        const { data } = await chatApi.messages(id, {})
        const list = this.messages[id]
        const real = (list || []).filter((m) => m.id > 0)
        const lastOld = real.length ? real[real.length - 1].id : 0
        const firstNew = data.messages.length ? data.messages[0].id : 0
        if (!list || (data.has_more && lastOld > 0 && firstNew > lastOld)) {
          const pending = (list || []).filter((m) => m.id < 0)
          this.messages = { ...this.messages, [id]: [...data.messages, ...pending] }
          this.hasMore = { ...this.hasMore, [id]: data.has_more }
        } else {
          // Tin đã có thì thay bản mới (có thể đã sửa / thu hồi / thêm cảm xúc).
          for (const m of data.messages) this.mergeMessage(m)
        }
        this.maybeMarkRead(id)
      } catch {
        /* thử lại lượt sau */
      }
    },

    /** Mở một cuộc trên màn hình: tải tin và tính là đã đọc. */
    async openConversation(id: number) {
      this.activeId = id
      if (!this.messages[id]) {
        const { data } = await chatApi.messages(id, {})
        this.messages = { ...this.messages, [id]: data.messages }
        this.hasMore = { ...this.hasMore, [id]: data.has_more }
        this.maybeMarkRead(id)
      } else {
        await this.syncLatest(id)
      }
    },

    async loadOlder(id: number): Promise<number> {
      const list = this.messages[id] || []
      const first = list.find((m) => m.id > 0)
      if (!first || !this.hasMore[id]) return 0
      const { data } = await chatApi.messages(id, { before_id: first.id })
      const known = new Set(list.map((m) => m.id))
      const older = data.messages.filter((m) => !known.has(m.id))
      this.messages = { ...this.messages, [id]: [...older, ...list] }
      this.hasMore = { ...this.hasMore, [id]: data.has_more }
      return older.length
    },

    /** Tải dần tin cũ lên tới khi gặp messageId (từ kết quả tìm kiếm / trích dẫn). */
    async jumpTo(convId: number, messageId: number): Promise<boolean> {
      if (!this.messages[convId]) await this.openConversation(convId)
      for (let i = 0; i < 30; i++) {
        if ((this.messages[convId] || []).some((m) => m.id === messageId)) return true
        if (!(await this.loadOlder(convId))) break
      }
      return (this.messages[convId] || []).some((m) => m.id === messageId)
    },

    mergeMessage(m: ChatMessage) {
      const list = this.messages[m.conversation_id]
      if (!list) return
      let i = list.findIndex((x) => x.id === m.id)
      if (i < 0 && m.client_id) i = list.findIndex((x) => x.id < 0 && x.client_id === m.client_id)
      if (i >= 0) {
        list[i].localPreviews?.forEach((p) => p.url && URL.revokeObjectURL(p.url))
        list.splice(i, 1, m)
        return
      }
      // Chèn đúng thứ tự id (tin chờ gửi có id âm luôn nằm cuối).
      let at = list.length
      while (at > 0 && (list[at - 1].id < 0 || list[at - 1].id > m.id)) at--
      list.splice(at, 0, m)
    },

    onMessage(m: ChatMessage, fromSocket = false) {
      const conv = this.byId(m.conversation_id)
      const known = this.messages[m.conversation_id]?.some((x) => x.id === m.id)
      this.mergeMessage(m)
      const typingHere = this.typing[m.conversation_id]
      if (typingHere?.[m.sender_id]) {
        const rest = { ...typingHere }
        delete rest[m.sender_id]
        this.typing = { ...this.typing, [m.conversation_id]: rest }
      }
      if (!conv) {
        // Cuộc mới (người khác nhắn mình lần đầu / vừa được thêm vào nhóm).
        void this.refreshConversation(m.conversation_id)
        if (fromSocket && !known) this.notifyIncoming(m)
        return
      }
      if (!conv.last_message || conv.last_message.id <= m.id) {
        conv.last_message = m
        conv.last_message_at = m.created_at
      }
      // Người gửi hiển nhiên đã xem tin của chính họ.
      const sender = conv.members.find((x) => x.id === m.sender_id)
      if (sender && sender.last_read_message_id < m.id) sender.last_read_message_id = m.id
      if (m.sender_id === this.me) {
        conv.my_last_read = Math.max(conv.my_last_read, m.id)
      } else if (!known && m.id > conv.my_last_read) {
        conv.unread = (conv.unread || 0) + 1
        if (fromSocket) this.notifyIncoming(m)
      }
      this.sortConversations()
      this.maybeMarkRead(m.conversation_id)
    },

    /** Tin được sửa / thu hồi. */
    onUpdated(m: ChatMessage) {
      const list = this.messages[m.conversation_id]
      const i = list ? list.findIndex((x) => x.id === m.id) : -1
      if (i >= 0) list!.splice(i, 1, m)
      const conv = this.byId(m.conversation_id)
      if (conv?.last_message?.id === m.id) conv.last_message = m
    },

    setReactions(convId: number, messageId: number, reactions: ChatReaction[]) {
      const m = this.messages[convId]?.find((x) => x.id === messageId)
      if (m) m.reactions = reactions
    },

    /** Đọc ở tab khác (hoặc vừa đọc ở tab này): đồng bộ số chưa đọc. */
    onRead(convId: number, messageId: number) {
      const conv = this.byId(convId)
      if (!conv) return
      const mine = conv.members.find((x) => x.id === this.me)
      if (mine && mine.last_read_message_id < messageId) mine.last_read_message_id = messageId
      if (messageId <= conv.my_last_read) return
      conv.my_last_read = messageId
      if (conv.last_message && messageId >= conv.last_message.id) conv.unread = 0
      else void this.refreshConversation(convId)
    },

    /** Người khác đã xem tới messageId (để hiện "đã xem"). */
    onPeerRead(convId: number, userId: number, messageId: number, at?: string) {
      const conv = this.byId(convId)
      const mb = conv?.members.find((x) => x.id === userId)
      if (!mb || mb.last_read_message_id >= messageId) return
      mb.last_read_message_id = messageId
      if (at) mb.last_read_at = at
      // Người vừa xem thì hết "đang soạn" cũng được — không đụng tới.
    },

    onTyping(convId: number, userId: number) {
      if (!convId || !userId || userId === this.me) return
      this.typing = { ...this.typing, [convId]: { ...(this.typing[convId] || {}), [userId]: Date.now() + 4500 } }
      this.tick = Date.now()
      if (!typingTimer) {
        typingTimer = setInterval(() => {
          const now = Date.now()
          this.tick = now
          const any = Object.values(this.typing).some((map) => Object.values(map).some((exp) => exp > now))
          if (!any && typingTimer) {
            clearInterval(typingTimer)
            typingTimer = null
            this.typing = {}
          }
        }, 1000)
      }
    },

    /** Báo "đang soạn" qua WebSocket (tối đa mỗi 2,5 giây một lần cho mỗi cuộc). */
    sendTyping(convId: number) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      const now = Date.now()
      if (now - (typingSentAt.get(convId) || 0) < 2500) return
      typingSentAt.set(convId, now)
      socket.send(JSON.stringify({ type: 'typing', conversation_id: convId }))
    },

    /** Đánh dấu đã đọc nếu cuộc đang mở và người dùng thật sự đang nhìn tab. */
    maybeMarkRead(convId: number) {
      if (this.activeId !== convId) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const conv = this.byId(convId)
      const list = this.messages[convId]
      if (!conv || !list?.length) return
      const last = [...list].reverse().find((m) => m.id > 0)
      conv.unread = 0
      if (!last || last.id <= conv.my_last_read) return
      conv.my_last_read = last.id
      const mine = conv.members.find((x) => x.id === this.me)
      if (mine && mine.last_read_message_id < last.id) mine.last_read_message_id = last.id
      const prev = readTimers.get(convId)
      if (prev) clearTimeout(prev)
      readTimers.set(
        convId,
        setTimeout(() => {
          readTimers.delete(convId)
          chatApi.markRead(convId, last.id).catch(() => {})
        }, 250),
      )
    },

    // ---------------- thông báo ----------------

    toggleMute() {
      this.muted = !this.muted
      writeFlag(MUTE_KEY, this.muted)
    },

    /** Bật/tắt thông báo trình duyệt. Chỉ xin quyền ở đây — khi người dùng bấm nút. */
    async toggleNotify(): Promise<'on' | 'off' | 'denied' | 'unsupported'> {
      if (!this.notifySupported) return 'unsupported'
      if (this.notify) {
        this.notify = false
        writeFlag(NOTIFY_KEY, false)
        return 'off'
      }
      let p = Notification.permission
      if (p === 'default') p = await Notification.requestPermission()
      this.notify = p === 'granted'
      writeFlag(NOTIFY_KEY, this.notify)
      return this.notify ? 'on' : 'denied'
    },

    /** Tin mới của người khác: âm báo nhẹ + thông báo trình duyệt khi không nhìn thấy cuộc đó. */
    notifyIncoming(m: ChatMessage) {
      if (m.sender_id === this.me || typeof document === 'undefined') return
      const hidden = document.visibilityState !== 'visible'
      if (!hidden && this.activeId === m.conversation_id) return // đang nhìn đúng cuộc này
      if (!this.muted && (hidden || !this.onChatPage)) playDing()
      if (!this.notify || !hidden || !this.notifySupported || Notification.permission !== 'granted') return
      const conv = this.byId(m.conversation_id)
      const title = conv ? convTitle(conv) : m.sender_name || 'Tin nhắn mới'
      let body = messagePreview(m, this.me, false)
      if (conv?.kind === 'group' && m.sender_name && m.kind !== 'system') body = `${m.sender_name}: ${body}`
      const opts: NotificationOptions = { body, tag: `ffm-chat-${m.conversation_id}`, icon: '/pwa-192.png' }
      try {
        const n = new Notification(title, opts)
        n.onclick = () => {
          window.focus()
          openFromNotification?.(m.conversation_id)
          n.close()
        }
      } catch {
        // Android Chrome không cho new Notification — đi qua service worker.
        navigator.serviceWorker
          ?.getRegistration?.()
          .then((r) => r?.showNotification(title, opts))
          .catch(() => {})
      }
    },

    // ---------------- gửi ----------------

    /** Gửi một tin (chữ / file / trả lời): hiện ngay trong luồng ("Đang gửi…"), thay bằng tin thật khi API trả. */
    async send(convId: number, body: string, opts: SendOptions = {}) {
      const auth = useAuthStore()
      const files = opts.files || []
      const r = opts.replyTo
      const temp: ChatMessage = {
        id: -(++tempSeq),
        conversation_id: convId,
        sender_id: this.me,
        sender_name: auth.fullName,
        kind: 'text',
        body,
        created_at: new Date().toISOString(),
        client_id: newClientId(),
        pending: 'sending',
        reply_to: r
          ? {
              id: r.id,
              sender_id: r.sender_id,
              sender_name: r.sender_name || '',
              body: (r.body || '').slice(0, 200),
              recalled: !!r.recalled_at,
              attachment: r.attachments?.[0]?.name,
              is_image: r.attachments?.[0]?.is_image,
            }
          : null,
        attachments: [],
        reactions: [],
        refs: [],
        localFiles: files,
        localPreviews: files.map((f) => ({
          name: f.name,
          size: f.size,
          url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        })),
      }
      if (!this.messages[convId]) this.messages = { ...this.messages, [convId]: [] }
      this.messages[convId].push(temp)
      await this.deliver(temp)
    },

    async deliver(temp: ChatMessage) {
      temp.pending = 'sending'
      const live = () => this.messages[temp.conversation_id]?.find((x) => x.client_id === temp.client_id && x.id < 0)
      const uploaded: number[] = temp.uploadedIds || []
      // Mất mạng thì thử lại vài lần: cùng client_id nên không bao giờ ra hai tin;
      // file đã tải lên rồi thì lần thử lại không tải lại.
      let lastErr: any = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const files = temp.localFiles || []
          for (let i = uploaded.length; i < files.length; i++) {
            const { data } = await chatApi.upload(temp.conversation_id, files[i])
            uploaded.push(data.id)
            temp.uploadedIds = uploaded
          }
          const { data } = await chatApi.send(temp.conversation_id, {
            body: temp.body,
            client_id: temp.client_id!,
            reply_to_id: temp.reply_to?.id || undefined,
            attachment_ids: uploaded.length ? uploaded : undefined,
          })
          this.onMessage(data)
          return
        } catch (e: any) {
          lastErr = e
          if (e?.code !== 'NETWORK' || attempt === 2) break
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        }
      }
      const t = live()
      if (t) {
        t.pending = 'failed'
        t.error = lastErr?.message || 'Gửi lỗi'
      }
      throw lastErr || new Error('Gửi tin không thành công')
    },

    retry(m: ChatMessage) {
      return this.deliver(m).catch(() => {})
    },

    discard(m: ChatMessage) {
      const list = this.messages[m.conversation_id]
      const i = list ? list.indexOf(m) : -1
      if (i >= 0) {
        list![i].localPreviews?.forEach((p) => p.url && URL.revokeObjectURL(p.url))
        list!.splice(i, 1)
      }
    },

    async edit(m: ChatMessage, body: string) {
      const { data } = await chatApi.edit(m.id, body)
      this.onUpdated(data)
    },

    async recall(m: ChatMessage) {
      const { data } = await chatApi.recall(m.id)
      this.onUpdated(data)
    },

    async react(m: ChatMessage, emoji: string) {
      const { data } = await chatApi.react(m.id, emoji)
      this.setReactions(m.conversation_id, m.id, data.reactions)
    },

    async togglePin(convId: number) {
      const c = this.byId(convId)
      if (!c) return
      const { data } = await chatApi.pin(convId, !c.pinned_at)
      c.pinned_at = data.pinned_at
      this.sortConversations()
    },
  },
})
