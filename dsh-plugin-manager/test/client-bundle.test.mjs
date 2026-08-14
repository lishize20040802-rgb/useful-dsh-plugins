import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = 'dsh-plugin-manager'

test('client bundle is a ModuleLoader factory envelope', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(
    src.startsWith(`window.__ModuleLoader__.load({ id: "${PACKAGE_ID}", factory: (require) => {`),
    'bundle must start with the ModuleLoader factory envelope'
  )
  assert.ok(src.includes('return module.exports; } });'), 'bundle must close the factory envelope')
  assert.ok(src.includes('require("react")') || src.includes('require("react/jsx-runtime")'), 'react must stay external')
  assert.ok(src.includes('require("@deepseek-ai/dsh-client-ui-primitives")'), 'primitives must stay external')
  assert.ok(src.includes('settings.plugins.tab'), 'settings tab registration must survive bundling')
  assert.ok(src.includes('pluginInventory'), 'inventory remote usage must survive bundling')
  assert.ok(src.includes('/api/plugin-manager'), 'manager API calls must survive bundling')
  assert.ok(src.includes('dsh-pm-row'), 'row styling class must survive bundling')
  assert.ok(!src.includes('node_modules'), 'no bundler internals leaked')
})

test('sourcemap accompanies the bundle', () => {
  assert.ok(existsSync(fileURLToPath(new URL('../lib/client.js.map', import.meta.url))))
})
