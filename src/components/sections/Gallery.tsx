/**
 * Gallery — the "curated collection of original generated audio" deliverable.
 * Each piece is rendered offline with exactly the same synthesis code as live playback,
 * so the download is the piece you just heard, not a separate export path.
 */

import { useRef, useState } from 'react'
import { TRACKS } from '@/data/tracks'
import type { Track } from '@/data/types'
import { buildScore } from '@/audio/score'
import { renderScore } from '@/audio/render'
import { engine } from '@/audio/engine'
import { audioBufferToWav, downloadBlob, peakEnvelope } from '@/lib/wav'
import { useStore } from '@/state/store'
import { fmtClock } from '@/lib/format'
import { Badge, Button, Panel, Reveal, SectionHeading, SourceBadge, Spinner } from '@/components/ui/Primitives'
import { IconDownload, IconPause, IconPlay, IconWave, TrackIcon } from '@/components/ui/Icon'

const PIECE_SECONDS = 45

interface PieceState {
  status: 'idle' | 'rendering' | 'ready' | 'playing'
  peaks: number[]
  buffer: AudioBuffer | null
  seconds: number
}

export function Gallery() {
  const [pieces, setPieces] = useState<Record<string, PieceState>>({})
  const buffers = useRef<Record<string, AudioBuffer>>({})
  const intensity = useStore((s) => s.intensity)
  const announce = useStore((s) => s.announce)

  const set = (id: string, patch: Partial<PieceState>) =>
    setPieces((p) => {
      const current: PieceState = p[id] ?? { status: 'idle', peaks: [], buffer: null, seconds: PIECE_SECONDS }
      return { ...p, [id]: { ...current, ...patch } }
    })

  const render = async (track: Track, play: boolean) => {
    set(track.id, { status: 'rendering' })
    announce(`Rendering ${track.title}. This takes a few seconds.`)
    try {
      const score = buildScore(track, track.yearSpan[0], track.yearSpan[1], PIECE_SECONDS, { intensity })
      const buffer = await renderScore(score, { tail: 4 })
      buffers.current[track.id] = buffer
      const peaks = peakEnvelope(buffer, 220)
      set(track.id, { status: play ? 'playing' : 'ready', peaks, buffer, seconds: buffer.duration })
      if (play) {
        await engine.playBuffer(buffer, () => set(track.id, { status: 'ready' }))
      }
      announce(`${track.title} rendered: ${Math.round(buffer.duration)} seconds, ${score.noteCount} notes. ${track.sonification.mood}.`)
    } catch (err) {
      console.error(err)
      set(track.id, { status: 'idle' })
      announce('The render failed on this device. Try a shorter window in the studio.')
    }
  }

  const stopAll = () => {
    engine.stopRendered()
    TRACKS.forEach((t) => pieces[t.id]?.status === 'playing' && set(t.id, { status: 'ready' }))
  }

  return (
    <section id="gallery" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
      <SectionHeading
        eyebrow="Gallery · step 5"
        title={
          <>
            Six pieces, <span className="text-gradient">composed by the data</span>
          </>
        }
        lede="Each piece below is a full-record rendering — the entire dataset compressed into forty-five seconds of music. Press render and the browser computes it offline with the same voices, reverb and ruleset as live playback, then hands you a 16-bit stereo WAV. No loops, no samples, no pre-recorded audio: every sound is a function of the numbers."
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <SourceBadge id="webaudio" label="OfflineAudioContext" />
        <Badge tone="cyan">16-bit · 44.1 kHz · stereo</Badge>
        <Button size="sm" variant="ghost" onClick={stopAll}>
          <IconPause size={13} /> Stop playback
        </Button>
      </div>

      <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TRACKS.map((t, i) => {
          const p = pieces[t.id] ?? { status: 'idle' as const, peaks: [], buffer: null, seconds: PIECE_SECONDS }
          const busy = p.status === 'rendering'
          return (
            <Reveal as="li" key={t.id} delay={i * 60}>
              <Panel className="flex h-full flex-col overflow-hidden">
                <div className="flex items-start gap-3 px-4 pt-4">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                    style={{ color: t.color, borderColor: `${t.color}44`, background: t.colorSoft }}
                  >
                    <TrackIcon id={t.id} size={19} />
                  </span>
                  <div className="min-w-0">
                    <div className="label-mono">
                      {t.yearSpan[0]}–{t.yearSpan[1]} · {PIECE_SECONDS}s
                    </div>
                    <h3 className="mt-0.5 truncate text-[15.5px] font-semibold text-mist-50">{t.title}</h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">{t.sonification.scale}</Badge>
                      <Badge tone="neutral">{t.sonification.mood}</Badge>
                    </div>
                  </div>
                </div>

                {/* waveform */}
                <div className="mt-3 flex h-16 items-end gap-[1px] overflow-hidden px-4" aria-hidden>
                  {p.peaks.length ? (
                    p.peaks.map((v, k) => (
                      <span
                        key={k}
                        className="flex-1 rounded-sm transition-all duration-300"
                        style={{
                          height: `${Math.max(4, v * 100)}%`,
                          background: p.status === 'playing' ? t.color : `${t.color}88`,
                          opacity: 0.35 + v * 0.65,
                        }}
                      />
                    ))
                  ) : (
                    <div className="flex w-full items-center justify-center rounded-lg border border-dashed border-white/12 text-[11px] text-mist-500">
                      {busy ? 'rendering…' : 'not rendered yet'}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-1 flex-col justify-between gap-3 px-4 pb-4">
                  <p className="text-[12px] leading-relaxed text-mist-300">{t.audioDescription}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={p.status === 'playing' ? 'outline' : 'primary'}
                      disabled={busy}
                      onClick={async () => {
                        if (p.status === 'playing') {
                          stopAll()
                          return
                        }
                        if (buffers.current[t.id]) {
                          set(t.id, { status: 'playing' })
                          await engine.playBuffer(buffers.current[t.id], () => set(t.id, { status: 'ready' }))
                        } else {
                          await render(t, true)
                        }
                      }}
                    >
                      {busy ? <Spinner size={13} /> : p.status === 'playing' ? <IconPause size={13} /> : <IconPlay size={13} />}
                      {busy ? 'Rendering' : p.status === 'playing' ? 'Playing' : p.status === 'ready' ? 'Play' : 'Render & play'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!buffers.current[t.id] || busy}
                      onClick={() => {
                        const buf = buffers.current[t.id]
                        if (!buf) return
                        downloadBlob(audioBufferToWav(buf), `earth-jukebox-${t.id}-${t.yearSpan[0]}-${t.yearSpan[1]}.wav`)
                        announce('WAV download started')
                      }}
                    >
                      <IconDownload size={13} /> WAV
                    </Button>
                    {p.buffer && <span className="data-mono text-[10.5px] text-mist-400">{fmtClock(p.buffer.duration)}</span>}
                  </div>
                </div>
              </Panel>
            </Reveal>
          )
        })}
      </ul>

      <Reveal className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <span className="label-mono mb-2 flex items-center gap-2">
            <IconWave size={12} /> The creative process
          </span>
          <div className="space-y-3 text-[13px] leading-relaxed text-mist-200">
            <p>
              We started from the constraint the brief names directly: a raw pixel-to-pitch translation is noise. So every
              track gets a ruleset first and a dataset second — a mood, a mode, a register, and a decision about which
              property of the data carries the melody and which carries the rhythm.
            </p>
            <p>
              Temperature became a slow string fever in Aeolian minor, because the story is a rise you feel before you
              notice it. Carbon dioxide became a Phrygian drone with an accelerating pulse: an engine that never idles. Sea
              ice became glass bells in Lydian that thin out as the extent falls. Sea level is a sub-bass tide. Emissions is
              percussion, with the plume centroid panning east across the century. Ocean heat is a granular swarm that keeps
              accumulating, because the number never goes down.
            </p>
            <p>
              Then we made the mapping honest: the same score object drives live playback, the offline WAV render and the
              printed ruleset in the interface. If you download a piece, you can read exactly which rule produced each note.
            </p>
          </div>
        </Panel>

        <Panel className="p-5">
          <span className="label-mono mb-2 block">Reproduce it</span>
          <p className="text-[13px] leading-relaxed text-mist-200">
            The whole pipeline is deterministic. Given a track, a window and an intensity,{' '}
            <code className="data-mono rounded bg-white/8 px-1.5 py-0.5 text-[11.5px] text-sonic-200">buildScore()</code>{' '}
            returns the identical list of notes on every machine — no random seeding, no network calls.{' '}
            <code className="data-mono rounded bg-white/8 px-1.5 py-0.5 text-[11.5px] text-sonic-200">renderScore()</code>{' '}
            then runs it through an OfflineAudioContext and encodes a WAV.
          </p>
          <pre className="data-mono mt-3 overflow-auto rounded-xl border border-white/10 bg-void-950 p-3 text-[11px] leading-relaxed text-mist-300">
{`const score = buildScore(track, 1900, 2000, 45, { intensity: 0.8 })
const buffer = await renderScore(score)
downloadBlob(audioBufferToWav(buffer), 'piece.wav')`}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const st = useStore.getState()
                const t = st.activeTrack()
                set(`${t.id}-studio`, { status: 'rendering' })
                const score = buildScore(t, st.range[0], st.range[1], st.duration, { intensity: st.intensity })
                const buffer = await renderScore(score)
                downloadBlob(audioBufferToWav(buffer), `earth-jukebox-${t.id}-${st.range[0]}-${st.range[1]}.wav`)
                set(`${t.id}-studio`, { status: 'idle' })
                announce('Studio window rendered and downloaded.')
              }}
            >
              <IconDownload size={13} /> Render the current studio window
            </Button>
            <SourceBadge id="globalCarbon" />
          </div>
        </Panel>
      </Reveal>
    </section>
  )
}
