/**
 * The data chart: full record for context, the listening window highlighted,
 * a playhead that follows the audio clock, annotated events, and click-to-seek.
 * Drawn as SVG so it stays crisp, zoomable and screen-reader describable.
 */

import { useMemo, useState } from 'react'
import type { Track } from '@/data/types'
import { useStore } from '@/state/store'
import { fmt, fmtSigned } from '@/lib/format'
import { clamp, invLerp } from '@/lib/math'

const W = 1000
const H = 300
const PAD = { l: 52, r: 18, t: 18, b: 30 }

interface Props {
  track: Track
  compact?: boolean
}

export function Chart({ track, compact = false }: Props) {
  const year = useStore((s) => s.year)
  const range = useStore((s) => s.range)
  const showEvents = useStore((s) => s.showEvents)
  const [hoverYear, setHoverYear] = useState<number | null>(null)

  const [y0, y1] = track.yearSpan
  const [vMin, vMax] = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of track.series) {
      if (p.v < lo) lo = p.v
      if (p.v > hi) hi = p.v
    }
    const pad = (hi - lo) * 0.12 || 1
    return [lo - pad, hi + pad]
  }, [track.series])

  const xOf = (t: number) => PAD.l + ((t - y0) / (y1 - y0)) * (W - PAD.l - PAD.r)
  const yOf = (v: number) => PAD.t + (1 - invLerp(vMin, vMax, v)) * (H - PAD.t - PAD.b)

  const line = useMemo(() => {
    const pts = track.series
    // decimate for very dense series so the DOM stays light
    const stride = Math.max(1, Math.floor(pts.length / 900))
    let d = ''
    for (let i = 0; i < pts.length; i += stride) {
      const p = pts[i]
      d += `${d ? 'L' : 'M'}${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`
    }
    const last = pts[pts.length - 1]
    d += `L${xOf(last.t).toFixed(1)},${yOf(last.v).toFixed(1)}`
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.series, vMin, vMax, y0, y1])

  const area = useMemo(() => {
    const zero = clamp(yOf(track.divergeAt ?? vMin), PAD.t, H - PAD.b)
    return `${line}L${xOf(track.series[track.series.length - 1].t).toFixed(1)},${zero.toFixed(1)}L${xOf(track.series[0].t).toFixed(1)},${zero.toFixed(1)}Z`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, vMin, vMax, track.divergeAt, track.series])

  const ticks = useMemo(() => {
    const span = y1 - y0
    const step = span > 100 ? 20 : span > 50 ? 10 : 5
    const out: number[] = []
    for (let t = Math.ceil(y0 / step) * step; t <= y1; t += step) out.push(t)
    return out
  }, [y0, y1])

  const vTicks = useMemo(() => {
    const count = compact ? 3 : 5
    const out: number[] = []
    for (let i = 0; i <= count; i++) out.push(vMin + ((vMax - vMin) * i) / count)
    return out
  }, [vMin, vMax, compact])

  const valueAt = (t: number) => {
    const pts = track.series
    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid].t <= t) lo = mid
      else hi = mid
    }
    const a = pts[lo]
    const b = pts[hi]
    return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t || 1)
  }

  const playX = xOf(clamp(year, y0, y1))
  const playV = valueAt(clamp(year, y0, y1))
  const hoverX = hoverYear != null ? xOf(clamp(hoverYear, y0, y1)) : 0
  const hoverV = hoverYear != null ? valueAt(clamp(hoverYear, y0, y1)) : 0

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = y0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (y1 - y0)
    setHoverYear(clamp(t, y0, y1))
  }

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = y0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (y1 - y0)
    const st = useStore.getState()
    const yearPicked = clamp(t, st.range[0], st.range[1])
    st.setYear(yearPicked)
    st.setScoreTime(invLerp(st.range[0], st.range[1], yearPicked) * st.duration)
    const v = valueAt(yearPicked)
    st.announce(track.describe(yearPicked, v, valueAt(yearPicked + 1) - v))
  }

  const gradId = `grad-${track.id}`
  const eventId = `events-${track.id}`

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Line chart of ${track.title}. Values run from ${fmt(vMin, track.digits)} to ${fmt(vMax, track.digits)} ${track.unitSpoken} between ${y0} and ${y1}. The listening window is ${range[0]} to ${range[1]}, and the playhead is at ${Math.floor(year)}, ${fmtSigned(playV, track.digits)} ${track.unit}. A full data table follows this chart.`}
        onPointerMove={onPointer}
        onPointerLeave={() => setHoverYear(null)}
        onClick={onClick}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={track.color} stopOpacity="0.42" />
            <stop offset="100%" stopColor={track.color} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id={`${gradId}-clip`}>
            <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
          </clipPath>
        </defs>

        {/* window shading */}
        <rect x={PAD.l} y={PAD.t} width={Math.max(0, xOf(range[0]) - PAD.l)} height={H - PAD.t - PAD.b} fill="#03050b" opacity="0.62" />
        <rect
          x={xOf(range[1])}
          y={PAD.t}
          width={Math.max(0, W - PAD.r - xOf(range[1]))}
          height={H - PAD.t - PAD.b}
          fill="#03050b"
          opacity="0.62"
        />

        {/* grid */}
        {vTicks.map((v, i) => (
          <g key={`v${i}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="rgba(150,190,235,0.12)" strokeWidth="1" />
            <text x={PAD.l - 8} y={yOf(v) + 3.5} textAnchor="end" className="data-mono" fontSize="10.5" fill="#7f92b2">
              {fmt(v, track.digits > 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={`t${t}`}>
            <line x1={xOf(t)} x2={xOf(t)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(150,190,235,0.08)" strokeWidth="1" />
            <text x={xOf(t)} y={H - PAD.b + 16} textAnchor="middle" className="data-mono" fontSize="10.5" fill="#7f92b2">
              {t}
            </text>
          </g>
        ))}

        {/* zero line for diverging series */}
        {track.divergeAt != null && track.divergeAt > vMin && track.divergeAt < vMax && (
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={yOf(track.divergeAt)}
            y2={yOf(track.divergeAt)}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        )}

        {/* series */}
        <g clipPath={`url(#${gradId}-clip)`}>
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={track.color} strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* events */}
        {showEvents && (
          <g>
            {track.events.map((ev) => {
              const x = xOf(ev.year)
              const v = valueAt(ev.year)
              const active = Math.abs(ev.year - year) < 2
              return (
                <g key={`${ev.year}-${ev.title}`} opacity={active ? 1 : 0.55}>
                  <line x1={x} x2={x} y1={yOf(v)} y2={H - PAD.b} stroke={track.color} strokeWidth={active ? 1.2 : 0.7} strokeDasharray="2 4" opacity="0.5" />
                  <circle cx={x} cy={yOf(v)} r={active ? 5 : 3} fill={active ? track.color : '#0b1120'} stroke={track.color} strokeWidth="1.6">
                    <title>{`${Math.floor(ev.year)} — ${ev.title}: ${ev.detail}`}</title>
                  </circle>
                </g>
              )
            })}
          </g>
        )}

        {/* hover */}
        {hoverYear != null && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            <circle cx={hoverX} cy={yOf(hoverV)} r="4" fill="#fff" />
            <g transform={`translate(${clamp(hoverX - 62, PAD.l, W - PAD.r - 124)},${clamp(yOf(hoverV) - 44, PAD.t, H - 60)})`}>
              <rect width="124" height="34" rx="7" fill="rgba(3,6,14,0.92)" stroke="rgba(255,255,255,0.18)" />
              <text x="9" y="14" className="data-mono" fontSize="11" fill="#e6edf9">
                {Math.floor(hoverYear)}
              </text>
              <text x="9" y="27" className="data-mono" fontSize="11" fill={track.color}>
                {fmtSigned(hoverV, track.digits)} {track.unit}
              </text>
            </g>
          </g>
        )}

        {/* playhead */}
        <g pointerEvents="none">
          <line x1={playX} x2={playX} y1={PAD.t - 4} y2={H - PAD.b} stroke="#6ee7ff" strokeWidth="1.8" />
          <circle cx={playX} cy={yOf(playV)} r="6" fill="#6ee7ff" opacity="0.25" />
          <circle cx={playX} cy={yOf(playV)} r="3.4" fill="#ecfdff" stroke="#6ee7ff" strokeWidth="1.6" />
          <text x={clamp(playX, PAD.l + 16, W - PAD.r - 16)} y={PAD.t - 6} textAnchor="middle" className="data-mono" fontSize="11" fill="#6ee7ff">
            {Math.floor(year)}
          </text>
        </g>

        {/* axis titles */}
        <text x={PAD.l} y={12} className="data-mono" fontSize="10" fill="#6b7f9e" letterSpacing="1.4">
          {track.unit.toUpperCase()} · {y0}–{y1}
        </text>
      </svg>

      {hoverYear != null && (
        <div className="pointer-events-none absolute right-3 top-2 rounded-lg border border-white/12 bg-void-950/85 px-2.5 py-1.5 text-right">
          <div className="data-mono text-[11px] text-mist-200">
            {Math.floor(hoverYear)} · {fmtSigned(hoverV, track.digits)} {track.unit}
          </div>
          <div className="data-mono text-[10px] text-mist-400">click to move the playhead</div>
        </div>
      )}
      <div id={eventId} className="sr-only" aria-live="off" />
    </div>
  )
}
