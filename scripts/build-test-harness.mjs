/**
 * Bundles the main-process modules that the end-to-end test needs into a single
 * CommonJS file, so the test can exercise the real code without booting the app.
 *
 *   node scripts/build-test-harness.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

await build({
  entryPoints: [path.join(here, 'test-harness-entry.ts')],
  outfile: path.join(root, 'out', 'test-harness', 'main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'error'
})

console.log('built out/test-harness/main.cjs')
