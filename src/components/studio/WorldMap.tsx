/**
 * 2D world map: the equirectangular base image + the live data field + annotations.
 * Fully keyboard-drivable — arrow keys move a cursor, Enter sonifies the point, and every
 * move is announced, so the map is usable without seeing it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '@/data/types'
import { useStore } from '@/state/store'
import { renderField } from '@/lib/fieldCanvas'
import { loadBaseMap, getBaseMap } from '@/lib/basemap'
import { fieldValue } from '@/lib/fields'
import { EMISSION_HOTSPOTS, hotspotWeights } from '@/lib/fields'
import { colormapCss } from '@/lib/colormap'
import { engine } from '@/audio/engine'
import { clamp, invLerp, sampleSeries } from '@/lib/math'
import { fmt, latLabel, lonLabel } from '@/lib/format'
import { valueToMidi } from '@/audio/scales'
import { Badge } from '@/components/ui/Primitives'
import { IconGlobe } from '@/components/ui/Icon'

interface Props {
  track: Track
  active?: boolean
  compact?: boolean
}

interface Cursor {
  lat: number
  lon: number
}

export function WorldMap({ track, active = true, compact = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fieldRef = useRef<HTMLCanvasElement | null>(null)
  const [, force] = useState(0)
  const [size, setSize] = useState({ w: 900, h: 450 })
  const [hover, setHover] = useState<{ x: number; y: number; lat: number; lon: number; t: number } | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [focused, setFocused] = useState(false)
  const lastFieldYear = useRef(-9999)
  const lastDraw = useRef(0)

  const year = useStore((s) => s.year)
  const selected = useStore((s) => s.selected)
  const showGrid = useStore((s) => s.showGrid)
  const showEvents = useStore((s) => s.showEvents)
  const textOnly = useStore((s) => s.a11y.textOnly)
  const highContrast = useStore((s) => s.a11y.highContrast)

  const value = useMemo(() => sampleSeries(track.series, year), [track.series, year])
  const norm = invLerp(track.domain[0], track.domain[1], value)
  const delta = useMemo(
    () => (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2,
    [track.series, year],
  )

  /* -------- responsive sizing -------- */
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = Math.max(160, Math.round(w / 2))
      setSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* -------- base map -------- */
  useEffect(() => {
    let alive = true
    if (!getBaseMap()) {
      void loadBaseMap(1440).then(() => alive && force((n) => n + 1))
    }
    return () => {
      alive = false
    }
  }, [])

  if (!fieldRef.current && typeof document !== 'undefined') {
    fieldRef.current = document.createElement('canvas')
    fieldRef.current.width = 576
    fieldRef.current.height = 288
  }

  /* -------- draw -------- */
  const draw = useCallback(
    (now: number) => {
      const canvas = canvasRef.current
      const field = fieldRef.current
      if (!canvas || !field) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = size.w
      const H = size.h
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr)
        canvas.height = Math.round(H * dpr)
        canvas.style.width = `${W}px`
        canvas.style.height = `${H}px`
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // base imagery
      const base = getBaseMap()
      if (base) ctx.drawImage(base, 0, 0, W, H)
      else {
        ctx.fillStyle = '#060d1a'
        ctx.fillRect(0, 0, W, H)
      }

      // data field (re-rasterised at most ~30x/second)
      if (now - lastFieldYear.current > 33 || lastFieldYear.current === -9999) {
        lastFieldYear.current = now
        renderField(field, {
          kind: track.spatial,
          year,
          value,
          norm,
          delta,
          colormap: track.colormap,
          alphaScale: highContrast ? 0.95 : 0.82,
        })
      }
      ctx.drawImage(field, 0, 0, W, H)

      const lonToX = (lon: number) => ((lon + 180) / 360) * W
      const latToY = (lat: number) => ((90 - lat) / 180) * H

      // graticule
      if (showGrid) {
        ctx.lineWidth = 1
        ctx.strokeStyle = highContrast ? 'rgba(255,255,255,0.4)' : 'rgba(160,205,255,0.16)'
        ctx.beginPath()
        for (let lon = -180; lon <= 180; lon += 30) {
          const x = Math.round(lonToX(lon)) + 0.5
          ctx.moveTo(x, 0)
          ctx.lineTo(x, H)
        }
        for (let lat = -60; lat <= 60; lat += 30) {
          const y = Math.round(latToY(lat)) + 0.5
          ctx.moveTo(0, y)
          ctx.lineTo(W, y)
        }
        ctx.stroke()
        // equator + tropics + polar circles
        ctx.strokeStyle = highContrast ? 'rgba(255,255,255,0.55)' : 'rgba(160,215,255,0.3)'
        ctx.setLineDash([4, 5])
        ctx.beginPath()
        for (const lat of [0, 23.44, -23.44, 66.56, -66.56]) {
          const y = Math.round(latToY(lat)) + 0.5
          ctx.moveTo(0, y)
          ctx.lineTo(W, y)
        }
        ctx.stroke()
        ctx.setLineDash([])
      }

      // emission / CO2 plume centroids
      if (track.id === 'emissions' || track.id === 'co2') {
        const weights = hotspotWeights(year)
        EMISSION_HOTSPOTS.forEach((h, i) => {
          const w = weights[i]
          const r = clamp(w * (track.id === 'emissions' ? 46 : 26), 1.5, compact ? 9 : 15)
          const x = lonToX(h.lon)
          const y = latToY(h.lat)
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4)
          grad.addColorStop(0, `rgba(255,196,120,${clamp(w * 2.6, 0.05, 0.7)})`)
          grad.addColorStop(1, 'rgba(255,196,120,0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(x, y, r * 2.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,236,200,0.92)'
          ctx.beginPath()
          ctx.arc(x, y, Math.max(1.4, r * 0.22), 0, Math.PI * 2)
          ctx.fill()
          if (!compact && w > 0.05) {
            ctx.font = '500 10px "IBM Plex Mono", monospace'
            ctx.fillStyle = 'rgba(226,240,255,0.75)'
            ctx.textAlign = 'center'
            ctx.fillText(h.name.toUpperCase(), x, y - r * 0.5 - 6)
            ctx.fillText(`${Math.round(w * 100)}%`, x, y + r * 0.5 + 12)
          }
        })
      }

      // place-based events near the playhead
      if (showEvents) {
        for (const ev of track.events) {
          if (ev.lat == null || ev.lon == null) continue
          const dy = Math.abs(ev.year - year)
          if (dy > 6) continue
          const k = 1 - dy / 6
          const x = lonToX(ev.lon)
          const y = latToY(ev.lat)
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + k * 0.65})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(x, y, 5 + (1 - k) * 16, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = track.color
          ctx.beginPath()
          ctx.arc(x, y, 3.2, 0, Math.PI * 2)
          ctx.fill()
          if (k > 0.55 && !compact) {
            ctx.font = '600 10.5px "IBM Plex Mono", monospace'
            ctx.fillStyle = 'rgba(255,255,255,0.92)'
            ctx.textAlign = 'left'
            const label = `${Math.floor(ev.year)} · ${ev.title}`
            const w = ctx.measureText(label).width
            ctx.fillStyle = 'rgba(3,6,14,0.72)'
            ctx.fillRect(x + 8, y - 9, w + 10, 16)
            ctx.fillStyle = 'rgba(255,255,255,0.95)'
            ctx.fillText(label, x + 13, y + 2)
          }
        }
      }

      // selection
      if (selected) {
        const x = lonToX(selected.lon)
        const y = latToY(selected.lat)
        ctx.strokeStyle = 'rgba(110,231,255,0.95)'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x - 16, y)
        ctx.lineTo(x + 16, y)
        ctx.moveTo(x, y - 16)
        ctx.lineTo(x, y + 16)
        ctx.strokeStyle = 'rgba(110,231,255,0.4)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // keyboard cursor
      if (cursor) {
        const x = lonToX(cursor.lon)
        const y = latToY(cursor.lat)
        ctx.strokeStyle = focused ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 1.6
        ctx.strokeRect(x - 7.5, y - 7.5, 15, 15)
      }
    },
    [compact, cursor, delta, focused, highContrast, norm, selected, showEvents, showGrid, size.h, size.w, track, value, year],
  )

  useEffect(() => {
    if (!active || textOnly) return
    let raf = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - lastDraw.current < 16) return
      lastDraw.current = now
      draw(now)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, draw, textOnly])

  /* -------- interaction -------- */
  const toLatLon = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const lon = clamp((x / rect.width) * 360 - 180, -180, 180)
      const lat = clamp(90 - (y / rect.height) * 180, -90, 90)
      return { x, y, lat, lon, rect }
    },
    [],
  )

  const sample = useCallback(
    (lat: number, lon: number) =>
      fieldValue(track.spatial, lat, lon, { year, value, norm, delta }),
    [delta, norm, track.spatial, value, year],
  )

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toLatLon(e.clientX, e.clientY)
    if (!p) return
    const s = sample(p.lat, p.lon)
    setHover({ x: p.x, y: p.y, lat: p.lat, lon: p.lon, t: s.t })
  }

  const activate = useCallback(
    (lat: number, lon: number, announceIt = true) => {
      const st = useStore.getState()
      st.setSelected({ lat, lon })
      const s = sample(lat, lon)
      const midi = valueToMidi(s.t, track.sonification.rootMidi + 24, track.sonification.scale, 2)
      engine.ping(lat, lon, midi, 1, 'glass')
      if (announceIt) {
        st.announce(
          `${latLabel(lat)}, ${lonLabel(lon)}. Field value ${Math.round(s.t * 100)} percent of the ${track.shortTitle} colour range. Pitch ${Math.round(midi)}, panned ${
            lon < -20 ? 'left' : lon > 20 ? 'right' : 'centre'
          }.`,
        )
      }
    },
    [sample, track.shortTitle, track.sonification.rootMidi, track.sonification.scale],
  )

  const onClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toLatLon(e.clientX, e.clientY)
    if (!p) return
    void engine.init()
    activate(p.lat, p.lon)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const stepDeg = e.shiftKey ? 15 : 5
    const cur = cursor ?? { lat: 0, lon: 0 }
    let next: Cursor | null = null
    switch (e.key) {
      case 'ArrowLeft':
        next = { lat: cur.lat, lon: clamp(cur.lon - stepDeg, -180, 180) }
        break
      case 'ArrowRight':
        next = { lat: cur.lat, lon: clamp(cur.lon + stepDeg, -180, 180) }
        break
      case 'ArrowUp':
        next = { lat: clamp(cur.lat + stepDeg, -90, 90), lon: cur.lon }
        break
      case 'ArrowDown':
        next = { lat: clamp(cur.lat - stepDeg, -90, 90), lon: cur.lon }
        break
      case 'Enter':
      case ' ':
        void engine.init()
        activate(cur.lat, cur.lon)
        e.preventDefault()
        return
      case 'Home':
        next = { lat: 0, lon: 0 }
        break
      case 'Escape':
        useStore.getState().setSelected(null)
        return
      default:
        return
    }
    if (next) {
      e.preventDefault()
      setCursor(next)
      const s = sample(next.lat, next.lon)
      useStore.getState().announce(
        `${latLabel(next.lat)}, ${lonLabel(next.lon)}: ${Math.round(s.t * 100)} percent. Press Enter to sonify this point.`,
      )
    }
  }

  if (textOnly) return null

  const legend = colormapCss(track.colormap)
  const hoverSample = hover ? sample(hover.lat, hover.lon) : null

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-void-950"
        style={{ aspectRatio: '2 / 1' }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-crosshair touch-none"
          tabIndex={0}
          role="application"
          aria-label={`World map of ${track.title}. Use arrow keys to move a cursor across the map; Enter sonifies the point under the cursor. ${track.spatialNote}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onClick}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {/* corner readouts */}
        <div className="pointer-events-none absolute top-2.5 left-3 flex items-center gap-2">
          <Badge tone="cyan">
            <IconGlobe size={11} /> {compact ? 'MAP' : 'EQUIRECTANGULAR · 1.25° GRID'}
          </Badge>
        </div>
        <div className="pointer-events-none absolute right-3 bottom-2.5 flex items-center gap-2">
          <span className="data-mono rounded-md border border-white/12 bg-void-950/70 px-2 py-1 text-[10.5px] text-mist-300">
            {Math.floor(year)} · {fmt(value, track.digits)} {track.unit}
          </span>
        </div>

        {/* hover tooltip */}
        {hover && hoverSample && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] rounded-lg border border-sonic-300/35 bg-void-950/92 px-2.5 py-1.5 shadow-xl"
            style={{ left: hover.x, top: hover.y }}
          >
            <div className="data-mono text-[11px] font-semibold text-sonic-200">
              {latLabel(hover.lat)} {lonLabel(hover.lon)}
            </div>
            <div className="data-mono text-[10.5px] text-mist-300">
              field {Math.round(hoverSample.t * 100)}% · {track.unit}
            </div>
            <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(hoverSample.t * 100)}%`, background: legend.replace('linear-gradient(90deg', 'linear-gradient(90deg') }}
              />
            </div>
          </div>
        )}
      </div>

      {/* legend */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <div className="h-2.5 w-full rounded-full" style={{ background: legend }} />
          <div className="data-mono mt-1 flex justify-between text-[10px] text-mist-400">
            <span>
              {fmt(track.domain[0], track.digits)} {track.unit}
            </span>
            <span className="text-mist-300">{track.shortTitle} field · {Math.round(norm * 100)}% of range</span>
            <span>
              {fmt(track.domain[1], track.digits)} {track.unit}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist-400">{track.spatialNote}</p>
    </div>
  )
}
