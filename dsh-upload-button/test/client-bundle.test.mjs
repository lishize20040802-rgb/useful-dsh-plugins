import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = 'dsh-upload-button'

test('client bundle is a ModuleLoader factory envelope', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(
    src.startsWith(`window.__ModuleLoader__.load({ id: "${PACKAGE_ID}", factory: (require) => {`),
    'bundle must start with the ModuleLoader factory envelope'
  )
  assert.ok(
    src.includes('return module.exports; } });'),
    'bundle must close the factory envelope (sourceMappingURL comment may follow)'
  )
  assert.ok(src.includes('require("react")') || src.includes('require("react/jsx-runtime")'), 'react must stay external')
  assert.ok(src.includes('require("@deepseek-ai/dsh-client-ui-primitives")'), 'primitives must stay external')
  assert.ok(src.includes('conversation.input.left'), 'button slot registration must survive bundling')
  assert.ok(src.includes('conversation.input.dock'), 'file card dock registration must survive bundling')
  assert.ok(src.includes('dsh-upload-button'), 'package id / locale namespace must survive bundling')
  assert.ok(src.includes('dsh-up-button'), 'button styling class must survive bundling')
  assert.ok(src.includes('dsh-up-card'), 'file card styling class must survive bundling')
  assert.ok(src.includes('dsh-up-badge'), 'colored type badge styling must survive bundling')
  assert.ok(src.includes('dsh-up-error'), 'dismissible error banner must survive bundling')
  assert.ok(src.includes('useSyncExternalStore'), 'banner/pending subscription must survive bundling')
  assert.ok(src.includes('--dsh-composer-dock-inset'), 'official dock alignment formula must survive bundling')
  assert.ok(src.includes('chatFileMentions'), 'chat file-mention provider must survive bundling')
  assert.ok(src.includes('openPath'), 'file open action must survive bundling')
  assert.ok(src.includes('/api/upload'), 'upload fetch must survive bundling')
  assert.ok(!src.includes('node_modules'), 'no bundler internals leaked')
})

test('client bundle never touches the composer draft', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(!src.includes('slash/input-insert-reference'), 'occurrence insertion must be gone (draft stays untouched)')
  assert.ok(!src.includes('registerSource'), 'input-trigger source registration must be gone')
  assert.ok(!src.includes('setDraft'), 'the draft must never be written by the plugin')
  assert.ok(!src.includes('uV2eYG_chip'), 'draft-chip hiding rule must be gone')
})

test('client bundle attaches files at send time via the session prompt facade', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(src.includes('installSendAttachment'), 'send-time prompt wrapper must survive bundling')
  assert.ok(src.includes('pendingOf'), 'pending-attachment store must survive bundling')
  assert.ok(src.includes('addPendingFile'), 'pending-append must survive bundling')
  assert.ok(src.includes('removePendingFile'), 'pending-remove must survive bundling')
  assert.ok(src.includes('session.prompt'), 'the official prompt facade must be the interception point')
  assert.ok(src.includes('binding('), 'session binding resolution must survive bundling')
})

test('client bundle registers the official locale namespace', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(src.includes('locale.register'), 'package dictionaries must register through ctx.locale')
  assert.ok(src.includes('upload.button'), 'zh dictionary keys must survive bundling')
  assert.ok(src.includes('Upload file'), 'en dictionary must survive bundling')
})

test('client bundle shadows the user bubble with words-only + floating cards', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(src.includes('conversation.chat.node'), 'user-bubble shadow slot must survive bundling')
  assert.ok(src.includes('priority: -1'), 'shadow renderer must win over the official priority-0 entry')
  assert.ok(src.includes('dsh-up-msg-files'), 'floating file-card row styling must survive bundling')
  assert.ok(src.includes('dsh-up-msg-bubble'), 'words-only bubble styling must survive bundling')
  assert.ok(src.includes('dsh-up-msg-file'), 'floating file card styling must survive bundling')
  assert.ok(src.includes('UPLOAD_PATH_RE'), 'upload-path stripping must survive bundling')
  assert.ok(src.includes('require("@deepseek-ai/dsh-client-ui-attachment")'), 'message image gallery import must stay external')
})

test('declaration outputs accompany the bundles', () => {
  assert.ok(existsSync(fileURLToPath(new URL('../lib/client.js.map', import.meta.url))), 'client sourcemap must exist')
  assert.ok(existsSync(fileURLToPath(new URL('../lib/types/index.d.ts', import.meta.url))), 'node-half declarations must exist')
  assert.ok(existsSync(fileURLToPath(new URL('../lib/types/client.d.ts', import.meta.url))), 'browser-half declarations must exist')
})
