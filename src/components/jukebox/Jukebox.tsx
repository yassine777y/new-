/**
 * "Choose what you want to hear" — the jukebox rack.
 * Each card is a dataset: a sparkline of the real record, the mood of its sonification,
 * its sources, and one tap to load it into the studio.
 */

import { useMemo } from 'react'
import { TRACKS } from '@/data/tracks'
import type { Track } from '@/data/types'
import { useStore } from '@/state/store'
import { engine } from '@/audio/engine'
import { buildScore } from '@/audio/score'
import { emit } from '@/lib/bus'
import { invLerp, minMax } from '@/lib/math'
import { Badge, Button, Panel, Reveal, SectionHeading, SourceBadge } from '@/components/ui/Primitives'
import { IconArrow, IconPlay, IconWave, TrackIcon } from '@/components/ui/Icon'

function Sparkline({ track, width = 320, height = 64 }: { track: Track; width?: number; height?: number }) {
  const year = useStore((s) => s.year)
  const active = useStore((s) => s.activeTrackId) === track.id
  const { line, area, dot } = useMemo(() => {
    const pts = track.series
    const stride = Math.max(1, Math.floor(pts.length / 180))
    const [lo, hi] = minMax(pts.map((p) => p.v))
    const x = (t: number) => ((t - track.yearSpan[0]) / (track.yearSpan[1] - track.yearSpan[0])) * width
    const y = (v: number) => height - 4 - invLerp(lo, hi, v) * (height - 10)
    let d = ''
    for (let i = 0; i < pts.length; i += stride) {
      const p = pts[i]
      d += `${d ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`
    }
    const lastP = pts[pts.length - 1]
    d += `L${x(lastP.t).toFixed(1)},${y(lastP.v).toFixed(1)}`
    const py = active ? Math.min(Math.max(year, track.yearSpan[0]), track.yearSpan[1]) : lastP.t
    return { line: d, area: `${d}L${x(lastP.t).toFixed(1)},${height}L${x(pts[0].t).toFixed(1)},${height}Z`, dot: { cx: x(py), cy: y(active ? track.series.reduce((b, p) => (Math.abs(p.t - py) < Math.abs(b.t - py) ? p : b), pts[0]).v : lastP.v) } }
  }, [active, height, track, width, year])

  const gradId = `spark-${track.id}`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" role="img" aria-label={`Trend of ${track.title} from ${track.yearSpan[0]} to ${track.yearSpan[1]}`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={track.color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={track.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={track.color} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      {active && (
        <>
          <circle cx={dot.cx} cy={dot.cy} r="6" fill={track.color} opacity="0.2" />
          <circle cx={dot.cx} cy={dot.cy} r="2.8" fill="#fff" />
        </>
      )}
    </svg>
  )
}

function TrackCard({ track, index }: { track: Track; index: number }) {
  const activeTrackId = useStore((s) => s.activeTrackId)
  const setActiveTrack = useStore((s) => s.setActiveTrack)
  const isPlaying = useStore((s) => s.isPlaying)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const announce = useStore((s) => s.announce)
  const active = activeTrackId === track.id
  const duration = useStore((s) => s.duration)
  const intensity = useStore((s) => s.intensity)

  const open = (play: boolean) => {
    setActiveTrack(track.id, { play: false })
    emit({ type: 'scroll-to', section: 'studio' })
    if (play) {
      void engine.init()
      setIsPlaying(true)
      announce(`Playing ${track.title}. ${track.sonification.mood}.`)
    } else {
      announce(`${track.title} loaded in the studio.`)
    }
    engine.uiBlip('select')
  }

  const preview = async () => {
    void engine.init()
    const mid = (track.yearSpan[0] + track.yearSpan[1]) / 2
    const score = buildScore(track, mid - 8, mid + 8, 8, { intensity })
    await engine.preview(score, 3.4)
    announce(`Preview of ${track.shortTitle}: ${track.sonification.mood}.`)
  }

  return (
    <Reveal delay={index * 60} as="li">
      <Panel
        className={`group relative flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
          active ? 'ring-1 ring-white/25' : ''
        }`}
        style={active ? { boxShadow: `0 0 0 1px ${track.color}44, 0 30px 70px -40px ${track.color}` } : undefined}
      >
        {/* accent wash */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-45 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
          style={{ background: `radial-gradient(60% 60% at 50% 100%, ${track.color}, transparent 70%)` }}
          aria-hidden
        />

        <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
              style={{ color: track.color, borderColor: `${track.color}44`, background: track.colorSoft }}
            >
              <TrackIcon id={track.id} size={20} />
            </span>
            <div>
              <div className="label-mono">{track.kicker}</div>
              <h3 className="mt-0.5 text-[17px] leading-tight font-semibold text-mist-50">{track.title}</h3>
            </div>
          </div>
          {active && (
            <Badge tone="cyan">
              {isPlaying ? (
                <>
                  <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                    <span className="eq-bar w-[2px] bg-sonic-300" style={{ height: '100%', animationDelay: '0ms' }} />
                    <span className="eq-bar w-[2px] bg-sonic-300" style={{ height: '100%', animationDelay: '160ms' }} />
                    <span className="eq-bar w-[2px] bg-sonic-300" style={{ height: '100%', animationDelay: '320ms' }} />
                  </span>
                  playing
                </>
              ) : (
                'in studio'
              )}
            </Badge>
          )}
        </div>

        <p className="relative mt-3 px-5 text-[13px] leading-relaxed text-mist-300">{track.tagline}</p>

        <div className="relative mt-3 px-2">
          <Sparkline track={track} />
        </div>

        <div className="relative mt-2 grid grid-cols-3 gap-px overflow-hidden border-y border-white/8 bg-white/[0.02]">
          {track.stats.map((s) => (
            <div key={s.label} className="bg-void-900/60 px-3 py-2.5">
              <div className="label-mono truncate text-[9.5px]">{s.label}</div>
              <div className="data-mono mt-0.5 truncate text-[12.5px] font-semibold" style={{ color: track.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex flex-1 flex-col justify-between gap-3 px-5 py-4">
          <div>
            <div className="label-mono mb-1">Sonification</div>
            <p className="text-[12.5px] leading-relaxed text-mist-200">
              <span className="font-semibold" style={{ color: track.color }}>
                {track.sonification.mood}.
              </span>{' '}
              {track.sonification.rule}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="neutral">{track.sonification.scale}</Badge>
              <Badge tone="neutral">{track.sonification.timbre}</Badge>
              <Badge tone="neutral">
                {track.sonification.bpm[0]}–{track.sonification.bpm[1]} bpm
              </Badge>
              <Badge tone="neutral">
                {track.yearSpan[0]}–{track.yearSpan[1]}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => open(true)}>
              <IconPlay size={13} /> Listen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void preview()} title="A three-second excerpt, synthesised now">
              <IconWave size={14} /> Preview
            </Button>
            <Button variant="ghost" size="sm" onClick={() => open(false)}>
              Open studio <IconArrow size={14} />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-white/8 pt-3">
            {track.sources.slice(0, 3).map((s) => (
              <SourceBadge key={s} id={s} />
            ))}
          </div>
        </div>

        <p className="sr-only">
          {track.audioDescription} Press Listen to play this dataset from {track.yearSpan[0]} to {track.yearSpan[1]} in{' '}
          {duration} seconds.
        </p>
      </Panel>
    </Reveal>
  )
}

export function Jukebox() {
  return (
    <section id="listen" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <SectionHeading
          eyebrow="The rack · step 2"
          title={
            <>
              What do you want <span className="text-gradient">to hear?</span>
            </>
          }
          lede="Six Earth vital signs, each with its own dataset, its own colour ramp and its own musical ruleset. Pick one and the studio below loads it: a 2D map, a 3D globe, a time window you can set to 1900→2000, and the chart with the playhead."
        />
        <div className="flex flex-col gap-2 text-right">
          <span className="label-mono">all sound is generated live</span>
          <span className="data-mono text-[12px] text-mist-400">no pre-recorded audio · Web Audio API synthesis</span>
        </div>
      </div>

      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {TRACKS.map((t, i) => (
          <TrackCard key={t.id} track={t} index={i} />
        ))}
      </ul>
    </section>
  )
}
