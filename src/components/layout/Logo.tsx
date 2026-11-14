/**
 * The animated mark in the header.
 *
 * A real orthographic globe — rasterised per pixel from the same NASA-derived land mask the
 * maps use, tilted 23.44° and lit by the same fixed sun as the hero Earth — whose ocean colour
 * is the *live climate anomaly* of whatever you are listening to. It warms from deep blue to red
 * as the timeline advances: the whole premise of the project, in 36 pixels.
 *
 * Idle, it drifts through the record on its own, so the header is never a static picture.
 * All projection and lighting maths lives in `globeMark.ts` (pure, unit-tested); this component
 * only owns the canvas, the clock and the accessibility rules.
 */

import { useEffect, useRef } from 'react'
import { clamp, sampleSeries } from '@/lib/math'
import { isReady, loadLandMask } from '@/lib/landmask'
import { seriesExtent } from '@/data/tracks'
import { useStore } from '@/state/store'
import { DRIFT_SECONDS, SPIN_DEG_PER_SEC, anomalyT, buildGlobeGeometry, paintGlobe } from './globeMark'

export interface LogoProps {
  /** CSS size in pixels; the backing store renders at 2× for retina. */
  size?: number
  /** Freeze the animation (footer, reduced motion). */
  still?: boolean
  className?: string
}

export function Logo({ size = 36, still = false, className }: LogoProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const maskRef = useRef<Uint8Array | null>(isReady() ? null : null)
  const reduceMotion = useStore((s) => s.a11y.reduceMotion)
  const textOnly = useStore((s) => s.a11y.textOnly)
  const highContrast = useStore((s) => s.a11y.highContrast)
  const frozen = still || reduceMotion

  // The mask is derived from the Blue Marble texture at runtime; until it lands, the mark falls
  // back to procedural continents so the header is never empty.
  useEffect(() => {
    let cancelled = false
    void loadLandMask()
      .then((m) => {
        if (!cancelled) maskRef.current = m
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const S = Math.max(24, Math.round(size * 2))
    canvas.width = S
    canvas.height = S
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const geo = buildGlobeGeometry(S)
    const image = ctx.createImageData(S, S)
    let spin = 12 // a starting meridian that shows Africa and Europe
    let last = 0
    let raf = 0

    const draw = (now: number) => {
      const dt = last ? Math.min(0.12, (now - last) / 1000) : 0.016
      last = now
      const st = useStore.getState()
      const track = st.activeTrack()

      // The real playhead while playing; otherwise a slow idle drift through the window.
      const year =
        st.isPlaying || frozen
          ? st.year
          : st.range[0] + (((now / 1000) % DRIFT_SECONDS) / DRIFT_SECONDS) * (st.range[1] - st.range[0] || 1)

      const [lo, hi] = seriesExtent(track.series)
      const t = anomalyT(sampleSeries(track.series, year), lo, hi)
      if (!frozen) spin = (spin + dt * SPIN_DEG_PER_SEC) % 360

      paintGlobe(geo, image.data, {
        spin,
        t,
        level: clamp(st.isPlaying ? st.level : 0),
        mask: maskRef.current,
        highContrast,
      })
      ctx.putImageData(image, 0, 0)
    }

    if (frozen) {
      draw(performance.now())
      return
    }
    const loop = (now: number) => {
      if (!document.hidden) draw(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [size, frozen, highContrast])

  if (textOnly) {
    // No canvas at all in text-only mode — a static ring keeps the header's rhythm.
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-full border border-sonic-300/50 bg-sonic-300/10 ${className ?? ''}`}
        style={{ width: size, height: size }}
      >
        <span className="block rounded-full bg-sonic-300/70" style={{ width: size * 0.34, height: size * 0.34 }} />
      </span>
    )
  }

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  )
}
