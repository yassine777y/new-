/**
 * Connects the zustand store to the audio engine: builds scores, runs the transport,
 * and mirrors the engine clock back into React so visuals stay locked to the sound.
 */

import { useEffect, useRef } from 'react'
import { useStore } from '@/state/store'
import { engine } from './engine'
import { buildScore, type Score } from './score'
import { trackById } from '@/data/tracks'
import { onBus } from '@/lib/bus'
import { clamp } from '@/lib/math'

export function useJukebox() {
  const activeTrackId = useStore((s) => s.activeTrackId)
  const range = useStore((s) => s.range)
  const duration = useStore((s) => s.duration)
  const intensity = useStore((s) => s.intensity)
  const scaleOverride = useStore((s) => s.scaleOverride)
  const layers = useStore((s) => s.layers)
  const isPlaying = useStore((s) => s.isPlaying)
  const loop = useStore((s) => s.loop)
  const volume = useStore((s) => s.volume)
  const muted = useStore((s) => s.muted)
  const reverb = useStore((s) => s.reverb)

  const scoreRef = useRef<Score | null>(null)
  const rebuildTimer = useRef<number | null>(null)
  const lastPublished = useRef({ year: -1, time: -1 })

  /* ------------------------- score building ------------------------- */
  useEffect(() => {
    const build = () => {
      const track = trackById(activeTrackId)
      const score = buildScore(track, range[0], range[1], duration, {
        intensity,
        scaleOverride: (scaleOverride as Score['preset']['scale']) ?? undefined,
        layers,
      })
      scoreRef.current = score
      void engine.setScore(score).then(() => {
        const st = useStore.getState()
        // keep the playhead where the user left it
        const t = clamp((st.year - range[0]) / Math.max(1e-6, range[1] - range[0]), 0, 1) * duration
        engine.seek(t)
        if (st.isPlaying) void engine.play(t)
        st.setNowPlayingLabel(`${track.shortTitle} · ${range[0]}–${range[1]} · ${score.noteCount} notes`)
      })
    }
    if (rebuildTimer.current) window.clearTimeout(rebuildTimer.current)
    rebuildTimer.current = window.setTimeout(build, 140)
    return () => {
      if (rebuildTimer.current) window.clearTimeout(rebuildTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrackId, range[0], range[1], duration, intensity, scaleOverride, layers.drone, layers.melody, layers.rhythm, layers.shimmer, layers.sub])

  /* ------------------------- transport ------------------------- */
  useEffect(() => {
    if (isPlaying) {
      const st = useStore.getState()
      if (engine.currentScore?.trackId === 'frame') {
        void engine.play(0)
        st.setAudioUnlocked(true)
        return
      }
      const t = clamp((st.year - st.range[0]) / Math.max(1e-6, st.range[1] - st.range[0]), 0, 1) * st.duration
      void engine.play(t)
      st.setAudioUnlocked(true)
    } else {
      engine.pause()
    }
  }, [isPlaying])

  /* ------------------------- mix ------------------------- */
  useEffect(() => {
    engine.setVolume(volume)
  }, [volume])
  useEffect(() => {
    engine.setMuted(muted)
  }, [muted])
  useEffect(() => {
    engine.setReverb(reverb)
  }, [reverb])

  /* ------------------------- clock → React ------------------------- */
  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const status = engine.status()
      const st = useStore.getState()
      if (engine.playing) {
        if (engine.currentScore?.trackId === 'frame') {
          // frame scores have no year axis: publish scan progress only
          if (now - last > 45) {
            last = now
            st.setFrameProgress(status.scoreTime / Math.max(1e-6, engine.currentScore.duration))
            st.setBpm(status.bpm)
          }
          return
        }
        if (now - last > 45) {
          last = now
          const [lo, hi] = st.range
          const year = lo + (status.scoreTime / Math.max(1e-6, st.duration)) * (hi - lo)
          if (Math.abs(year - lastPublished.current.year) > 0.004 || Math.abs(status.scoreTime - lastPublished.current.time) > 0.02) {
            lastPublished.current = { year, time: status.scoreTime }
            st.setYear(year)
            st.setScoreTime(status.scoreTime)
            st.setBpm(status.bpm)
          }
        }
      } else if (status.finished && st.isPlaying) {
        if (st.loop) {
          st.setScoreTime(0)
          st.setYear(st.range[0])
          void engine.play(0)
        } else {
          st.setIsPlaying(false)
          st.announce(`Finished ${st.activeTrack().shortTitle}, ${st.range[0]} to ${st.range[1]}.`)
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ------------------------- level meter ------------------------- */
  useEffect(() => {
    const id = window.setInterval(() => {
      useStore.getState().setLevel(engine.getLevel())
    }, 90)
    return () => window.clearInterval(id)
  }, [])

  /* ------------------------- audio unlock on first gesture ------------------------- */
  useEffect(() => {
    let done = false
    const unlock = () => {
      if (done) return
      done = true
      void engine.init().then(() => {
        engine.setVolume(useStore.getState().volume)
        engine.setMuted(useStore.getState().muted)
        useStore.getState().setAudioUnlocked(true)
      })
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: false })
    window.addEventListener('keydown', unlock, { once: false })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  /* ------------------------- bus ------------------------- */
  useEffect(
    () =>
      onBus((e) => {
        if (e.type === 'rebuild-score') {
          const st = useStore.getState()
          const score = buildScore(trackById(st.activeTrackId), st.range[0], st.range[1], st.duration, {
            intensity: st.intensity,
            layers: st.layers,
          })
          scoreRef.current = score
          void engine.setScore(score)
        } else if (e.type === 'unlock-audio') {
          void engine.init()
        }
      }),
    [],
  )

  /* ------------------------- cleanup ------------------------- */
  useEffect(() => () => engine.dispose(), [])

  return scoreRef
}
