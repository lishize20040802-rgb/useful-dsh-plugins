// dsh-upload-button — browser-half chat-message surface.
//
// Shadow renderer for the official `user` / `steering` chat nodes. The
// official bubble renders the raw message text verbatim, so the uploaded
// path (the inline-code token the send-time wrapper appends) would appear
// right after the user's words. This renderer shadows the official entries
// of the keyed `conversation.chat.node` slot at a lower priority (lowest
// wins) and renders the same bubble language itself — images, words, /@ ref
// chips and the time+copy actions row — plus one floating file card per
// attached file. The raw text (paths included) is what the copy action and
// the model see; only the display hides it.
import { memo, useEffect, useState, useRef, type ReactNode } from 'react'
import {
  Tooltip, IconCopyOutline16, IconCheckOutline16,
  JsonBlock, writeClipboard
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { UPLOAD_PATH_RE, displayName, badgeStyle } from './upload'
import type { NS } from './locales'

/** The framework-injected `t` seat carries this package's key union (+ common). */
export type UploadTranslate = TranslateNS<typeof NS>

/** One chat-node content block (wide by contract — only text/image read). */
interface ContentBlock { type: string; text?: string; attachment?: ImageAttachmentRef }

/** Split a user message content array into text / image / other blocks. */
function contentParts(content: ReadonlyArray<ContentBlock>): { text: string; images: Array<{ attachment: ImageAttachmentRef }>; rest: ContentBlock[] } {
  const texts: string[] = []
  const images: Array<{ attachment: ImageAttachmentRef }> = []
  const rest: ContentBlock[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
    else if (block.type === 'image' && block.attachment !== undefined) images.push({ attachment: block.attachment })
    else rest.push(block)
  }
  return { text: texts.join(''), images, rest }
}

/** Inline-code token scan: `` `...` `` runs the codec serialization produces. */
const INLINE_CODE_RE = /`([^`\n]+)`/g

export interface FileChip { path: string; name: string }

/**
 * Strip inline-code upload-path tokens from the display text. Each stripped
 * token becomes a floating file chip; everything else — including tokens that
 * do not look like our upload paths — stays verbatim.
 * @param text - the full serialized user message text
 * @returns visible text without upload tokens, plus one chip entry per file
 */
export function stripUploadTokens(text: string): { visible: string; files: FileChip[] } {
  const files: FileChip[] = []
  let visible = ''
  let cursor = 0
  let m: RegExpExecArray | null
  INLINE_CODE_RE.lastIndex = 0
  while ((m = INLINE_CODE_RE.exec(text)) !== null) {
    const token = m[1] ?? ''
    if (!UPLOAD_PATH_RE.test(token)) continue
    visible += text.slice(cursor, m.index)
    files.push({ path: token, name: displayName(token) })
    cursor = m.index + m[0].length
  }
  if (files.length === 0) return { visible: text, files }
  visible += text.slice(cursor)
  // The token usually follows a newline the user typed before sending; with
  // the path gone the dangling separator would leave an empty line.
  visible = visible.replace(/[ \t\n]+$/, '')
  return { visible, files }
}

/** Decorate sent `/name` / `@name` tokens as chips (bubble projection of the
 * composer's chips; the sent text IS the reference, shape alone decorates). */
function projectRefTokens(text: string): ReactNode[] {
  const re = /(^|\s)([/@][\w-]+)(?=\s|$)/g
  const parts: ReactNode[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tokenStart = m.index + (m[1]?.length ?? 0)
    const label = m[2] ?? ''
    if (tokenStart > cursor) parts.push(<span key={cursor} className="dsh-up-msg-text">{text.slice(cursor, tokenStart)}</span>)
    parts.push(<span key={`chip-${tokenStart}`} className="dsh-up-msg-chip" data-ref-chip={label.startsWith('@') ? 'subagent' : 'skill'}>{label}</span>)
    cursor = tokenStart + label.length
  }
  if (parts.length === 0) return [<span key={0} className="dsh-up-msg-text">{text}</span>]
  if (cursor < text.length) parts.push(<span key={cursor} className="dsh-up-msg-text">{text.slice(cursor)}</span>)
  return parts
}

/** Resolve the message-image gallery strings from the package namespace. */
function messageImageLabels(t: UploadTranslate) {
  return {
    image: t('image.label'),
    open: t('image.openOriginal'),
    openNamed: (label: string) => t('image.openOriginalLabel', { label }),
    loading: t('image.loading'),
    loadFailed: t('image.loadFailed'),
    lightbox: {
      dialog: t('image.lightboxDialog'),
      close: t('image.lightboxClose')
    }
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Date-aware clock string (24-hour, zero-padded) mirroring the official one. */
function formatMessageClock(time: number, t: UploadTranslate, now = Date.now()): string {
  const d = new Date(time)
  const n = new Date(now)
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  return `${d.getFullYear() === n.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)} ${clock}`
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function msUntilNextLocalMidnight(ms: number): number {
  const next = startOfLocalDay(ms) + 24 * 60 * 60 * 1000
  return Math.max(1000, next - ms)
}

/** Local calendar-day epoch that advances at each local midnight. */
function useCalendarDay(): number {
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      const now = Date.now()
      setDay(startOfLocalDay(now))
      timer = setTimeout(arm, msUntilNextLocalMidnight(now))
    }
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
    return () => { clearTimeout(timer) }
  }, [])
  return day
}

/** Time + copy actions row for user bubbles (official visual language). */
function UserBubbleActions({ text, time, t }: { text: string; time?: number; t: UploadTranslate }) {
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const day = useCalendarDay()
  const onCopy = () => {
    if (copied || copyTimer.current !== null) return
    void writeClipboard(text).then((ok: boolean) => {
      if (!ok) return
      setCopied(true)
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null
        setCopied(false)
      }, 1000)
    })
  }
  const clockEl = time === undefined ? null : (
    <span className="dsh-up-msg-time">{formatMessageClock(time, t, day)}</span>
  )
  return (
    <div className="dsh-up-msg-actions">
      {clockEl}
      <Tooltip label={copied ? t('copied') : t('copy')} side="bottom">
        <button type="button" className="dsh-up-msg-action" aria-label={copied ? t('copied') : t('copy')} onClick={onCopy}>
          {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
        </button>
      </Tooltip>
    </div>
  )
}

/** The durable user / steering node slice this renderer reads. */
interface UserMessageNode {
  data?: {
    content?: ReadonlyArray<ContentBlock>
    time?: number
  }
}

export interface UserMessageViewProps {
  /** The routed chat node (owner share). */
  node: UserMessageNode
  /** Resolve a session-authorized historical image for inline display. */
  loadImage?: (attachment: ImageAttachmentRef) => Promise<string>
  /** Open a filesystem path through the Host (tool-row semantics). */
  openFile?: (path: string) => void
  /** Framework-injected package-namespace translate. */
  t: UploadTranslate
}

/**
 * Shadow renderer for user / steering chat nodes: the bubble shows only the
 * user's words; each attached file floats as the same Microsoft-classic card
 * the composer dock uses, above the bubble. The raw message text (upload
 * paths included) is preserved — copy and the model-visible message stay
 * identical to what was sent.
 */
export const UserMessageWithUploads = memo(function UserMessageWithUploads({ node, loadImage, openFile, t }: UserMessageViewProps) {
  const content = node.data?.content ?? []
  const { text, images, rest } = contentParts(content)
  const { visible, files } = stripUploadTokens(text)
  const imageLoader = loadImage ?? (() => Promise.reject(new Error(t('image.serviceUnavailable'))))
  const showBubble = visible !== '' || rest.length > 0
  return (
    <div className="dsh-up-msg-row" data-time-hover-root>
      <div className="dsh-up-msg-stack">
        {images.length > 0 && <ImageGallery images={images} load={imageLoader} align="end" labels={messageImageLabels(t)} />}
        {files.length > 0 && (
          <div className="dsh-up-msg-files">
            {files.map((f) => {
              const { bg, ext } = badgeStyle(f.name)
              return (
                <button
                  key={f.path}
                  type="button"
                  className="dsh-up-msg-file"
                  title={f.path}
                  aria-label={t('upload.openFile')}
                  onClick={() => { try { openFile?.(f.path) } catch { /* host may not expose the opener */ } }}
                >
                  <span className="dsh-up-badge" style={{ background: bg }}>{ext}</span>
                  <span className="dsh-up-name">{f.name}</span>
                </button>
              )
            })}
          </div>
        )}
        {showBubble && (
          <div className="dsh-up-msg-bubble">
            {projectRefTokens(visible)}
            {rest.map((block, i) => (
              <JsonBlock key={i} label={t('message.extraBlock')} payload={block} truncatedLabel={(total: number) => t('json.truncated', { total })} />
            ))}
          </div>
        )}
      </div>
      <UserBubbleActions text={text} time={node.data?.time} t={t} />
    </div>
  )
})

