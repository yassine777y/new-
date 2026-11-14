/**
 * Synthesis primitives.
 *
 * Every voice takes a `BaseAudioContext`, so exactly the same code drives
 * real-time playback (AudioContext) and offline rendering (OfflineAudioContext)
 * for the downloadable WAV pieces in the Gallery.
 */

import type { TimbreName } from '@/data/types'
import { midiToFreq } from './scales'

export interface NoteParams {
  midi: number
  when: number
  dur?: number
  gain?: number
  pan?: number
  /** Filter cutoff in Hz; higher = brighter. */
  cutoff?: number
  timbre?: TimbreName
  detune?: number
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx)
  if (cached) return cached
  const len = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let last = 0
    for (let i = 0; i < len; i++) {
      // slightly pink-ish noise: one-pole filter over white noise
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      d[i] = white * 0.6 + last * 3.2
    }
  }
  noiseCache.set(ctx, buf)
  return buf
}

function panner(ctx: BaseAudioContext, pan = 0): AudioNode {
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    return p
  }
  const g = ctx.createGain()
  return g
}

function adsr(ctx: BaseAudioContext, when: number, peak: number, attack: number, dur: number, release: number): GainNode {
  const g = ctx.createGain()
  const p = Math.max(0.0001, peak)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(p, when + attack)
  g.gain.setValueAtTime(p, when + Math.max(attack, dur))
  g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(attack, dur) + release)
  return g
}

/** Warm evolving pad: three detuned oscillators + sub, through a low-pass. */
export function playPad(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams) {
  const when = p.when
  const dur = p.dur ?? 1.6
  const freq = midiToFreq(p.midi)
  const out = adsr(ctx, when, p.gain ?? 0.16, 0.28, dur, 0.9)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(Math.max(120, p.cutoff ?? 900), when)
  filt.Q.value = 0.8
  const pan = panner(ctx, p.pan)
  filt.connect(out)
  out.connect(pan)
  pan.connect(dest)
  const oscs: OscillatorNode[] = []
  const spread = p.detune ?? 7
  for (const [mult, det, level] of [
    [1, -spread, 0.42],
    [1, spread, 0.42],
    [2, 0, 0.16],
    [0.5, 0, 0.3],
  ] as const) {
    const o = ctx.createOscillator()
    o.type = mult === 0.5 ? 'sine' : mult === 2 ? 'triangle' : 'sawtooth'
    o.frequency.value = freq * mult
    o.detune.value = det
    const g = ctx.createGain()
    g.gain.value = level
    o.connect(g)
    g.connect(filt)
    o.start(when)
    o.stop(when + dur + 1.1)
    oscs.push(o)
  }
  return oscs
}

/** FM bell — the "glass" voice for ice and shimmer. */
export function playBell(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams) {
  const when = p.when
  const freq = midiToFreq(p.midi)
  const dur = p.dur ?? 1.1
  const out = adsr(ctx, when, p.gain ?? 0.2, 0.006, dur * 0.12, dur)
  const pan = panner(ctx, p.pan)
  out.connect(pan)
  pan.connect(dest)
  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.value = freq
  const mod = ctx.createOscillator()
  mod.type = 'sine'
  mod.frequency.value = freq * 2.76
  const modGain = ctx.createGain()
  modGain.gain.setValueAtTime(freq * 1.8, when)
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.05), when + dur * 0.9)
  mod.connect(modGain)
  modGain.connect(carrier.frequency)
  const partial = ctx.createOscillator()
  partial.type = 'sine'
  partial.frequency.value = freq * 5.4
  const partialGain = ctx.createGain()
  partialGain.gain.setValueAtTime(0.06 * (p.gain ?? 0.2), when)
  partialGain.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.5)
  partial.connect(partialGain)
  partialGain.connect(out)
  carrier.connect(out)
  carrier.start(when)
  mod.start(when)
  partial.start(when)
  const end = when + dur + 0.2
  carrier.stop(end)
  mod.stop(end)
  partial.stop(end)
  return [carrier, mod, partial]
}

/** Bright, short glass ping used for extremes and location pings. */
export function playGlass(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams) {
  const when = p.when
  const freq = midiToFreq(p.midi)
  const dur = p.dur ?? 2.2
  const out = adsr(ctx, when, p.gain ?? 0.13, 0.01, 0.02, dur)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 240
  const pan = panner(ctx, p.pan)
  hp.connect(out)
  out.connect(pan)
  pan.connect(dest)
  for (const [mult, level] of [
    [1, 0.5],
    [2.01, 0.22],
    [3.02, 0.1],
    [4.98, 0.05],
  ] as const) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq * mult
    o.detune.value = (Math.random() - 0.5) * 6
    const g = ctx.createGain()
    g.gain.value = level
    o.connect(g)
    g.connect(hp)
    o.start(when)
    o.stop(when + dur + 0.3)
  }
  return []
}

/** Plucked string — the melodic workhorse. */
export function playPluck(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams) {
  const when = p.when
  const freq = midiToFreq(p.midi)
  const dur = p.dur ?? 0.5
  const out = adsr(ctx, when, p.gain ?? 0.2, 0.004, dur * 0.3, dur)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(Math.max(300, p.cutoff ?? 2600), when)
  filt.frequency.exponentialRampToValueAtTime(Math.max(180, (p.cutoff ?? 2600) * 0.35), when + dur)
  filt.Q.value = 1.2
  const pan = panner(ctx, p.pan)
  filt.connect(out)
  out.connect(pan)
  pan.connect(dest)
  for (const [type, mult, level] of [
    ['triangle', 1, 0.6],
    ['sawtooth', 1, 0.22],
    ['sine', 2, 0.12],
  ] as const) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq * mult
    o.detune.value = (Math.random() - 0.5) * 5
    const g = ctx.createGain()
    g.gain.value = level
    o.connect(g)
    g.connect(filt)
    o.start(when)
    o.stop(when + dur + 0.4)
  }
  return []
}

/** Granular cloud — a burst of tiny grains, used for ocean heat and density. */
export function playGranular(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams, grains = 6) {
  const when = p.when
  const freq = midiToFreq(p.midi)
  const pan = panner(ctx, p.pan ?? 0)
  pan.connect(dest)
  for (let i = 0; i < grains; i++) {
    const t = when + i * (0.028 + Math.random() * 0.03)
    const f = freq * (1 + (Math.random() - 0.5) * 0.09) * (Math.random() > 0.82 ? 2 : 1)
    const g = adsr(ctx, t, (p.gain ?? 0.1) * (0.5 + Math.random() * 0.6), 0.008, 0.02, 0.16 + Math.random() * 0.16)
    const o = ctx.createOscillator()
    o.type = Math.random() > 0.5 ? 'sine' : 'triangle'
    o.frequency.value = f
    o.connect(g)
    g.connect(pan)
    o.start(t)
    o.stop(t + 0.5)
  }
  return []
}

/** Percussive hit: filtered noise + a low thump. */
export function playPercussion(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams, kind: 'tick' | 'thump' | 'shaker' = 'tick') {
  const when = p.when
  const pan = panner(ctx, p.pan ?? 0)
  pan.connect(dest)
  const gain = p.gain ?? 0.14
  if (kind === 'tick' || kind === 'shaker') {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer(ctx)
    src.playbackRate.value = kind === 'shaker' ? 1.4 : 1
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = Math.max(200, p.cutoff ?? (kind === 'shaker' ? 6200 : 3200))
    bp.Q.value = kind === 'shaker' ? 0.9 : 1.6
    const env = adsr(ctx, when, gain * (kind === 'shaker' ? 0.5 : 0.8), 0.001, 0.01, kind === 'shaker' ? 0.09 : 0.05)
    src.connect(bp)
    bp.connect(env)
    env.connect(pan)
    src.start(when, Math.random() * 1.2)
    src.stop(when + 0.4)
  }
  if (kind === 'thump' || kind === 'tick') {
    const o = ctx.createOscillator()
    o.type = 'sine'
    const base = midiToFreq(p.midi - 24)
    o.frequency.setValueAtTime(base * 2.2, when)
    o.frequency.exponentialRampToValueAtTime(base, when + 0.09)
    const env = adsr(ctx, when, gain * (kind === 'thump' ? 1 : 0.45), 0.003, 0.02, kind === 'thump' ? 0.34 : 0.12)
    o.connect(env)
    env.connect(pan)
    o.start(when)
    o.stop(when + 0.6)
  }
  return []
}

/** Sustained sub-bass. */
export function playSub(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams) {
  const when = p.when
  const freq = midiToFreq(p.midi)
  const dur = p.dur ?? 2
  const out = adsr(ctx, when, p.gain ?? 0.22, 0.06, dur, 0.5)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = Math.max(90, freq * 3)
  const pan = panner(ctx, p.pan ?? 0)
  lp.connect(out)
  out.connect(pan)
  pan.connect(dest)
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = freq
  const o2 = ctx.createOscillator()
  o2.type = 'triangle'
  o2.frequency.value = freq * 2
  const g2 = ctx.createGain()
  g2.gain.value = 0.16
  o.connect(lp)
  o2.connect(g2)
  g2.connect(lp)
  o.start(when)
  o2.start(when)
  o.stop(when + dur + 0.7)
  o2.stop(when + dur + 0.7)
  return []
}

export function playNote(ctx: BaseAudioContext, dest: AudioNode, p: NoteParams) {
  const timbre = p.timbre ?? 'pad'
  switch (timbre) {
    case 'pad':
      return playPad(ctx, dest, p)
    case 'bell':
    case 'percussive':
      if (timbre === 'percussive') return playPercussion(ctx, dest, p, 'thump')
      return playBell(ctx, dest, p)
    case 'glass':
      return playGlass(ctx, dest, p)
    case 'pluck':
      return playPluck(ctx, dest, p)
    case 'granular':
      return playGranular(ctx, dest, p)
    case 'drone':
      return playPad(ctx, dest, { ...p, dur: p.dur ?? 2.2, gain: (p.gain ?? 0.14) * 0.9 })
  }
}

/* ------------------------------------------------------------------ *
 * Persistent drone voice (continuous layer that follows the data)
 * ------------------------------------------------------------------ */

export class DroneVoice {
  private oscs: OscillatorNode[] = []
  private gains: GainNode[] = []
  private filter: BiquadFilterNode
  private out: GainNode
  private pan: StereoPannerNode | null = null
  private started = false

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
    private rootMidi: number,
  ) {
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 500
    this.filter.Q.value = 1.1
    this.out = ctx.createGain()
    this.out.gain.value = 0.0001
    if (typeof ctx.createStereoPanner === 'function') {
      this.pan = ctx.createStereoPanner()
      this.filter.connect(this.out)
      this.out.connect(this.pan)
      this.pan.connect(dest)
    } else {
      this.filter.connect(this.out)
      this.out.connect(dest)
    }
  }

  start() {
    if (this.started) return
    const now = this.ctx.currentTime
    const ratios = [0.5, 1, 1.006, 1.5, 2]
    const levels = [0.5, 0.34, 0.3, 0.12, 0.08]
    const types: OscillatorType[] = ['sine', 'sawtooth', 'sawtooth', 'triangle', 'sine']
    ratios.forEach((r, i) => {
      const o = this.ctx.createOscillator()
      o.type = types[i]
      o.frequency.value = midiToFreq(this.rootMidi) * r
      o.detune.value = (i - 2) * 4
      const g = this.ctx.createGain()
      g.gain.value = levels[i]
      o.connect(g)
      g.connect(this.filter)
      o.start(now)
      this.oscs.push(o)
      this.gains.push(g)
    })
    this.started = true
  }

  /** Smooth parameter update — `tc` is the smoothing time constant in seconds. */
  update(midi: number, cutoffHz: number, gain: number, pan = 0, tc = 0.12) {
    if (!this.started) return
    const now = this.ctx.currentTime
    const base = midiToFreq(midi)
    const ratios = [0.5, 1, 1.006, 1.5, 2]
    this.oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * ratios[i], now, tc))
    this.filter.frequency.setTargetAtTime(Math.max(80, cutoffHz), now, tc)
    this.out.gain.setTargetAtTime(Math.max(0.0001, gain), now, tc)
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, tc)
  }

  setRoot(midi: number) {
    this.rootMidi = midi
  }

  get root(): number {
    return this.rootMidi
  }

  /**
   * Explicit automation for offline rendering, where `currentTime` is frozen at 0.
   * Keyframes are written with linear ramps so the drone glides exactly like the
   * real-time version.
   */
  scheduleAutomation(
    keys: Array<{ time: number; midi: number; cutoff: number; gain: number; pan: number }>,
    fadeOutAt?: number,
  ) {
    if (!this.started) return
    const base = this.oscs[0]
    const ratios = [0.5, 1, 1.006, 1.5, 2]
    keys.forEach((k, idx) => {
      const t = Math.max(0, k.time)
      const f = midiToFreq(k.midi)
      this.oscs.forEach((o, i) => {
        if (idx === 0) o.frequency.setValueAtTime(f * ratios[i], t)
        else o.frequency.linearRampToValueAtTime(f * ratios[i], t)
      })
      if (idx === 0) this.filter.frequency.setValueAtTime(Math.max(80, k.cutoff), t)
      else this.filter.frequency.linearRampToValueAtTime(Math.max(80, k.cutoff), t)
      if (idx === 0) this.out.gain.setValueAtTime(Math.max(0.0001, k.gain), t)
      else this.out.gain.linearRampToValueAtTime(Math.max(0.0001, k.gain), t)
      if (this.pan) {
        if (idx === 0) this.pan.pan.setValueAtTime(k.pan, t)
        else this.pan.pan.linearRampToValueAtTime(k.pan, t)
      }
      void base
    })
    if (fadeOutAt != null) {
      this.out.gain.linearRampToValueAtTime(0.0001, fadeOutAt)
    }
  }

  stop(release = 1.2) {
    if (!this.started) return
    const now = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setTargetAtTime(0.0001, now, release / 3)
    this.oscs.forEach((o) => {
      try {
        o.stop(now + release + 0.4)
      } catch {
        /* already stopped */
      }
    })
    this.started = false
  }
}
