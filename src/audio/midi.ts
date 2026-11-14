/**
 * MIDI export — the score as a standard `.mid` file.
 *
 * The same `Score` object that drives Web Audio playback and the offline WAV render is
 * written out as General MIDI, so a musician can open a piece in a DAW, read the notes,
 * re-orchestrate it or print it. Tempo is not flattened: the score's real tempo curve
 * (rate of change → bpm) becomes a tempo map, and the annotated events become markers.
 *
 * Format 1, 480 ticks per quarter note, one track per voice group plus a conductor track.
 * Pure and synchronous — no DOM, so it is unit-testable.
 */

import type { Score, ScoreNote, ScoreVoice } from './score'
import { clamp } from '@/lib/math'

export const PPQ = 480

/** General MIDI voice for each synthesis voice, and the channel it lives on. */
const VOICE_MAP: Record<ScoreVoice, { program: number; channel: number; label: string }> = {
  pad: { program: 89, channel: 0, label: 'Pad (warm)' }, // data melody / drones
  bell: { program: 14, channel: 1, label: 'Tubular bells' }, // extremes and records
  glass: { program: 99, channel: 2, label: 'Crystal' }, // shimmer
  pluck: { program: 25, channel: 3, label: 'Nylon guitar' }, // percussive melody
  granular: { program: 100, channel: 4, label: 'Atmosphere' }, // granular clouds
  drone: { program: 91, channel: 5, label: 'Choir' }, // sustained root
  percussive: { program: 13, channel: 7, label: 'Marimba' }, // never emitted directly (score maps it to pluck), kept for type completeness
  sub: { program: 38, channel: 6, label: 'Synth bass' }, // sub layer
  tick: { program: -1, channel: 9, label: 'Drums · tick' },
  shaker: { program: -1, channel: 9, label: 'Drums · shaker' },
  thump: { program: -1, channel: 9, label: 'Drums · thump' },
}

/** GM drum-map note numbers for the percussion voices. */
const DRUM_NOTE: Record<string, number> = { tick: 42, shaker: 82, thump: 36 }

interface TempoSegment {
  /** Seconds from the start of the score. */
  time: number
  /** Beats per minute from this point on. */
  bpm: number
  /** Absolute tick at `time`. */
  tick: number
}

/**
 * Turn the score's continuously varying bpm into a piecewise tempo map, emitting a change
 * whenever the tempo moves by more than 1.5 bpm and at least 1.2 s have passed.
 */
export function buildTempoMap(score: Score): TempoSegment[] {
  const fallback = (score.preset.bpm[0] + score.preset.bpm[1]) / 2
  const keys = score.keys.filter((k) => Number.isFinite(k.bpm) && k.bpm > 10 && k.bpm < 300)
  const segments: TempoSegment[] = []
  let tick = 0
  let prevTime = 0
  let prevBpm = keys.length ? keys[0].bpm : fallback

  const push = (time: number, bpm: number) => {
    if (time > prevTime) tick += ((time - prevTime) * prevBpm * PPQ) / 60
    segments.push({ time, bpm, tick: Math.round(tick) })
    prevTime = time
    prevBpm = bpm
  }

  push(0, prevBpm)
  for (const k of keys) {
    if (k.time <= 0 || k.time >= score.duration) continue
    const last = segments[segments.length - 1]
    if (Math.abs(k.bpm - last.bpm) < 1.5 || k.time - last.time < 1.2) continue
    push(k.time, k.bpm)
  }
  return segments
}

/** Absolute tick for a time in seconds, integrating the tempo map. */
export function ticksAt(map: TempoSegment[], timeSec: number): number {
  if (!map.length) return Math.round(timeSec * PPQ)
  let seg = map[0]
  for (let i = 0; i < map.length; i++) {
    if (map[i].time <= timeSec) seg = map[i]
    else break
  }
  const dt = Math.max(0, timeSec - seg.time)
  return Math.round(seg.tick + (dt * seg.bpm * PPQ) / 60)
}

/** MIDI variable-length quantity. */
export function vlq(value: number): number[] {
  let v = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  const out = [v & 0x7f]
  v = Math.floor(v / 128)
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  return out
}

/** UTF-8 bytes of a string, for meta event text. */
function utf8(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return out
}

function meta(type: number, payload: number[]): number[] {
  return [0xff, type, ...vlq(payload.length), ...payload]
}

interface MidiEvent {
  tick: number
  /** Sort tie-breaker: note-offs (0) must precede note-ons (1) at the same tick. */
  order: number
  bytes: number[]
}

function withDeltas(events: MidiEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order)
  const out: number[] = []
  let prev = 0
  for (const e of events) {
    out.push(...vlq(Math.max(0, e.tick - prev)), ...e.bytes)
    prev = e.tick
  }
  return out
}

export interface MidiOptions {
  /** Track name written into the file. */
  title?: string
  /** Free text (the ruleset) written as a text event. */
  text?: string
}

export interface MidiResult {
  bytes: Uint8Array
  /** Useful for the UI: how many notes and how many tempo changes were written. */
  noteCount: number
  tempoChanges: number
  tracks: number
  channels: number[]
}

/** Encode a Score as a General MIDI file (format 1). */
export function scoreToMidi(score: Score, opts: MidiOptions = {}): MidiResult {
  const map = buildTempoMap(score)
  const title = opts.title ?? `Earth Jukebox — ${score.trackId}`
  const groups = new Map<number, { channel: number; program: number; label: string; events: MidiEvent[] }>()
  const lastPan = new Map<number, number>()
  let noteCount = 0

  const groupFor = (voice: ScoreVoice) => {
    const v = VOICE_MAP[voice] ?? VOICE_MAP.pad
    let g = groups.get(v.channel)
    if (!g) {
      g = { channel: v.channel, program: v.program, label: v.label, events: [] }
      groups.set(v.channel, g)
    }
    return g
  }

  for (const note of score.notes) {
    if (!Number.isFinite(note.time) || !Number.isFinite(note.midi)) continue
    const g = groupFor(note.voice)
    const start = ticksAt(map, note.time)
    const end = Math.max(start + 8, ticksAt(map, note.time + Math.max(0.04, note.dur)))
    const key = clamp(Math.round(note.midi), 0, 127)
    const vel = clamp(Math.round(note.gain * 480), 1, 127)

    // stereo pan as CC10, only when it moves enough to be audible
    const pan = clamp(note.pan ?? 0, -1, 1)
    const panCc = Math.round(((pan + 1) / 2) * 126) + 1
    const prev = lastPan.get(g.channel)
    if (prev === undefined || Math.abs(prev - panCc) > 6) {
      g.events.push({ tick: Math.max(0, start - 1), order: 0, bytes: [0xb0 | g.channel, 0x0a, panCc] })
      lastPan.set(g.channel, panCc)
    }

    if (g.channel === 9) {
      const drum = DRUM_NOTE[note.voice] ?? 42
      g.events.push({ tick: start, order: 1, bytes: [0x99, drum, vel] })
      g.events.push({ tick: end, order: 0, bytes: [0x89, drum, 0x40] })
    } else {
      g.events.push({ tick: start, order: 1, bytes: [0x90 | g.channel, key, vel] })
      g.events.push({ tick: end, order: 0, bytes: [0x80 | g.channel, key, 0x40] })
    }
    noteCount++
  }

  // ---- conductor track: tempo map, markers and the ruleset as text
  const conductor: MidiEvent[] = [
    { tick: 0, order: 0, bytes: meta(0x03, utf8(title)) },
    { tick: 0, order: 0, bytes: meta(0x01, utf8(opts.text ?? score.ruleSummary)) },
    { tick: 0, order: 0, bytes: meta(0x59, [0, 0]) }, // key signature: C, for readability
  ]
  for (const seg of map) {
    const uspq = Math.round(60_000_000 / clamp(seg.bpm, 10, 300))
    conductor.push({
      tick: seg.tick,
      order: 0,
      bytes: meta(0x51, [(uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff]),
    })
  }
  for (const mark of score.marks) {
    if (!Number.isFinite(mark.time)) continue
    conductor.push({
      tick: ticksAt(map, mark.time),
      order: 1,
      bytes: meta(0x06, utf8(`${Math.round(mark.year)} · ${mark.title}`)),
    })
  }
  // a time signature so DAWs show bars: 4/4, 24 clocks per click
  conductor.push({ tick: 0, order: 0, bytes: meta(0x58, [4, 2, 24, 8]) })


  // End-of-track must be the very last event, so it goes after the longest sustaining note
  // (a pad struck near the end of the window can ring past `score.duration`).
  let maxTick = 0
  for (const g of groups.values()) for (const e of g.events) if (e.tick > maxTick) maxTick = e.tick
  for (const e of conductor) if (e.tick > maxTick) maxTick = e.tick
  const endTick = Math.max(ticksAt(map, score.duration) + PPQ, maxTick + Math.round(PPQ / 4))

  const trackChunks: number[][] = []
  const channels: number[] = []

  const wrap = (events: MidiEvent[], name: string, program: number, channel: number): number[] => {
    const body: MidiEvent[] = [
      { tick: 0, order: 0, bytes: meta(0x03, utf8(name)) },
      ...events,
      { tick: endTick, order: 2, bytes: meta(0x2f, []) },
    ]
    if (program >= 0 && channel !== 9) body.push({ tick: 0, order: 1, bytes: [0xc0 | channel, program] })
    return withDeltas(body)
  }

  trackChunks.push(wrap(conductor, 'Conductor · tempo + events', -1, 0))
  for (const [, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    channels.push(g.channel)
    trackChunks.push(wrap(g.events, g.label, g.program, g.channel))
  }

  // ---- assemble the file
  const out: number[] = []
  out.push(0x4d, 0x54, 0x68, 0x64) // MThd
  out.push(0, 0, 0, 6) // header length
  out.push(0, 1) // format 1
  out.push((trackChunks.length >> 8) & 0xff, trackChunks.length & 0xff)
  out.push((PPQ >> 8) & 0xff, PPQ & 0xff) // division: ticks per quarter note
  for (const chunk of trackChunks) {
    out.push(0x4d, 0x54, 0x72, 0x6b) // MTrk
    out.push((chunk.length >> 24) & 0xff, (chunk.length >> 16) & 0xff, (chunk.length >> 8) & 0xff, chunk.length & 0xff)
    out.push(...chunk)
  }

  return {
    bytes: new Uint8Array(out),
    noteCount,
    tempoChanges: map.length,
    tracks: trackChunks.length,
    channels,
  }
}

/** Convenience: the score as a Blob, ready for `downloadBlob`. */
export function scoreToMidiBlob(score: Score, opts: MidiOptions = {}): Blob {
  const { bytes } = scoreToMidi(score, opts)
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'audio/midi' })
}

export function midiFileName(trackId: string, from: number, to: number): string {
  return `earth-jukebox-${trackId}-${Math.round(from)}-${Math.round(to)}.mid`
}
