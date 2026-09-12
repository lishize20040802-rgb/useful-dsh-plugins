// dsh-plugin-doc-companion — browser-half toolbar toggle.
//
// A borderless book icon in the composer toolbar (`conversation.input.left`)
// that opens the reader panel. The panel lives in the official `details`
// layout column, so "open" is just `ctx.layout.openDetails()` — the toggle
// carries no state of its own.
import type { DocCompanionLocaleKey } from './locales'

/** Props injected by the slot framework (locale) + the register inject face. */
export interface ToggleProps {
  t?: (key: DocCompanionLocaleKey, params?: Record<string, unknown>) => string
  /** Open the details column (injected from the register's inject face). */
  openPanel?: () => void
}

export function DocToggle(props: ToggleProps): JSX.Element {
  const t = props.t ?? ((key: DocCompanionLocaleKey) => key)
  return (
    <button
      type="button"
      title={t('toggle.title')}
      aria-label={t('toggle.title')}
      onClick={() => props.openPanel?.()}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 4,
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--dsw-alias-text-secondary, #6b7280)'
      }}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3.5C6.8 2.7 5.2 2.4 3.5 2.6c-.6.1-1 .5-1 1.1v8.2c0 .6.4 1 1 1.1 1.7.2 3.3-.1 4.5-.9 1.2.8 2.8 1.1 4.5.9.6-.1 1-.5 1-1.1V3.7c0-.6-.4-1-1-1.1-1.7-.2-3.3.1-4.5.9z" />
        <path d="M8 3.5v9" />
      </svg>
    </button>
  )
}
