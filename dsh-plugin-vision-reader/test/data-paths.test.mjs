import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { normalizeConfig } from '../lib/index.js'
const resolvePath = inboxDir => normalizeConfig({ inboxDir }).inboxDir

test('data paths use DSH_HOME, support tilde, preserve absolute overrides and ignore launch cwd', () => {
  const oldHome = process.env.DSH_HOME, oldCwd = process.cwd()
  const home = join(tmpdir(), 'synthetic-dsh-data-home')
  try {
    process.env.DSH_HOME = home
    assert.equal(resolvePath(''), join(home, 'vision-inbox'))
    assert.equal(resolvePath('data/custom'), join(home, 'data', 'custom'))
    const explicit = join(tmpdir(), 'synthetic-custom-data')
    assert.equal(resolvePath(explicit), explicit)
    assert.equal(resolvePath('~/custom-data'), join(homedir(), 'custom-data'))
    const before = resolvePath('data/custom')
    process.chdir(tmpdir())
    assert.equal(resolvePath('data/custom'), before)
  } finally {
    process.chdir(oldCwd)
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
  }
})
