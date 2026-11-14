/**
 * Global app state (zustand).
 * Kept intentionally flat so the voice agent can drive the whole interface
 * ("play sea ice from 1990 to 2010" is a single dispatch).
 */

import { create } from 'zustand'
import type { ChatMessage, Track } from '@/data/types'
import { TRACKS, trackById } from '@/data/tracks'
import { clamp } from '@/lib/math'
import type { Lang } from '@/i18n'

export type ViewMode = '2d' | '3d' | 'chart' | 'frame'

export interface AgentSettings {
  /** Where spoken answers come from. */
  voiceName: string | null
  rate: number
  pitch: number
  /** Set to an OpenAI-compatible endpoint to swap the local knowledge engine for a model. */
  endpoint: string
  speakAnswers: boolean
}

export interface A11ySettings {
  highContrast: boolean
  reduceMotion: boolean
  verbose: boolean
  /** Turn off WebGL/canvas layers and expose the data as tables instead. */
  textOnly: boolean
  haptics: boolean
}

interface JukeboxState {
  /* navigation */
  section: string
  setSection: (s: string) => void

  /* the track being listened to */
  activeTrackId: string | null
  setActiveTrack: (id: string, opts?: { play?: boolean }) => void
  activeTrack: () => Track

  /* time window + playhead */
  range: [number, number]
  setRange: (r: [number, number]) => void
  year: number
  setYear: (y: number) => void
  isPlaying: boolean
  setIsPlaying: (p: boolean) => void
  /** Playback duration in seconds for the current window. */
  duration: number
  setDuration: (d: number) => void
  loop: boolean
  toggleLoop: () => void
  scoreTime: number
  setScoreTime: (t: number) => void

  /* view */
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  showEvents: boolean
  toggleEvents: () => void
  showGrid: boolean
  toggleGrid: () => void

  /* sonification parameters */
  volume: number
  setVolume: (v: number) => void
  muted: boolean
  toggleMute: () => void
  intensity: number
  setIntensity: (v: number) => void
  reverb: number
  setReverb: (v: number) => void
  scaleOverride: string | null
  setScaleOverride: (s: string | null) => void
  layers: { drone: boolean; melody: boolean; rhythm: boolean; shimmer: boolean; sub: boolean }
  toggleLayer: (k: keyof JukeboxState['layers']) => void

  /* interaction on the map / globe */
  selected: { lat: number; lon: number } | null
  setSelected: (p: { lat: number; lon: number } | null) => void
  hovered: { lat: number; lon: number; t: number } | null
  setHovered: (p: { lat: number; lon: number; t: number } | null) => void

  /* engine status mirrors */
  bpm: number
  setBpm: (b: number) => void
  level: number
  setLevel: (l: number) => void
  audioUnlocked: boolean
  setAudioUnlocked: (v: boolean) => void

  /* frame studio */
  /** 0..1 progress of a frame scan (the frame score has no year axis). */
  frameProgress: number
  setFrameProgress: (v: number) => void
  frameSource: string | null
  setFrameSource: (s: string | null) => void
  frameScoreId: number
  bumpFrameScore: () => void

  /* voice agent */
  agentOpen: boolean
  setAgentOpen: (v: boolean) => void
  messages: ChatMessage[]
  pushMessage: (m: ChatMessage) => void
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  listening: boolean
  setListening: (v: boolean) => void
  interim: string
  setInterim: (s: string) => void
  speaking: boolean
  setSpeaking: (v: boolean) => void
  recording: boolean
  setRecording: (v: boolean) => void
  agent: AgentSettings
  setAgentSettings: (p: Partial<AgentSettings>) => void

  /* accessibility */
  a11y: A11ySettings
  setA11y: (p: Partial<A11ySettings>) => void

  /* announcements for screen readers */
  announcement: string
  announce: (text: string) => void

  /* search */
  query: string
  setQuery: (q: string) => void
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void

  /* misc UI */
  /** Installation mode: fullscreen, chrome hidden, auto-advancing through every dataset. */
  ambient: boolean
  setAmbient: (v: boolean) => void

  /** Interface language; also the language the guide agent speaks. */
  lang: Lang
  setLang: (lang: Lang) => void

  studioOpen: boolean
  setStudioOpen: (v: boolean) => void
  nowPlayingLabel: string
  setNowPlayingLabel: (s: string) => void
}

const LS_KEY = 'earth-jukebox-prefs-v1'

interface Prefs {
  a11y?: Partial<A11ySettings>
  agent?: Partial<AgentSettings>
  volume?: number
  lang?: Lang
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const prefs = typeof window === 'undefined' ? {} : loadPrefs()

const reduceMotionQuery =
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export const useStore = create<JukeboxState>((set, get) => ({
  section: 'hero',
  setSection: (section) => set({ section }),

  activeTrackId: 'temperature',
  setActiveTrack: (id, opts) => {
    const track = trackById(id)
    const [defLo, defHi] = defaultRangeFor(track)
    // Keep the window the listener chose (e.g. 1900 → 2000) when this dataset actually
    // covers it, so comparing two phenomena happens over the same years.
    const cur = get().range
    const fits = cur[1] > cur[0] && cur[0] >= defLo && cur[1] <= defHi
    const [lo, hi] = fits ? cur : [defLo, defHi]
    set({
      activeTrackId: track.id,
      range: [lo, hi],
      year: fits ? clamp(get().year, lo, hi) : lo,
      studioOpen: true,
      scoreTime: 0,
      isPlaying: opts?.play ?? get().isPlaying,
      selected: null,
      announcement: `${track.title} selected. ${track.tagline}. Data from ${track.kicker}.`,
    })
  },
  activeTrack: () => trackById(get().activeTrackId),

  range: [1900, 2000],
  setRange: (range) =>
    set({
      range,
      year: Math.min(Math.max(get().year, range[0]), range[1]),
      scoreTime: 0,
    }),
  year: 1900,
  setYear: (year) => set({ year }),
  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  duration: 24,
  setDuration: (duration) => set({ duration, scoreTime: 0 }),
  loop: true,
  toggleLoop: () => set({ loop: !get().loop }),
  scoreTime: 0,
  setScoreTime: (scoreTime) => set({ scoreTime }),

  viewMode: '2d',
  setViewMode: (viewMode) => set({ viewMode }),
  showEvents: true,
  toggleEvents: () => set({ showEvents: !get().showEvents }),
  showGrid: true,
  toggleGrid: () => set({ showGrid: !get().showGrid }),

  volume: prefs.volume ?? 0.72,
  setVolume: (volume) => set({ volume }),
  muted: false,
  toggleMute: () => set({ muted: !get().muted }),
  intensity: 0.8,
  setIntensity: (intensity) => set({ intensity }),
  reverb: 0.6,
  setReverb: (reverb) => set({ reverb }),
  scaleOverride: null,
  setScaleOverride: (scaleOverride) => set({ scaleOverride }),
  layers: { drone: true, melody: true, rhythm: true, shimmer: true, sub: true },
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),

  selected: null,
  setSelected: (selected) => set({ selected }),
  hovered: null,
  setHovered: (hovered) => set({ hovered }),

  bpm: 0,
  setBpm: (bpm) => set({ bpm }),
  level: 0,
  setLevel: (level) => set({ level }),
  audioUnlocked: false,
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),

  frameProgress: 0,
  setFrameProgress: (frameProgress) => set({ frameProgress }),
  frameSource: null,
  setFrameSource: (frameSource) => set({ frameSource }),
  frameScoreId: 0,
  bumpFrameScore: () => set({ frameScoreId: get().frameScoreId + 1 }),

  agentOpen: false,
  setAgentOpen: (agentOpen) => set({ agentOpen }),
  messages: [
    {
      id: 'welcome',
      role: 'agent',
      text: 'Salam — I am the Earth Jukebox guide. Ask me anything about what you are hearing, or say "play sea ice from 1990 to 2010". Tap the microphone and speak, or record your question as audio.',
      at: Date.now(),
    },
  ],
  pushMessage: (m) => set({ messages: [...get().messages, m] }),
  patchMessage: (id, patch) =>
    set({ messages: get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
  listening: false,
  setListening: (listening) => set({ listening }),
  interim: '',
  setInterim: (interim) => set({ interim }),
  speaking: false,
  setSpeaking: (speaking) => set({ speaking }),
  recording: false,
  setRecording: (recording) => set({ recording }),
  agent: {
    voiceName: prefs.agent?.voiceName ?? null,
    rate: prefs.agent?.rate ?? 1,
    pitch: prefs.agent?.pitch ?? 1,
    endpoint: prefs.agent?.endpoint ?? (import.meta.env.VITE_AGENT_API_URL as string | undefined) ?? '',
    speakAnswers: prefs.agent?.speakAnswers ?? true,
  },
  setAgentSettings: (p) => {
    const agent = { ...get().agent, ...p }
    set({ agent })
    persist({ agent })
  },

  a11y: {
    highContrast: prefs.a11y?.highContrast ?? false,
    reduceMotion: prefs.a11y?.reduceMotion ?? (reduceMotionQuery?.matches ?? false),
    verbose: prefs.a11y?.verbose ?? false,
    textOnly: prefs.a11y?.textOnly ?? false,
    haptics: prefs.a11y?.haptics ?? true,
  },
  setA11y: (p) => {
    const a11y = { ...get().a11y, ...p }
    set({ a11y })
    persist({ a11y })
  },

  announcement: '',
  announce: (text) => set({ announcement: text }),

  query: '',
  setQuery: (query) => set({ query }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  ambient: false,
  setAmbient: (ambient) => set({ ambient }),

  lang: (prefs.lang as Lang) ?? 'en',
  setLang: (lang) => {
    set({ lang })
    persist({ lang })
  },

  studioOpen: false,
  setStudioOpen: (studioOpen) => set({ studioOpen }),
  nowPlayingLabel: '',
  setNowPlayingLabel: (nowPlayingLabel) => set({ nowPlayingLabel }),
}))

function persist(partial: Prefs) {
  try {
    const current = loadPrefs()
    localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    /* private mode — preferences simply will not persist */
  }
}

/** Every track defaults to the widest window it has data for, clipped to 1900 onwards. */
/**
 * The window a dataset opens on.
 *
 * The brief asks for a 1900 → 2000 timeline, so that century is the default wherever the
 * record actually covers it. Datasets that begin later (satellite sea ice from 1979,
 * ocean heat from 1971) open on the part of the century they really have, and never
 * invent years before their first observation. "Full record" in the Timeline presets
 * always reaches the present day.
 */
export function defaultRangeFor(track: Track): [number, number] {
  const lo = Math.ceil(Math.max(track.yearSpan[0], 1900))
  const hi = Math.floor(Math.min(track.yearSpan[1], 2000))
  if (hi > lo) return [lo, hi]
  return [Math.ceil(track.yearSpan[0]), Math.floor(track.yearSpan[1])]
}

export const allTracks = TRACKS
