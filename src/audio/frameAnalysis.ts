/**
 * Visual frame → sound.
 *
 * This is the direct answer to the challenge brief: take an Earth Information Center
 * style visual frame (any image — a NASA SVS still, a Worldview screenshot, one of the
 * frames this app renders itself) and translate it into a score.
 *
 * Mapping (documented in the UI):
 *   x position across the frame  → time (a left-to-right scan, as in Chandra's sonifications)
 *   vertical centroid of light   → pitch, and stereo pan (top = high/right)
 *   brightness                   → loudness
 *   dominant hue                 → scale degree + timbre choice
 *   saturation                   → filter brightness
 *   pixel density above a level  → percussion activity
 *   palette (top colours)        → chord
 */

import type { ScaleName, SonificationPreset } from '@/data/types'
import { clamp, invLerp, lerp } from '@/lib/math'
import { degreeToMidi, hueToDegree } from './scales'
import type { Score, ScoreKey, ScoreNote } from './score'

export interface FrameColumn {
  /** 0..1 across the frame. */
  x: number
  hue: number
  saturation: number
  brightness: number
  /** Fraction of pixels above the energy threshold. */
  density: number
  /** 0 (top) .. 1 (bottom) centre of mass of brightness. */
  centroidY: number
  /** Vertical spread of the brightness — wide = chord, narrow = single note. */
  spread: number
  color: [number, number, number]
}

export interface PaletteEntry {
  color: [number, number, number]
  hue: number
  weight: number
  name: string
}

export interface FrameAnalysis {
  width: number
  height: number
  columns: FrameColumn[]
  meanBrightness: number
  contrast: number
  warmth: number
  palette: PaletteEntry[]
  /** Seconds of sound this frame maps to at the default scan rate. */
  defaultDuration: number
}

const HUE_NAMES: Array<[number, string]> = [
  [12, 'crimson'],
  [32, 'ember orange'],
  [52, 'amber'],
  [72, 'gold'],
  [100, 'olive green'],
  [140, 'vegetation green'],
  [172, 'teal'],
  [200, 'shallow water cyan'],
  [225, 'ocean blue'],
  [250, 'deep blue'],
  [275, 'indigo'],
  [300, 'violet'],
  [330, 'magenta'],
  [360, 'crimson'],
]

export function hueName(hue: number): string {
  const h = ((hue % 360) + 360) % 360
  for (const [limit, name] of HUE_NAMES) if (h <= limit) return name
  return 'crimson'
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  const d = max - min
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) h = ((bn - rn) / d + 2) * 60
    else h = ((rn - gn) / d + 4) * 60
  }
  return [h, s, l]
}

export interface AnalyseOptions {
  columns?: number
  /** Downsample width/height used for analysis (keeps 4K frames fast). */
  width?: number
  height?: number
  energyThreshold?: number
}

/** Analyse any drawable source into columns + palette. */
export function analyseFrame(source: CanvasImageSource, opts: AnalyseOptions = {}): FrameAnalysis {
  const cols = clamp(opts.columns ?? 96, 8, 512)
  const w = opts.width ?? 512
  const h = opts.height ?? (Math.round(w / 2) || 256)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data
  const threshold = opts.energyThreshold ?? 0.28

  const columns: FrameColumn[] = []
  const colW = w / cols
  let brightSum = 0
  let brightSq = 0
  let warmSum = 0
  let totalPixels = 0
  const hueHist = new Float64Array(36)

  for (let c = 0; c < cols; c++) {
    const x0 = Math.floor(c * colW)
    const x1 = Math.max(x0 + 1, Math.floor((c + 1) * colW))
    let lumSum = 0
    let centSum = 0
    let centWeight = 0
    let dense = 0
    let n = 0
    let satSum = 0
    let hueX = 0
    let hueY = 0
    let rSum = 0
    let gSum = 0
    let bSum = 0
    const rows = new Float64Array(h)
    for (let y = 0; y < h; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const [hue, sat, lum] = rgbToHsl(r, g, b)
        const energy = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255)
        rows[y] += energy * sat + energy * 0.35
        lumSum += energy
        satSum += sat
        centSum += energy * (y / h)
        centWeight += energy
        if (energy > threshold) dense++
        n++
        const weight = energy * (0.25 + sat)
        hueX += Math.cos((hue * Math.PI) / 180) * weight
        hueY += Math.sin((hue * Math.PI) / 180) * weight
        hueHist[Math.min(35, Math.floor(hue / 10))] += weight
        rSum += r
        gSum += g
        bSum += b
        brightSum += energy
        brightSq += energy * energy
        warmSum += (r - b) / 255
        totalPixels++
      }
    }
    const meanLum = n ? lumSum / n : 0
    const centroidY = centWeight > 1e-6 ? centSum / centWeight : 0.5
    // vertical spread (standard deviation of the row energy profile)
    let rowTotal = 0
    for (let y = 0; y < h; y++) rowTotal += rows[y]
    let variance = 0
    if (rowTotal > 1e-6) {
      let mean = 0
      for (let y = 0; y < h; y++) mean += (rows[y] / rowTotal) * (y / h)
      for (let y = 0; y < h; y++) variance += (rows[y] / rowTotal) * (y / h - mean) ** 2
    }
    // circular mean of hue, weighted by energy x saturation
    const hueMag = Math.hypot(hueX, hueY)
    const avgHue = hueMag > 1e-6 ? (Math.atan2(hueY, hueX) * 180) / Math.PI : 0
    columns.push({
      x: (c + 0.5) / cols,
      hue: (avgHue + 360) % 360,
      saturation: n ? satSum / n : 0,
      brightness: meanLum,
      density: n ? dense / n : 0,
      centroidY,
      spread: Math.sqrt(variance),
      color: [Math.round(rSum / Math.max(1, n)), Math.round(gSum / Math.max(1, n)), Math.round(bSum / Math.max(1, n))],
    })
  }

  // palette: dominant hue bins
  const palette: PaletteEntry[] = []
  const hueTotal = Array.from(hueHist).reduce((a, b) => a + b, 0) || 1
  for (let b = 0; b < 36; b++) {
    if (hueHist[b] / hueTotal < 0.03) continue
    palette.push({
      color: hslToRgb(b * 10 + 5, 0.72, 0.55),
      hue: b * 10 + 5,
      weight: hueHist[b] / hueTotal,
      name: hueName(b * 10 + 5),
    })
  }
  palette.sort((a, b) => b.weight - a.weight)

  const meanBrightness = totalPixels ? brightSum / totalPixels : 0
  const varianceAll = totalPixels ? Math.max(0, brightSq / totalPixels - meanBrightness ** 2) : 0

  return {
    width: w,
    height: h,
    columns,
    meanBrightness,
    contrast: Math.sqrt(varianceAll),
    warmth: totalPixels ? warmSum / totalPixels : 0,
    palette: palette.slice(0, 6),
    defaultDuration: Math.max(4, Math.round(cols / 6)),
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)]
}

/** Top 3 palette colours → a chord in the given scale. */
export function paletteToChord(a: FrameAnalysis, scale: ScaleName = 'aeolian', rootMidi = 57): number[] {
  const picks = a.palette.slice(0, 3)
  if (!picks.length) return [rootMidi, rootMidi + 7, rootMidi + 12]
  const degrees = picks
    .map((p) => hueToDegree(p.hue, scale, 2))
    .sort((x, y) => x - y)
  return degrees.map((d) => degreeToMidi(rootMidi, scale, d))
}

export interface FrameScoreOptions {
  duration?: number
  scale?: ScaleName
  rootMidi?: number
  intensity?: number
  /** notes per column, capped */
  voicesPerColumn?: number
  withPercussion?: boolean
}

const FRAME_PRESET: SonificationPreset = {
  scale: 'aeolian',
  rootMidi: 45,
  octaves: 3,
  bpm: [70, 120],
  timbre: 'glass',
  layers: { drone: true, melody: true, rhythm: true, shimmer: true, sub: false },
  reverb: 0.6,
  tension: 0.7,
  mood: 'Frame scan',
  rule: 'Left→right scan: x → time, height of light → pitch and pan, brightness → loudness, hue → timbre',
}

/** Convert a frame analysis into a playable / renderable score. */
export function frameToScore(a: FrameAnalysis, opts: FrameScoreOptions = {}): Score {
  const duration = Math.max(2, opts.duration ?? a.defaultDuration)
  const scale = opts.scale ?? FRAME_PRESET.scale
  const rootMidi = opts.rootMidi ?? FRAME_PRESET.rootMidi
  const intensity = clamp(opts.intensity ?? 0.8, 0.1, 1)
  const preset: SonificationPreset = { ...FRAME_PRESET, scale, rootMidi }
  const notes: ScoreNote[] = []
  const keys: ScoreKey[] = []

  const colDur = duration / a.columns.length

  a.columns.forEach((col, i) => {
    const time = i * colDur
    // top of the frame = high note, bottom = low note (inverted centroidY)
    const height = 1 - col.centroidY
    const deg = Math.round(clamp(height, 0, 1) * 22)
    const midi = degreeToMidi(rootMidi + 12, scale, deg)
    const brightness = clamp(col.brightness * 2.2)
    const gain = clamp(0.03 + brightness * 0.24 * intensity, 0.004, 0.3)
    const timbre = col.saturation > 0.55 ? (col.hue < 90 || col.hue > 300 ? 'bell' : 'glass') : col.brightness > 0.45 ? 'pluck' : 'pad'
    const pan = clamp((0.5 - col.centroidY) * 1.4, -1, 1)

    if (brightness > 0.04) {
      notes.push({
        time,
        midi,
        dur: colDur * (timbre === 'pad' ? 3.2 : 1.6),
        gain,
        pan,
        cutoff: lerp(600, 6200, clamp(col.saturation * 0.7 + brightness * 0.5)),
        voice: timbre,
        layer: 'melody',
        year: col.x,
        label: `${hueName(col.hue)} · ${Math.round(brightness * 100)}%`,
      })
    }

    // a wide vertical spread becomes a chord (two more voices)
    if (col.spread > 0.2 && brightness > 0.14 && (opts.voicesPerColumn ?? 3) > 1) {
      const second = degreeToMidi(rootMidi + 12, scale, Math.max(0, deg - 3))
      notes.push({
        time: time + colDur * 0.15,
        midi: second,
        dur: colDur * 2.4,
        gain: gain * 0.5,
        pan: -pan * 0.6,
        cutoff: 2600,
        voice: 'pad',
        layer: 'harmony',
        year: col.x,
      })
    }

    if (opts.withPercussion !== false && col.density > 0.3) {
      notes.push({
        time: time + colDur * 0.5,
        midi: rootMidi,
        dur: 0.1,
        gain: clamp(0.05 * col.density * intensity, 0.004, 0.14),
        pan: pan * 0.4,
        cutoff: lerp(2200, 8200, col.density),
        voice: col.density > 0.55 ? 'shaker' : 'tick',
        layer: 'rhythm',
        year: col.x,
      })
    }

    keys.push({
      time,
      year: col.x,
      value: col.brightness,
      midi: degreeToMidi(rootMidi - 12, scale, Math.round(brightness * 4)),
      cutoff: lerp(220, 3000, clamp(brightness + col.saturation * 0.4)),
      gain: lerp(0.04, 0.16, clamp(brightness)) * intensity,
      bpm: lerp(70, 130, clamp(brightness)),
      pan: pan * 0.3,
    })
  })

  notes.sort((x, y) => x.time - y.time)
  return {
    trackId: 'frame',
    notes,
    keys,
    marks: [],
    duration,
    yearStart: 0,
    yearEnd: 1,
    preset,
    noteCount: notes.length,
    ruleSummary: `${a.columns.length} columns scanned over ${duration.toFixed(1)} s · ${a.palette
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ') || 'no dominant hue'} · mean brightness ${(a.meanBrightness * 100).toFixed(0)}% · contrast ${(a.contrast * 100).toFixed(0)}%`,
  }
}

/** A compact spoken description of a frame — used by the voice agent and screen readers. */
export function describeFrame(a: FrameAnalysis, title = 'this frame'): string {
  const pal = a.palette.slice(0, 3)
  const paletteText = pal.length
    ? pal.map((p) => `${p.name} (${Math.round(p.weight * 100)}%)`).join(', ')
    : 'a narrow, low-saturation range'
  const bright = a.meanBrightness
  const brightText = bright > 0.55 ? 'bright' : bright > 0.3 ? 'mid-toned' : 'dark'
  const contrastText = a.contrast > 0.24 ? 'high contrast' : a.contrast > 0.12 ? 'moderate contrast' : 'low contrast'
  const warm = a.warmth > 0.06 ? 'warm-biased' : a.warmth < -0.06 ? 'cool-biased' : 'neutral in temperature'
  const densest = a.columns.reduce((best, c) => (c.density > best.density ? c : best), a.columns[0])
  return `${title} is ${brightText} and ${contrastText}, ${warm}. Its palette is dominated by ${paletteText}. The most energetic part of the frame sits at ${Math.round(
    densest.x * 100,
  )}% across and ${Math.round(densest.centroidY * 100)}% down, which is where the scan places the loudest notes.`
}

export const frameValueLabel = (a: FrameAnalysis): string =>
  `brightness ${(a.meanBrightness * 100).toFixed(0)}% · contrast ${(a.contrast * 100).toFixed(0)}% · warmth ${(a.warmth * 100).toFixed(0)}`

export const columnToMidi = (col: FrameColumn, scale: ScaleName, rootMidi: number): number =>
  degreeToMidi(rootMidi, scale, Math.round(invLerp(1, 0, col.centroidY) * 20))
