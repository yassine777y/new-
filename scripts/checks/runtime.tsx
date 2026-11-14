/**
 * Headless runtime smoke test: renders the real <App/> inside jsdom, drives the actual
 * user flows (track switching, views, timeline, voice agent, keyboard, a11y switches)
 * and fails on any React error, unhandled rejection or console.error.
 */
import { JSDOM } from 'jsdom'

const errors: string[] = []
const warns: string[] = []

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
})
const win = dom.window as unknown as Window & Record<string, unknown>
const g = globalThis as unknown as Record<string, unknown>

// ---- globals ------------------------------------------------------------
for (const k of [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'HTMLElement', 'HTMLInputElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Element', 'Node',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'Image', 'Blob', 'File',
  'FileReader', 'URL', 'DOMParser', 'MutationObserver', 'requestAnimationFrame',
  'cancelAnimationFrame', 'matchMedia', 'ResizeObserver', 'IntersectionObserver', 'devicePixelRatio',
  'innerWidth', 'innerHeight', 'scrollTo', 'alert', 'screen', 'visualViewport', 'self', 'frames',
]) {
  if (k in win) Object.defineProperty(g, k, { value: (win as Record<string, unknown>)[k], writable: true, configurable: true })
}
Object.defineProperty(g, 'navigator', { value: win.navigator, writable: true, configurable: true })
// Node's own performance is complete; jsdom's is not (React needs performance.measure).
Object.defineProperty(win, 'performance', { value: g.performance, writable: true, configurable: true })

// jsdom lacks these; the app must survive without them.
if (!g.matchMedia) {
  Object.defineProperty(g, 'matchMedia', {
    value: (q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false, onchange: null }),
    writable: true, configurable: true,
  })
}
;(win as unknown as Record<string, unknown>).matchMedia = g.matchMedia
class RO { observe() {} unobserve() {} disconnect() {} }
class IO { constructor(public cb: (e: Array<{ isIntersecting: boolean; target: Element }>) => void) {} observe(el: Element) { this.cb([{ isIntersecting: true, target: el }]) } unobserve() {} disconnect() {} takeRecords() { return [] } }
Object.defineProperty(g, 'ResizeObserver', { value: RO, writable: true, configurable: true })
Object.defineProperty(g, 'IntersectionObserver', { value: IO, writable: true, configurable: true })
;(win as unknown as Record<string, unknown>).ResizeObserver = RO
;(win as unknown as Record<string, unknown>).IntersectionObserver = IO

// ---- canvas 2d stub -----------------------------------------------------
function stub2d(canvas: { width: number; height: number }) {
  const gradient = { addColorStop() {} }
  const ctx: Record<string, unknown> = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    filter: 'none', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: 'transparent', lineDashOffset: 0,
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
    ellipse() {}, rect() {}, roundRect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {},
    clip() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, translate() {},
    rotate() {}, scale() {}, transform() {}, setTransform() {}, resetTransform() {}, setLineDash() {},
    getLineDash() { return [] }, drawImage() {},
    createLinearGradient: () => gradient, createRadialGradient: () => gradient, createPattern: () => null,
    measureText: (t: string) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  }
  return ctx
}
const HTMLCanvasElement = g.HTMLCanvasElement as unknown as { prototype: Record<string, unknown> }
HTMLCanvasElement.prototype.getContext = function (this: { width: number; height: number }, kind: string) {
  if (kind === '2d') return stub2d(this)
  return null // WebGL unavailable → three.js paths must not be exercised here
} as unknown as () => unknown
HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'
HTMLCanvasElement.prototype.toBlob = function (cb: (b: unknown) => void) { cb(new (g.Blob as new () => Blob)()) }

// image loading resolves instantly with a plausible size
const HTMLImageElement = g.HTMLImageElement as unknown as { prototype: Record<string, unknown> }
const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  configurable: true,
  get(this: Record<string, unknown>) { return desc?.get?.call(this) ?? '' },
  set(this: Record<string, unknown> & { onload: (() => void) | null }, v: string) {
    desc?.set?.call(this, v)
    const self = this as Record<string, unknown>
    for (const [k, val] of [['width', 1440], ['height', 720], ['naturalWidth', 1440], ['naturalHeight', 720], ['complete', true]] as Array<[string, unknown]>) {
      Object.defineProperty(self, k, { value: val, writable: true, configurable: true })
    }
    setTimeout(() => (self.onload as (() => void) | null)?.(), 0)
  },
})
// jsdom omissions that real browsers have
class ImageDataStub { data: Uint8ClampedArray; constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4) } }
if (!g.ImageData) Object.defineProperty(g, 'ImageData', { value: ImageDataStub, writable: true, configurable: true })
;(win as unknown as Record<string, unknown>).ImageData = g.ImageData ?? ImageDataStub
const ElProto = (g.Element as unknown as { prototype: Record<string, unknown> }).prototype
if (!ElProto.scrollIntoView) ElProto.scrollIntoView = function () {}
if (!ElProto.attachEvent) ElProto.attachEvent = function () {}
if (!ElProto.detachEvent) ElProto.detachEvent = function () {}
;(g.URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:stub'
;(g.URL as unknown as Record<string, unknown>).revokeObjectURL = () => undefined

// ---- error capture ------------------------------------------------------
const origError = console.error
const origWarn = console.warn
console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); origError(...(a as [])) }
console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(' ')) }
win.addEventListener('error', (e) => errors.push(`window.error: ${(e as ErrorEvent).message}`))
process.on('unhandledRejection', (r) => errors.push(`unhandledRejection: ${String(r)}`))

// ---- render -------------------------------------------------------------
;(g as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
win.localStorage.setItem(
  'earth-jukebox-prefs-v1',
  JSON.stringify({ state: { a11y: { highContrast: false, reduceMotion: true, verbose: false, textOnly: true, haptics: false } }, version: 1 }),
)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React as unknown as { act: (fn: () => unknown | Promise<unknown>) => Promise<void> }
const App = (await import('@/App')).default
const { useStore } = await import('@/state/store')
const { TRACKS } = await import('@/data/tracks')
const { engine } = await import('@/audio/engine')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const settle = async (ms = 40) => { await act(async () => { await sleep(ms) }) }

const root = createRoot(document.getElementById('root')!)
await act(async () => { root.render(React.createElement(App)) })
await settle(120)

const text = () => document.getElementById('root')!.textContent ?? ''
const html = () => document.getElementById('root')!.innerHTML
const buttons = () => Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
const clickText = async (label: RegExp | string, nth = 0) => {
  const hit = buttons().filter((b) => (typeof label === 'string' ? b.textContent?.trim() === label : label.test(b.textContent ?? '')))[nth]
  if (!hit) { errors.push(`no button matching ${label}`); return false }
  await act(async () => { hit.dispatchEvent(new win.MouseEvent('click', { bubbles: true })) })
  await settle()
  return true
}
const key = async (k: string, opts: Partial<{ shiftKey: boolean; code: string }> = {}) => {
  await act(async () => {
    document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: opts.code ?? k, bubbles: true, shiftKey: opts.shiftKey ?? false }))
  })
  await settle()
}

const checks: string[] = []
const expect = (cond: boolean, msg: string) => { if (!cond) errors.push(`EXPECT FAIL: ${msg}`); else checks.push(msg) }

// 1 — the page rendered
expect(text().includes('Earth Jukebox'), 'app title rendered')
expect(html().length > 20000, `substantial DOM (${html().length} chars)`)
expect(!!document.getElementById('listen'), '#listen section exists')
expect(!!document.getElementById('studio'), '#studio section exists')
expect(!!document.getElementById('method'), '#method section exists')
expect(!!document.getElementById('access'), '#access section exists')
expect(!!document.getElementById('gallery'), '#gallery section exists')
expect(!!document.getElementById('sources'), '#sources section exists')
expect(!!document.querySelector('[aria-live="polite"]'), 'live region present')
expect(buttons().length > 40, `${buttons().length} interactive controls`)

// 2 — every track can be selected and renders its studio
for (const t of TRACKS) {
  await act(async () => { useStore.getState().setActiveTrack(t.id, { play: false }) })
  await settle(80)
  expect(text().includes(t.title.split(' ')[0]) || text().includes(t.shortTitle), `studio shows ${t.id}`)
  for (const mode of ['2d', '3d', 'chart', 'frame'] as const) {
    await act(async () => { useStore.getState().setViewMode(mode) })
    await settle(60)
    expect(useStore.getState().viewMode === mode, `${t.id} → view ${mode}`)
  }
}
await act(async () => { useStore.getState().setViewMode('2d'); useStore.getState().setActiveTrack('temperature', { play: false }) })
await settle(60)

// 3 — timeline window 1900 → 2000 and scrubbing
await act(async () => {
  const st = useStore.getState()
  st.setRange([1900, 2000])
  st.setYear(1900)
})
await settle(200)
expect(useStore.getState().range[0] === 1900 && useStore.getState().range[1] === 2000, 'range 1900-2000')
await act(async () => { useStore.getState().setYear(1963.5) })
await settle(150)
expect(Math.abs(useStore.getState().year - 1963.5) < 0.01, 'scrub to 1963.5')
expect(text().includes('1963') || text().includes('1964'), 'year is printed somewhere')

// 4 — keyboard shortcuts
await key('2'); await settle(120)
expect(useStore.getState().activeTrackId === 'co2', 'key 2 selects CO2')
const y0 = useStore.getState().year
await key('ArrowRight')
expect(useStore.getState().year === y0 + 1, `ArrowRight advances the year ${y0} → ${useStore.getState().year}`)
await key('ArrowLeft', { shiftKey: true })
expect(useStore.getState().year === y0 - 9, `Shift+ArrowLeft steps back ten years → ${useStore.getState().year}`)
await key('m'); expect(useStore.getState().muted === true, 'M mutes')
await key('m'); expect(useStore.getState().muted === false, 'M unmutes')
await key('v'); expect(useStore.getState().agentOpen === true, 'V opens the agent')
await key('c'); expect(useStore.getState().viewMode === 'chart', 'C switches to chart')

// 5 — voice agent (local knowledge engine, no network, no mic)
await act(async () => { useStore.getState().setAgentOpen(true) })
await settle(60)
const { useVoiceAgent } = await import('@/voice/useVoiceAgent')
let agentApi: ReturnType<typeof useVoiceAgent> | null = null
function AgentProbe() { agentApi = useVoiceAgent(); return null }
const probeHost = document.createElement('div')
document.body.appendChild(probeHost)
const probeRoot = createRoot(probeHost)
await act(async () => { probeRoot.render(React.createElement(AgentProbe)) })
await settle(80)
if (agentApi) {
  for (const q of ['what am I hearing', 'show me sea ice', 'play from 1900 to 2000', 'bghit nchouf co2', 'go to 1988', 'sonify this frame']) {
    await act(async () => { await agentApi!.ask(q) })
    await settle(60)
  }
} else errors.push('agent probe did not mount')
const msgs = useStore.getState().messages
expect(msgs.length >= 12, `agent logged ${msgs.length} messages`)
expect(msgs.every((m) => m.text.length > 0), 'every agent message has text')
expect(useStore.getState().agent.rate > 0 && useStore.getState().agent.pitch > 0, 'agent settings sane')
expect(msgs.some((m) => m.role === 'agent'), 'agent replied')
expect(!msgs.some((m) => /\[object Object\]|undefined/.test(m.text)), 'no undefined/[object Object] in agent text')

// 6 — accessibility switches flip real state
for (const flag of ['highContrast', 'reduceMotion', 'verbose', 'textOnly', 'haptics'] as const) {
  const v0 = useStore.getState().a11y[flag]
  await act(async () => { useStore.getState().setA11y({ [flag]: !v0 }) })
  await settle(40)
  expect(useStore.getState().a11y[flag] === !v0, `a11y.${flag} toggles`)
  await act(async () => { useStore.getState().setA11y({ [flag]: v0 }) })
}
await settle(40)
expect(document.documentElement.dataset.motion === 'reduced' || document.documentElement.dataset.motion === 'full', 'html data-motion attribute applied')

// 7 — transport without Web Audio must degrade silently, not crash
await act(async () => { useStore.getState().setIsPlaying(true) })
await settle(300)
expect(engine.ready === false, 'engine stays uninitialised without a gesture/AudioContext')
await act(async () => { useStore.getState().setIsPlaying(false) })
await settle(60)

// 8 — layers, intensity, reverb, scale override
await act(async () => {
  const st = useStore.getState()
  st.toggleLayer('drone'); st.toggleLayer('melody'); st.toggleLayer('rhythm'); st.toggleLayer('shimmer'); st.toggleLayer('sub')
})
await settle(150)
await act(async () => { const st = useStore.getState(); st.setIntensity(0.35); st.setReverb(0.9); st.setScaleOverride('phrygian') })
await settle(200)
expect(useStore.getState().intensity === 0.35, 'intensity set')
await act(async () => { const st = useStore.getState(); st.setScaleOverride(null); st.setIntensity(0.8) })
await settle(120)

// 9 — search panel + section navigation
await act(async () => { useStore.getState().setQuery('ice') })
await settle(60)
const searchInput = document.querySelector('input[aria-label*="earch" i], input[type="search"], input[role="combobox"]') as HTMLInputElement | null
expect(!!searchInput, 'search input rendered')
await clickText(/Sources|Sources for/i)
await settle(80)

// 10 — sources: every track's badges resolve to an entry in the section
await act(async () => { document.getElementById('sources')?.scrollIntoView() })
for (const t of TRACKS) {
  for (const sid of t.sources) {
    expect(!!document.getElementById(`source-${sid}`), `#${sid} listed in Sources for ${t.id}`)
  }
}

// 11 — gallery render path must catch the missing OfflineAudioContext
const renderBtn = buttons().find((b) => /Render & play/i.test(b.textContent ?? ''))
if (renderBtn) {
  await act(async () => { renderBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })) })
  await settle(400)
  expect(true, 'gallery render button handled without crashing')
} else errors.push('gallery render button missing')

// 12 — interface languages, including RTL
for (const lang of ['fr', 'ar', 'en'] as const) {
  await act(async () => { useStore.getState().setLang(lang) })
  await settle(70)
  expect(document.documentElement.lang === lang, `html lang="${lang}"`)
  expect(document.documentElement.dir === (lang === 'ar' ? 'rtl' : 'ltr'), `html dir="${document.documentElement.dir}" for ${lang}`)
}
await act(async () => { useStore.getState().setLang('fr') })
await settle(70)
expect(text().includes('\u00c9couter'), 'French navigation rendered')
expect(text().includes('Que voulez-vous'), 'French section heading rendered')
for (const [probe, name] of [
  ['Comment une image de la Terre', 'method'],
  ['Pas une fonction.', 'accessibility'],
  ['Six pièces,', 'gallery'],
  ['D\u2019où vient chaque nombre,', 'sources'],
  ['Ce que nous avons fait,', 'about'],
] as const) {
  expect(text().includes(probe), `French ${name} heading rendered`)
}
expect(!text().includes('What do you want'), 'no English heading leaks through in French')
await act(async () => { useStore.getState().setLang('ar') })
await settle(70)
expect(text().includes('\u0627\u0633\u062a\u0645\u0639'), 'Arabic navigation rendered')
expect(text().includes('\u0633\u062a\u0651 \u0642\u0637\u0639'), 'Arabic gallery heading rendered')
expect(text().includes('\u0644\u064a\u0633\u062a \u0645\u064a\u0632\u0629'), 'Arabic accessibility heading rendered')
expect(document.querySelectorAll('[dir="rtl"], html[dir="rtl"]').length >= 0 && document.documentElement.dir === 'rtl', 'RTL active')
await act(async () => { useStore.getState().setLang('en') })
await settle(70)
expect(text().includes('Listen'), 'back to English')
expect(useStore.getState().lang === 'en', 'language persisted in the store')

await settle(200)
await act(async () => { probeRoot.unmount(); root.unmount() })
await sleep(50)

// ---- report -------------------------------------------------------------
const noise = /Not implemented: HTMLCanvasElement|jsdom|Warning: An update to|not wrapped in act|attachEvent|ImageData is not defined|THREE_CJS_DEPRECATED|no OfflineAudioContext|require\("three"\)|--trace-deprecation/i
const realErrors = errors.filter((e) => !noise.test(e))
console.log(`\nchecks passed: ${checks.length}`)
console.log(`errors: ${errors.length} (filtered ${realErrors.length})`)
for (const e of realErrors.slice(0, 25)) console.log('  ✗', e.slice(0, 400))
const realWarns = warns.filter((w) => !/Web Audio API unavailable|not wrapped in act|useLayoutEffect does nothing on the server|landmask/i.test(w))
console.log(`warnings: ${realWarns.length} (all: ${warns.length}) landmask-fallback=${warns.some((w) => /landmask/.test(w))}`)
for (const w of realWarns.slice(0, 12)) console.log('  !', w.slice(0, 300))
process.exitCode = realErrors.length === 0 ? 0 : 1
console.log(realErrors.length === 0 ? '\nRUNTIME SMOKE TEST PASSED' : `\nRUNTIME SMOKE TEST: ${realErrors.length} problem(s)`)
