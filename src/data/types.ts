/** Shared data model for the jukebox. */

export interface DataPoint {
  /** Decimal year — 1991.5 means July 1991. */
  t: number
  /** Value in the track's native unit. */
  v: number
}

export interface SourceRef {
  id: string
  title: string
  publisher: string
  url: string
  /** How this source is used inside the app. */
  usedFor: string
  license?: string
  note?: string
}

export type SpatialFieldKind = 'temperature' | 'co2' | 'seaice' | 'sealevel' | 'emissions' | 'oceanheat'

export type ColormapKey = 'rdbu' | 'viridis' | 'inferno' | 'magma' | 'plasma' | 'turbo' | 'blues' | 'ice' | 'carbon'

export interface TrackEvent {
  year: number
  title: string
  detail: string
  kind: 'eruption' | 'record' | 'policy' | 'phenomenon' | 'instrument'
  /** Where it happened, when the event is a place (volcanoes, observatories, launches). */
  lat?: number
  lon?: number
  place?: string
}

export type ScaleName =
  | 'minorPentatonic'
  | 'aeolian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'harmonicMinor'
  | 'wholeTone'

export type TimbreName = 'pad' | 'bell' | 'pluck' | 'granular' | 'drone' | 'percussive' | 'glass'

export interface SonificationPreset {
  /** Musical mode the melody is quantised to. */
  scale: ScaleName
  /** Root of the drone, as a MIDI note. */
  rootMidi: number
  /** How many octaves of the scale the data may span. */
  octaves: number
  /** BPM at the low / high end of the data range. */
  bpm: [number, number]
  timbre: TimbreName
  layers: {
    drone: boolean
    melody: boolean
    rhythm: boolean
    shimmer: boolean
    sub: boolean
  }
  /** 0..1 wet reverb send. */
  reverb: number
  /** How strongly rate-of-change brightens the filter. */
  tension: number
  mood: string
  /** One-line poetic reading of the mapping, shown in the UI. */
  rule: string
}

export interface Track {
  id: string
  title: string
  shortTitle: string
  kicker: string
  tagline: string
  description: string
  unit: string
  /** Spoken form of the unit, used by the voice agent and TTS. */
  unitSpoken: string
  digits: number
  color: string
  colorSoft: string
  glyph: string
  series: DataPoint[]
  /** Inclusive data window. */
  yearSpan: [number, number]
  /** [min, max] used to normalise values into 0..1 for sound + colour. */
  domain: [number, number]
  colormap: ColormapKey
  /** For diverging maps (temperature): the value that maps to the neutral centre of the ramp. */
  divergeAt?: number
  spatial: SpatialFieldKind
  spatialNote: string
  events: TrackEvent[]
  sonification: SonificationPreset
  sources: string[]
  /** Key numbers shown on the card and in the studio header. */
  stats: Array<{ label: string; value: string }>
  /** Screen-reader / agent friendly description of the whole record. */
  audioDescription: string
  /** Spoken sentence describing one moment of the record. */
  describe(year: number, value: number, delta: number): string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  /** Object URL of a recorded audio question, when the user spoke instead of typed. */
  audioUrl?: string
  audioSeconds?: number
  at: number
  pending?: boolean
}
