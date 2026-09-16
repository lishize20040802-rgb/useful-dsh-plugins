// dsh-plugin-doc-companion — browser-half global styles.
//
// Tiny injection of shared styles that are awkward to inline. The panel and
// the toggle use design tokens (--dsw-*) with light fallbacks so they blend
// into both the default and dark themes.
const CSS = `
.dsh-doc-companion-canvas-wrap {
  display: flex;
  justify-content: center;
}
`

let injected = false

/** Inject the shared stylesheet once per page load. */
export function injectCss(): void {
  if (injected) return
  injected = true
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
}
