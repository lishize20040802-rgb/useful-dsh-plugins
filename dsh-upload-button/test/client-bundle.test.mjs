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
  assert.ok(src.includes('dsh-upload-button'), 'reference source name must survive bundling')
  assert.ok(src.includes('slash/input-insert-reference'), 'occurrence insertion event must survive bundling')
  assert.ok(src.includes('registerSource'), 'source codec registration must survive bundling')
  assert.ok(src.includes('dsh-up-button'), 'button styling class must survive bundling')
  assert.ok(src.includes('dsh-up-card'), 'file card styling class must survive bundling')
  assert.ok(src.includes('dsh-up-badge'), 'colored type badge styling must survive bundling')
  assert.ok(src.includes('dsh-up-error'), 'dismissible error banner must survive bundling')
  assert.ok(src.includes('useSyncExternalStore'), 'error banner subscription must survive bundling')
  assert.ok(src.includes('uV2eYG_chip'), 'draft-token hiding rule must survive bundling')
  assert.ok(src.includes('--dsh-composer-dock-inset'), 'official dock alignment formula must survive bundling')
  assert.ok(src.includes('/api/upload'), 'upload fetch must survive bundling')
  assert.ok(!src.includes('node_modules'), 'no bundler internals leaked')
})

test('sourcemap accompanies the bundle', () => {
  assert.ok(existsSync(fileURLToPath(new URL('../lib/client.js.map', import.meta.url))))
})
