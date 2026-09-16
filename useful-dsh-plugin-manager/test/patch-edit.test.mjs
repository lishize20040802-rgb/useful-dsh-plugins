import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addManagedDisable,
  removeManagedDisable,
  listManaged,
  removeAllManaged,
  isValidId
} from '../lib/index.js'

const MARKER = '# useful-dsh-plugin-manager managed entry'

test('addManagedDisable appends one marked entry idempotently', () => {
  const first = addManagedDisable('[]\n', 'my-plugin')
  assert.equal(first.changed, true)
  assert.ok(first.content.includes(MARKER))
  assert.ok(first.content.includes('- id: my-plugin'))
  const second = addManagedDisable(first.content, 'my-plugin')
  assert.equal(second.changed, false)
  assert.equal(second.content, first.content)
})

test('addManagedDisable preserves existing user content', () => {
  const user = '- id: upload-button\n  config:\n    maxBytes: 1\n'
  const { content } = addManagedDisable(user, 'x')
  assert.ok(content.startsWith(user))
  assert.ok(content.includes(MARKER))
})

test('removeManagedDisable removes only the targeted entry', () => {
  let { content } = addManagedDisable('[]\n', 'a')
  ;({ content } = addManagedDisable(content, 'b'))
  const { content: after, changed } = removeManagedDisable(content, 'a')
  assert.equal(changed, true)
  assert.ok(!after.includes('- id: a'))
  assert.ok(after.includes('- id: b'))
  assert.equal(listManaged(after).length, 1)
})

test('removeManagedDisable reports unchanged for absent ids', () => {
  const { content, changed } = removeManagedDisable('[]\n', 'nope')
  assert.equal(changed, false)
  assert.equal(content, '[]\n')
})

test('listManaged extracts every managed id', () => {
  let { content } = addManagedDisable('[]\n', 'a')
  ;({ content } = addManagedDisable(content, 'b'))
  assert.deepEqual(listManaged(content), ['a', 'b'])
})

test('removeAllManaged clears every marked entry', () => {
  let { content } = addManagedDisable('[]\n', 'a')
  ;({ content } = addManagedDisable(content, 'b'))
  const { content: cleaned, removed } = removeAllManaged(content)
  assert.equal(removed, 2)
  assert.ok(!cleaned.includes(MARKER))
})

test('isValidId accepts sane ids and rejects junk', () => {
  assert.equal(isValidId('upload-button'), true)
  assert.equal(isValidId('@scope/pkg'), true)
  assert.equal(isValidId('a/b-c_d.e'), true)
  assert.equal(isValidId(''), false)
  assert.equal(isValidId(42), false)
  assert.equal(isValidId('bad id\n- id: x'), false)
  assert.equal(isValidId('a'.repeat(300)), false)
})

test('empty arrays, CRLF, comments and official expression tags remain valid YAML', () => {
  for (const input of ['[]\r\n', '# user note\r\n[]\r\n', '- id: user\n  disabled: !!js process.env.DISABLED\n  config:\n    value: [one, two]\n']) {
    const result = addManagedDisable(input, 'third-party', 'a-plugin')
    assert.deepEqual(listManaged(result.content), ['third-party'])
    const restored = removeManagedDisable(result.content, 'third-party', 'a-plugin')
    assert.deepEqual(listManaged(restored.content), [])
    if (input.includes('!!js')) assert.match(restored.content, /!!js process.env.DISABLED/)
    if (input.includes('# user note')) assert.match(restored.content, /# user note/)
  }
})
test('modified or malformed marker blocks are not deleted by restore', () => {
  const text = `${MARKER}\n- id: mine\n  disabled: true\n  config:\n    keep: true\n${MARKER}\n- id: other\n  disabled: false\n`
  const result = removeAllManaged(text)
  assert.equal(result.removed, 0)
  assert.equal(result.content, text)
})
test('duplicate keys and invalid top-level patch types are rejected', () => {
  for (const text of ['{}', '[]\n- id: bad', '- id: first\n  id: second\n', '- scalar']) {
    assert.throws(() => addManagedDisable(text, 'my-plugin'), { code: 'INVALID_PATCH' })
  }
})
