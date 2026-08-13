// Build both halves of the dsh-upload-button dual-face plugin.
// - node half:   src/index.ts  -> lib/index.js   (ESM, runs in host cordis)
// - browser half: src/client.tsx -> lib/client.js (classic script: registers
//   a factory on window.__ModuleLoader__, matching the official tsdown output)
import { build } from 'esbuild'

const PACKAGE_ID = 'dsh-upload-button'

// The 10 platform seed words every client bundle must keep as require() calls,
// resolved by the browser module table (dsh-client-web PLATFORM_MODULES). This
// bundle imports values from no other graph plugin (its services — slots,
// sessions, inputTriggers — ride cordis injection, not module imports).
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

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'lib/index.js',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'],
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

console.log('built lib/index.js (node half) and lib/client.js (browser half)')
