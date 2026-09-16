// dsh-upload-button — browser-half stylesheet (single injected <style> tag).
//
// Idempotent injection mirroring the official data-plugin-css pattern: one
// style tag per package, tagged with the package id and a stable css handle.
export const STYLE_TAG = 'dsh-upload-button/style.css'

export const STYLE_CSS = `
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
/* Sent user message: the bubble shows the user's words only — upload paths
   stay out of the display. Each attached file floats above the bubble as the
   same Microsoft-classic card the composer dock uses: portrait page badge
   colored by type (red PDF, blue Word, green Excel...), two-line clamped
   name — identical visual language, whole card clickable. */
.dsh-up-msg-row{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.dsh-up-msg-stack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}
.dsh-up-msg-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.dsh-up-msg-text{white-space:pre-wrap}
.dsh-up-msg-chip{display:inline-flex;align-items:center;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit);padding:0 6px;font-size:14px;line-height:22px;margin:0 2px}
/* The negative bottom margin pulls the bubble up under the cards so they
   float on its top edge instead of sitting in a separate row. */
.dsh-up-msg-files{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;position:relative;z-index:1;margin-bottom:-14px}
/* Same visual as .dsh-up-card / .dsh-up-badge / .dsh-up-name in the composer
   dock (shared classes below), rendered as one clickable card. */
.dsh-up-msg-file{position:relative;flex-direction:column;align-items:center;gap:5px;width:88px;flex:none;display:flex;text-align:center;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.08)));border-radius:12px;padding:12px 8px 9px;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,inherit);cursor:pointer}
.dsh-up-msg-file:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-up-msg-file .dsh-up-name{color:var(--dsw-alias-label-primary,inherit)}
/* Actions row mirroring the official MessageIconActions (time + copy). */
.dsh-up-msg-actions{align-items:center;gap:10px;height:28px;display:flex}
.dsh-up-msg-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:24px}
@media (hover:hover){[data-time-hover-root] .dsh-up-msg-time{opacity:0;transition:opacity 80ms}[data-time-hover-root]:hover .dsh-up-msg-time,[data-time-hover-root]:focus-within .dsh-up-msg-time{opacity:1}}
.dsh-up-msg-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}
.dsh-up-msg-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
`

/** Idempotent style injection, mirroring the official data-plugin pattern. */
export function injectCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-upload-button'
  tag.dataset.pluginCss = STYLE_TAG
  tag.textContent = STYLE_CSS
  document.head.appendChild(tag)
}
