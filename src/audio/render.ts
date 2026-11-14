/**
 * Offline rendering: turn a score into an AudioBuffer (and therefore a WAV file)
 * using the exact same synthesis code as the real-time engine.
 * This is what powers the Gallery — "download this piece".
 */

import type { Score } from './score'
import type { Track } from '@/data/types'
import { buildScore, type ScoreOptions } from './score'
import { DroneVoice, playNote, playPercussion, playSub } from './voices'
import { makeImpulseForRender } from './impulse'

export interface RenderOptions extends ScoreOptions {
  sampleRate?: number
  /** Extra seconds of reverb tail. */
  tail?: number
}

export async function renderScore(score: Score, opts: RenderOptions = {}): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 44100
  const tail = opts.tail ?? 3.5
  const length = Math.ceil((score.duration + tail) * sampleRate)
  const Ctor: typeof OfflineAudioContext | undefined =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Ctor) {
    throw new Error(
      'This browser has no OfflineAudioContext, so the piece cannot be rendered to a file. Live playback still works.',
    )
  }
  const ctx = new Ctor(2, length, sampleRate)

  const bus = ctx.createGain()
  const dry = ctx.createGain()
  dry.gain.value = 0.92
  const send = ctx.createGain()
  send.gain.value = score.preset.reverb
  const convolver = ctx.createConvolver()
  convolver.buffer = makeImpulseForRender(ctx)
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.knee.value = 22
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.22
  const master = ctx.createGain()
  master.gain.value = 0.9

  bus.connect(dry)
  dry.connect(comp)
  bus.connect(send)
  send.connect(convolver)
  convolver.connect(comp)
  comp.connect(master)
  master.connect(ctx.destination)

  // continuous drone
  if (score.preset.layers.drone) {
    const drone = new DroneVoice(ctx, bus, score.preset.rootMidi)
    drone.start()
    drone.scheduleAutomation(
      score.keys.map((k) => ({ time: k.time, midi: k.midi, cutoff: k.cutoff, gain: k.gain, pan: k.pan })),
      score.duration + 0.8,
    )
  }

  // every note, placed at its exact time
  for (const n of score.notes) {
    const when = 0.02 + n.time
    switch (n.voice) {
      case 'tick':
      case 'shaker':
      case 'thump':
        playPercussion(ctx, bus, { midi: n.midi, when, gain: n.gain, pan: n.pan, cutoff: n.cutoff }, n.voice)
        break
      case 'sub':
        playSub(ctx, bus, { midi: n.midi, when, gain: n.gain, dur: n.dur, pan: n.pan })
        break
      default:
        playNote(ctx, bus, {
          midi: n.midi,
          when,
          dur: n.dur,
          gain: n.gain,
          pan: n.pan,
          cutoff: n.cutoff,
          timbre: n.voice,
        })
    }
  }

  return ctx.startRendering()
}

export async function renderTrackWindow(
  track: Track,
  yearStart: number,
  yearEnd: number,
  durationSec: number,
  opts: RenderOptions = {},
): Promise<{ buffer: AudioBuffer; score: Score }> {
  const score = buildScore(track, yearStart, yearEnd, durationSec, opts)
  const buffer = await renderScore(score, opts)
  return { buffer, score }
}
