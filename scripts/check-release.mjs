// Check a source checkout before committing; no file contents are printed.
import { readdir, readFile, lstat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = process.argv[2] ? resolve(process.argv[2]) : dirname(dirname(fileURLToPath(import.meta.url)))
const findings = []
let count = 0
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'artifacts'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    const rel = relative(root, path).replaceAll('\\', '/')
    if ((await lstat(path)).isSymbolicLink()) { findings.push(`${rel}: unexpected symlink`); continue }
    if (entry.isDirectory()) { await walk(path); continue }
    count++
    if (/\.(?:wav|mp3|m4a|onnx|log|tgz|map)$|\.bak|^\.env|(?:^|\/)\.npmrc$/i.test(rel)) findings.push(`${rel}: local or generated artifact`)
    if (!/\.(?:[cm]?js|tsx?|json|ya?ml|md|ps1|txt)$/.test(rel)) continue
    const content = await readFile(path, 'utf8')
    const patterns = [
      ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
      ['access token', /\b(?:ghp_|github_pat_|sk-proj-)[a-zA-Z0-9_]{20,}/],
      ['personal Windows directory', /[A-Z]:[\\/](?:Users|Documents and Settings)[\\/](?!<|%|\$|example\b|user\b|you\b)[\w.-]+/i],
      ['credential URL', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
    ]
    for (const [kind, pattern] of patterns) if (pattern.test(content)) findings.push(`${rel}: ${kind}`)
  }
}
await walk(root)
console.log(JSON.stringify({ checkedFiles: count, findings }, null, 2))
if (findings.length) process.exitCode = 1
