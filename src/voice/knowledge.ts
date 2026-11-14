/**
 * The guide agent's knowledge engine.
 *
 * Offline-first: every answer is composed from the datasets bundled with the app plus a
 * curated knowledge base, so the jukebox works at a hackathon booth with no network.
 * If you set `VITE_AGENT_API_URL` (or paste an endpoint in the agent settings) the same
 * questions are sent to that OpenAI-compatible endpoint instead, with the live app state
 * (current track, year, value, sonification rules) injected as context.
 */

import type { Track } from '@/data/types'
import { TRACKS, trackById } from '@/data/tracks'
import { dominantEmitter, emissionCentroidLon } from '@/audio/score'
import { SCALE_LABELS } from '@/audio/scales'
import { fmt, fmtSigned } from '@/lib/format'
import { clamp, invLerp, sampleSeries } from '@/lib/math'

export type ViewMode = '2d' | '3d' | 'chart' | 'frame'

export type AgentAction =
  | { type: 'selectTrack'; trackId: string; play?: boolean }
  | { type: 'setRange'; from: number; to: number }
  | { type: 'setYear'; year: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'view'; mode: ViewMode }
  | { type: 'goto'; section: string }
  | { type: 'volume'; value?: number; delta?: number; mute?: boolean }
  | { type: 'sonifyFrame' }
  | { type: 'openStudio' }

export interface AgentContext {
  track: Track
  year: number
  range: [number, number]
  isPlaying: boolean
  viewMode: ViewMode
  volume: number
  muted: boolean
  intensity: number
}

export interface AgentReply {
  text: string
  actions: AgentAction[]
  lang: 'en' | 'darija'
}

/* ------------------------------------------------------------------ *
 * parsing helpers
 * ------------------------------------------------------------------ */

const TRACK_WORDS: Record<string, string[]> = {
  temperature: ['temperature', 'temp', 'heat', 'warming', 'warm', 'anomaly', 'fever', 'سخونة', 'حرارة', 'skaraz', 'حر'],
  co2: ['co2', 'carbon', 'dioxide', 'keeling', 'ppm', 'كاربون', 'ثاني أكسيد'],
  emissions: ['emission', 'emissions', 'fossil', 'coal', 'oil', 'combustion', 'carbon output', 'انبعاثات'],
  seaice: ['ice', 'arctic', 'sea ice', 'glacier', 'freeze', 'frozen', 'جليد', 'قطب'],
  sealevel: ['sea level', 'sea-level', 'ocean rise', 'tide', 'flood', 'coastal', 'مستوى البحر', 'بحر'],
  oceanheat: ['ocean heat', 'ocean warming', 'heat content', 'zettajoule', 'deep ocean', 'حرارة المحيط'],
}

export function detectTracks(q: string): Track[] {
  const text = q.toLowerCase()
  const hits: Array<{ track: Track; score: number }> = []
  for (const t of TRACKS) {
    const words = TRACK_WORDS[t.id] ?? []
    let score = 0
    for (const w of words) if (text.includes(w)) score += w.length > 4 ? 2 : 1
    if (text.includes(t.shortTitle.toLowerCase())) score += 2
    if (score > 0) hits.push({ track: t, score })
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.track)
}

export function detectYears(q: string): number[] {
  const m = q.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/g)
  if (!m) return []
  return Array.from(new Set(m.map(Number))).sort((a, b) => a - b)
}

const isDarija = (q: string): boolean =>
  /[\u0600-\u06FF]/.test(q) ||
  /\b(bghit|bghiit|ch7al|ach|chno|kifach|3afak|sm3|tsme3|wakha|salam|hada|hadi|dyal|dial|mzyan|bezaf|wahed)\b/i.test(q)

/* ------------------------------------------------------------------ *
 * knowledge base
 * ------------------------------------------------------------------ */

interface Entry {
  id: string
  /** lowercase keywords, weighted by length */
  keys: string[]
  /** optional stronger patterns */
  test?: RegExp
  build: (q: string, ctx: AgentContext) => Omit<AgentReply, 'lang'>
}

const entries: Entry[] = [
  {
    id: 'greeting',
    keys: ['hello', 'hi', 'hey', 'salam', 'good morning', 'good evening', 'ahlan', 'sava'],
    build: (_q, ctx) => ({
      text: `Salam. The jukebox is currently on ${ctx.track.shortTitle}, ${Math.floor(ctx.year)}, ${
        ctx.isPlaying ? 'playing' : 'paused'
      }. Ask me what you are hearing, pick a dataset, or jump to any year between ${ctx.range[0]} and ${ctx.range[1]}.`,
      actions: [],
    }),
  },
  {
    id: 'help',
    keys: ['help', 'what can you do', 'commands', 'how do i', 'guide', 'instructions', 'ach tqdr', 'kifach'],
    build: () => ({
      text:
        'You can say: "play sea ice", "show the temperature from 1900 to 2000", "jump to 1991", "what am I hearing", "explain the mapping", "show me the 3D globe", "how accessible is this", or "where does the data come from". I can also record your question as audio and answer out loud.',
      actions: [],
    }),
  },
  {
    id: 'whatHearing',
    keys: ['what am i hearing', 'what is this sound', 'describe the sound', 'what does this mean', 'sonification of this', 'ach hada'],
    build: (_q, ctx) => {
      const value = sampleSeries(ctx.track.series, ctx.year)
      const delta = (sampleSeries(ctx.track.series, ctx.year + 1) - sampleSeries(ctx.track.series, ctx.year - 1)) / 2
      const p = ctx.track.sonification
      return {
        text:
          `You are hearing ${ctx.track.title}. Right now the playhead is at ${Math.floor(ctx.year)}, where the value is ` +
          `${fmtSigned(value, ctx.track.digits)} ${ctx.track.unitSpoken}. That number is mapped to pitch inside a ${p.scale} scale ` +
          `rooted at MIDI ${p.rootMidi}, and the rate of change (${fmtSigned(delta, 3)} per year) sets the tempo and how bright the filter is. ` +
          `In one sentence: ${p.rule}.`,
        actions: [],
      }
    },
  },
  {
    id: 'howWorks',
    keys: ['how does it work', 'how do you sonify', 'explain the mapping', 'algorithm', 'method', 'process', 'kifach khddam'],
    build: () => ({
      text:
        'Four steps. One: the dataset is sampled at the playhead, giving a value and a rate of change. Two: those numbers are mapped by an artistic ruleset — value becomes pitch inside a musical scale, rate of change becomes tempo and filter brightness, extremes become struck bells, and for emissions the geographic centroid becomes stereo pan. Three: the score is scheduled on the Web Audio clock, so timing is sample-accurate. Four: the same score can be rendered offline to a WAV file you can download. There is also a frame analyser that scans an actual image left to right and turns colour, brightness and density into notes.',
      actions: [{ type: 'goto', section: 'method' }],
    }),
  },
  {
    id: 'accessibility',
    keys: ['accessib', 'blind', 'low vision', 'screen reader', 'disab', 'aria', 'wa3r', 'lmafqudin'],
    build: () => ({
      text:
        'Accessibility is the reason this project exists. Every visual has an audio equivalent and every sound has a text equivalent: the timeline is a real slider with spoken value text, charts have data tables, announcements go to a polite live region, and the guide agent can be driven entirely by voice. You can switch on high contrast, reduced motion, or a text-only mode that turns off WebGL completely.',
      actions: [{ type: 'goto', section: 'access' }],
    }),
  },
  {
    id: 'sources',
    keys: ['source', 'citation', 'where does the data', 'reference', 'who measured', 'data from'],
    build: (_q, ctx) => ({
      text: `This track uses ${ctx.track.sources.length} sources — for example ${ctx.track.kicker}. Every panel in the app shows a source badge, and the Sources section at the bottom lists publisher, link, licence and exactly what was copied. The spatial maps are modelled from published characteristics rather than copied pixel-by-pixel, and each one says so.`,
      actions: [{ type: 'goto', section: 'sources' }],
    }),
  },
  {
    id: 'nasaEic',
    keys: ['earth information center', 'eic', 'nasa', 'visual frame', 'svs', 'visualisation'],
    build: () => ({
      text:
        "NASA's Earth Information Center produces visual frames of Earth's vital signs — temperature, carbon, ice, sea level, ocean heat. This jukebox takes those frames and their underlying records and gives them a soundtrack in real time, so the same story can be seen, heard, read and spoken. The frame analyser can also scan any image you drop onto it.",
      actions: [{ type: 'goto', section: 'method' }],
    }),
  },
  {
    id: 'arcticFast',
    keys: ['arctic amplification', 'why is the arctic', 'polar warming', 'faster in the arctic', 'why faster'],
    build: () => ({
      text:
        'The Arctic warms roughly three to four times faster than the global average. Three reasons: sea ice disappears and dark ocean replaces bright ice, so less sunlight is reflected; the cold polar atmosphere traps heat very efficiently near the surface, a shallow inversion; and ocean and atmospheric circulation carry extra heat northward. In this app that is why the map field brightens fastest at high northern latitudes and why the sea-ice track sounds like it is thinning out.',
      actions: [{ type: 'selectTrack', trackId: 'seaice', play: false }],
    }),
  },
  {
    id: 'pinatubo',
    keys: ['pinatubo', 'volcano', 'eruption', 'krakatoa', 'el chichon', 'agung', 'dip in'],
    build: (_q, ctx) => {
      const eruptions = trackById('temperature').events.filter((e) => e.kind === 'eruption')
      return {
        text:
          'Big eruptions inject sulfate aerosols into the stratosphere and cool the planet for a year or two. In the temperature record you can hear the dips at ' +
          eruptions.map((e) => `${Math.floor(e.year)} (${e.title})`).join(', ') +
          '. Each one is marked with a low struck chord and a sub-bass thump in the sonification.' +
          (ctx.track.id === 'temperature' ? ' Jump to 1991 to hear Pinatubo.' : ''),
        actions: ctx.track.id === 'temperature' ? [{ type: 'setYear', year: 1991.4 }] : [{ type: 'selectTrack', trackId: 'temperature', play: false }],
      }
    },
  },
  {
    id: 'valueAt',
    keys: ['how much', 'what was', 'what is the value', 'level in', 'value in', 'temperature in', 'co2 in', 'ch7al'],
    build: (q, ctx) => {
      const years = detectYears(q)
      const target = detectTracks(q)[0] ?? ctx.track
      const year = years[years.length - 1] ?? Math.floor(ctx.year)
      const value = sampleSeries(target.series, year)
      const prev = sampleSeries(target.series, year - 10)
      return {
        text: `In ${year}, ${target.shortTitle.toLowerCase()} was ${fmtSigned(value, target.digits)} ${target.unitSpoken}. Ten years earlier it was ${fmt(
          prev,
          target.digits,
        )}, so the decade change was ${fmtSigned(value - prev, target.digits)} ${target.unit}. ${target.describe(year, value, value - prev).split('.').slice(1).join('.').trim()}`,
        actions: years.length ? [{ type: 'selectTrack', trackId: target.id, play: false }, { type: 'setYear', year }] : [],
      }
    },
  },
  {
    id: 'trend',
    keys: ['trend', 'how fast', 'rate', 'per decade', 'accelerat', 'slope'],
    build: (q, ctx) => {
      const target = detectTracks(q)[0] ?? ctx.track
      const [lo, hi] = target.yearSpan
      const a = sampleSeries(target.series, lo)
      const b = sampleSeries(target.series, hi)
      const perDecade = ((b - a) / (hi - lo)) * 10
      const mid = sampleSeries(target.series, (lo + hi) / 2)
      const early = ((mid - a) / ((hi - lo) / 2)) * 10
      const late = ((b - mid) / ((hi - lo) / 2)) * 10
      return {
        text: `Over the whole record (${lo}–${hi}) ${target.shortTitle.toLowerCase()} changed by ${fmtSigned(
          perDecade,
          target.digits,
        )} ${target.unit} per decade on average. The first half moved at ${fmtSigned(early, target.digits)} and the second half at ${fmtSigned(
          late,
          target.digits,
        )} per decade — ${Math.abs(late) > Math.abs(early) * 1.15 ? 'it is accelerating' : 'the rate is broadly steady'}. That acceleration is exactly what the tempo mapping makes audible.`,
        actions: [{ type: 'selectTrack', trackId: target.id, play: false }],
      }
    },
  },
  {
    id: 'emissionsWhere',
    keys: ['who emits', 'which country', 'biggest emitter', 'where are emissions', 'plume'],
    build: (_q, ctx) => {
      const y = ctx.year
      return {
        text: `At ${Math.floor(y)}, ${dominantEmitter(y)} is the largest single region in the modelled plume field, and the weighted centre of global emissions sits near ${Math.round(
          emissionCentroidLon(y),
        )}° longitude. That longitude is mapped to stereo pan, so as the centre drifts east across the century you literally hear the sound move in the stereo field.`,
        actions: [{ type: 'selectTrack', trackId: 'emissions', play: false }],
      }
    },
  },
  {
    id: 'scale',
    keys: ['scale', 'mode', 'key', 'musical', 'why does it sound', 'chord'],
    build: (_q, ctx) => {
      const p = ctx.track.sonification
      return {
        text: `This track uses the ${p.scale} mode — ${SCALE_LABELS[p.scale]}. The root sits at MIDI ${p.rootMidi} and the data spans ${p.octaves} octaves above it, with tempo mapped between ${p.bpm[0]} and ${p.bpm[1]} bpm. Quantising to a scale is the artistic ruleset: raw pixel-to-pitch mapping sounds like noise, a scale makes the same data singable. Mood: ${p.mood}.`,
        actions: [],
      }
    },
  },
  {
    id: 'gallery',
    keys: ['download', 'export', 'wav', 'save the audio', 'gallery', 'playlist', 'render'],
    build: () => ({
      text: 'The Gallery section renders any window of any track offline with the same synthesis code and gives you a 16-bit WAV, plus the peak waveform and the exact ruleset used. That is the curated playlist deliverable for the challenge.',
      actions: [{ type: 'goto', section: 'gallery' }],
    }),
  },
  {
    id: 'volume',
    keys: ['volume', 'louder', 'quieter', 'mute', 'silent', 'sda', 'sout'],
    build: (q, ctx) => {
      const down = /(lower|quieter|down|less|sda)/.test(q)
      const mute = /(mute|silent)/.test(q)
      if (mute) return { text: ctx.muted ? 'Audio unmuted.' : 'Audio muted.', actions: [{ type: 'volume', mute: !ctx.muted }] }
      return {
        text: down ? 'Turning the volume down.' : 'Turning the volume up.',
        actions: [{ type: 'volume', delta: down ? -0.2 : 0.2 }],
      }
    },
  },
  {
    id: 'thanks',
    keys: ['thank', 'shukran', 'thanks', 'nice', 'great', 'beautiful', 'mzyan'],
    build: () => ({ text: 'Any time. Keep listening — the shape of the curve is much easier to hear than to read.', actions: [] }),
  },
  {
    id: 'team',
    keys: ['who made', 'team', 'who built', 'project', 'hackathon', 'space apps'],
    build: () => ({
      text: 'Earth Jukebox was built for the 2026 NASA Space Apps Challenge "Earth Jukebox" brief: pair Earth Information Center visual frames with real-time sonification. Everything runs locally in your browser — React, three.js for the globe, and the Web Audio API for synthesis. No audio is streamed; every sound is computed from the data you are looking at.',
      actions: [{ type: 'goto', section: 'about' }],
    }),
  },
]

/* ------------------------------------------------------------------ *
 * command parsing (play / stop / jump / view)
 * ------------------------------------------------------------------ */

function parseCommand(q: string, ctx: AgentContext): Omit<AgentReply, 'lang'> | null {
  const text = q.toLowerCase()
  const years = detectYears(q)
  const tracks = detectTracks(q)
  const actions: AgentAction[] = []

  const wantsStop = /\b(stop|pause|silence|halt|waqf|وقف|sakt)\b/.test(text)
  const wantsPlay = /\b(play|start|begin|resume|listen|sonify|sm3|سمع|شغل|khlli)\b/.test(text)
  const wantsJump = /\b(jump to|go to|show me|move to|set year|seek|find)\b/.test(text) || years.length > 0

  const viewMatch =
    /\b(3d|globe|sphere)\b/.test(text)
      ? '3d'
      : /\b(2d|map|flat|world map)\b/.test(text)
        ? '2d'
        : /\b(chart|graph|plot|curve|line)\b/.test(text)
          ? 'chart'
          : /\b(frame|image|picture|scan)\b/.test(text)
            ? 'frame'
            : null

  const rangeMatch = text.match(/(?:from\s+)?(\d{4})\s*(?:to|until|-|–)\s*(?:to\s+)?(\d{4})/)
  if (rangeMatch) {
    const from = Number(rangeMatch[1])
    const to = Number(rangeMatch[2])
    const target = tracks[0] ?? ctx.track
    const lo = Math.max(target.yearSpan[0], Math.min(from, to))
    const hi = Math.min(target.yearSpan[1], Math.max(from, to))
    actions.push({ type: 'selectTrack', trackId: target.id, play: false })
    actions.push({ type: 'setRange', from: lo, to: hi })
    actions.push({ type: 'openStudio' })
    if (wantsPlay) actions.push({ type: 'play' })
    return {
      text: `${target.title}, ${lo} to ${hi}. ${wantsPlay ? 'Playing now — the tempo mapping will follow the rate of change across that window.' : 'Loaded into the studio.'}`,
      actions,
    }
  }

  if (viewMatch) {
    actions.push({ type: 'view', mode: viewMatch as ViewMode })
    actions.push({ type: 'openStudio' })
    const label = { '2d': 'the 2D world map', '3d': 'the 3D globe', chart: 'the data chart', frame: 'the frame analyser' }[viewMatch]
    if (/\b(sonif|scan|play the frame)\b/.test(text)) {
      actions.push({ type: 'sonifyFrame' })
      return { text: `Here is ${label}. Scanning the frame from left to right — colour becomes pitch, brightness becomes loudness.`, actions }
    }
    return { text: `Switched to ${label}.`, actions }
  }

  if (wantsStop) {
    return { text: 'Paused. The playhead stays where it is — say "resume" to continue.', actions: [{ type: 'pause' }] }
  }

  if (tracks.length && wantsPlay) {
    const t = tracks[0]
    actions.push({ type: 'selectTrack', trackId: t.id, play: true })
    actions.push({ type: 'openStudio' })
    return { text: `Playing ${t.title}: ${t.tagline}, ${t.kicker}. ${t.sonification.mood} — ${t.sonification.rule}.`, actions }
  }

  if (tracks.length && !wantsJump) {
    const t = tracks[0]
    actions.push({ type: 'selectTrack', trackId: t.id, play: false })
    actions.push({ type: 'openStudio' })
    return {
      text: `${t.title} — ${t.tagline}. ${t.audioDescription}`,
      actions,
    }
  }

  if (wantsJump && years.length) {
    const year = clamp(years[years.length - 1], ctx.track.yearSpan[0], ctx.track.yearSpan[1])
    actions.push({ type: 'setYear', year })
    actions.push({ type: 'openStudio' })
    const value = sampleSeries(ctx.track.series, year)
    return { text: ctx.track.describe(year, value, sampleSeries(ctx.track.series, year + 1) - value), actions }
  }

  if (wantsPlay) {
    return {
      text: ctx.isPlaying
        ? 'Already playing.'
        : `Playing ${ctx.track.title} from ${ctx.range[0]} to ${ctx.range[1]}.`,
      actions: [{ type: 'openStudio' }, { type: ctx.isPlaying ? 'pause' : 'play' }],
    }
  }

  return null
}

/* ------------------------------------------------------------------ *
 * fallback: something useful about the current state
 * ------------------------------------------------------------------ */

function fallback(ctx: AgentContext, q: string): Omit<AgentReply, 'lang'> {
  const value = sampleSeries(ctx.track.series, ctx.year)
  const norm = invLerp(ctx.track.domain[0], ctx.track.domain[1], value)
  const trackNames = TRACKS.map((t) => t.shortTitle).join(', ')
  return {
    text:
      `I did not catch a command in that, so here is where we are: ${ctx.track.title}, ${Math.floor(ctx.year)}, ` +
      `${fmtSigned(value, ctx.track.digits)} ${ctx.track.unit} — ${Math.round(norm * 100)}% of the way through its historical range. ` +
      `Try "play sea ice", "from 1900 to 2000", "what am I hearing", or ask about ${trackNames}. ` +
      (q.length < 4 ? 'Say a little more and I will do my best.' : ''),
    actions: [],
  }
}

/* ------------------------------------------------------------------ *
 * main entry
 * ------------------------------------------------------------------ */

export function answerAgent(query: string, ctx: AgentContext): AgentReply {
  const q = query.trim()
  const lang: 'en' | 'darija' = isDarija(q) ? 'darija' : 'en'
  if (!q) return { text: 'I am listening — go ahead.', actions: [], lang }

  const command = parseCommand(q, ctx)
  if (command) return { ...command, lang }

  let best: Entry | null = null
  let bestScore = 0
  const lower = q.toLowerCase()
  for (const e of entries) {
    let score = 0
    if (e.test && e.test.test(lower)) score += 6
    for (const k of e.keys) {
      if (lower.includes(k)) score += Math.min(5, 1 + k.length / 4)
    }
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }

  if (best && bestScore >= 2) {
    const reply = best.build(q, ctx)
    return { ...reply, lang: lang === 'darija' && DARIJA[best.id] ? 'darija' : lang }
  }
  return { ...fallback(ctx, q), lang }
}

/** Short Darija answers for the most common intents, so the agent can be used in the team's own language. */
export const DARIJA: Record<string, string> = {
  greeting: 'Salam! Ana dalil dial Earth Jukebox. Goul liya ach bghiti tsme3, wla sfeT liya so2al b sout.',
  help: 'Tqdr tgoul: "play sea ice", "from 1900 to 2000", "jump to 1991", "ach kanasma3", wla "kifach khddam hadchi". N9dr njawbk b sout wla nssajjel so2alek f audio.',
  whatHearing: 'Had l sout howa data dial l ard mtarjma l musique: l valeur katwlli pitch, w sur3a dial taghyiour kat3ti tempo.',
  accessibility: 'Koulchi mfassal bach y9dr yst3mlha l a3ma w l basar d3if: timeline slider b sout, jadawil dial data, w agent b voice.',
  howWorks: 'Arb3a khotawat: n9rao l data f wa9t mo3ayan, n7awlouha l pitch w tempo b qawa3id fanniya, nbrmjouha 3la Web Audio clock, w n9dro nrenderiw-ha l fichier WAV.',
  thanks: 'Bla jmil! Kmmel sma3 — chkl dial l courbe katban b l widnin ktar mn l 3inin.',
}

export const SUGGESTIONS = [
  'What am I hearing right now?',
  'Play sea ice from 1979 to 2024',
  'Show the temperature from 1900 to 2000',
  'Why is the Arctic warming faster?',
  'Explain how the mapping works',
  'Where does this data come from?',
  'Jump to 1991',
  'Show me the 3D globe',
]
