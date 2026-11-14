/**
 * Frame Studio — the literal "analyse a visual frame and play the corresponding
 * soundscape" mode. Works on frames this app renders itself *and* on any image you
 * drop in (a NASA SVS still, a Worldview screenshot, an EIC animation frame).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '@/data/types'
import type { FrameAnalysis } from '@/audio/frameAnalysis'
import { analyseFrame, describeFrame, frameToScore, hueName, paletteToChord } from '@/audio/frameAnalysis'
import { composeFrameCanvas } from '@/lib/frameSource'
import { engine } from '@/audio/engine'
import { renderScore } from '@/audio/render'
import { audioBufferToWav, downloadBlob } from '@/lib/wav'
import { useStore } from '@/state/store'
import { SCALE_LABELS, midiToName } from '@/audio/scales'
import type { ScaleName } from '@/data/types'
import { Badge, Button, Panel, Slider, Spinner } from '@/components/ui/Primitives'
import { IconDownload, IconFrame, IconPlay, IconSpark, IconStop } from '@/components/ui/Icon'
import { onBus } from '@/lib/bus'

const COLUMN_OPTIONS = [32, 64, 96, 128, 192]

export function FrameStudio({ track }: { track: Track }) {
  const year = useStore((s) => s.year)
  const intensity = useStore((s) => s.intensity)
  const announce = useStore((s) => s.announce)
  const frameProgress = useStore((s) => s.frameProgress)

  const viewRef = useRef<HTMLCanvasElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [analysis, setAnalysis] = useState<FrameAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [columns, setColumns] = useState(96)
  const [scale, setScale] = useState<ScaleName>(track.sonification.scale)
  const [duration, setDuration] = useState(16)
  const [sourceLabel, setSourceLabel] = useState(`Rendered frame · ${track.shortTitle} · ${Math.floor(year)}`)

  /* keep the visible preview in sync with the app's own frame */
  const useCurrentFrame = useCallback(
    async (silent = false) => {
      const view = viewRef.current
      if (!view) return
      setBusy(true)
      try {
        const canvas = await composeFrameCanvas(track, year, {
          width: 960,
          graticule: true,
          title: `EARTH JUKEBOX · ${track.shortTitle.toUpperCase()} · ${Math.floor(year)}`,
        })
        sourceCanvasRef.current = canvas
        view.width = canvas.width
        view.height = canvas.height
        const ctx = view.getContext('2d')!
        ctx.drawImage(canvas, 0, 0)
        const a = analyseFrame(canvas, { columns })
        setAnalysis(a)
        setSourceLabel(`Rendered frame · ${track.shortTitle} · ${Math.floor(year)}`)
        if (!silent) announce(describeFrame(a, 'The current frame'))
      } finally {
        setBusy(false)
      }
    },
    [announce, columns, track, year],
  )

  useEffect(() => {
    void useCurrentFrame(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, columns])

  useEffect(() => {
    let t = 0
    const id = window.setTimeout(() => {
      t = 1
      if (sourceCanvasRef.current?.dataset.source !== 'upload') void useCurrentFrame(true)
    }, 400)
    return () => {
      window.clearTimeout(id)
      void t
    }
  }, [year, useCurrentFrame])

  /* the voice agent can trigger a scan */
  useEffect(() => onBus((e) => e.type === 'sonify-frame' && void scanAndPlay()), []) // eslint-disable-line react-hooks/exhaustive-deps

  const onUpload = async (file: File) => {
    setBusy(true)
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const w = 960
        const h = Math.max(120, Math.round((w * img.naturalHeight) / img.naturalWidth))
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        canvas.dataset.source = 'upload'
        sourceCanvasRef.current = canvas
        const view = viewRef.current!
        view.width = w
        view.height = h
        view.getContext('2d')!.drawImage(canvas, 0, 0)
        const a = analyseFrame(canvas, { columns })
        setAnalysis(a)
        setSourceLabel(`Uploaded frame · ${file.name}`)
        announce(describeFrame(a, file.name))
        setBusy(false)
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        setBusy(false)
        announce('That file could not be read as an image.')
      }
      img.src = url
    } catch {
      setBusy(false)
    }
  }

  const scanAndPlay = async () => {
    const a = analysis ?? (await analyseCurrent())
    if (!a) return
    const score = frameToScore(a, { duration, scale, rootMidi: track.sonification.rootMidi + 12, intensity })
    await engine.setScore(score)
    await engine.play(0)
    setPlaying(true)
    announce(`Scanning the frame: ${score.noteCount} notes over ${duration} seconds. ${describeFrame(a, 'This frame')}`)
  }

  const analyseCurrent = async () => {
    if (!sourceCanvasRef.current) await useCurrentFrame(true)
    const canvas = sourceCanvasRef.current
    if (!canvas) return null
    const a = analyseFrame(canvas, { columns })
    setAnalysis(a)
    return a
  }

  const stop = () => {
    engine.stop()
    setPlaying(false)
    useStore.getState().setIsPlaying(false)
  }

  const exportWav = async () => {
    const a = analysis
    if (!a) return
    setRendering(true)
    try {
      const score = frameToScore(a, { duration, scale, rootMidi: track.sonification.rootMidi + 12, intensity })
      const buffer = await renderScore(score)
      downloadBlob(audioBufferToWav(buffer), `earth-jukebox-frame-${track.id}-${Math.floor(year)}.wav`)
      announce('Frame sonification rendered and downloaded as a WAV file.')
    } finally {
      setRendering(false)
    }
  }

  const chord = analysis ? paletteToChord(analysis, scale, track.sonification.rootMidi + 12) : []

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div>
        <Panel className="overflow-hidden">
          <div className="relative">
            <canvas ref={viewRef} className="block h-auto w-full" aria-label={`Visual frame: ${sourceLabel}`} role="img" />
            {/* scan line */}
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-sonic-300 shadow-[0_0_18px_4px_rgba(110,231,255,0.55)] transition-[left] duration-75"
              style={{ left: `${(playing ? frameProgress : 0) * 100}%`, opacity: playing ? 1 : 0.35 }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-void-950/90 to-transparent px-3 py-2">
              <span className="data-mono text-[10.5px] tracking-wide text-mist-200 uppercase">{sourceLabel}</span>
              <Badge tone="cyan">
                <IconFrame size={11} /> {columns} columns
              </Badge>
            </div>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-void-950/60">
                <Spinner size={22} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/8 p-3">
            <Button variant="primary" size="sm" onClick={() => void scanAndPlay()} disabled={busy}>
              <IconPlay size={14} /> Scan &amp; play
            </Button>
            <Button size="sm" variant="ghost" onClick={stop} disabled={!playing}>
              <IconStop size={13} /> Stop
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void useCurrentFrame()}>
              Use current map frame
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              Upload an image
            </Button>
            <Button size="sm" variant="outline" onClick={() => void exportWav()} disabled={rendering || !analysis}>
              {rendering ? <Spinner size={13} /> : <IconDownload size={14} />} Render WAV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUpload(f)
                e.target.value = ''
              }}
            />
          </div>
        </Panel>

        <p className="mt-2 text-[11.5px] leading-relaxed text-mist-400">
          Drop any NASA Earth Information Center frame, a Worldview screenshot or a still from an SVS animation onto the
          image above. The scan reads it left to right: position becomes time, the height of the light becomes pitch and
          stereo pan, brightness becomes loudness, hue becomes timbre, and density becomes percussion.
        </p>
      </div>

      <div className="space-y-4">
        <Panel className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="label-mono flex items-center gap-2">
              <IconSpark size={12} /> Frame analysis
            </span>
            {analysis && <Badge tone="neutral">{analysis.columns.length} cols</Badge>}
          </div>
          {analysis ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Brightness" value={`${Math.round(analysis.meanBrightness * 100)}%`} />
                <Metric label="Contrast" value={`${Math.round(analysis.contrast * 100)}%`} />
                <Metric label="Warmth" value={`${Math.round(analysis.warmth * 100)}`} />
              </div>
              <div>
                <span className="label-mono mb-1.5 block">Palette → chord</span>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.palette.map((p) => (
                    <span
                      key={p.hue + p.name}
                      className="data-mono inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2 py-1 text-[10.5px] text-mist-200"
                      title={`${p.name} · ${Math.round(p.weight * 100)}% of the frame`}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ background: `rgb(${p.color.join(',')})` }} />
                      {p.name} {Math.round(p.weight * 100)}%
                    </span>
                  ))}
                </div>
                {chord.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="xs" variant="outline" onClick={() => engine.playChord(chord)}>
                      Play the palette chord
                    </Button>
                    <span className="data-mono text-[11px] text-mist-300">{chord.map((m) => midiToName(m)).join(' · ')}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-mist-400">Analysing…</p>
          )}
        </Panel>

        <Panel className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label-mono mb-1.5 block">Scan columns</span>
              <div className="flex flex-wrap gap-1.5">
                {COLUMN_OPTIONS.map((c) => (
                  <Button key={c} size="xs" variant={columns === c ? 'outline' : 'ghost'} onClick={() => setColumns(c)}>
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <span className="label-mono mb-1.5 block">Scale</span>
              <select
                className="data-mono w-full appearance-none rounded-lg border border-white/12 bg-void-900 px-2.5 py-2 text-[11.5px] text-mist-100 outline-none focus:border-sonic-300/60"
                value={scale}
                onChange={(e) => setScale(e.target.value as ScaleName)}
                aria-label="Scale used for the frame scan"
              >
                {(Object.keys(SCALE_LABELS) as ScaleName[]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Slider
            label="Scan duration"
            value={duration}
            min={4}
            max={60}
            step={1}
            onChange={setDuration}
            format={(v) => `${v}s`}
            valueText={`${duration} seconds per scan`}
          />
          <p className="text-[11.5px] leading-relaxed text-mist-400">
            {analysis
              ? `This frame becomes ${Math.round(analysis.columns.length * 1.4)}–${analysis.columns.length * 2} notes over ${duration} seconds in ${scale}. ${hueName(analysis.palette[0]?.hue ?? 0)} dominates the palette.`
              : 'Choose a scale and duration, then scan.'}
          </p>
        </Panel>

        {analysis && (
          <Panel className="overflow-hidden">
            <div className="border-b border-white/8 px-4 py-2.5">
              <span className="label-mono">Column → note mapping (first 12)</span>
            </div>
            <div className="max-h-56 overflow-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">How each vertical strip of the frame maps to a note</caption>
                <thead className="sticky top-0 bg-void-850/95">
                  <tr>
                    {['x', 'hue', 'bright', 'pitch', 'pan'].map((h) => (
                      <th key={h} scope="col" className="data-mono px-3 py-1.5 text-[10px] tracking-wider text-mist-400 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.columns.slice(0, 12).map((c) => (
                    <tr key={c.x} className="border-t border-white/6">
                      <td className="data-mono px-3 py-1.5 text-[11.5px] text-mist-200">{Math.round(c.x * 100)}%</td>
                      <td className="px-3 py-1.5 text-[11.5px] text-mist-300">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${c.color.join(',')})` }} />
                          {hueName(c.hue)}
                        </span>
                      </td>
                      <td className="data-mono px-3 py-1.5 text-[11.5px] text-mist-300">{Math.round(c.brightness * 100)}%</td>
                      <td className="data-mono px-3 py-1.5 text-[11.5px] text-sonic-200">
                        {midiToName(track.sonification.rootMidi + 12 + Math.round((1 - c.centroidY) * 20))}
                      </td>
                      <td className="data-mono px-3 py-1.5 text-[11.5px] text-mist-300">
                        {((0.5 - c.centroidY) * 1.4).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <div className="label-mono">{label}</div>
      <div className="data-mono mt-0.5 text-[15px] font-semibold text-mist-50">{value}</div>
    </div>
  )
}
