/**
 * Real-time sonification engine.
 *
 * Owns the AudioContext graph, the playback clock and the note scheduler.
 * Clock: `t0` is the AudioContext time at which `score.time === 0`, so every note is
 * placed with sample accuracy no matter how the browser throttles animation frames.
 */

import type { Score, ScoreKey, ScoreNote } from './score'
import type { TimbreName } from '@/data/types'
import { DroneVoice, playBell, playGlass, playNote, playPercussion, playSub } from './voices'
import { clamp, invLerp, lerp } from '@/lib/math'
import { makeImpulseForRender } from './impulse'

export interface EngineStatus {
  ready: boolean
  playing: boolean
  scoreTime: number
  year: number
  noteIndex: number
  bpm: number
  level: number
  finished: boolean
}

export class JukeboxEngine {
  ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private dry: GainNode | null = null
  private send: GainNode | null = null
  private convolver: ConvolverNode | null = null
  private comp: DynamicsCompressorNode | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array = new Uint8Array(0)
  private waveData: Uint8Array = new Uint8Array(0)

  private score: Score | null = null
  private t0 = 0
  private nextIndex = 0
  private timer: number | null = null
  private drone: DroneVoice | null = null
  private renderedSource: AudioBufferSourceNode | null = null
  private pausedAt = 0
  private _playing = false
  private _finished = false
  private _volume = 0.75
  private _muted = false

  /** The UI polls this (via rAF) so the visuals follow the audio clock, not the other way round. */
  onTick: ((status: EngineStatus) => void) | null = null

  get ready(): boolean {
    return this.ctx !== null
  }
  get playing(): boolean {
    return this._playing
  }
  get finished(): boolean {
    return this._finished
  }
  get currentScore(): Score | null {
    return this.score
  }

  /** True when this browser can do Web Audio at all. */
  get supported(): boolean {
    if (typeof window === 'undefined') return false
    return !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  }

  /**
   * Must be called from a user gesture the first time (browser autoplay policy).
   * Resolves to `null` — never throws — when Web Audio is unavailable, so the rest of the
   * app keeps working as a visual-only experience.
   */
  async init(): Promise<AudioContext | null> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) {
        console.warn('[Earth Jukebox] Web Audio API unavailable — running in silent visual mode')
        return null
      }
      const ctx = new Ctor({ latencyHint: 'interactive' })
      this.ctx = ctx

      this.bus = ctx.createGain()
      this.comp = ctx.createDynamicsCompressor()
      this.comp.threshold.value = -16
      this.comp.knee.value = 22
      this.comp.ratio.value = 4
      this.comp.attack.value = 0.004
      this.comp.release.value = 0.22

      this.master = ctx.createGain()
      this.master.gain.value = this._muted ? 0 : this._volume

      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.72
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
      this.waveData = new Uint8Array(this.analyser.fftSize)

      this.convolver = ctx.createConvolver()
      this.convolver.buffer = makeImpulseForRender(ctx)
      this.send = ctx.createGain()
      this.send.gain.value = 0.4
      this.dry = ctx.createGain()
      this.dry.gain.value = 0.92

      this.bus.connect(this.dry)
      this.dry.connect(this.comp)
      this.bus.connect(this.send)
      this.send.connect(this.convolver)
      this.convolver.connect(this.comp)
      this.comp.connect(this.master)
      this.master.connect(this.analyser)
      this.analyser.connect(ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        /* will retry on the next gesture */
      }
    }
    return this.ctx
  }

  setVolume(v: number) {
    this._volume = clamp(v, 0, 1)
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this._muted ? 0 : this._volume, this.ctx.currentTime, 0.03)
  }
  get volume(): number {
    return this._volume
  }
  setMuted(m: boolean) {
    this._muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this._volume, this.ctx.currentTime, 0.05)
  }
  get muted(): boolean {
    return this._muted
  }
  setReverb(amount: number) {
    if (this.send && this.ctx) this.send.gain.setTargetAtTime(clamp(amount, 0, 1), this.ctx.currentTime, 0.2)
  }

  /**
   * Load a score and (re)build the continuous drone layer for it.
   * Deliberately does NOT create an AudioContext: browsers require a user gesture, so the
   * context is created lazily by play()/preview()/ping().
   */
  async setScore(score: Score): Promise<void> {
    this.score = score
    this.nextIndex = 0
    this.pausedAt = 0
    this._finished = false
    if (!this.ctx) return
    if (this.send) this.send.gain.setTargetAtTime(score.preset.reverb, this.ctx.currentTime, 0.25)
    this.rebuildDrone()
  }

  private rebuildDrone() {
    if (!this.ctx || !this.bus || !this.score) return
    if (this.drone) {
      this.drone.stop(0.5)
      this.drone = null
    }
    if (!this.score.preset.layers.drone) return
    const d = new DroneVoice(this.ctx, this.bus, this.score.preset.rootMidi)
    d.start()
    this.drone = d
  }

  async play(fromScoreTime = this.pausedAt): Promise<void> {
    const ctx = await this.init()
    if (!ctx) return
    if (!this.score) return
    const start = clamp(fromScoreTime, 0, this.score.duration)
    this.pausedAt = start
    this.t0 = ctx.currentTime + 0.09 - start
    this.nextIndex = firstIndexAtOrAfter(this.score.notes, start)
    this._playing = true
    this._finished = false
    if (!this.drone) this.rebuildDrone()
    if (this.send) this.send.gain.setTargetAtTime(this.score.preset.reverb, ctx.currentTime, 0.3)
    this.startScheduler()
  }

  pause() {
    this._playing = false
    this.pausedAt = this.scoreTime
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.drone) this.drone.update(this.drone.root, 180, 0.0001, 0, 0.25)
  }

  stop() {
    this.stopRendered()
    this.pause()
    this.pausedAt = 0
    this.nextIndex = 0
    this._finished = false
    if (this.drone) {
      this.drone.stop(0.9)
      this.drone = null
    }
  }

  seek(scoreTime: number) {
    if (!this.score) return
    const t = clamp(scoreTime, 0, this.score.duration)
    this.pausedAt = t
    this._finished = false
    if (this._playing && this.ctx) {
      this.t0 = this.ctx.currentTime + 0.05 - t
      this.nextIndex = firstIndexAtOrAfter(this.score.notes, t)
    }
  }

  get scoreTime(): number {
    if (!this.score) return 0
    if (!this.ctx) return this.pausedAt
    return this._playing ? clamp(this.ctx.currentTime - this.t0, 0, this.score.duration) : this.pausedAt
  }

  get year(): number {
    if (!this.score) return 0
    return lerp(this.score.yearStart, this.score.yearEnd, this.scoreTime / Math.max(1e-6, this.score.duration))
  }

  /** Drone parameters at the current playhead (also used by the UI readout). */
  get currentKey(): ScoreKey | InterpolatedKey | null {
    if (!this.score) return null
    return interpolateKeys(this.score, this.scoreTime)
  }

  private startScheduler() {
    if (this.timer !== null) clearInterval(this.timer)
    const tick = () => {
      const ctx = this.ctx
      const score = this.score
      if (!ctx || !score || !this._playing) return
      const now = ctx.currentTime
      const horizon = now + 0.14
      const st = now - this.t0

      while (this.nextIndex < score.notes.length && this.t0 + score.notes[this.nextIndex].time < horizon) {
        const note = score.notes[this.nextIndex]
        this.emit(note, Math.max(now + 0.004, this.t0 + note.time))
        this.nextIndex++
      }

      if (this.drone) {
        const k = interpolateKeys(score, st)
        if (k) this.drone.update(k.midi, k.cutoff, k.gain, k.pan, 0.09)
      }

      if (this.nextIndex >= score.notes.length && st > score.duration + 0.35) {
        this._playing = false
        this._finished = true
        this.pausedAt = score.duration
        if (this.timer !== null) {
          clearInterval(this.timer)
          this.timer = null
        }
        if (this.drone) this.drone.update(score.preset.rootMidi, 200, 0.0001, 0, 0.5)
      }
      this.onTick?.(this.status())
    }
    tick()
    this.timer = window.setInterval(tick, 25)
  }

  private emit(note: ScoreNote, when: number) {
    const ctx = this.ctx
    const bus = this.bus
    if (!ctx || !bus) return
    switch (note.voice) {
      case 'tick':
      case 'shaker':
      case 'thump':
        playPercussion(ctx, bus, { midi: note.midi, when, gain: note.gain, pan: note.pan, cutoff: note.cutoff }, note.voice)
        return
      case 'sub':
        playSub(ctx, bus, { midi: note.midi, when, gain: note.gain, dur: note.dur, pan: note.pan })
        return
      default:
        playNote(ctx, bus, {
          midi: note.midi,
          when,
          dur: note.dur,
          gain: note.gain,
          pan: note.pan,
          cutoff: note.cutoff,
          timbre: note.voice as TimbreName,
        })
    }
  }

  /* --------------------------- interactive extras --------------------------- */

  /** The user clicked or focused a point on the map: ring it, panned by longitude. */
  ping(lat: number, lon: number, midi: number, intensity = 1, timbre: 'bell' | 'glass' = 'glass') {
    const ctx = this.ctx
    const bus = this.bus
    if (!ctx || !bus || this._muted) return
    const params = {
      midi: clamp(midi + (lat / 90) * 7, 12, 108),
      when: ctx.currentTime + 0.02,
      gain: 0.17 * intensity,
      pan: clamp(lon / 180, -1, 1),
      dur: timbre === 'glass' ? 2.6 : 1.8,
      cutoff: lerp(700, 6000, invLerp(-90, 90, lat)),
    }
    if (timbre === 'glass') playGlass(ctx, bus, params)
    else playBell(ctx, bus, params)
  }

  /** Play a chord built from an image palette (colour → harmony). */
  playChord(midis: number[], spread = 0.06, gain = 0.13, timbre: TimbreName = 'glass') {
    const ctx = this.ctx
    const bus = this.bus
    if (!ctx || !bus || this._muted) return
    const now = ctx.currentTime + 0.03
    midis.forEach((m, i) => {
      playNote(ctx, bus, {
        midi: m,
        when: now + i * spread,
        dur: 2.8,
        gain,
        pan: ((i % 3) - 1) * 0.28,
        cutoff: 4200,
        timbre,
      })
    })
  }

  /** Play a rendered AudioBuffer (the Gallery's offline pieces) through the same chain. */
  async playBuffer(buffer: AudioBuffer, onEnd?: () => void): Promise<void> {
    const ctx = await this.init()
    if (!ctx) return
    const bus = this.bus
    if (!bus) return
    this.stopRendered()
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(bus)
    src.onended = () => {
      this.renderedSource = null
      onEnd?.()
    }
    this.renderedSource = src
    src.start(ctx.currentTime + 0.05)
  }

  stopRendered() {
    if (this.renderedSource) {
      try {
        this.renderedSource.onended = null
        this.renderedSource.stop()
      } catch {
        /* already finished */
      }
      this.renderedSource = null
    }
  }

  /**
   * Play an arbitrary list of notes — used by the "hear the mapping" demos in the
   * Method section and by anything that needs a quick, one-off musical gesture.
   */
  async playNotes(notes: Array<{ midi: number; delay?: number; gain?: number; pan?: number; dur?: number; timbre?: TimbreName }>) {
    const ctx = await this.init()
    if (!ctx) return
    const bus = this.bus
    if (!bus) return
    const t0 = ctx.currentTime + 0.05
    for (const n of notes) {
      playNote(ctx, bus, {
        midi: n.midi,
        when: t0 + (n.delay ?? 0),
        gain: n.gain ?? 0.14,
        pan: n.pan ?? 0,
        dur: n.dur ?? 0.9,
        cutoff: 4200,
        timbre: n.timbre ?? 'glass',
      })
    }
  }

  /** Short audible preview used by the jukebox cards. */
  async preview(score: Score, seconds = 3.4) {
    const ctx = await this.init()
    if (!ctx) return
    if (!this.bus) return
    const anchor = score.notes.length ? score.notes[Math.floor(score.notes.length * 0.3)].time : 0
    const now = ctx.currentTime + 0.05
    let count = 0
    for (const n of score.notes) {
      if (n.time < anchor) continue
      if (n.time > anchor + seconds) break
      this.emit(n, now + (n.time - anchor))
      if (++count > 90) break
    }
  }

  status(): EngineStatus {
    const st = this.scoreTime
    const k = this.score ? interpolateKeys(this.score, st) : null
    return {
      ready: this.ready,
      playing: this._playing,
      scoreTime: st,
      year: this.year,
      noteIndex: this.nextIndex,
      bpm: k?.bpm ?? this.score?.preset.bpm[0] ?? 0,
      level: this.getLevel(),
      finished: this._finished,
    }
  }

  getSpectrum(target: Uint8Array): Uint8Array {
    if (!this.analyser) return target
    const bins = this.analyser.frequencyBinCount
    if (this.freqData.length !== bins) this.freqData = new Uint8Array(bins)
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>)
    const n = Math.min(target.length, bins)
    for (let i = 0; i < n; i++) {
      // log-ish grouping: low bins carry the musical information
      const f = Math.floor(Math.pow(i / n, 1.7) * bins * 0.8)
      target[i] = this.freqData[Math.min(bins - 1, f)]
    }
    return target
  }

  getWaveform(target: Uint8Array): Uint8Array {
    if (!this.analyser) return target
    const n = this.analyser.fftSize
    if (this.waveData.length !== n) this.waveData = new Uint8Array(n)
    this.analyser.getByteTimeDomainData(this.waveData as Uint8Array<ArrayBuffer>)
    const step = n / target.length
    for (let i = 0; i < target.length; i++) target[i] = this.waveData[Math.floor(i * step)]
    return target
  }

  getLevel(): number {
    if (!this.analyser) return 0
    const w = this.getWaveform(new Uint8Array(256))
    let sum = 0
    for (let i = 0; i < w.length; i++) {
      const v = (w[i] - 128) / 128
      sum += v * v
    }
    return Math.sqrt(sum / w.length)
  }

  /** Tactile/audible confirmation for interface actions — useful without looking at the screen. */
  uiBlip(kind: 'on' | 'off' | 'select' = 'select') {
    const ctx = this.ctx
    const bus = this.bus
    if (!ctx || !bus || this._muted) return
    const midi = kind === 'on' ? 88 : kind === 'off' ? 71 : 81
    playBell(ctx, bus, { midi, when: ctx.currentTime + 0.01, gain: 0.05, dur: 0.35, pan: 0, cutoff: 5200 })
  }

  /** Orientation chime when audio is first unlocked. */
  async welcomeChime() {
    const ctx = await this.init()
    if (!ctx) return
    const bus = this.bus
    if (!bus) return
    const now = ctx.currentTime + 0.05
    ;[60, 67, 72, 79].forEach((m, i) =>
      playBell(ctx, bus, { midi: m, when: now + i * 0.11, gain: 0.09, dur: 1.6, pan: (i - 1.5) * 0.25 }),
    )
  }

  dispose() {
    this.stop()
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    if (this.ctx) {
      this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    this.bus = null
    this.drone = null
    this.score = null
  }
}

interface InterpolatedKey extends ScoreKey {}

function firstIndexAtOrAfter(notes: ScoreNote[], time: number): number {
  let lo = 0
  let hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].time < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

function interpolateKeys(score: Score, st: number): InterpolatedKey | null {
  const keys = score.keys
  if (!keys.length) return null
  if (st <= keys[0].time) return keys[0]
  const last = keys[keys.length - 1]
  if (st >= last.time) return last
  const i = Math.min(keys.length - 2, Math.max(0, Math.floor(st / 0.1)))
  const a = keys[i]
  const b = keys[i + 1]
  const f = clamp((st - a.time) / (b.time - a.time || 0.1))
  return {
    time: st,
    year: lerp(a.year, b.year, f),
    value: lerp(a.value, b.value, f),
    midi: lerp(a.midi, b.midi, f),
    cutoff: lerp(a.cutoff, b.cutoff, f),
    gain: lerp(a.gain, b.gain, f),
    bpm: lerp(a.bpm, b.bpm, f),
    pan: lerp(a.pan, b.pan, f),
  }
}

/** Singleton — one audio graph for the whole app. */
export const engine = new JukeboxEngine()
