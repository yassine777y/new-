/**
 * Web Speech wrappers: recognition (mic → text) and synthesis (text → voice).
 * Both are optional — the app degrades to typed questions and text answers.
 */

type AnyWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ 0: { transcript: string; confidence: number }; isFinal: boolean; length: number }>
}

export function recognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as AnyWindow
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function synthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function createRecognition(lang = 'en-US'): SpeechRecognitionLike | null {
  if (!recognitionSupported()) return null
  const w = window as AnyWindow
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = lang
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1
  return rec
}

/* ----------------------------- synthesis ----------------------------- */

let voicesCache: SpeechSynthesisVoice[] = []
let voicesLoaded = false

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!synthesisSupported()) return Promise.resolve([])
  if (voicesLoaded && voicesCache.length) return Promise.resolve(voicesCache)
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices()
    if (existing.length) {
      voicesCache = existing
      voicesLoaded = true
      resolve(existing)
      return
    }
    const timer = window.setTimeout(() => {
      voicesCache = window.speechSynthesis.getVoices()
      voicesLoaded = true
      resolve(voicesCache)
    }, 1200)
    window.speechSynthesis.onvoiceschanged = () => {
      voicesCache = window.speechSynthesis.getVoices()
      voicesLoaded = true
      window.clearTimeout(timer)
      resolve(voicesCache)
    }
  })
}

/** Prefer a natural English voice; fall back to whatever exists. */
export function pickVoice(preferredName: string | null, langPrefix = 'en'): SpeechSynthesisVoice | null {
  const voices = voicesCache.length ? voicesCache : synthesisSupported() ? window.speechSynthesis.getVoices() : []
  if (!voices.length) return null
  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName)
    if (exact) return exact
  }
  const preferred = ['Google UK English Female', 'Google US English', 'Samantha', 'Microsoft Aria', 'Microsoft Jenny', 'Daniel', 'Serena']
  for (const p of preferred) {
    const v = voices.find((x) => x.name.includes(p))
    if (v) return v
  }
  const en = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix))
  return en ?? voices[0]
}

export interface SpeakOptions {
  voiceName?: string | null
  rate?: number
  pitch?: number
  volume?: number
  lang?: string
  onStart?: () => void
  onEnd?: () => void
  onBoundary?: (charIndex: number) => void
}

let currentUtterance: SpeechSynthesisUtterance | null = null

export function cancelSpeech() {
  if (!synthesisSupported()) return
  window.speechSynthesis.cancel()
  currentUtterance = null
}

/** Chunk long text so browsers that cut off around ~200 characters stay reliable. */
function chunkText(text: string, max = 190): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) ?? [text]
  const out: string[] = []
  let buf = ''
  for (const s of sentences) {
    if ((buf + s).length > max && buf) {
      out.push(buf.trim())
      buf = ''
    }
    if (s.length > max) {
      // split very long sentences on commas / spaces
      const parts = s.split(/,\s*|\s+/)
      let cur = ''
      for (const p of parts) {
        if ((cur + ' ' + p).length > max && cur) {
          out.push(cur.trim())
          cur = ''
        }
        cur += (cur ? ' ' : '') + p
      }
      buf = cur
    } else {
      buf += s
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out.length ? out : [text]
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!synthesisSupported() || !text.trim()) {
      opts.onEnd?.()
      resolve()
      return
    }
    cancelSpeech()
    const chunks = chunkText(text)
    const voice = pickVoice(opts.voiceName ?? null)
    let index = 0
    const synth = window.speechSynthesis

    const next = () => {
      if (index >= chunks.length) {
        currentUtterance = null
        opts.onEnd?.()
        resolve()
        return
      }
      const u = new SpeechSynthesisUtterance(chunks[index++])
      if (voice) u.voice = voice
      u.rate = clampNum(opts.rate ?? 1, 0.5, 2)
      u.pitch = clampNum(opts.pitch ?? 1, 0, 2)
      u.volume = clampNum(opts.volume ?? 1, 0, 1)
      u.lang = opts.lang ?? voice?.lang ?? 'en-US'
      u.onstart = () => index === 1 && opts.onStart?.()
      u.onend = next
      u.onerror = next
      u.onboundary = (e) => opts.onBoundary?.(e.charIndex)
      currentUtterance = u
      synth.speak(u)
    }
    next()
  })
}

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function isSpeaking(): boolean {
  return synthesisSupported() && window.speechSynthesis.speaking
}

export { currentUtterance }
