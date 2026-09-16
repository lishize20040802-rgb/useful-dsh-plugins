import { parseDocument, isMap, isSeq } from 'yaml'

const MARKER = ' useful-dsh-plugin-manager managed entry'
export function fail(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code })
}
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9@._/:-]{1,200}$/.test(value) && !value.includes('..')
}
export function isPackageName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
}
export function patchDocument(content: string) {
  // Preserve the official !!js scalar dialect; do not evaluate expressions.
  const doc = parseDocument(content, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }], uniqueKeys: true })
  if (doc.errors.length || doc.warnings.length || !isSeq(doc.contents) || doc.contents.items.some(item => !isMap(item))) {
    fail(409, 'INVALID_PATCH', 'The profile patch must be a valid YAML array of mappings; it was left unchanged.')
  }
  return doc
}
export function managedNode(node: any) {
  if (!isMap(node) || !node.commentBefore?.split('\n').includes(MARKER)) return null
  const keys = node.items.map(pair => String(pair.key))
  if (keys.length < 2 || keys.length > 3 || keys.some(key => !['id', 'name', 'disabled'].includes(key))) return null
  const id = node.get('id'), module = node.get('name')
  if (!isValidId(id) || node.get('disabled') !== true || (module !== undefined && !isPackageName(module))) return null
  return { id, module }
}
export function listManaged(content: string) {
  return (patchDocument(content).contents as any).items.map(managedNode).filter(Boolean).map(row => row.id)
}
function removeNodes(doc: any, shouldRemove: (node: any) => boolean) {
  const seq = doc.contents, kept = [], comments: string[] = []
  let removed = 0
  for (const node of seq.items) {
    if (shouldRemove(node)) {
      removed++
      const before = node.commentBefore?.split('\n').filter(line => line !== MARKER).join('\n')
      if (before) comments.push(before)
      if (node.comment) comments.push(node.comment)
      for (const pair of node.items) for (const scalar of [pair.key, pair.value]) {
        if (scalar?.commentBefore) comments.push(scalar.commentBefore)
        if (scalar?.comment) comments.push(scalar.comment)
      }
    } else {
      if (comments.length) { node.commentBefore = [...comments, node.commentBefore].filter(Boolean).join('\n'); comments.length = 0 }
      kept.push(node)
    }
  }
  if (comments.length) doc.comment = [doc.comment, ...comments].filter(Boolean).join('\n')
  seq.items = kept
  return removed
}
export function addManagedDisable(content: string, id: string, module?: string) {
  if (!isValidId(id) || (module !== undefined && !isPackageName(module))) fail(400, 'INVALID_ID', 'Invalid plugin identity.')
  const doc = patchDocument(content), seq = doc.contents as any
  for (const node of seq.items) {
    const managed = managedNode(node)
    if (managed?.id === id) {
      if (managed.module !== module) fail(409, 'PATCH_IDENTITY_CHANGED', 'A managed patch belongs to a different module identity; review it manually.')
      return { content, changed: false }
    }
  }
  const node = doc.createNode({ id, ...(module === undefined ? {} : { name: module }), disabled: true })
  node.commentBefore = MARKER
  seq.flow = false
  seq.items.push(node)
  const after = doc.toString({ lineWidth: 0 })
  patchDocument(after)
  return { content: after, changed: true }
}
export function removeManagedDisable(content: string, id: string, module?: string) {
  const doc = patchDocument(content)
  const removed = removeNodes(doc, node => {
    const managed = managedNode(node)
    return managed?.id === id && (module === undefined || managed.module === undefined || managed.module === module)
  })
  return { content: removed ? doc.toString({ lineWidth: 0 }) : content, changed: removed > 0 }
}
export function removeAllManaged(content: string, allowed?: Map<string, string>) {
  const doc = patchDocument(content)
  const removed = removeNodes(doc, node => {
    const managed = managedNode(node)
    if (!managed) return false
    if (allowed === undefined) return true
    return allowed.has(managed.id) && (managed.module === undefined || managed.module === allowed.get(managed.id))
  })
  return { content: removed ? doc.toString({ lineWidth: 0 }) : content, removed }
}
