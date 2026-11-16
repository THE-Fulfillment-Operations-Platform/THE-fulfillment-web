<script setup lang="ts">
import { chatAssetUrl } from '~/services/api/chat'
import { useChatStore } from '~/stores/chat'
import { useToastStore } from '~/stores/toast'
import { useConfirm } from '~/composables/useConfirm'
import { errorMessage } from '~/utils/api-error'
import type { ChatAttachment, ChatConversation, ChatMember, ChatMessage } from '~/types/chat'
import { clockTime, fileSize, messageSegments } from '~/utils/chat'

// Một tin trong luồng: trích dẫn, chữ (mã đơn/batch + link web thành link), ảnh,
// file, cảm xúc, "đã sửa", tin thu hồi, dòng hệ thống; thanh thao tác (thả cảm
// xúc, trả lời, sửa trong 15 phút, thu hồi) hiện khi rê chuột hoặc chạm vào tin.
const props = defineProps<{
  m: ChatMessage
  conv: ChatConversation
  first: boolean
  last: boolean
  /** Thành viên (trừ mình) đã xem tới đúng tin này. */
  readers: ChatMember[]
  /** Tin cuối của luồng: hiện chữ "Đã xem / Đã gửi". */
  isTail: boolean
  highlight: boolean
}>()
const emit = defineEmits<{
  (e: 'reply', m: ChatMessage): void
  (e: 'edit', m: ChatMessage): void
  (e: 'media', list: ChatAttachment[], index: number): void
  (e: 'jump', id: number): void
}>()

const chat = useChatStore()
const toast = useToastStore()
const { confirm } = useConfirm()

const mine = computed(() => props.m.sender_id === chat.me)
const isGroup = computed(() => props.conv.kind === 'group')
const recalled = computed(() => !!props.m.recalled_at)
const segments = computed(() => messageSegments(props.m.body || '', props.m.refs))
const images = computed(() => (props.m.attachments || []).filter((a) => a.is_image))
const files = computed(() => (props.m.attachments || []).filter((a) => !a.is_image))
const canEdit = computed(
  () =>
    mine.value &&
    props.m.id > 0 &&
    !recalled.value &&
    props.m.kind !== 'system' &&
    Date.now() - Date.parse(props.m.created_at) < chat.editMinutes * 60_000,
)
const actionsOpen = ref(false)
const picking = ref(false)

function nameOf(id: number): string {
  return props.conv.members.find((x) => x.id === id)?.full_name || 'Ai đó'
}
function reactionTitle(ids: number[]): string {
  return ids.map((id) => (id === chat.me ? 'Bạn' : nameOf(id))).join(', ')
}
const myReaction = computed(() => (props.m.reactions || []).find((r) => r.user_ids.includes(chat.me))?.emoji)

async function react(emoji: string) {
  picking.value = false
  actionsOpen.value = false
  try {
    await chat.react(props.m, emoji)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
async function recall() {
  actionsOpen.value = false
  const ok = await confirm({
    title: 'Thu hồi tin nhắn?',
    message: 'Tin (cả ảnh, file và cảm xúc) sẽ bị xoá với mọi người trong cuộc. Không hoàn tác được.',
    confirmText: 'Thu hồi',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await chat.recall(props.m)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
function onBubbleClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('a,button')) return
  actionsOpen.value = !actionsOpen.value
}
function openFile(a: ChatAttachment) {
  if (a.mime === 'application/pdf') emit('media', [a], 0)
}
const seenText = computed(() => {
  if (!props.isTail || !mine.value || props.m.id < 0) return ''
  if (!props.readers.length) return 'Đã gửi'
  if (!isGroup.value) return 'Đã xem'
  // Ít người thì ghi đủ tên; đông thì tên gọi (chữ cuối) cho gọn.
  const names = props.readers.map((r) => (props.readers.length <= 3 ? r.full_name : r.full_name.split(' ').slice(-1)[0]))
  return `Đã xem: ${names.join(', ')}`
})
</script>

<template>
  <!-- Dòng hệ thống: "A đã tạo nhóm", "A đã thêm B"… -->
  <div v-if="m.kind === 'system'" class="my-2 px-6 text-center text-xs text-muted-foreground" :data-chat-msg="m.id" data-chat-system>
    {{ m.body }}
  </div>

  <div
    v-else
    class="group/msg flex flex-col"
    :class="[mine ? 'items-end' : 'items-start', first ? 'mt-2' : 'mt-0.5']"
    :data-chat-msg="m.id"
  >
    <p v-if="isGroup && first && !mine" class="mb-0.5 ml-3 text-[11px] font-medium text-muted-foreground">{{ m.sender_name }}</p>

    <div class="flex max-w-[88%] items-center gap-1 sm:max-w-[78%]" :class="mine ? 'flex-row-reverse' : 'flex-row'">
      <div
        class="relative min-w-0 rounded-2xl transition-shadow"
        :class="[
          highlight ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-card' : '',
          m.pending === 'sending' ? 'opacity-70' : '',
        ]"
        data-chat-bubble-body
        @click="onBubbleClick"
      >
        <!-- Trích dẫn -->
        <button
          v-if="m.reply_to"
          type="button"
          class="mb-0.5 block w-full max-w-full truncate rounded-xl border-l-4 border-primary/50 bg-muted/70 px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
          :title="m.reply_to.recalled ? '' : m.reply_to.body"
          data-chat-quote
          @click.stop="emit('jump', m.reply_to.id)"
        >
          <span class="font-semibold text-foreground">↩ {{ m.reply_to.sender_name }}:</span>{{ ' ' }}<i v-if="m.reply_to.recalled">Tin nhắn đã được thu hồi</i
          ><span v-else-if="m.reply_to.body">{{ m.reply_to.body }}</span
          ><span v-else-if="m.reply_to.attachment">{{ m.reply_to.is_image ? '📷 Ảnh' : `📎 ${m.reply_to.attachment}` }}</span>
        </button>

        <!-- Thu hồi -->
        <div
          v-if="recalled"
          class="rounded-2xl border border-border px-3 py-2 text-sm italic text-muted-foreground"
          data-chat-recalled
        >
          {{ mine ? 'Bạn đã thu hồi một tin nhắn' : 'Tin nhắn đã được thu hồi' }}
        </div>

        <template v-else>
          <!-- Ảnh -->
          <div
            v-if="images.length || m.localPreviews?.some((p) => p.url)"
            class="mb-0.5 grid gap-1"
            :class="(images.length || m.localPreviews?.filter((p) => p.url).length || 0) > 1 ? 'grid-cols-2' : 'grid-cols-1'"
          >
            <button
              v-for="(a, i) in images"
              :key="a.id"
              type="button"
              class="block overflow-hidden rounded-xl bg-muted"
              :title="a.name"
              data-chat-image
              @click.stop="emit('media', images, i)"
            >
              <img
                :src="chatAssetUrl(a.thumb_url || a.url)"
                :alt="a.name"
                class="max-h-64 w-full object-cover"
                :style="a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined"
                loading="lazy"
              />
            </button>
            <template v-if="m.id < 0">
              <div v-for="p in m.localPreviews?.filter((x) => x.url)" :key="p.name" class="relative overflow-hidden rounded-xl bg-muted">
                <img :src="p.url!" :alt="p.name" class="max-h-64 w-full object-cover opacity-70" />
                <span v-if="m.pending === 'sending'" class="absolute inset-0 flex items-center justify-center"><UiSpinner :size="22" /></span>
              </div>
            </template>
          </div>
          <!-- File -->
          <div v-if="files.length || (m.id < 0 && m.localPreviews?.some((p) => !p.url))" class="mb-0.5 flex flex-col gap-1">
            <div
              v-for="a in files"
              :key="a.id"
              class="flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-2 text-sm"
              data-chat-file
            >
              <UiIcon name="file" :size="20" class="shrink-0 text-primary" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-foreground" :title="a.name">{{ a.name }}</span>
                <span class="block text-[11px] text-muted-foreground">{{ fileSize(a.size) }}</span>
              </span>
              <button
                v-if="a.mime === 'application/pdf'"
                type="button"
                class="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                data-chat-file-view
                @click.stop="openFile(a)"
              >
                Xem
              </button>
              <a
                :href="chatAssetUrl(a.download_url)"
                class="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                :download="a.name"
                rel="noopener"
                @click.stop
              >
                Tải
              </a>
            </div>
            <template v-if="m.id < 0">
              <div
                v-for="p in m.localPreviews?.filter((x) => !x.url)"
                :key="p.name"
                class="flex items-center gap-2 rounded-xl border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground"
              >
                <UiIcon name="file" :size="18" />
                <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
                <span class="text-[11px]">{{ fileSize(p.size) }}</span>
              </div>
            </template>
          </div>
          <!-- Chữ -->
          <div
            v-if="m.body"
            class="whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed"
            :class="mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'"
            data-chat-body
          ><template v-for="(s, i) in segments" :key="i"><NuxtLink
            v-if="s.t === 'ref'"
            :to="s.to"
            class="font-semibold underline decoration-2 underline-offset-2"
            :title="s.kind === 'batch' ? 'Mở batch' : 'Mở đơn'"
            data-chat-ref
            @click.stop
          >{{ s.v }}</NuxtLink><a
            v-else-if="s.t === 'url'"
            :href="s.href"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-2"
            @click.stop
          >{{ s.v }}</a><template v-else>{{ s.v }}</template></template></div>
        </template>

        <!-- Cảm xúc -->
        <div v-if="m.reactions?.length" class="-mt-1 flex flex-wrap gap-1 px-1" :class="mine ? 'justify-end' : 'justify-start'">
          <button
            v-for="r in m.reactions"
            :key="r.emoji"
            type="button"
            class="inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-0.5 text-xs shadow-sm"
            :class="r.user_ids.includes(chat.me) ? 'border-primary/60 bg-accent' : ''"
            :title="reactionTitle(r.user_ids)"
            :data-chat-reaction="r.emoji"
            @click.stop="react(r.emoji)"
          >
            <span>{{ r.emoji }}</span><span v-if="r.user_ids.length > 1" class="text-muted-foreground">{{ r.user_ids.length }}</span>
          </button>
        </div>
      </div>

      <!-- Thanh thao tác -->
      <div
        v-if="m.id > 0 && !recalled"
        class="relative flex shrink-0 items-center gap-0.5 transition-opacity"
        :class="actionsOpen || picking ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100'"
        data-chat-actions
      >
        <button type="button" class="chat-act" title="Thả cảm xúc" aria-label="Thả cảm xúc" data-chat-act-react @click.stop="picking = !picking">
          <UiIcon name="smile" :size="16" />
        </button>
        <button type="button" class="chat-act" title="Trả lời" aria-label="Trả lời" data-chat-act-reply @click.stop="emit('reply', m); actionsOpen = false">
          <UiIcon name="reply" :size="16" />
        </button>
        <button v-if="canEdit" type="button" class="chat-act" title="Sửa (trong 15 phút)" aria-label="Sửa" data-chat-act-edit @click.stop="emit('edit', m); actionsOpen = false">
          <UiIcon name="pencil" :size="15" />
        </button>
        <button v-if="mine" type="button" class="chat-act" title="Thu hồi" aria-label="Thu hồi" data-chat-act-recall @click.stop="recall">
          <UiIcon name="trash" :size="15" />
        </button>
        <div
          v-if="picking"
          class="absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-border bg-card px-1.5 py-1 shadow-soft"
          :class="mine ? 'right-0' : 'left-0'"
          data-chat-react-picker
        >
          <button
            v-for="e in chat.reactionSet"
            :key="e"
            type="button"
            class="rounded-full px-1 text-xl leading-none transition-transform hover:scale-125"
            :class="myReaction === e ? 'bg-accent' : ''"
            :data-chat-emoji="e"
            @click.stop="react(e)"
          >
            {{ e }}
          </button>
        </div>
      </div>
    </div>

    <!-- Giờ / trạng thái / đã sửa -->
    <div v-if="m.pending || last || (m.edited_at && !recalled)" class="mt-0.5 px-1 text-[11px] text-muted-foreground">
      <span v-if="m.pending === 'sending'">Đang gửi…</span>
      <span v-else-if="m.pending === 'failed'" class="text-destructive">
        {{ m.error || 'Gửi lỗi' }} · <button class="underline" @click="chat.retry(m)">Thử lại</button> ·
        <button class="underline" @click="chat.discard(m)">Bỏ</button>
      </span>
      <template v-else>
        <span v-if="last">{{ clockTime(m.created_at) }}</span>
        <span v-if="m.edited_at && !recalled" data-chat-edited> · đã sửa</span>
      </template>
    </div>

    <!-- Đã xem -->
    <div v-if="readers.length || seenText" class="mt-0.5 flex items-center gap-1 px-1" :class="mine ? 'flex-row-reverse' : ''" data-chat-seen>
      <span class="flex -space-x-1">
        <ChatAvatar v-for="r in readers.slice(0, 6)" :key="r.id" :id="r.id" :name="r.full_name" :size="16" />
      </span>
      <span v-if="readers.length > 6" class="text-[10px] text-muted-foreground">+{{ readers.length - 6 }}</span>
      <span v-if="seenText" class="text-[11px] text-muted-foreground" data-chat-seen-text>{{ seenText }}</span>
    </div>
  </div>
</template>

<style scoped>
.chat-act {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground;
}
</style>
