/**
 * The Studio — what opens when you pick something to listen to.
 * 2D map / 3D globe / frame scan / chart, a time window (1900→2000 by default presets),
 * a live transport, the sonification ruleset, and the sources for everything on screen.
 */

import { useEffect, useMemo, useState } from 'react'
import { useStore, type ViewMode } from '@/state/store'
import { TRACKS } from '@/data/tracks'
import { sourceList } from '@/data/sources'
import { dominantEmitter, emissionCentroidLon } from '@/audio/score'
import { fmt, fmtSigned, latLabel, lonLabel } from '@/lib/format'
import { clamp, invLerp, sampleSeries } from '@/lib/math'
import { fieldValue } from '@/lib/fields'
import { midiToName } from '@/audio/scales'
import { engine } from '@/audio/engine'
import { renderScore } from '@/audio/render'
import { buildScore } from '@/audio/score'
import { audioBufferToWav, downloadBlob } from '@/lib/wav'
import { useInView } from '@/lib/hooks'
import { WorldMap } from './WorldMap'
import { DataGlobe } from '@/three/DataGlobe'
import { Chart } from './Chart'
import { Timeline } from './Timeline'
import { Visualizer } from './Visualizer'
import { SonificationControls } from './SonificationControls'
import { DataTable } from './DataTable'
import { FrameStudio } from './FrameStudio'
import { Badge, Button, IconButton, Panel, Reveal, SourceBadge, Spinner } from '@/components/ui/Primitives'
import { IconChart, IconDownload, IconFrame, IconGlobe, IconInfo, IconKeyboard, IconMap, IconPlay, IconSpark, TrackIcon } from '@/components/ui/Icon'
import { emit } from '@/lib/bus'

const VIEWS: Array<{ id: ViewMode; label: string; icon: typeof IconMap; hint: string }> = [
  { id: '2d', label: '2D map', icon: IconMap, hint: 'Equirectangular field with hover and keyboard cursor' },
  { id: '3d', label: '3D globe', icon: IconGlobe, hint: 'Realistic Earth with the data wrapped on the sphere' },
  { id: 'chart', label: 'Chart', icon: IconChart, hint: 'The time series with playhead and annotated events' },
  { id: 'frame', label: 'Frame scan', icon: IconFrame, hint: 'Analyse the visual frame itself and sonify the pixels' },
]

export function Studio() {
  const trackId = useStore((s) => s.activeTrackId)
  const track = useMemo(() => TRACKS.find((t) => t.id === trackId) ?? TRACKS[0], [trackId])
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const year = useStore((s) => s.year)
  const range = useStore((s) => s.range)
  const setActiveTrack = useStore((s) => s.setActiveTrack)
  const selected = useStore((s) => s.selected)
  const showGrid = useStore((s) => s.showGrid)
  const toggleGrid = useStore((s) => s.toggleGrid)
  const showEvents = useStore((s) => s.showEvents)
  const toggleEvents = useStore((s) => s.toggleEvents)
  const duration = useStore((s) => s.duration)
  const intensity = useStore((s) => s.intensity)
  const layers = useStore((s) => s.layers)
  const scaleOverride = useStore((s) => s.scaleOverride)
  const textOnly = useStore((s) => s.a11y.textOnly)
  const announce = useStore((s) => s.announce)

  const [showTable, setShowTable] = useState(false)
  const [rendering, setRendering] = useState(false)
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '200px' })

  const value = sampleSeries(track.series, year)
  const norm = invLerp(track.domain[0], track.domain[1], value)
  const delta = (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2
  const sources = sourceList(track.sources)

  const selectedSample = selected
    ? fieldValue(track.spatial, selected.lat, selected.lon, { year, value, norm, delta })
    : null

  useEffect(() => {
    document.documentElement.style.setProperty('--track-color', track.color)
  }, [track.color])

  const exportWindow = async () => {
    setRendering(true)
    try {
      const score = buildScore(track, range[0], range[1], duration, {
        intensity,
        layers,
        scaleOverride: (scaleOverride as never) ?? undefined,
      })
      const buffer = await renderScore(score)
      downloadBlob(audioBufferToWav(buffer), `earth-jukebox-${track.id}-${range[0]}-${range[1]}.wav`)
      announce('Rendered and downloaded. The WAV file uses the same score you just heard.')
    } catch (err) {
      console.error(err)
      announce('The render failed. Try a shorter window.')
    } finally {
      setRendering(false)
    }
  }

  return (
    <section id="studio" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-16 sm:px-6 lg:px-10">
      <div ref={ref}>
        {/* ---------------- header ---------------- */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="label-mono mb-2 flex items-center gap-2.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: track.color }} />
              now in the studio · {track.kicker}
            </div>
            <h2 className="text-3xl leading-tight font-semibold text-mist-50 sm:text-[40px]">{track.title}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mist-300">{track.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {track.sources.slice(0, 3).map((s) => (
              <SourceBadge key={s} id={s} />
            ))}
            <Button size="sm" variant="outline" onClick={() => void exportWindow()} disabled={rendering}>
              {rendering ? <Spinner size={13} /> : <IconDownload size={14} />} Render this window (WAV)
            </Button>
          </div>
        </div>

        {/* ---------------- track switcher ---------------- */}
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Choose a dataset">
          {TRACKS.map((t) => {
            const on = t.id === track.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setActiveTrack(t.id, { play: false })
                  engine.uiBlip('select')
                  announce(`${t.title} loaded. ${t.tagline}.`)
                }}
                className={`group inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                  on
                    ? 'border-white/25 bg-white/10 text-mist-50'
                    : 'border-white/10 bg-white/[0.02] text-mist-300 hover:border-white/20 hover:text-mist-100'
                }`}
                style={on ? { boxShadow: `0 0 0 1px ${t.color}55, 0 10px 30px -18px ${t.color}` } : undefined}
              >
                <span style={{ color: on ? t.color : undefined }}>
                  <TrackIcon id={t.id} size={17} />
                </span>
                <span className="text-[12.5px] font-medium whitespace-nowrap">{t.shortTitle}</span>
              </button>
            )
          })}
        </div>

        {/* ---------------- main grid ---------------- */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
          {/* left: the view */}
          <div className="space-y-5">
            <Panel className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Visualisation mode">
                  {VIEWS.map((v) => {
                    const Icon = v.icon
                    const on = viewMode === v.id
                    return (
                      <button
                        key={v.id}
                        role="tab"
                        aria-selected={on}
                        title={v.hint}
                        onClick={() => {
                          setViewMode(v.id)
                          engine.uiBlip('select')
                          announce(`${v.label} view`)
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                          on ? 'bg-sonic-300/15 text-sonic-200 ring-1 ring-sonic-300/40' : 'text-mist-300 hover:bg-white/6 hover:text-mist-100'
                        }`}
                      >
                        <Icon size={14} />
                        {v.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <IconButton label={showGrid ? 'Hide graticule' : 'Show graticule'} active={showGrid} onClick={toggleGrid}>
                    <IconGlobe size={15} />
                  </IconButton>
                  <IconButton label={showEvents ? 'Hide event markers' : 'Show event markers'} active={showEvents} onClick={toggleEvents}>
                    <IconSpark size={15} />
                  </IconButton>
                </div>
              </div>

              <div className="p-3 sm:p-4">
                {viewMode === '2d' && <WorldMap track={track} active={inView} />}
                {viewMode === '3d' && (
                  <div className="relative aspect-2/1 w-full overflow-hidden rounded-xl border border-white/10 bg-void-950">
                    <DataGlobe track={track} active={inView} />
                    <div className="pointer-events-none absolute bottom-2.5 left-3">
                      <Badge tone="cyan">
                        <IconGlobe size={11} /> drag to rotate · click to sonify a point
                      </Badge>
                    </div>
                  </div>
                )}
                {viewMode === 'chart' && (
                  <div className="rounded-xl border border-white/10 bg-void-950/60 p-2">
                    <Chart track={track} />
                  </div>
                )}
                {viewMode === 'frame' && <FrameStudio track={track} />}

                {textOnly && (
                  <p className="rounded-lg border border-carbon-300/30 bg-carbon-300/8 px-3 py-2 text-[12px] text-carbon-200">
                    Text-only mode is on: the maps and globe are hidden. The chart, data table and every number below remain
                    available, and the sonification still plays.
                  </p>
                )}
              </div>
            </Panel>

            {/* readout strip */}
            <Panel className="grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4">
              <Readout label="Value" value={`${fmtSigned(value, track.digits)} ${track.unit}`} tone={track.color} />
              <Readout label="Rate of change" value={`${fmtSigned(delta, Math.max(2, track.digits))} /yr`} />
              <Readout
                label={selected ? 'Selected point' : 'Field at equator'}
                value={
                  selected
                    ? `${latLabel(selected.lat)} ${lonLabel(selected.lon)}`
                    : `${Math.round(fieldValue(track.spatial, 0, 0, { year, value, norm, delta }).t * 100)}%`
                }
                sub={selectedSample ? `${Math.round(selectedSample.t * 100)}% of colour range` : 'Greenwich, 0°N'}
              />
              <Readout
                label={track.id === 'emissions' ? 'Emissions centre' : 'Position in range'}
                value={
                  track.id === 'emissions'
                    ? `${dominantEmitter(year)}`
                    : `${Math.round(norm * 100)}%`
                }
                sub={track.id === 'emissions' ? `${Math.round(emissionCentroidLon(year))}° → stereo pan` : `${track.domain[0]} to ${track.domain[1]} ${track.unit}`}
              />
            </Panel>

            {/* chart is always available under the map, per the brief: view + timeline + chart */}
            {viewMode !== 'chart' && !textOnly && (
              <Panel className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
                  <span className="label-mono flex items-center gap-2">
                    <IconChart size={12} /> time series · {track.yearSpan[0]}–{track.yearSpan[1]}
                  </span>
                  <Badge tone="neutral">click to seek</Badge>
                </div>
                <div className="p-3 sm:p-4">
                  <Chart track={track} />
                </div>
              </Panel>
            )}
          </div>

          {/* right: transport + sound */}
          <div className="space-y-5">
            <Panel className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="label-mono flex items-center gap-2">
                  <IconPlay size={12} /> transport
                </span>
                <Badge tone="cyan">
                  {Math.floor(year)} / {range[1]}
                </Badge>
              </div>
              <Timeline track={track} />
            </Panel>

            <Panel className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="label-mono flex items-center gap-2">
                  <IconSpark size={12} /> what you are hearing
                </span>
                <span className="data-mono text-[10.5px] text-mist-400">live</span>
              </div>
              <Visualizer color={track.color} height={86} />
              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12.5px] leading-relaxed text-mist-200">
                {track.describe(year, value, delta)}{' '}
                <span className="text-mist-400">
                  Drone {midiToName(track.sonification.rootMidi + norm * 12)} · {Math.round(norm * 100)}% of the colour
                  range · reverb {Math.round(track.sonification.reverb * 100)}%.
                </span>
              </p>
            </Panel>

            <Panel className="p-4">
              <SonificationControls track={track} />
            </Panel>

            <Panel className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <IconKeyboard size={14} className="text-mist-400" />
                <span className="label-mono">Keyboard</span>
              </div>
              <ul className="data-mono space-y-1 text-[11.5px] text-mist-300">
                <li>
                  <Key>Space</Key> play / pause
                </li>
                <li>
                  <Key>←</Key>
                  <Key>→</Key> step the playhead
                </li>
                <li>
                  <Key>Shift</Key>+<Key>←</Key> jump 10 years
                </li>
                <li>
                  <Key>1</Key>…<Key>6</Key> switch dataset
                </li>
                <li>
                  <Key>M</Key> mute · <Key>V</Key> open the voice agent
                </li>
              </ul>
            </Panel>
          </div>
        </div>

        {/* ---------------- narrative + data table + sources ---------------- */}
        <Reveal className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel className="p-5">
            <span className="label-mono mb-2 block">About this record</span>
            <p className="text-[14px] leading-relaxed text-mist-200">{track.description}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {track.stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="label-mono">{s.label}</div>
                  <div className="data-mono mt-1 text-[14px] font-semibold" style={{ color: track.color }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowTable((v) => !v)}>
                {showTable ? 'Hide the data table' : 'Show the data table'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  announce(track.audioDescription)
                  emit({ type: 'scroll-to', section: 'studio' })
                }}
              >
                <IconInfo size={13} /> Read the audio description aloud
              </Button>
            </div>
            <p className="sr-only">{track.audioDescription}</p>
            {showTable && (
              <div className="mt-4">
                <DataTable track={track} />
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <span className="label-mono mb-3 block">Sources for everything in this panel</span>
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[13px] font-semibold text-sonic-200 underline decoration-sonic-300/30 underline-offset-2 hover:decoration-sonic-300"
                  >
                    {s.title}
                  </a>
                  <div className="data-mono mt-0.5 text-[11px] text-mist-400">
                    {s.publisher}
                    {s.license ? ` · ${s.license}` : ''}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-300">{s.usedFor}</p>
                  {s.note && <p className="mt-1 text-[11px] leading-relaxed text-mist-400">{s.note}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-mist-400">
              Spatial fields are modelled from published characteristics (see the note under each map) rather than copied
              from a gridded product. Time series are the published values, rounded for distribution.
            </p>
          </Panel>
        </Reveal>
      </div>
    </section>
  )
}

function Readout({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white/[0.02] px-4 py-3">
      <div className="label-mono truncate">{label}</div>
      <div className="data-mono mt-1 truncate text-[16px] font-semibold" style={{ color: tone ?? 'var(--color-mist-50)' }}>
        {value}
      </div>
      {sub && <div className="data-mono mt-0.5 truncate text-[10.5px] text-mist-400">{sub}</div>}
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded border border-white/15 bg-white/6 px-1 py-0.5 text-[10px] text-mist-200">
      {children}
    </kbd>
  )
}
