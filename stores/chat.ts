import { defineStore } from 'pinia'
import { chatApi, chatSocketUrl } from '~/services/api/chat'
import { useAuthStore } from '~/stores/auth'
import type { ChatConversation, ChatMessage } from '~/types/chat'

// ---------------------------------------------------------------------------
// Chat nội bộ (nhắn tin chữ 1-1) — MỘT store và MỘT WebSocket cho cả app:
// bong bóng nổi, ô chat nhỏ và trang Tin nhắn đầy đủ đều đọc chung ở đây.
//
// plugins/chat.client.ts gọi start() khi đăng nhập, stop() khi đăng xuất. API
// trả 403 cho tài khoản chưa được mở chat (CHAT_ROLES) → enabled=false, không
// mở WebSocket, giao diện ẩn hẳn.
//
// Tin đi bằng REST (client_id để gửi lại không ra hai tin), tin về bằng
// WebSocket. Rớt WebSocket: tự nối lại (lùi dần 1s → 30s); mỗi lần thử lại và
// mỗi lần nối được đều kéo bù danh sách cuộc + tin mới của cuộc đang mở qua REST.
// ---------------------------------------------------------------------------

type WsState = 'idle' | 'connecting' | 'open' | 'closed'

// Đối tượng WebSocket / timer để ở cấp module: không phải state cần phản ứng,
// và chỉ được có MỘT bản cho cả app.
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let watchdogTimer: ReturnType<typeof setInterval> | null = null
let backoff = 1000
let lastFrameAt = 0
let wanted = false
let tempSeq = 0
const readTimers = new Map<number, ReturnType<typeof setTimeout>>()

function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface State {
  enabled: boolean
  conversations: ChatConversation[]
  listLoaded: boolean
  messages: Record<number, ChatMessage[]>
  hasMore: Record<number, boolean>
  /** Cuộc đang mở trên màn hình (trang đầy đủ hoặc ô chat nhỏ); null nếu không. */
  activeId: number | null
  wsState: WsState
}

export const useChatStore = defineStore('chat', {
  state: (): State => ({
    enabled: false,
    conversations: [],
    listLoaded: false,
    messages: {},
    hasMore: {},
    activeId: null,
    wsState: 'idle',
  }),

  getters: {
    me(): number {
      return useAuthStore().user?.id ?? 0
    },
    /** Tổng tin chưa đọc — số trên menu và trên bong bóng. */
    totalUnread: (s): number => s.conversations.reduce((n, c) => n + (c.unread || 0), 0),
    byId: (s) => (id: number) => s.conversations.find((c) => c.id === id),
  },

  actions: {
    // ---------------- vòng đời ----------------

    async start() {
      wanted = true
      try {
        await chatApi.config()
        this.enabled = true
      } catch {
        this.enabled = false // 403: chat chưa mở cho tài khoản này
      }
      if (!this.enabled || !wanted) return
      void this.connect()
      if (!watchdogTimer) {
        // WebSocket im quá lâu (mạng chết mà trình duyệt chưa biết): cắt để nối lại.
        watchdogTimer = setInterval(() => {
          if (socket && this.wsState === 'open' && Date.now() - lastFrameAt > 75_000) socket.close()
        }, 15_000)
      }
    },

    stop() {
      wanted = false
      this.disconnect()
      if (watchdogTimer) clearInterval(watchdogTimer)
      watchdogTimer = null
      readTimers.forEach((t) => clearTimeout(t))
      readTimers.clear()
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
          break
        case 'message.new':
          this.onMessage(ev.message as ChatMessage)
          break
        case 'read':
          this.onRead(ev.conversation_id, ev.message_id)
          break
      }
    },

    // ---------------- dữ liệu ----------------

    async loadConversations() {
      try {
        const { data } = await chatApi.conversations()
        this.conversations = data || []
        this.listLoaded = true
      } catch {
        /* giữ danh sách cũ */
      }
    },

    async refreshConversation(id: number) {
      try {
        const { data } = await chatApi.conversation(id)
        this.upsertConversation(data)
      } catch {
        /* lượt kéo bù sau sẽ thử lại */
      }
    },

    upsertConversation(c: ChatConversation) {
      const i = this.conversations.findIndex((x) => x.id === c.id)
      if (i >= 0) this.conversations.splice(i, 1, c)
      else this.conversations.unshift(c)
      this.sortConversations()
    },

    sortConversations() {
      this.conversations.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''))
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

    mergeMessage(m: ChatMessage) {
      const list = this.messages[m.conversation_id]
      if (!list) return
      let i = list.findIndex((x) => x.id === m.id)
      if (i < 0 && m.client_id) i = list.findIndex((x) => x.id < 0 && x.client_id === m.client_id)
      if (i >= 0) {
        list.splice(i, 1, m)
        return
      }
      // Chèn đúng thứ tự id (tin chờ gửi có id âm luôn nằm cuối).
      let at = list.length
      while (at > 0 && (list[at - 1].id < 0 || list[at - 1].id > m.id)) at--
      list.splice(at, 0, m)
    },

    onMessage(m: ChatMessage) {
      const conv = this.byId(m.conversation_id)
      const known = this.messages[m.conversation_id]?.some((x) => x.id === m.id)
      this.mergeMessage(m)
      if (!conv) {
        // Cuộc mới (người khác nhắn mình lần đầu).
        void this.refreshConversation(m.conversation_id)
        return
      }
      if (!conv.last_message || conv.last_message.id <= m.id) {
        conv.last_message = m
        conv.last_message_at = m.created_at
      }
      if (m.sender_id === this.me) {
        conv.my_last_read = Math.max(conv.my_last_read, m.id)
      } else if (!known && m.id > conv.my_last_read) {
        conv.unread = (conv.unread || 0) + 1
      }
      this.sortConversations()
      this.maybeMarkRead(m.conversation_id)
    },

    /** Đọc ở tab khác (hoặc vừa đọc ở tab này): đồng bộ số chưa đọc. */
    onRead(convId: number, messageId: number) {
      const conv = this.byId(convId)
      if (!conv || messageId <= conv.my_last_read) return
      conv.my_last_read = messageId
      if (conv.last_message && messageId >= conv.last_message.id) conv.unread = 0
      else void this.refreshConversation(convId)
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

    // ---------------- gửi ----------------

    /** Gửi một tin: hiện ngay trong luồng ("Đang gửi…"), thay bằng tin thật khi API trả. */
    async send(convId: number, body: string) {
      const temp: ChatMessage = {
        id: -(++tempSeq),
        conversation_id: convId,
        sender_id: this.me,
        body,
        created_at: new Date().toISOString(),
        client_id: newClientId(),
        pending: 'sending',
      }
      if (!this.messages[convId]) this.messages = { ...this.messages, [convId]: [] }
      this.messages[convId].push(temp)
      await this.deliver(temp)
    },

    async deliver(temp: ChatMessage) {
      temp.pending = 'sending'
      // Mất mạng thì thử lại vài lần: cùng client_id nên không bao giờ ra hai tin.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await chatApi.send(temp.conversation_id, temp.body, temp.client_id!)
          this.onMessage(data)
          return
        } catch (e: any) {
          if (e?.code !== 'NETWORK' || attempt === 2) break
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        }
      }
      const t = this.messages[temp.conversation_id]?.find((x) => x.client_id === temp.client_id && x.id < 0)
      if (t) t.pending = 'failed'
      throw new Error('Gửi tin không thành công')
    },

    retry(m: ChatMessage) {
      return this.deliver(m).catch(() => {})
    },

    discard(m: ChatMessage) {
      const list = this.messages[m.conversation_id]
      const i = list ? list.indexOf(m) : -1
      if (i >= 0) list!.splice(i, 1)
    },
  },
})
