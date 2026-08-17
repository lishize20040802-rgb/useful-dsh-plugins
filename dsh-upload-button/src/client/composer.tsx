// dsh-upload-button — browser-half composer surface.
//
// The two `conversation.input.*` slot contributions: the borderless toolbar
// button (`.left`) and the floating card row above the composer (`.dock`).
// Uploads never touch the draft — the dock renders the plugin's per-session
// pending list, and Send picks the paths up at the session.prompt facade
// (see upload.ts). Both read the package-namespace `t` seat via the `locale:`
// registration option.
import { useState, useSyncExternalStore } from 'react'
import { Tooltip, IconPaperclipOutline16, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  pendingOf, subscribePending, removePendingFile,
  subscribeErrors, getUploadError, clearUploadError,
  badgeStyle, formatBytes
} from './upload'
import type { NS } from './locales'

/** The framework-injected `t` seat carries this package's key union (+ common). */
export type UploadTranslate = TranslateNS<typeof NS>

export interface UploadButtonProps {
  /** Upload + queue one picked file for the session's next send (injected). */
  attach?: (file: File) => Promise<void>
  /** Framework-injected package-namespace translate. */
  t: UploadTranslate
}

export function UploadButton({ attach, t }: UploadButtonProps) {
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
            // already surfaced via the error banner
          }
        }
        setBusy(false)
      })()
    }
    input.click()
  }

  return (
    <Tooltip label={busy ? t('upload.buttonBusy') : t('upload.button')} side="top">
      <button type="button" className="dsh-up-button" aria-label={t('upload.button')} disabled={busy} onClick={pick}>
        <IconPaperclipOutline16 size={14} />
      </button>
    </Tooltip>
  )
}

export interface UploadDockProps {
  /** The session this composer belongs to (framework standard kit). */
  sessionId: SessionId
  /** Framework-injected package-namespace translate. */
  t: UploadTranslate
}

/** Floating card row above the composer: pending file cards + error banner. */
export function UploadDock({ sessionId, t }: UploadDockProps) {
  const files = useSyncExternalStore(subscribePending, () => pendingOf(sessionId))
  const error = useSyncExternalStore(subscribeErrors, getUploadError)

  if (files.length === 0 && error === null) return null

  const removeCard = (path: string) => {
    removePendingFile(sessionId, path)
    void fetch(`/api/upload?path=${encodeURIComponent(path)}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <div className="dsh-up-dock">
      {error !== null && (
        <div key={`error-${error.seq}`} className="dsh-up-error" role="alert">
          <span className="dsh-up-error-text" title={error.text}>{error.text}</span>
          <button
            type="button"
            className="dsh-up-remove"
            aria-label={t('upload.dismissError')}
            onClick={clearUploadError}
          >
            <IconCloseOutline16 size={12} />
          </button>
        </div>
      )}
      {files.map((file) => {
        const { bg, ext } = badgeStyle(file.name)
        return (
          <div key={file.path} className="dsh-up-card">
            <span className="dsh-up-badge" style={{ background: bg }}>{ext}</span>
            <span className="dsh-up-name" title={file.path}>{file.name}</span>
            {file.bytes > 0 && <span className="dsh-up-size">{formatBytes(file.bytes)}</span>}
            <Tooltip label={t('upload.remove')} side="top">
              <button
                type="button"
                className="dsh-up-remove"
                aria-label={t('upload.remove')}
                onClick={() => removeCard(file.path)}
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
