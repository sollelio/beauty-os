// Build step for the static-shell service worker (ADR-0010 §7; Offline 5): after Vite writes dist/, list the shell
// files, version them by their content, and write dist/sw.js from pwa/sw.js. No runtime-caching tool, no dependency.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

export const SW_FILE = 'sw.js'
const TEMPLATE = resolve(import.meta.dirname, 'sw.js')
// what the shell needs to boot: the entry HTML, the built JS/CSS, the manifest and the icons; nothing else
const SHELL_FILE = /\.(html|js|css|webmanifest|png|svg|ico)$/i

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
}

/** The precache list ("/" stands for index.html, as the server serves it) and a version that changes with any byte. */
export function shellManifest(outDir: string): { urls: string[]; version: string } {
  const files = walk(outDir)
    .map((p) => relative(outDir, p).split(sep).join('/'))
    .filter((f) => f !== SW_FILE && SHELL_FILE.test(f))
    .sort()
  const hash = createHash('sha256')
  for (const f of files) hash.update(f).update('\0').update(readFileSync(join(outDir, f)))
  return { urls: files.map((f) => (f === 'index.html' ? '/' : `/${f}`)), version: hash.digest('hex').slice(0, 16) }
}

export function renderServiceWorker(template: string, manifest: { urls: string[]; version: string }): string {
  if (!template.includes('__BEAUTY_OS_SHELL_VERSION__') || !template.includes('__BEAUTY_OS_PRECACHE__')) throw new Error('service worker template placeholders missing')
  return template.replace("'__BEAUTY_OS_SHELL_VERSION__'", JSON.stringify(manifest.version)).replace('__BEAUTY_OS_PRECACHE__', JSON.stringify(manifest.urls))
}

export function writeServiceWorker(outDir: string, template = readFileSync(TEMPLATE, 'utf8')): { urls: string[]; version: string } {
  const manifest = shellManifest(outDir)
  if (!manifest.urls.includes('/')) throw new Error('index.html missing from the build: no shell to precache')
  writeFileSync(join(outDir, SW_FILE), renderServiceWorker(template, manifest))
  return manifest
}

/** Vite plugin (build only): writes dist/sw.js once the bundle is on disk. */
export function serviceWorkerShell(): Plugin {
  let outDir = 'dist'
  return {
    name: 'beauty-os-service-worker-shell',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() { writeServiceWorker(outDir) },
  }
}
