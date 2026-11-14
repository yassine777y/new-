/**
 * Installation mode — the piece as an exhibit rather than a web page.
 *
 * Fullscreen, no chrome, the cursor hidden: a rotating data globe, the year in huge type and
 * one spoken sentence about what is happening, cycling through all six datasets on their own.
 * This is the mode you leave running on a screen at a science fair or in a jury room.
 *
 * It is still the same app underneath: the same store, the same score, the same transport. It
 * only changes what is drawn and who is driving the timeline.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { TRACKS, trackById } from '@/data/tracks'
import { defaultRangeFor, useStore } from '@/state/store'
import { engine } from '@/audio/engine'
import { fmtSigned } from '@/lib/format'
import { clamp, invLerp, sampleSeries } from '@/lib/math'
import { DataGlobe } from '@/three/DataGlobe'
import { useInView } from '@/lib/hooks'
import { IconClose, IconMute, IconSpark, IconVolume, TrackIcon } from '@/components/ui/Icon'
import { useI18n } from '@/i18n/useI18n'

/** Seconds each dataset gets before the exhibit moves on. */
const CYCLE_SECONDS = 50

export function AmbientMode() {
  const { t } = useI18n()
  const ambient = useStore((s) => s.ambient)
  const setAmbient = useStore((s) => s.setAmbient)
  const activeTrackId = useStore((s) => s.activeTrackId)
  const setActiveTrack = useStore((s) => s.setActiveTrack)
  const year = useStore((s) => s.year)
  const range = useStore((s) => s.range)
  const duration = useStore((s) => s.duration)
  const scoreTime = useStore((s) => s.scoreTime)
  const isPlaying = useStore((s) => s.isPlaying)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const muted = useStore((s) => s.muted)
  const toggleMute = useStore((s) => s.toggleMute)
  const setDuration = useStore((s) => s.setDuration)
  const setRange = useStore((s) => s.setRange)
  const announce = useStore((s) => s.announce)
  const textOnly = useStore((s) => s.a11y.textOnly)
  const reduceMotion = useStore((s) => s.a11y.reduceMotion)

  const track = trackById(activeTrackId)
  const index = Math.max(0, TRACKS.findIndex((t) => t.id === track.id))
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const [cursorHidden, setCursorHidden] = useState(false)
  const { ref: globeRef, inView } = useInView<HTMLDivElement>({ threshold: 0.05 })

  const goTo = useCallback(
    (i: number, play: boolean) => {
      const t = TRACKS[((i % TRACKS.length) + TRACKS.length) % TRACKS.length]
      const [lo, hi] = defaultRangeFor(t)
      setRange([lo, hi])
      setDuration(CYCLE_SECONDS - 5)
      setActiveTrack(t.id, { play })
    },
    [setActiveTrack, setDuration, setRange],
  )

  // ---- enter / exit -------------------------------------------------------
  useEffect(() => {
    if (!ambient) return
    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    const fs = document.fullscreenElement ? null : html.requestFullscreen?.({ navigationUI: 'hide' })
    fs?.catch(() => undefined) // fullscreen is a nicety; the exhibit works without it
    closeRef.current?.focus()
    // start the exhibit playing, and make sure the audio engine has its gesture
    void engine.init()
    setDuration(CYCLE_SECONDS - 5)
    goTo(index, true)
    announce(`Installation mode. Six datasets, ${CYCLE_SECONDS} seconds each, narrated and sonified. Press Escape to leave.`)

    const onFsChange = () => {
      if (!document.fullscreenElement && useStore.getState().ambient) useStore.getState().setAmbient(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      html.style.overflow = prevOverflow
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient])

  // ---- auto-advance -------------------------------------------------------
  useEffect(() => {
    if (!ambient) return
    const id = window.setInterval(() => goTo(useStore.getState().activeTrackId ? TRACKS.findIndex((t) => t.id === useStore.getState().activeTrackId) + 1 : 0, true), CYCLE_SECONDS * 1000)
    return () => window.clearInterval(id)
  }, [ambient, goTo])

  // ---- Escape / arrows, and the hidden cursor ------------------------------
  useEffect(() => {
    if (!ambient) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAmbient(false)
        return
      }
      if (e.key === 'ArrowRight') goTo(index + 1, true)
      if (e.key === 'ArrowLeft') goTo(index - 1, true)
      if (e.key === ' ') {
        e.preventDefault()
        setIsPlaying(!useStore.getState().isPlaying)
      }
    }
    let t = 0
    const onMove = () => {
      setCursorHidden(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setCursorHidden(true), 2600)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', onMove, { passive: true })
    onMove()
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', onMove)
      window.clearTimeout(t)
    }
  }, [ambient, goTo, index, setAmbient, setIsPlaying])

  if (!ambient) return null

  const value = sampleSeries(track.series, year)
  const delta = (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2
  const progress = clamp(invLerp(range[0], range[1], year))
  const cycleProgress = duration > 0 ? clamp(scoreTime / duration) : 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('ambient.label')}
      className="fixed inset-0 z-[95] flex flex-col overflow-hidden bg-void-950 text-mist-100"
      style={{ cursor: cursorHidden && !reduceMotion ? 'none' : undefined }}
    >
      {/* the globe, full-bleed */}
      <div ref={globeRef} className="absolute inset-0" aria-hidden>
        {!textOnly && <DataGlobe track={track} active={inView} />}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
          style={{ background: `radial-gradient(70% 60% at 50% 45%, ${track.colorSoft}, transparent 72%)`, opacity: 0.5 }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void-950 via-transparent to-void-950/70" />
      </div>

      {/* top line: what you are hearing */}
      <header className="relative z-10 flex items-start justify-between gap-4 px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl border"
            style={{ color: track.color, borderColor: `${track.color}55`, background: track.colorSoft }}
          >
            <TrackIcon id={track.id} size={22} />
          </span>
          <div>
            <div className="label-mono" style={{ color: track.color }}>
              {track.kicker}
            </div>
            <h2 className="mt-0.5 text-[19px] leading-tight font-semibold text-mist-50 sm:text-[24px]">{track.title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              toggleMute()
              engine.setMuted(!muted)
            }}
            className="glass-soft flex h-10 w-10 items-center justify-center rounded-xl text-mist-200 transition hover:text-mist-50"
            aria-label={muted ? t('top.unmute') : t('top.mute')}
          >
            {muted ? <IconMute size={17} /> : <IconVolume size={17} />}
          </button>
          <button
            ref={closeRef}
            onClick={() => setAmbient(false)}
            className="glass-soft flex h-10 items-center gap-2 rounded-xl px-3 text-[12.5px] text-mist-200 transition hover:text-mist-50"
            aria-label={t('ambient.leave')}
          >
            <IconClose size={15} /> <span className="hidden sm:inline">Escape</span>
          </button>
        </div>
      </header>

      {/* the readout */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 text-center">
        <div
          className="data-mono leading-none font-semibold tracking-tight"
          style={{ fontSize: 'clamp(64px, 17vw, 210px)', color: track.color }}
          aria-hidden
        >
          {Math.floor(year)}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
          <span className="data-mono text-[clamp(20px,3.4vw,38px)] text-mist-50">
            {fmtSigned(value, track.digits)} <span className="text-[0.55em] text-mist-300">{track.unit}</span>
          </span>
          <span className="data-mono text-[clamp(13px,1.7vw,18px)] text-mist-400">
            {delta >= 0 ? '▲' : '▼'} {fmtSigned(delta, track.digits)} / yr
          </span>
        </div>
        <p className="mt-5 max-w-3xl text-[clamp(14px,1.9vw,20px)] leading-relaxed text-mist-200" aria-live="polite">
          {track.describe(year, value, delta)}
        </p>
        <p className="sr-only">
          Year {Math.floor(year)}. {track.title}: {fmtSigned(value, track.digits)} {track.unit}.
        </p>
      </div>

      {/* bottom: the cycle */}
      <footer className="relative z-10 px-5 pb-5 sm:px-10 sm:pb-8">
        <div className="mb-3 flex items-center justify-center gap-2">
          {TRACKS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => goTo(i, true)}
              aria-label={t.title}
              aria-current={i === index}
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: i === index ? 34 : 12,
                background: i === index ? t.color : 'rgba(255,255,255,0.22)',
              }}
            />
          ))}
        </div>
        <div className="mx-auto h-[3px] w-full max-w-3xl overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-linear"
            style={{ width: `${(isPlaying ? cycleProgress : progress) * 100}%`, background: track.color }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-mist-400">
          <IconSpark size={13} />
          <span className="label-mono">
            {t('ambient.hint')} · {index + 1}/{TRACKS.length} · {isPlaying ? t('ambient.playing') : t('ambient.paused')}
          </span>
        </div>
      </footer>
    </div>
  )
}
