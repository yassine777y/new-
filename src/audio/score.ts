/**
 * Score builder — the "translation algorithm".
 *
 * A pure function: dataset + time window + artistic ruleset → a list of timed musical
 * events. The exact same score drives real-time playback and the offline WAV renders in
 * the Gallery, so what you hear is what you download.
 *
 * Mapping rules (documented in the UI under "How it works"):
 *   value            → pitch height, quantised to the track's scale
 *   |rate of change| → tempo (bpm), filter brightness and percussion density
 *   decade boundary  → octave leap / cadence back to the root
 *   regional centroid→ stereo pan (emissions: the plumes literally move across the field)
 *   extremes & events→ struck bells and glass harmonics
 */

import type { SonificationPreset, TimbreName, Track, TrackEvent } from '@/data/types'
import { clamp, invLerp, lerp, sampleSeries, fbm3 } from '@/lib/math'
import { EMISSION_HOTSPOTS, hotspotWeights } from '@/lib/fields'
import { degreeToMidi, lonToPan, midiToName, valueToMidi } from './scales'

export type ScoreVoice = TimbreName | 'tick' | 'shaker' | 'thump' | 'sub'

export interface ScoreNote {
  /** Seconds from the start of the score. */
  time: number
  midi: number
  dur: number
  gain: number
  pan: number
  cutoff: number
  voice: ScoreVoice
  layer: 'melody' | 'harmony' | 'rhythm' | 'shimmer' | 'sub' | 'event'
  /** Decimal year this note represents — shown in the "what you are hearing" readout. */
  year: number
  label?: string
}

export interface ScoreKey {
  time: number
  year: number
  value: number
  midi: number
  cutoff: number
  gain: number
  bpm: number
  pan: number
}

export interface ScoreEventMark {
  time: number
  year: number
  title: string
  detail: string
}

export interface Score {
  trackId: string
  notes: ScoreNote[]
  keys: ScoreKey[]
  marks: ScoreEventMark[]
  duration: number
  yearStart: number
  yearEnd: number
  preset: SonificationPreset
  noteCount: number
  /** Human readable summary of the ruleset actually applied. */
  ruleSummary: string
}

export interface ScoreOptions {
  /** Master expressiveness 0..1 — scales note gain and layer density. */
  intensity?: number
  scaleOverride?: SonificationPreset['scale']
  rootOffset?: number
  layers?: Partial<SonificationPreset['layers']>
  /** Melody steps per beat (0.5 = one note every two beats). */
  subdivision?: number
  /** Pan source: 'data' (regional centroid) or 'centre'. */
  pan?: 'data' | 'centre' | 'sweep'
}

const statsCache = new Map<string, { maxAbsDelta: number; min: number; max: number }>()

export function seriesStats(track: Track) {
  const cached = statsCache.get(track.id)
  if (cached) return cached
  let maxAbsDelta = 1e-6
  let min = Infinity
  let max = -Infinity
  const h = 1
  for (let i = 0; i < track.series.length; i++) {
    const p = track.series[i]
    if (p.v < min) min = p.v
    if (p.v > max) max = p.v
    const a = sampleSeries(track.series, p.t - h)
    const b = sampleSeries(track.series, p.t + h)
    const d = Math.abs((b - a) / (2 * h))
    if (d > maxAbsDelta) maxAbsDelta = d
  }
  const stats = { maxAbsDelta, min, max }
  statsCache.set(track.id, stats)
  return stats
}

/** Circular mean longitude of the emission plumes — the "where is the carbon" pointer. */
export function emissionCentroidLon(year: number): number {
  const w = hotspotWeights(year)
  let sx = 0
  let sy = 0
  for (let i = 0; i < EMISSION_HOTSPOTS.length; i++) {
    const rad = (EMISSION_HOTSPOTS[i].lon * Math.PI) / 180
    sx += Math.cos(rad) * w[i]
    sy += Math.sin(rad) * w[i]
  }
  return (Math.atan2(sy, sx) * 180) / Math.PI
}

/** Which region dominates emissions at this year (used in the readout). */
export function dominantEmitter(year: number): string {
  const w = hotspotWeights(year)
  let best = 0
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i
  return EMISSION_HOTSPOTS[best].name
}

const bpmFor = (preset: SonificationPreset, norm: number, tension: number): number =>
  lerp(preset.bpm[0], preset.bpm[1], clamp(norm * 0.55 + tension * 0.45))

/**
 * Build the score.
 * @param durationSec how long the window should take to play.
 */
export function buildScore(
  track: Track,
  yearStart: number,
  yearEnd: number,
  durationSec: number,
  opts: ScoreOptions = {},
): Score {
  const preset: SonificationPreset = {
    ...track.sonification,
    scale: opts.scaleOverride ?? track.sonification.scale,
    layers: { ...track.sonification.layers, ...(opts.layers ?? {}) },
  }
  const layers = preset.layers
  const intensity = clamp(opts.intensity ?? 0.8, 0.05, 1)
  const subdivision = opts.subdivision ?? 1
  const rootOffset = opts.rootOffset ?? 0
  const root = preset.rootMidi + rootOffset

  const span = Math.max(0.0001, yearEnd - yearStart)
  const duration = Math.max(1, durationSec)
  const yps = span / duration // years per second
  const stats = seriesStats(track)
  const [dLo, dHi] = track.domain

  const notes: ScoreNote[] = []
  const keys: ScoreKey[] = []
  const marks: ScoreEventMark[] = []

  /* ---- continuous drone automation (10 keys per second) ---- */
  const keyStep = 0.1
  for (let t = 0; t <= duration + 1e-6; t += keyStep) {
    const year = yearStart + t * yps
    const value = sampleSeries(track.series, year)
    const norm = invLerp(dLo, dHi, value)
    const delta = (sampleSeries(track.series, year + 0.5) - sampleSeries(track.series, year - 0.5)) / 1
    const tension = clamp(Math.abs(delta) / stats.maxAbsDelta)
    const bpm = bpmFor(preset, norm, tension)
    const midi = valueToMidi(norm, root, preset.scale, 1.2)
    const cutoff = lerp(180, 3400, clamp(norm * 0.6 + tension * preset.tension * 0.7))
    const pan =
      opts.pan === 'centre'
        ? 0
        : track.id === 'emissions'
          ? lonToPan(emissionCentroidLon(year)) * 0.5
          : fbm3(year * 0.08, 3.1, 0) * 0.35
    keys.push({
      time: t,
      year,
      value,
      midi,
      cutoff,
      gain: lerp(0.05, 0.2, intensity) * (0.55 + 0.45 * norm),
      bpm,
      pan,
    })
  }

  /* ---- melodic / rhythmic steps ---- */
  let t = 0
  let stepIndex = 0
  let lastMidi = -999
  while (t < duration) {
    const year = yearStart + t * yps
    const value = sampleSeries(track.series, year)
    const norm = invLerp(dLo, dHi, value)
    const delta = (sampleSeries(track.series, year + 0.5) - sampleSeries(track.series, year - 0.5)) / 1
    const tension = clamp(Math.abs(delta) / stats.maxAbsDelta)
    const bpm = bpmFor(preset, norm, tension)
    const beatSec = 60 / bpm
    const stepSec = beatSec / subdivision

    const pan =
      opts.pan === 'centre'
        ? 0
        : track.id === 'emissions'
          ? lonToPan(emissionCentroidLon(year)) * 0.75
          : clamp(fbm3(year * 0.11, 7.7, 1.3, 2) * 0.8, -0.85, 0.85)

    const cutoff = lerp(500, 5200, clamp(norm * 0.5 + tension * preset.tension))

    // --- melody: value → scale degree, with an anti-repetition rule ---
    if (layers.melody) {
      let midi = valueToMidi(norm, root + 12, preset.scale, preset.octaves)
      const isCadence = stepIndex % 16 === 0
      const isDecade = Math.abs(year / 10 - Math.round(year / 10)) < 0.5 / Math.max(1, yps * stepSec) * 0.5
      if (isCadence) midi = root + 12 // resolve to the root
      else if (isDecade) midi += 12 // decade leap
      if (Math.round(midi) === lastMidi) midi += 2 // keep the line moving
      lastMidi = Math.round(midi)

      const accent = stepIndex % 4 === 0 ? 1.18 : 1
      notes.push({
        time: t,
        midi,
        dur: beatSec * (isCadence ? 1.9 : 0.85),
        gain: clamp(0.16 * intensity * accent * (0.55 + 0.6 * norm), 0.005, 0.3),
        pan,
        cutoff,
        voice: preset.timbre === 'percussive' ? 'pluck' : preset.timbre === 'drone' ? 'pad' : preset.timbre,
        layer: 'melody',
        year,
      })

      // --- harmony: a third/fifth under every fourth step ---
      if (layers.melody && stepIndex % 4 === 2) {
        notes.push({
          time: t + beatSec * 0.02,
          midi: degreeToMidi(root + 12, preset.scale, Math.round((midi - root - 12) / 2) + 2),
          dur: beatSec * 1.5,
          gain: 0.09 * intensity,
          pan: -pan * 0.6,
          cutoff: cutoff * 0.8,
          voice: 'pad',
          layer: 'harmony',
          year,
        })
      }
    }

    // --- rhythm: rate of change → pulse density ---
    if (layers.rhythm) {
      const density = clamp(0.18 + tension * 1.5 * intensity + norm * 0.25, 0, 0.95)
      const slots = preset.timbre === 'percussive' ? 4 : 2
      for (let s = 0; s < slots; s++) {
        const rnd = pseudoRandom(track.id, stepIndex, s)
        if (rnd > density) continue
        const kind: ScoreVoice = s === 0 ? 'thump' : rnd > 0.72 ? 'shaker' : 'tick'
        notes.push({
          time: t + (s * beatSec) / slots,
          midi: root,
          dur: 0.12,
          gain: clamp((kind === 'thump' ? 0.16 : 0.07) * intensity * (0.6 + tension), 0.004, 0.24),
          pan: clamp(pan * 0.5 + (s % 2 === 0 ? -0.15 : 0.15), -1, 1),
          cutoff: lerp(1800, 7600, tension),
          voice: kind,
          layer: 'rhythm',
          year,
        })
      }
    }

    // --- sub: slow gravity notes for the low-register tracks ---
    if (layers.sub && stepIndex % 8 === 0) {
      notes.push({
        time: t,
        midi: root - 12,
        dur: beatSec * 3.4,
        gain: 0.17 * intensity * (0.4 + 0.6 * norm),
        pan: 0,
        cutoff: 320,
        voice: 'sub',
        layer: 'sub',
        year,
      })
    }

    // --- shimmer: rapid change or extremes ring a high glass note ---
    if (layers.shimmer && (tension > 0.45 || norm > 0.93) && stepIndex % 2 === 0) {
      notes.push({
        time: t + beatSec * 0.5,
        midi: valueToMidi(norm, Math.min(root + 24, 81), 'lydian', 2),
        dur: 2.4,
        gain: 0.075 * intensity * clamp(tension + 0.2),
        pan: clamp(pan * -1.2, -1, 1),
        cutoff: 6000,
        voice: 'glass',
        layer: 'shimmer',
        year,
      })
    }

    t += stepSec
    stepIndex++
    if (stepIndex > 6000) break // safety valve for absurd windows
  }

  /* ---- annotated events get a distinct strike ---- */
  for (const ev of track.events as TrackEvent[]) {
    if (ev.year < yearStart || ev.year > yearEnd) continue
    const time = ((ev.year - yearStart) / span) * duration
    marks.push({ time, year: ev.year, title: ev.title, detail: ev.detail })
    const chord = [0, 2, 4].map((d) => degreeToMidi(root + 12, preset.scale, d + (ev.kind === 'record' ? 4 : 0)))
    chord.forEach((midi, i) => {
      notes.push({
        time: time + i * 0.07,
        midi: midi + (ev.kind === 'eruption' ? -12 : 0),
        dur: ev.kind === 'record' ? 3.2 : 2.2,
        gain: 0.15 * intensity,
        pan: (i - 1) * 0.3,
        cutoff: ev.kind === 'eruption' ? 900 : 4200,
        voice: ev.kind === 'eruption' ? 'pad' : 'glass',
        layer: 'event',
        year: ev.year,
        label: ev.title,
      })
    })
    if (ev.kind === 'eruption') {
      notes.push({
        time,
        midi: root - 24,
        dur: 2.6,
        gain: 0.22 * intensity,
        pan: 0,
        cutoff: 220,
        voice: 'thump',
        layer: 'event',
        year: ev.year,
        label: ev.title,
      })
    }
  }

  // Musical safety rail: nothing leaves the piano's range (A0..C7), so no window of
  // any dataset can produce inaudible sub-bass or piercing glass.
  for (const n of notes) n.midi = clamp(n.midi, 21, 96)
  for (const k of keys) k.midi = clamp(k.midi, 21, 96)

  notes.sort((a, b) => a.time - b.time)

  return {
    trackId: track.id,
    notes,
    keys,
    marks,
    duration,
    yearStart,
    yearEnd,
    preset,
    noteCount: notes.length,
    ruleSummary: `${preset.scale} scale, root ${midiToName(root)}, ${Math.round(preset.bpm[0])}–${Math.round(preset.bpm[1])} bpm, ${notes.length} events over ${duration.toFixed(1)} s (${span.toFixed(0)} years)`,
  }
}

/** Deterministic pseudo-random in [0,1) — keeps a score identical across renders. */
export function pseudoRandom(seedStr: string, a: number, b: number): number {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= a * 374761393
  h ^= b * 668265263
  h = (h ^ (h >>> 13)) >>> 0
  return (h % 100000) / 100000
}

/** A one-line description of what is happening at a moment of the score. */
export function describeMoment(track: Track, year: number, note?: ScoreNote): string {
  const value = sampleSeries(track.series, year)
  const base = track.describe(year, value, (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2)
  if (!note) return base
  return `${base} You are hearing ${midiToName(note.midi)} in ${track.sonification.scale}, played by the ${note.layer} layer.`
}
