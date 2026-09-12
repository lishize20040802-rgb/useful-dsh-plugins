// dsh-plugin-doc-companion — browser-half upload helper.
//
// Every request carries the session id so the host keeps one reading
// position per conversation: the panel in session A never disturbs the
// panel in session B.

/** File picker accept list (mirrors the host's supported kinds). */
export const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md,.markdown'

/** Upload a document file to the host and return its registry id. */
export async function uploadDocument(file: File, sessionId?: string): Promise<{ doc_id: string }> {
  const headers: Record<string, string> = { 'x-file-name': encodeURIComponent(file.name) }
  if (sessionId !== undefined && sessionId !== '') headers['x-session'] = sessionId
  const res = await fetch('/api/doc/upload', {
    method: 'POST',
    headers,
    body: file
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`)
  }
  return res.json() as Promise<{ doc_id: string }>
}

/** Poll the host for the current document state of one session. */
export interface DocState {
  doc: {
    id: string
    name: string
    kind: string
    total_blocks: number | null
    ready: boolean
    text_layer_broken?: boolean
  } | null
  block: number | null
}

export async function fetchDocState(sessionId?: string): Promise<DocState> {
  const query = sessionId !== undefined && sessionId !== '' ? `?session=${encodeURIComponent(sessionId)}` : ''
  const res = await fetch(`/api/doc/state${query}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<DocState>
}
