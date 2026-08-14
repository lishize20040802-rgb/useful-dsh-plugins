// dsh-upload-button — browser half.
//
// Attachment flow built entirely on the input machine's occurrence pipeline
// (the same mechanism as @references), split across two official slots:
//
// - `conversation.input.left` (order 0): a borderless toolbar button that
//   uploads files and inserts one occurrence per file at the end of the
//   draft. The occurrence's label is a single type emoji — a minimal token,
//   NOT the display surface.
// - `conversation.input.dock` (order 5): the display surface — one
//   Microsoft-classic colored file card per occurrence (red PDF, blue Word,
//   green Excel, ...) floating above the composer card, with ✕ removal.
//
// Pressing the ordinary Send button serializes each occurrence through the
// registered source codec (ref -> saved path), so the message carries the
// paths automatically; the draft commit clears the occurrences and the cards
// disappear. Backspace over a token also detaches the file.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Tooltip, IconPaperclipOutline16, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

/** Browser cordis services this client plugin needs. */
export const inject = ['slots', 'sessions', 'inputTriggers', 'workspaces']

const PLUGIN_ID = 'dsh-upload-button'
const STYLE_TAG = 'dsh-upload-button/style.css'

/** Reference-source name routing the submit-time serialization. */
const SOURCE_NAME = 'dsh-upload-button'

/** Display metadata cache keyed by upload path; occurrences stay the source of truth. */
const uploadMeta = new Map<string, { name: string; bytes: number }>()

/**
 * Dismissible error banner state (module-local, observable via React's
 * useSyncExternalStore). Upload errors land here instead of the official
 * notice surface, which offers no dismissal affordance.
 */
interface UploadError { seq: number; text: string }
let uploadError: UploadError | null = null
let errorSeq = 0
const errorListeners = new Set<() => void>()

function subscribeErrors(listener: () => void): () => void {
  errorListeners.add(listener)
  return () => { errorListeners.delete(listener) }
}
function getUploadError(): UploadError | null {
  return uploadError
}
function setUploadError(text: string): void {
  uploadError = { seq: ++errorSeq, text }
  for (const listener of errorListeners) listener()
}
function clearUploadError(): void {
  uploadError = null
  for (const listener of errorListeners) listener()
}

/** Classic Microsoft palette: badge background + uppercase extension label. */
function badgeStyle(name: string): { bg: string; ext: string } {
  const ext = name.slice(name.lastIndexOf('.') + 1).toUpperCase().slice(0, 4)
  const lower = ext.toLowerCase()
  if (lower === 'pdf') return { bg: '#C93B2E', ext: 'PDF' }
  if (lower === 'doc' || lower === 'docx') return { bg: '#2B579A', ext: 'DOC' }
  if (lower === 'xls' || lower === 'xlsx' || lower === 'csv') return { bg: '#217346', ext: 'XLS' }
  if (lower === 'ppt' || lower === 'pptx') return { bg: '#C43E1C', ext: 'PPT' }
  if (lower === 'txt' || lower === 'md') return { bg: '#757575', ext: 'TXT' }
  if (lower === 'zip' || lower === 'rar' || lower === '7z') return { bg: '#7A5BB0', ext: 'ZIP' }
  return { bg: '#5B7DB1', ext: ext === '' ? 'FILE' : ext }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Fallback display name for a meta-less occurrence (hash-prefixed basename). */
function nameFromPath(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1)
  return base === '' ? path : base
}

/** Our content-addressed upload path signature: `<dir>...<12-hex>-<name>`. */
const UPLOAD_PATH_RE = /^[A-Za-z]:[\\/].+[\\/][0-9a-f]{12}-[^\\/]+$/

/**
 * The chat markdown renderer asks this provider (the official
 * `chatFileMentions` seat) to resolve inline-code tokens: a token matching an
 * upload path renders as a compact file mention (filename label, click opens
 * the file) instead of a long path string — the renderer never guesses paths
 * on its own; only tokens this provider accepts become file cards.
 * @param ctx - the plugin apply context (used lazily for the open action)
 */
function fileMentionsProvider(ctx: any) {
  const resolve = (value: string) => {
    if (!UPLOAD_PATH_RE.test(value)) return undefined
    return {
      label: nameFromPath(value).replace(/^[0-9a-f]{12}-/, ''),
      title: value,
      open: () => {
        const workspaces = ctx.get('workspaces')
        if (workspaces === undefined) return
        void workspaces.openPath(value).catch(() => {})
      }
    }
  }
  return {
    forClosing: () => ({ resolve })
  }
}

/** Idempotent style injection, mirroring the official data-plugin pattern. */
function injectCss() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = STYLE_TAG
  tag.textContent = `
.dsh-up-button{border:none;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);cursor:pointer;border-radius:6px;padding:4px;display:inline-flex;align-items:center;justify-content:center;line-height:0}
.dsh-up-button:hover:not(:disabled){color:var(--dsw-alias-label-primary,currentColor)}
.dsh-up-button:disabled{opacity:.45;cursor:default}
/* Alignment mirrors the official QueueDock formula, so the card row lines up
   with the composer card below it. */
.dsh-up-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto 6px;padding:0 var(--dsh-composer-dock-inset);display:flex;flex-wrap:wrap;gap:8px;flex:none}
/* Windows-icon posture: a vertical card, portrait page badge on top, two-line
   clamped name below, corner ✕ — long names wrap instead of stretching wide. */
.dsh-up-card{position:relative;flex-direction:column;align-items:center;gap:5px;width:88px;flex:none;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.08)));border-radius:12px;padding:12px 8px 9px;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,inherit)}
.dsh-up-badge{width:44px;height:56px;border-radius:6px;color:#fff;font-size:12px;font-weight:700;font-family:var(--ds-font-family-code,monospace);display:inline-flex;align-items:center;justify-content:center;letter-spacing:.5px;flex:none;box-shadow:inset 0 -10px 14px rgba(0,0,0,.14),inset 0 10px 12px rgba(255,255,255,.16)}
.dsh-up-name{width:100%;font-size:12px;line-height:16px;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.dsh-up-size{color:var(--dsw-alias-label-tertiary,inherit);font-size:10.5px;flex:none}
.dsh-up-remove{border:none;background:transparent;color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer;padding:2px;border-radius:4px;display:inline-flex;line-height:0;flex:none}
.dsh-up-remove:hover{color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-up-card>.dsh-up-remove{position:absolute;top:4px;right:4px}
.dsh-up-error{display:inline-flex;align-items:center;gap:8px;max-width:100%;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-interactive-bg-hover-danger,rgba(216,97,97,.14));color:var(--dsw-alias-state-error-primary,#d86161);border-radius:10px;padding:6px 8px 6px 10px;font-size:13px}
.dsh-up-error-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
/* Hide our empty-label draft tokens: occurrences exist only to carry the
   path into the outgoing message, never as a visual (visibility keeps the
   placeholder width so the mirror text stays aligned). */
.uV2eYG_chip:has(> .uV2eYG_chipLabel:empty){visibility:hidden}
`
  document.head.appendChild(tag)
}

/**
 * Upload one browser File and attach it to the session's outgoing message.
 * Primary path: insert an occurrence token (native pipeline — cards render
 * above the composer and Send serializes the path automatically). Degraded
 * path (source registration conflicted): append the plain path to the draft,
 * so uploads keep working with reduced polish instead of failing.
 * @param actx - the session scope context (from `ctx.sessions.scope(sessionId)`)
 * @param file - the picked browser file
 * @param degraded - true when the input-trigger source could not register
 */
async function attachFile(actx: any, file: File, degraded: boolean): Promise<void> {
  const conversation = actx.get('conversation')
  if (conversation === undefined) throw new Error('conversation service unavailable')
  const input = conversation.input.for(actx)
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'x-file-name': encodeURIComponent(file.name) },
      body: file
    })
    if (!res.ok) throw new Error(`${file.name}: HTTP ${res.status}`)
    const payload = await res.json() as { path?: string; name?: string; bytes?: number }
    if (typeof payload.path !== 'string') throw new Error('missing path in response')
    const name = payload.name ?? file.name
    uploadMeta.set(payload.path, { name, bytes: payload.bytes ?? file.size })
    clearUploadError()

    if (degraded) {
      const state = input.state.getSnapshot()
      const token = `\`${payload.path}\``
      const next = state.draft.trim() === '' ? token : `${state.draft}\n${token}`
      input.setDraft(next)
      return
    }

    const state = input.state.getSnapshot()
    actx.emit('slash/input-insert-reference', {
      reference: {
        source: SOURCE_NAME,
        ref: payload.path,
        label: '',
        clipboardText: payload.path
      },
      span: {
        start: state.draft.length,
        end: state.draft.length,
        draftRev: state.draftRev
      }
    })

    // The event applies only when the span CAS passes; verify or surface it.
    const after = input.state.getSnapshot()
    const inserted = after.occurrences.some(o => o.source === SOURCE_NAME && o.ref === payload.path)
    if (!inserted) {
      setUploadError(`文件已上传但未能加入输入框: ${payload.path}`)
    }
  } catch (err) {
    setUploadError(`上传失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

interface UploadButtonProps {
  attach?: (file: File) => Promise<void>
}

function UploadButton({ attach }: UploadButtonProps) {
  const [busy, setBusy] = useState(false)

  const pick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      input.remove()
      if (files.length === 0) return
      setBusy(true)
      void (async () => {
        for (const file of files) {
          try {
            await attach?.(file)
          } catch {
            // already surfaced via the composer notice
          }
        }
        setBusy(false)
      })()
    }
    input.click()
  }

  return (
    <Tooltip label={busy ? '上传中…' : '上传文件'} side="top">
      <button type="button" className="dsh-up-button" aria-label="上传文件" disabled={busy} onClick={pick}>
        <IconPaperclipOutline16 size={14} />
      </button>
    </Tooltip>
  )
}

interface UploadDockProps {
  useInput?: <S>(sel: (s: { draft: string; occurrences: ReadonlyArray<{
    occurrenceId: number
    source: string
    ref: string
    offset: number
  }> }) => S) => S
  inputActions?: { setDraft(text: string): void }
}

/** Floating card row above the composer: file cards plus the error banner. */
function UploadDock({ useInput, inputActions }: UploadDockProps) {
  const state = useInput?.(s => s) ?? null
  const error = useSyncExternalStore(subscribeErrors, getUploadError)
  const ours = (state?.occurrences ?? []).filter(o => o.source === SOURCE_NAME)
  const refs = ours.map(o => o.ref).join('\n')

  // Prune display metadata for tokens that no longer exist (sent or removed).
  useEffect(() => {
    const live = new Set(ours.map(o => o.ref))
    for (const key of [...uploadMeta.keys()]) {
      if (!live.has(key)) uploadMeta.delete(key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs])

  if (ours.length === 0 && error === null) return null

  const removeCard = (_occurrenceId: number, ref: string, offset: number) => {
    const draft = state?.draft ?? ''
    const next = draft.slice(0, offset) + draft.slice(offset + 1)
    inputActions?.setDraft(next)
    uploadMeta.delete(ref)
    void fetch(`/api/upload?path=${encodeURIComponent(ref)}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <div className="dsh-up-dock">
      {error !== null && (
        <div key={`error-${error.seq}`} className="dsh-up-error" role="alert">
          <span className="dsh-up-error-text" title={error.text}>{error.text}</span>
          <button
            type="button"
            className="dsh-up-remove"
            aria-label="关闭错误提示"
            onClick={clearUploadError}
          >
            <IconCloseOutline16 size={12} />
          </button>
        </div>
      )}
      {ours.map(occ => {
        const meta = uploadMeta.get(occ.ref)
        const name = meta?.name ?? nameFromPath(occ.ref)
        const { bg, ext } = badgeStyle(name)
        return (
          <div key={occ.occurrenceId} className="dsh-up-card">
            <span className="dsh-up-badge" style={{ background: bg }}>{ext}</span>
            <span className="dsh-up-name" title={occ.ref}>{name}</span>
            {meta !== undefined && meta.bytes > 0 && <span className="dsh-up-size">{formatBytes(meta.bytes)}</span>}
            <Tooltip label="移除" side="top">
              <button
                type="button"
                className="dsh-up-remove"
                aria-label="移除"
                onClick={() => removeCard(occ.occurrenceId, occ.ref, occ.offset)}
              >
                <IconCloseOutline16 size={12} />
              </button>
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}

export function apply(ctx: any) {
  injectCss()

  // File mentions in chat: the message renderer turns our inline-code path
  // tokens into compact file cards (filename + click-to-open). Optional
  // service — a conflict never crashes the plugin.
  try {
    ctx.provide('chatFileMentions', fileMentionsProvider(ctx))
  } catch (err) {
    console.warn('[dsh-upload-button] chatFileMentions service registration failed; paths will render as plain text:', err)
  }

  // A source-name conflict must never crash the browser plugin: degrade to
  // plain draft-text attachment instead (uploads keep working, cards don't).
  let degraded = false
  try {
    ctx.effect(() => ctx.inputTriggers.registerSource({
      trigger: '@',
      name: SOURCE_NAME,
      candidates: async () => [],
      onPick: () => undefined,
      codec: {
        clipboardText: (ref: string) => ref,
        // Inline-code form: the chat renderer resolves it via the
        // chatFileMentions provider above into a compact file mention,
        // while the agent still receives the path verbatim.
        serialize: async (ref: string) => `\`${ref}\``
      }
    }))
  } catch (err) {
    degraded = true
    console.warn('[dsh-upload-button] input-trigger source registration failed; falling back to draft-text attachment:', err)
  }

  // Slot conflicts (duplicate cell ids) also degrade instead of crashing.
  const registerSlot = (slot: string, options: object, component: any) => {
    try {
      return ctx.slots.register(options, component)
    } catch (err) {
      console.warn(`[dsh-upload-button] slot "${slot}" registration failed; that UI seat stays absent:`, err)
      return undefined
    }
  }

  ctx.slots.inject('conversation.input.left', () => registerSlot('conversation.input.left', {
    name: 'conversation.input.left',
    id: 'upload-file-button',
    order: 0,
    inject: (sessionId: string) => ({
      attach: (file: File) => attachFile(ctx.sessions.scope(sessionId), file, degraded)
    })
  }, UploadButton))

  ctx.slots.inject('conversation.input.dock', () => registerSlot('conversation.input.dock', {
    name: 'conversation.input.dock',
    id: 'upload-file-dock',
    order: 5
  }, UploadDock))
}
