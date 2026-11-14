/**
 * Method — how a visual frame becomes sound. Every rule is stated in words *and*
 * demonstrated with a button that plays it, because the point of the project is that
 * you should not have to see it to understand it.
 */

import { useState } from 'react'
import { TRACKS } from '@/data/tracks'
import { SCALE_LABELS, degreeToMidi, midiToName, valueToMidi } from '@/audio/scales'
import type { ScaleName, TimbreName } from '@/data/types'
import { engine } from '@/audio/engine'
import { useStore } from '@/state/store'
import { useI18n } from '@/i18n/useI18n'
import { Badge, Button, Panel, Reveal, SectionHeading, SourceBadge } from '@/components/ui/Primitives'
import { IconArrow, IconChart, IconFrame, IconPlay, IconSpark, IconWave, TrackIcon } from '@/components/ui/Icon'

const PIPELINE = [
  {
    step: '01',
    title: 'Take the frame',
    body: 'An Earth Information Center visualisation is a sequence of frames. We use two sources: the published data record behind the frame, and the rendered pixels themselves — you can drop any NASA still onto the frame scanner.',
    icon: IconFrame,
  },
  {
    step: '02',
    title: 'Analyse',
    body: 'Per frame we measure the value and its rate of change, plus (for pixels) a column-by-column scan of hue, brightness, saturation, vertical centre of mass and density, and a dominant-colour palette.',
    icon: IconChart,
  },
  {
    step: '03',
    title: 'Map by ruleset',
    body: 'An artistic ruleset turns measurements into music: value → pitch inside a scale, rate of change → tempo and filter brightness, extremes → struck bells, longitude → stereo pan, palette → chord.',
    icon: IconSpark,
  },
  {
    step: '04',
    title: 'Synthesise',
    body: 'The score is scheduled on the Web Audio clock with sample accuracy. Voices are built from oscillators and FM bells, shaped by a convolution reverb generated in-app, and limited by a compressor.',
    icon: IconWave,
  },
  {
    step: '05',
    title: 'Listen — and read',
    body: 'Sound is only one output. Every moment also produces a spoken sentence, a live-region announcement and a row in a data table, so the same story reaches ears, eyes and screen readers.',
    icon: IconPlay,
  },
]

const MAPPINGS: Array<{ from: string; to: string; why: string; demo: () => void; demoLabel: string }> = [
  {
    from: 'Value (°C, ppm, M km², mm, ZJ)',
    to: 'Pitch — quantised to the track’s scale',
    why: 'Quantising keeps the result musical. A raw value-to-frequency mapping slides through microtones and sounds like a siren; a scale makes the same data singable.',
    demoLabel: 'Hear value → pitch',
    demo: () => {
      const midi = [0, 0.25, 0.5, 0.75, 1].map((t) => valueToMidi(t, 57, 'aeolian', 2))
      void engine.playNotes(midi.map((m, i) => ({ midi: m, delay: i * 0.42, gain: 0.15, dur: 1.1, timbre: 'glass' })))
    },
  },
  {
    from: 'Rate of change (units per year)',
    to: 'Tempo, percussion density and filter brightness',
    why: 'Acceleration is the most important thing in climate data and the hardest to see in a static chart. You feel it as the music getting busier and brighter.',
    demoLabel: 'Hear slow → fast',
    demo: () => {
      const notes: Array<{ midi: number; delay: number }> = []
      let t = 0
      for (let step = 0; step < 22; step++) {
        notes.push({ midi: degreeToMidi(45, 'phrygian', step % 6), delay: t })
        t += Math.max(0.09, 0.55 - step * 0.022)
      }
      void engine.playNotes(notes.map((n) => ({ ...n, gain: 0.11, dur: 0.24, timbre: 'pluck' })))
    },
  },
  {
    from: 'Longitude of the signal',
    to: 'Stereo pan',
    why: 'For emissions, the centre of the world’s carbon output drifts eastward across the century — so the sound physically moves from the left speaker to the right.',
    demoLabel: 'Hear west → east',
    demo: () => {
      void engine.playNotes(
        [-1, -0.5, 0, 0.5, 1].map((pan, i) => ({ midi: 69, delay: i * 0.34, pan, gain: 0.14, dur: 0.7, timbre: 'bell' })),
      )
    },
  },
  {
    from: 'Latitude of a point you touch',
    to: 'Pitch offset + a struck glass note',
    why: 'Click or arrow-key across the map and every location answers with its own pitch, panned to its longitude. That is how a blind listener explores the geography.',
    demoLabel: 'Hear south → north',
    demo: () => {
      void engine.playNotes(
        [-60, -30, 0, 30, 60].map((lat, i) => ({ midi: 62 + (lat / 90) * 12, delay: i * 0.3, pan: 0, gain: 0.13, dur: 1.4, timbre: 'glass' })),
      )
    },
  },
  {
    from: 'Frame palette (dominant colours)',
    to: 'A chord in the track’s scale',
    why: 'Colour spectrum → harmony, exactly as the brief suggests. Three dominant hues become three scale degrees, so a red frame and a blue frame have different chords.',
    demoLabel: 'Hear three palettes',
    demo: () => {
      const sets = [
        [57, 60, 64], // warm
        [57, 62, 66], // neutral
        [55, 62, 67], // cool
      ]
      void engine.playNotes(
        sets.flatMap((s, i) => s.map((m, j) => ({ midi: m, delay: i * 1.1 + j * 0.05, gain: 0.12, dur: 1.6, timbre: 'pad' as const }))),
      )
    },
  },
  {
    from: 'Pixel density above a threshold',
    to: 'Percussion activity',
    why: 'A busy frame rattles; an empty one stays still. Density becomes rhythm without any pitch information being lost.',
    demoLabel: 'Hear sparse → dense',
    demo: () => {
      const notes: Array<{ midi: number; delay: number }> = []
      let t = 0
      for (let i = 0; i < 30; i++) {
        notes.push({ midi: 45, delay: t })
        t += Math.max(0.06, 0.5 - i * 0.016)
      }
      void engine.playNotes(notes.map((n) => ({ ...n, gain: 0.07, dur: 0.1, timbre: 'pluck' })))
    },
  },
  {
    from: 'Records, eruptions, treaties',
    to: 'Distinct struck events',
    why: 'Not everything is continuous. Pinatubo in 1991 is not a wiggle in the line — it gets its own low chord and a sub-bass thump so you hear the event as an event.',
    demoLabel: 'Hear an eruption',
    demo: () => {
      void engine.playNotes([
        { midi: 33, delay: 0, gain: 0.2, dur: 2.2, timbre: 'drone' },
        { midi: 45, delay: 0.05, gain: 0.14, dur: 2.4, timbre: 'pad' },
        { midi: 52, delay: 0.12, gain: 0.13, dur: 2.4, timbre: 'pad' },
        { midi: 76, delay: 0.2, gain: 0.1, dur: 2.6, timbre: 'glass' },
      ])
    },
  },
]

export function HowItWorks() {
  const { t } = useI18n()
  const [scale, setScale] = useState<ScaleName>('aeolian')
  const intensity = useStore((s) => s.intensity)
  const announce = useStore((s) => s.announce)

  const playScale = (s: ScaleName) => {
    setScale(s)
    type DemoNote = { midi: number; delay: number; gain: number; dur: number; timbre: TimbreName }
    const notes: DemoNote[] = [0, 1, 2, 3, 4, 5, 6, 7].map((d, i) => ({
      midi: degreeToMidi(57, s, d),
      delay: i * 0.2,
      gain: 0.13,
      dur: 0.9,
      timbre: 'glass',
    }))
    notes.push({ midi: degreeToMidi(45, s, 0), delay: 0, gain: 0.1, dur: 2.2, timbre: 'pad' })
    void engine.playNotes(notes)
    announce(`${s} scale. ${SCALE_LABELS[s]}.`)
  }

  return (
    <section id="method" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
      <SectionHeading
        eyebrow={t('method.eyebrow')}
        title={
          <>
            {t('method.title1')} <span className="text-gradient">{t('method.title2')}</span>
          </>
        }
        lede={t('method.lede')}
      />

      <div className="mt-10 flex flex-wrap gap-2">
        <SourceBadge id="sonificationHandbook" label="The Sonification Handbook" />
        <SourceBadge id="chandraSonification" label="Chandra sound sonification" />
        <SourceBadge id="webaudio" label="Web Audio API" />
        <SourceBadge id="nasaSvs" label="NASA SVS frames" />
      </div>

      {/* pipeline */}
      <ol className="mt-10 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE.map((p, i) => {
          const Icon = p.icon
          return (
            <Reveal as="li" key={p.step} delay={i * 70}>
              <Panel className="relative h-full p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sonic-300/30 bg-sonic-300/10 text-sonic-200">
                    <Icon size={17} />
                  </span>
                  <span className="data-mono text-[11px] text-mist-500">{p.step}</span>
                </div>
                <h3 className="text-[14.5px] font-semibold text-mist-50">{p.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist-300">{p.body}</p>
                {i < PIPELINE.length - 1 && (
                  <span className="absolute top-1/2 -end-3 hidden text-mist-500 xl:block" aria-hidden>
                    <IconArrow size={16} />
                  </span>
                )}
              </Panel>
            </Reveal>
          )
        })}
      </ol>

      {/* mapping table */}
      <Reveal className="mt-6">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
            <div>
              <span className="label-mono">The ruleset · data → sound</span>
              <h3 className="mt-1 text-[17px] font-semibold text-mist-50">Every mapping you can hear</h3>
            </div>
            <Badge tone="cyan">press a demo — it plays immediately</Badge>
          </div>
          <div className="divide-y divide-white/6">
            {MAPPINGS.map((m) => (
              <div key={m.from} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] md:items-center">
                <div>
                  <div className="data-mono text-[11px] tracking-wide text-mist-400 uppercase">data</div>
                  <div className="mt-0.5 text-[13.5px] font-medium text-mist-50">{m.from}</div>
                </div>
                <div>
                  <div className="data-mono text-[11px] tracking-wide text-sonic-300/80 uppercase">sound</div>
                  <div className="mt-0.5 text-[13.5px] text-mist-100">{m.to}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mist-400">{m.why}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { void engine.init(); m.demo(); announce(m.demoLabel) }}>
                  <IconPlay size={12} /> {m.demoLabel}
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      </Reveal>

      {/* scales */}
      <Reveal className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="p-5">
          <span className="label-mono mb-3 block">Scales — why the data still sounds like music</span>
          <p className="mb-4 text-[13px] leading-relaxed text-mist-300">
            A direct value-to-frequency mapping produces sliding, atonal noise. Quantising to a scale keeps the information
            (higher is still higher, faster is still faster) while making it listenable for minutes at a time. Tap a mode to
            hear it: <span className="data-mono text-sonic-200">{midiToName(degreeToMidi(57, scale, 0))}</span> is the current
            root.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(SCALE_LABELS) as ScaleName[]).map((s) => (
              <button
                key={s}
                onClick={() => playScale(s)}
                className={`rounded-lg border px-3 py-2 text-start transition ${
                  scale === s ? 'border-sonic-300/50 bg-sonic-300/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                }`}
              >
                <span className="data-mono block text-[12px] font-semibold text-mist-50">{s}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-mist-400">{SCALE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <span className="label-mono mb-3 block">One ruleset per dataset</span>
          <ul className="space-y-2.5">
            {TRACKS.map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <span className="mt-0.5 shrink-0" style={{ color: t.color }}>
                  <TrackIcon id={t.id} size={17} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-mist-50">{t.shortTitle}</span>
                    <Badge tone="neutral">{t.sonification.scale}</Badge>
                    <Badge tone="neutral">{t.sonification.timbre}</Badge>
                    <Badge tone="neutral">
                      {t.sonification.bpm[0]}–{t.sonification.bpm[1]} bpm
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mist-300">
                    <span style={{ color: t.color }}>{t.sonification.mood}.</span> {t.sonification.rule}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const t = TRACKS[Math.floor(Math.random() * TRACKS.length)]
                useStore.getState().setActiveTrack(t.id, { play: true })
                announce(`Loaded ${t.title}`)
              }}
            >
              <IconSpark size={13} /> Surprise me with a dataset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => announce(`Intensity is ${Math.round(intensity * 100)} percent`)}>
              Announce current intensity
            </Button>
          </div>
        </Panel>
      </Reveal>
    </section>
  )
}
