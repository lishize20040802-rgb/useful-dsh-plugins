// dsh-desktop-launcher — unit tests for config normalization and the
// settings namespace contract.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, NAMESPACE, DEFAULT_HOST, DEFAULT_PORT } from '../lib/index.js'

test('normalizeConfig fills defaults for an empty input', () => {
  const cfg = normalizeConfig({})
  assert.equal(cfg.host, DEFAULT_HOST)
  assert.equal(cfg.port, DEFAULT_PORT)
  assert.equal(cfg.autoOpen, false)
})

test('normalizeConfig keeps explicit values', () => {
  const cfg = normalizeConfig({ host: '0.0.0.0', port: 8080, autoOpen: true })
  assert.equal(cfg.host, '0.0.0.0')
  assert.equal(cfg.port, 8080)
  assert.equal(cfg.autoOpen, true)
})

test('normalizeConfig trims strings and falls back on invalid host', () => {
  const cfg = normalizeConfig({ host: '  127.0.0.1  ', port: 3000 })
  assert.equal(cfg.host, '127.0.0.1')
  assert.equal(cfg.port, 3000)
  // 空 host 回退默认，而不是抛错（配置来自 YAML，保持宽容）
  assert.equal(normalizeConfig({ host: '   ' }).host, DEFAULT_HOST)
  // 非法端口回退默认
  assert.equal(normalizeConfig({ port: 99999 }).port, DEFAULT_PORT)
})

test('the settings namespace id is stable', () => {
  assert.equal(NAMESPACE, 'desktop-launcher')
})
