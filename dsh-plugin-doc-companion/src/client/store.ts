// dsh-plugin-doc-companion — browser-half tiny module store.
//
// The reader panel is a root-scope surface whose visibility is PER-SESSION
// UI intent: opening the panel in conversation A remembers it for A only —
// switching to a conversation that never opened the panel shows nothing,
// and the panel only appears there once the user clicks the toolbar toggle.
// (The official details column is NOT used — the panel makes room in the
// frame layout itself, so it works in every session state.)
const listeners = new Set<() => void>()
const panelRequestedBySession = new Map<string, boolean>()

/** Whether the user asked to show the reader panel in this session. */
export function isPanelRequested(sessionId?: string): boolean {
  if (sessionId === undefined || sessionId === '') return false
  return panelRequestedBySession.get(sessionId) === true
}

/** Remember the open intent for one session (toolbar toggle). */
export function requestPanel(sessionId?: string): void {
  if (sessionId === undefined || sessionId === '') return
  panelRequestedBySession.set(sessionId, true)
  for (const listener of listeners) listener()
}

/** Clear the open intent for one session (panel close button). */
export function dismissPanel(sessionId?: string): void {
  if (sessionId === undefined || sessionId === '') return
  panelRequestedBySession.set(sessionId, false)
  for (const listener of listeners) listener()
}

/** Subscribe to intent changes; returns an unsubscribe function. */
export function subscribePanelRequested(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
