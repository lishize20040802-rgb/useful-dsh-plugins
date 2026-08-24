// Build both halves of the dsh-desktop-config dual-face plugin.
// - typecheck + declarations: tsc (tsconfig.json) -> lib/types/*.d.ts
// - node half:   src/index.ts  -> lib/index.js   (ESM, runs in host cordis)
// - browser half: src/client.tsx -> lib/client.js (classic script: registers
//   a factory on window.__ModuleLoader__, matching the official tsdown output)
import { execSync } from 'node:child_process'
import { build } from 'esbuild'

const PACKAGE_ID = 'dsh-desktop-config'

// The platform seed words every client bundle must keep as require() calls.
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form'
]

const tsc = ['node', 'node_modules/typescript/bin/tsc']

execSync(tsc.join(' ') + ' --noEmit', { stdio: 'inherit' })

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'lib/index.js',
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/schemastery',
    '@deepseek-ai/dsh-settings'
  ],
  minify: false,
})

await build({
  entryPoints: ['src/client.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  external: CLIENT_EXTERNALS,
  sourcemap: true,
  minify: false,
  banner: {
    js: `window.__ModuleLoader__.load({ id: "${PACKAGE_ID}", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`
  },
  footer: {
    js: 'return module.exports; } });'
  },
})

execSync(tsc.join(' ') + ' --emitDeclarationOnly', { stdio: 'inherit' })

console.log('built lib/index.js + lib/client.js + lib/types/*.d.ts')
