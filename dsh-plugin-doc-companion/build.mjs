// Build both halves of the dsh-plugin-doc-companion dual-face plugin.
// - typecheck + declarations: tsc (tsconfig.json) -> lib/types/*.d.ts
// - host half:   src/index.ts  -> lib/index.js  (ESM, runs in host cordis)
// - browser half: src/client.tsx -> lib/client.js (classic script: registers
//   a factory on window.__ModuleLoader__, matching the official tsdown output)
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const PACKAGE_ID = 'dsh-plugin-doc-companion'

// The 10 platform seed words every client bundle must keep as require() calls,
// resolved by the browser module table (dsh-client-web PLATFORM_MODULES).
// Value imports from any other graph plugin would additionally need its name
// in the `dsh.client.inject` manifest list.
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form'
]

// Heavy runtime libraries stay external in the host bundle: they resolve from
// the plugin's own node_modules at runtime (same convention as the harness's
// own plugins), keeping the bundle small and avoiding esbuild rewrites of
// pdf.js worker/wasm loading paths and SheetJS dynamic requires.
const HOST_EXTERNALS = [
  // Official SDK modules are provided by the host. Keep their module identity
  // and version aligned with DSH instead of embedding copies in this bundle.
  '@deepseek-ai/*',
  'pdfjs-dist',
  'mammoth',
  'xlsx',
  // Loaded from pdf.js's dependency scope so both sides share one native addon.
  '@napi-rs/canvas'
]

// Official release shape: the source must typecheck before anything builds,
// and lib/types/*.d.ts ships beside the bundles (exports.types conditions).
// The tsc JS entry runs on every platform without .bin shims.
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')

execFileSync(process.execPath, [tsc, '--noEmit'], { stdio: 'inherit' })

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'lib/index.js',
  external: HOST_EXTERNALS,
  minify: false,
  sourcemap: false,
})

await build({
  entryPoints: ['src/client.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  external: CLIENT_EXTERNALS,
  sourcemap: false,
  minify: false,
  banner: {
    js: `window.__ModuleLoader__.load({ id: "${PACKAGE_ID}", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`
  },
  footer: {
    js: 'return module.exports; } });'
  },
})

execFileSync(process.execPath, [tsc, '--emitDeclarationOnly'], { stdio: 'inherit' })

console.log('built lib/index.js + lib/client.js + lib/types/*.d.ts')
