// dsh-plugin-voice-input — browser-half styles.
//
// One idempotent stylesheet with prefixed class names (`dsh-vi-*`), matching
// the official convention of scoping every selector to the plugin so the
// host theme is never affected. Visual language follows the composer tool
// row: a borderless icon button with a soft hover, a red recording state
// with a gentle pulse, and a compact inline status line.

const STYLE_ID = 'dsh-voice-input-style'

export function injectCss(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.dsh-vi-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.dsh-vi-button:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.12);
}
.dsh-vi-button:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh-vi-button[data-recording="true"] {
  color: #e5484d;
}
.dsh-vi-button[data-recording="true"] svg {
  animation: dsh-vi-pulse 1.1s ease-in-out infinite;
}
@keyframes dsh-vi-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
.dsh-vi-status {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 220px;
  margin-left: 6px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.dsh-vi-status[data-tone="recording"] { color: #e5484d; }
.dsh-vi-status[data-tone="processing"] { color: inherit; opacity: 0.7; }
.dsh-vi-status[data-tone="error"] { color: #e5484d; cursor: help; }
`
  document.head.appendChild(style)
  return () => style.remove()
}
