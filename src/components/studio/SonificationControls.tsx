/** Sonification parameters — the artistic ruleset, editable live. */

import type { ScaleName, Track } from '@/data/types'
import { useStore } from '@/state/store'
import { SCALE_LABELS } from '@/audio/scales'
import { engine } from '@/audio/engine'
import { emit } from '@/lib/bus'
import { Badge, Button, Slider, Toggle } from '@/components/ui/Primitives'
import { IconMute, IconVolume, IconWave } from '@/components/ui/Icon'

const LAYERS: Array<{ key: 'drone' | 'melody' | 'rhythm' | 'shimmer' | 'sub'; label: string; hint: string }> = [
  { key: 'drone', label: 'Drone', hint: 'Continuous pad that follows the value' },
  { key: 'melody', label: 'Melody', hint: 'Quantised notes, one per beat' },
  { key: 'rhythm', label: 'Rhythm', hint: 'Percussion driven by the rate of change' },
  { key: 'shimmer', label: 'Shimmer', hint: 'High glass harmonics on extremes' },
  { key: 'sub', label: 'Sub', hint: 'Low gravity notes every eight beats' },
]

export function SonificationControls({ track }: { track: Track }) {
  const layers = useStore((s) => s.layers)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const intensity = useStore((s) => s.intensity)
  const setIntensity = useStore((s) => s.setIntensity)
  const reverb = useStore((s) => s.reverb)
  const setReverb = useStore((s) => s.setReverb)
  const volume = useStore((s) => s.volume)
  const setVolume = useStore((s) => s.setVolume)
  const muted = useStore((s) => s.muted)
  const toggleMute = useStore((s) => s.toggleMute)
  const scaleOverride = useStore((s) => s.scaleOverride)
  const setScaleOverride = useStore((s) => s.setScaleOverride)
  const announce = useStore((s) => s.announce)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)

  const scale = (scaleOverride ?? track.sonification.scale) as ScaleName

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="label-mono flex items-center gap-2">
            <IconWave size={12} /> Musical ruleset
          </span>
          <Badge tone="warm">{track.sonification.mood}</Badge>
        </div>
        <label className="block">
          <span className="sr-only">Scale</span>
          <select
            className="data-mono w-full appearance-none rounded-lg border border-white/12 bg-void-900 px-3 py-2.5 text-[12.5px] text-mist-100 outline-none focus:border-sonic-300/60"
            value={scale}
            onChange={(e) => {
              setScaleOverride(e.target.value)
              announce(`Scale changed to ${e.target.value}`)
              emit({ type: 'rebuild-score', reason: 'scale' })
            }}
          >
            {(Object.keys(SCALE_LABELS) as ScaleName[]).map((s) => (
              <option key={s} value={s}>
                {s} — {SCALE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-[11.5px] leading-relaxed text-mist-400">
          Root {track.sonification.rootMidi} · {track.sonification.octaves} octaves ·{' '}
          {track.sonification.bpm[0]}–{track.sonification.bpm[1]} bpm · timbre {track.sonification.timbre}
        </p>
        <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-mist-200">
          {track.sonification.rule}
        </p>
      </div>

      <div>
        <span className="label-mono mb-2 block">Layers</span>
        <div className="flex flex-wrap gap-1.5">
          {LAYERS.map((l) => (
            <Button
              key={l.key}
              size="xs"
              variant={layers[l.key] ? 'outline' : 'ghost'}
              active={layers[l.key]}
              title={l.hint}
              aria-pressed={layers[l.key]}
              onClick={() => {
                toggleLayer(l.key)
                announce(`${l.label} layer ${layers[l.key] ? 'off' : 'on'}`)
                emit({ type: 'rebuild-score', reason: 'layers' })
              }}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Intensity"
          value={intensity}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(v) => setIntensity(v)}
          format={(v) => `${Math.round(v * 100)}%`}
          valueText={`${Math.round(intensity * 100)} percent intensity`}
        />
        <Slider
          label="Reverb"
          value={reverb}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => {
            setReverb(v)
            engine.setReverb(v)
          }}
          format={(v) => `${Math.round(v * 100)}%`}
          valueText={`${Math.round(reverb * 100)} percent reverb`}
        />
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
        <button
          onClick={() => {
            toggleMute()
            announce(muted ? 'Audio unmuted' : 'Audio muted')
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          className="text-mist-200 transition hover:text-sonic-200"
        >
          {muted ? <IconMute size={18} /> : <IconVolume size={18} />}
        </button>
        <Slider
          className="flex-1"
          label="Volume"
          value={volume}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => {
            setVolume(v)
            engine.setVolume(v)
          }}
          format={(v) => `${Math.round(v * 100)}%`}
          valueText={`Volume ${Math.round(volume * 100)} percent`}
        />
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <Toggle
          label="Sonify the visual frame instead"
          description="Scan the rendered map left→right: colour → pitch, brightness → loudness."
          checked={viewMode === 'frame'}
          onChange={(v) => {
            if (v) {
              setViewMode('frame')
              emit({ type: 'sonify-frame' })
            } else setViewMode('2d')
          }}
        />
      </div>
    </div>
  )
}
