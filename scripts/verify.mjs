#!/usr/bin/env node
/**
 * `npm run verify` — three gates, in order, stopping at the first failure:
 *
 *   1. types      tsc --noEmit over the whole app
 *   2. logic      datasets, the score builder, scales, spatial fields and the voice
 *                 agent's knowledge engine — pure functions, no DOM needed
 *   3. runtime    the real <App/> rendered inside jsdom, then driven through the actual
 *                 user flows (dataset switching, view modes, the 1900→2000 timeline,
 *                 keyboard shortcuts, the agent, the a11y switches, transport with no
 *                 AudioContext, the gallery's failure path). Fails on any React error,
 *                 unhandled rejection or console.error.
 *
 * WebGL and Web Audio cannot exist in jsdom, which is exactly why gate 3 is useful: it
 * proves the app degrades instead of crashing when they are missing.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'node_modules', '.verify')
mkdirSync(outDir, { recursive: true })

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  return r.status ?? 1
}

const gate = (n) => {
  console.error(`\n✗ gate ${n} failed`)
  process.exit(1)
}

console.log('── 1/3 types ──')
if (run('npx', ['tsc', '--noEmit']) !== 0) gate(1)

const targets = [
  { entry: 'scripts/checks/logic.ts', out: 'logic.mjs', name: '2/3 logic (data · score · scales · agent)' },
  { entry: 'scripts/checks/runtime.tsx', out: 'runtime.mjs', name: '3/3 runtime (real <App/> in jsdom)' },
]

for (const [i, t] of targets.entries()) {
  await build({
    entryPoints: [path.join(root, t.entry)],
    outfile: path.join(outDir, t.out),
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    packages: 'external',
    alias: { '@': path.join(root, 'src') },
    define: {
      'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'development', DEV: true, PROD: false }),
      'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'warning',
  })
  console.log(`\n── ${t.name} ──`)
  if (run(process.execPath, [path.join(outDir, t.out)]) !== 0) gate(i + 2)
}

console.log('\n✓ all three gates passed')
