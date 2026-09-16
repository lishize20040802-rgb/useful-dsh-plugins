import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

export const packages = [
  'dsh-plugin-doc-companion',
  'dsh-plugin-vision-reader',
  'dsh-plugin-voice-input',
  'dsh-upload-button',
  'useful-dsh-plugin-manager',
]
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const action = process.argv[2]
if (!['build', 'test', 'pack'].includes(action)) throw new Error('Use build, test, or pack.')
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this script through npm run build/test/pack:plugins.')
const output = join(root, 'artifacts')
if (action === 'pack') await mkdir(output, { recursive: true })
for (const name of packages) {
  const cwd = join(root, name)
  const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  if (action !== 'pack' && !pkg.scripts?.[action]) continue
  const args = action === 'pack'
    ? ['pack', '--ignore-scripts', '--pack-destination', output]
    : ['run', action]
  console.log(`${name}: ${action}`)
  const result = spawnSync(process.execPath, [npm, ...args], { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
