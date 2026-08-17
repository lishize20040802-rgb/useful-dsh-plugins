// dsh-upload-button — browser-half upload flow.
//
// Pending-attachment model: uploading a file NEVER touches the composer
// draft (no occurrence tokens, no invisible characters, no cursor impact —
// the input box stays exactly as the user left it). Each upload lands in a
// per-session pending list rendered by the composer dock; pressing Send
// appends the saved paths to the outgoing message at the official
// `session.prompt` facade, then the list clears. The chat bubble hides the
// paths (message-bubble.tsx strips them) while the model still receives them
// verbatim.
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { NS } from './locales'

/** The package-namespace translate used outside components (upload errors). */
export type UploadTranslate = TranslateNS<typeof NS>

/** Our content-addressed upload path signature: `<dir>...<12-hex>-<name>`. */
export const UPLOAD_PATH_RE = /^[A-Za-z]:[\\/].+[\\/][0-9a-f]{12}-[^\\/]+$/

/** One pending upload: the saved path plus display metadata. */
export interface PendingFile { path: string; name: string; bytes: number }

/**
 * Per-session pending attachments (module-local, observable via React's
 * useSyncExternalStore). Mutations replace the array reference so snapshots
 * stay stable between changes.
 */
const pendingBySession = new Map<string, PendingFile[]>()
const EMPTY_PENDING: PendingFile[] = []
const pendingListeners = new Set<() => void>()

function publishPending(): void {
  for (const listener of pendingListeners) listener()
}

export function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener)
  return () => { pendingListeners.delete(listener) }
}

export function pendingOf(sessionId: string): PendingFile[] {
  return pendingBySession.get(sessionId) ?? EMPTY_PENDING
}

function setPending(sessionId: string, files: PendingFile[]): void {
  pendingBySession.set(sessionId, files)
  publishPending()
}

export function addPendingFile(sessionId: string, file: PendingFile): void {
  setPending(sessionId, [...pendingOf(sessionId), file])
}

export function removePendingFile(sessionId: string, path: string): void {
  setPending(sessionId, pendingOf(sessionId).filter(f => f.path !== path))
}

function clearPending(sessionId: string): void {
  if (pendingOf(sessionId).length > 0) setPending(sessionId, [])
}

/**
 * Display metadata cache keyed by upload path (server-reported names/bytes;
 * the picker File object is not retained after upload).
 */
export interface UploadMeta { name: string; bytes: number }
export const uploadMeta = new Map<string, UploadMeta>()

/**
 * Dismissible error banner state (module-local, observable via React's
 * useSyncExternalStore). Upload errors land here instead of the official
 * notice surface, which offers no dismissal affordance.
 */
export interface UploadError { seq: number; text: string }
let uploadError: UploadError | null = null
let errorSeq = 0
const errorListeners = new Set<() => void>()

export function subscribeErrors(listener: () => void): () => void {
  errorListeners.add(listener)
  return () => { errorListeners.delete(listener) }
}
export function getUploadError(): UploadError | null {
  return uploadError
}
export function setUploadError(text: string): void {
  uploadError = { seq: ++errorSeq, text }
  for (const listener of errorListeners) listener()
}
export function clearUploadError(): void {
  uploadError = null
  for (const listener of errorListeners) listener()
}

/** Classic Microsoft palette: badge background + uppercase extension label. */
export function badgeStyle(name: string): { bg: string; ext: string } {
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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Display name of an uploaded file: the hash prefix stays internal. */
export function nameFromPath(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1)
  return base === '' ? path : base
}

/** Presentation name of an uploaded file: the hash prefix stays internal. */
export function displayName(path: string): string {
  return nameFromPath(path).replace(/^[0-9a-f]{12}-/, '')
}

/** The stable session face slice the send wrapper addresses. */
type SessionFace = { prompt: (content: unknown, mode: unknown) => Promise<unknown> }

/** Session faces whose `prompt` already carries the send-time attachment. */
const wrappedFaces = new WeakSet<object>()

/**
 * Transparently append the session's pending file paths to the next outgoing
 * message. Installed once per session face (WeakSet-guarded, so a re-created
 * face re-wraps). The paths are appended as inline-code tokens — the same
 * serialized shape the chat bubble renderer strips — so the model receives
 * them verbatim while the chat UI never shows them. Pending files clear only
 * after the prompt is accepted, so a failed send keeps the dock cards for a
 * retry.
 * @param sessions - the `ctx.sessions` service (binding resolution)
 * @param sessionId - target session
 */
export function installSendAttachment(sessions: any, sessionId: SessionId): void {
  const session = sessions.binding(sessionId)?.session as SessionFace | undefined
  if (session === undefined || typeof session.prompt !== 'function' || wrappedFaces.has(session)) return
  wrappedFaces.add(session)
  const original = session.prompt.bind(session)
  session.prompt = (content: unknown, mode: unknown) => {
    const pending = pendingOf(sessionId)
    if (pending.length === 0) return original(content, mode)
    const parts = Array.isArray(content) ? [...content] : []
    const paths = pending.map(f => `\`${f.path}\``).join('\n')
    const last = parts.length > 0 ? parts[parts.length - 1] as { type?: string; text?: string } : undefined
    if (last !== undefined && last.type === 'text' && typeof last.text === 'string') {
      parts[parts.length - 1] = { ...last, text: last.text === '' ? paths : `${last.text}\n${paths}` }
    } else {
      parts.push({ type: 'text', text: paths })
    }
    return original(parts, mode).then((result: any) => {
      if (result?.ok === true) clearPending(sessionId)
      return result
    })
  }
}

/**
 * Upload one browser File and queue it for the session's next send.
 * The composer draft is never touched.
 * @param sessions - the `ctx.sessions` service
 * @param sessionId - target session (pending files attach to its next send)
 * @param file - the picked browser file
 * @param t - the package-namespace translate (error copy)
 */
export async function attachFile(sessions: any, sessionId: SessionId, file: File, t: UploadTranslate): Promise<void> {
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
    const bytes = payload.bytes ?? file.size
    uploadMeta.set(payload.path, { name, bytes })
    addPendingFile(sessionId, { path: payload.path, name, bytes })
    installSendAttachment(sessions, sessionId)
    clearUploadError()
  } catch (err) {
    setUploadError(t('upload.failed', { message: err instanceof Error ? err.message : String(err) }))
    throw err
  }
}
