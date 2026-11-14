/** Musical scales + note maths. Data is always quantised to a scale so the result stays musical. */

import type { ScaleName } from '@/data/types'

export const SCALES: Record<ScaleName, number[]> = {
  minorPentatonic: [0, 3, 5, 7, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
}

export const SCALE_LABELS: Record<ScaleName, string> = {
  minorPentatonic: 'Minor pentatonic — open, unresolved, no semitone clashes',
  aeolian: 'Natural minor — melancholy, narrative',
  dorian: 'Dorian — minor with a raised 6th, hopeful but grounded',
  phrygian: 'Phrygian — dark, insistent, a semitone above the root',
  lydian: 'Lydian — bright, floating, raised 4th',
  mixolydian: 'Mixolydian — warm major with a flat 7th',
  harmonicMinor: 'Harmonic minor — tension, machinery, an augmented step',
  wholeTone: 'Whole tone — weightless, no tonal centre',
}

export const midiToFreq = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12)

export const freqToMidi = (freq: number, a4 = 440): number => 69 + 12 * Math.log2(freq / a4)

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export const midiToName = (midi: number): string => {
  const m = Math.round(midi)
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
}

export const scaleSteps = (scale: ScaleName): number[] => SCALES[scale] ?? SCALES.aeolian

/**
 * Map a normalised value (0..1) onto a scale spanning `octaves` octaves above `rootMidi`.
 * `t` is clamped, so out-of-range data saturates instead of producing absurd pitches.
 */
export function valueToMidi(t: number, rootMidi: number, scale: ScaleName, octaves: number): number {
  const steps = scaleSteps(scale)
  const total = steps.length * octaves
  const x = Math.min(0.9999, Math.max(0, t)) * total
  const i = Math.floor(x)
  const octave = Math.floor(i / steps.length)
  const degree = steps[i % steps.length]
  return rootMidi + octave * 12 + degree
}

/** Chord built from the tonic + a data-driven interval — used for the palette-to-chord mapping. */
export function chordFromDegrees(rootMidi: number, scale: ScaleName, degrees: number[], octaveSpan = 1): number[] {
  const steps = scaleSteps(scale)
  return degrees.map((d) => {
    const idx = ((d % (steps.length * octaveSpan)) + steps.length * octaveSpan) % (steps.length * octaveSpan)
    return rootMidi + Math.floor(idx / steps.length) * 12 + steps[idx % steps.length]
  })
}

/** Hue (0..360) → scale degree. Colour becomes pitch class. */
export function hueToDegree(hue: number, scale: ScaleName, octaves = 2): number {
  const steps = scaleSteps(scale)
  const total = steps.length * octaves
  const h = ((hue % 360) + 360) % 360
  return Math.floor((h / 360) * total)
}

export function degreeToMidi(rootMidi: number, scale: ScaleName, degree: number): number {
  const steps = scaleSteps(scale)
  const n = steps.length
  const octave = Math.floor(degree / n)
  const idx = ((degree % n) + n) % n
  return rootMidi + octave * 12 + steps[idx]
}

/** Map a stereo pan from longitude: -180 → left, +180 → right. */
export const lonToPan = (lon: number): number => Math.max(-1, Math.min(1, lon / 180))

/** Map latitude to a small pitch offset: north → higher. */
export const latToMidiOffset = (lat: number, spread = 7): number => (lat / 90) * spread
