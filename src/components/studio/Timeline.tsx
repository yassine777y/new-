/**
 * The transport: time window (with 1900→2000 style presets), a scrubbable playhead,
 * speed, loop and annotated events. Everything is a real control with a spoken value.
 */

import { useMemo } from 'react'
import type { Track } from '@/data/types'
import { useStore } from '@/state/store'
import { engine } from '@/audio/engine'
import { fmt, fmtSigned } from '@/lib/format'
import { clamp, invLerp, sampleSeries } from '@/lib/math'
import { Badge, Button, IconButton } from '@/components/ui/Primitives'
import { IconLoop, IconPause, IconPlay, IconRewind, IconStop } from '@/components/ui/Icon'
import { useI18n } from '@/i18n/useI18n'
import type { I18nKey } from '@/i18n'

const SPEEDS = [
  { label: '8 s', value: 8 },
  { label: '16 s', value: 16 },
  { label: '30 s', value: 30 },
  { label: '60 s', value: 60 },
]

function presetsFor(track: Track): Array<{ key: I18nKey; range: [number, number] }> {
  const [lo, hi] = track.yearSpan
  const list: Array<{ key: I18nKey; range: [number, number] }> = [
    { key: 'time.fullRecord', range: [lo, hi] },
    { key: 'time.century', range: [Math.max(lo, 1900), Math.min(hi, 2000)] },
    { key: 'time.half', range: [Math.max(lo, 1950), Math.min(hi, 2000)] },
    { key: 'time.twentieth', range: [Math.max(lo, 1901), Math.min(hi, 2000)] },
    { key: 'time.last30', range: [Math.max(lo, hi - 30), hi] },
  ]
  if (track.id === 'seaice') list.splice(3, 1, { key: 'time.satellite', range: [1979, hi] })
  if (track.id === 'sealevel') list.splice(3, 1, { key: 'time.altimetry', range: [1993, hi] })
  return list.filter((p) => p.range[1] > p.range[0])
}

export function Timeline({ track }: { track: Track }) {
  const { t } = useI18n()
  const year = useStore((s) => s.year)
  const range = useStore((s) => s.range)
  const setRange = useStore((s) => s.setRange)
  const duration = useStore((s) => s.duration)
  const setDuration = useStore((s) => s.setDuration)
  const isPlaying = useStore((s) => s.isPlaying)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const setYear = useStore((s) => s.setYear)
  const setScoreTime = useStore((s) => s.setScoreTime)
  const loop = useStore((s) => s.loop)
  const toggleLoop = useStore((s) => s.toggleLoop)
  const announce = useStore((s) => s.announce)

  const presets = useMemo(() => presetsFor(track), [track])
  const value = sampleSeries(track.series, year)
  const delta = (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2
  const progress = invLerp(range[0], range[1], year)

  const seekTo = (y: number, speak = false) => {
    const t = clamp(y, range[0], range[1])
    const scoreTime = invLerp(range[0], range[1], t) * duration
    setYear(t)
    setScoreTime(scoreTime)
    engine.seek(scoreTime)
    if (speak) {
      const v = sampleSeries(track.series, t)
      announce(track.describe(t, v, (sampleSeries(track.series, t + 1) - sampleSeries(track.series, t - 1)) / 2))
    }
  }

  const togglePlay = () => {
    void engine.init()
    if (!isPlaying && progress > 0.995) seekTo(range[0])
    setIsPlaying(!isPlaying)
    announce(isPlaying ? 'Paused' : `Playing ${track.shortTitle}, ${range[0]} to ${range[1]}`)
  }

  return (
    <div className="space-y-4">
      {/* transport row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" onClick={togglePlay} aria-label={isPlaying ? t('top.pause') : t('top.play')}>
            {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <IconButton
            label="Restart from the beginning of the window"
            onClick={() => {
              seekTo(range[0])
              engine.stop()
              setIsPlaying(false)
            }}
          >
            <IconRewind size={16} />
          </IconButton>
          <IconButton
            label="Stop and silence the drone"
            onClick={() => {
              setIsPlaying(false)
              engine.stop()
              seekTo(range[0])
              announce('Stopped')
            }}
          >
            <IconStop size={15} />
          </IconButton>
          <IconButton label={`${t('time.loop')}: ${loop ? 'on' : 'off'}`} active={loop} onClick={toggleLoop}>
            <IconLoop size={16} />
          </IconButton>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="label-mono me-1">{t('time.speed')}</span>
          {SPEEDS.map((s) => (
            <Button key={s.value} size="xs" variant={duration === s.value ? 'outline' : 'ghost'} onClick={() => setDuration(s.value)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* scrubber */}
      <div>
        <div className="relative">
          <div className="relative h-9">
            {/* window bar */}
            <div className="absolute top-4 inset-x-0 h-1.5 rounded-full bg-white/8" />
            <div
              className="absolute top-4 h-1.5 rounded-full"
              style={{
                left: `${progress * 100}%`,
                width: '2px',
                background: '#6ee7ff',
              }}
            />
            <div
              className="absolute top-4 h-1.5 rounded-full"
              style={{ left: 0, width: `${progress * 100}%`, background: `linear-gradient(90deg, ${track.colorSoft}, ${track.color})` }}
            />
            {/* event ticks */}
            {track.events
              .filter((e) => e.year >= range[0] && e.year <= range[1])
              .map((e) => {
                const p = invLerp(range[0], range[1], e.year)
                return (
                  <div
                    key={`${e.year}-${e.title}`}
                    className="group absolute top-0.5 -translate-x-1/2"
                    style={{ left: `${p * 100}%` }}
                  >
                    <div className="h-2.5 w-px bg-white/35" />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-56 -translate-x-1/2 rounded-lg border border-white/15 bg-void-950/95 px-2.5 py-1.5 text-start group-hover:block">
                      <div className="data-mono text-[10.5px] text-sonic-200">
                        {Math.floor(e.year)} · {e.title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-mist-300">{e.detail}</div>
                    </div>
                    <button
                      className="absolute -top-1 -start-3 h-6 w-6 cursor-pointer rounded-full opacity-0"
                      aria-label={`Jump to ${Math.floor(e.year)}: ${e.title}`}
                      onClick={() => seekTo(e.year, true)}
                    />
                  </div>
                )
              })}
          </div>
          <input
            type="range"
            className="relative z-10 -mt-6 w-full"
            min={range[0]}
            max={range[1]}
            step={0.25}
            value={clamp(year, range[0], range[1])}
            aria-label={t('time.year')}
            aria-valuetext={`${Math.floor(year)}, ${fmtSigned(value, track.digits)} ${track.unitSpoken}`}
            onChange={(e) => seekTo(Number(e.target.value))}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') seekTo(year, true)
            }}
          />
        </div>

        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="data-mono text-[30px] leading-none font-semibold text-mist-50 sm:text-[34px]">
              {Math.floor(year)}
              <span className="ms-2 text-[15px] font-normal" style={{ color: track.color }}>
                {fmtSigned(value, track.digits)} {track.unit}
              </span>
            </div>
            <div className="data-mono mt-1 text-[11px] text-mist-400">
              {fmtSigned(delta, Math.max(2, track.digits))} {track.unit}/yr at this point · {Math.round(progress * 100)}% through the window
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone="neutral">
              window {range[0]}–{range[1]}
            </Badge>
            <Badge tone="cyan">{duration}s per pass</Badge>
          </div>
        </div>
      </div>

      {/* range window */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="label-mono">{t('time.presets')}</span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const on = p.range[0] === range[0] && p.range[1] === range[1]
              return (
                <Button
                  key={t(p.key)}
                  size="xs"
                  variant={on ? 'outline' : 'ghost'}
                  onClick={() => {
                    setRange(p.range)
                    seekTo(p.range[0])
                    announce(`Window set to ${t(p.key)}: ${p.range[0]} to ${p.range[1]}`)
                  }}
                >
                  {t(p.key)}
                </Button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label-mono mb-1 block">From</span>
            <input
              type="number"
              className="data-mono w-full rounded-lg border border-white/12 bg-void-900 px-3 py-2 text-[13px] text-mist-100 outline-none focus:border-sonic-300/60"
              min={track.yearSpan[0]}
              max={range[1] - 1}
              step={1}
              value={range[0]}
              onChange={(e) => {
                const v = clamp(Number(e.target.value), track.yearSpan[0], range[1] - 1)
                setRange([Math.round(v), range[1]])
              }}
            />
          </label>
          <label className="block">
            <span className="label-mono mb-1 block">To</span>
            <input
              type="number"
              className="data-mono w-full rounded-lg border border-white/12 bg-void-900 px-3 py-2 text-[13px] text-mist-100 outline-none focus:border-sonic-300/60"
              min={range[0] + 1}
              max={track.yearSpan[1]}
              step={1}
              value={range[1]}
              onChange={(e) => {
                const v = clamp(Number(e.target.value), range[0] + 1, track.yearSpan[1])
                setRange([range[0], Math.round(v)])
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
