/**
 * Accessibility — the reason the project exists, presented as something you can try
 * rather than something you have to take on trust.
 */

import { useStore } from '@/state/store'
import { Badge, Button, Kbd, Panel, Reveal, SectionHeading, SourceBadge, Toggle } from '@/components/ui/Primitives'
import { IconAccess, IconKeyboard, IconMic, IconPlay, IconWave } from '@/components/ui/Icon'
import { emit } from '@/lib/bus'

const FEATURES = [
  {
    title: 'Screen-reader first',
    body: 'The timeline is a real slider with spoken value text, charts carry a long description plus a data table, and every state change is published to a polite live region.',
    tag: 'ARIA',
  },
  {
    title: 'Keyboard-only operation',
    body: 'Nothing requires a mouse or a touch screen. The map has an arrow-key cursor that announces each coordinate; Enter sonifies the point under it.',
    tag: 'WCAG 2.1.1',
  },
  {
    title: 'Sound as the map',
    body: 'Longitude becomes stereo pan and latitude becomes pitch, so a listener can locate a signal geographically without seeing it. Clicking anywhere answers with a note.',
    tag: 'non-visual',
  },
  {
    title: 'Text alternative for every sound',
    body: 'Each track has an audio description, and every moment of playback can be read as a sentence: the year, the value, the rate of change and what the mapping is doing.',
    tag: 'WCAG 1.2',
  },
  {
    title: 'Voice in, voice out',
    body: 'Ask the guide by microphone, by typed text, or by recording your question as an audio message. Answers are synthesised aloud and always transcribed on screen.',
    tag: 'speech',
  },
  {
    title: 'Sensory redundancy',
    body: 'No meaning lives in colour alone: the palette is named in words, the field value is printed as a percentage, and confirmation is given by sound, text and (where supported) vibration.',
    tag: 'WCAG 1.4.1',
  },
  {
    title: 'Motion, contrast, WebGL off',
    body: 'prefers-reduced-motion is honoured automatically, high contrast is one switch away, and text-only mode disables WebGL entirely while leaving data and audio intact.',
    tag: 'WCAG 2.3.3',
  },
  {
    title: 'Everything is generated locally',
    body: 'No streaming, no third-party audio, no network dependency: the sonification, the reverb impulse and the speech all run in the browser, which matters for low-bandwidth users.',
    tag: 'offline',
  },
]

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play or pause the sonification'],
  ['← / →', 'Step the playhead one year'],
  ['Shift + ← / →', 'Step ten years'],
  ['1 – 6', 'Switch dataset'],
  ['2 / 3 / 4', 'Switch between 2D map, 3D globe and chart'],
  ['M', 'Mute or unmute'],
  ['V', 'Open the guide agent'],
  ['/', 'Focus the search field'],
  ['Arrow keys on the map', 'Move the audio cursor across the globe'],
  ['Enter on the map', 'Sonify the point under the cursor'],
]

export function AccessibilitySection() {
  const a11y = useStore((s) => s.a11y)
  const setA11y = useStore((s) => s.setA11y)
  const announce = useStore((s) => s.announce)

  return (
    <section id="access" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
      <SectionHeading
        eyebrow="Accessibility · step 4"
        title={
          <>
            Not a feature. <span className="text-gradient">The reason.</span>
          </>
        }
        lede="Around 2.2 billion people live with a vision impairment, and NASA's Earth Information Center visualisations reach almost none of them. Turning sight into sound is not a novelty layer on top of this project — it is the project. Everything below is live: switch it on and the whole app changes."
      />

      <div className="mt-8 flex flex-wrap gap-2">
        <SourceBadge id="webspeech" label="Web Speech API" />
        <Badge tone="cyan">WCAG 2.2 AA-oriented</Badge>
        <Badge tone="neutral">no colour-only meaning</Badge>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 55}>
              <Panel className="h-full p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[14.5px] font-semibold text-mist-50">{f.title}</h3>
                  <Badge tone="neutral">{f.tag}</Badge>
                </div>
                <p className="text-[12.5px] leading-relaxed text-mist-300">{f.body}</p>
              </Panel>
            </Reveal>
          ))}
        </ul>

        <div className="space-y-5">
          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <IconAccess size={16} className="text-sonic-300" />
              <span className="label-mono">Try it now — these are live</span>
            </div>
            <div className="space-y-3">
              <Toggle label="High contrast" description="Pure-white text, opaque panels, stronger borders" checked={a11y.highContrast} onChange={(v) => setA11y({ highContrast: v })} />
              <Toggle label="Reduced motion" description="Freeze the globe and every transition" checked={a11y.reduceMotion} onChange={(v) => setA11y({ reduceMotion: v })} />
              <Toggle label="Text-only mode" description="Disable WebGL; keep charts, tables and audio" checked={a11y.textOnly} onChange={(v) => setA11y({ textOnly: v })} />
              <Toggle label="Verbose announcements" description="Read every playhead change to a screen reader" checked={a11y.verbose} onChange={(v) => setA11y({ verbose: v })} />
              <Toggle label="Haptic blips" description="Vibrate on confirmations where supported" checked={a11y.haptics} onChange={(v) => setA11y({ haptics: v })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setA11y({ textOnly: !a11y.textOnly })
                  announce(a11y.textOnly ? 'WebGL views enabled' : 'Text-only mode on. The maps and globe are hidden; the data table and audio remain.')
                }}
              >
                <IconPlay size={12} /> Toggle text-only
              </Button>
              <Button size="sm" variant="ghost" onClick={() => emit({ type: 'start-mic', mode: 'tap' })}>
                <IconMic size={13} /> Ask by voice
              </Button>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <IconKeyboard size={16} className="text-sonic-300" />
              <span className="label-mono">Keyboard map</span>
            </div>
            <dl className="space-y-1.5">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k + d} className="flex items-start justify-between gap-3 border-b border-white/6 pb-1.5 last:border-0">
                  <dt className="shrink-0 pt-0.5">
                    {k.split(' ').map((part, i) =>
                      part === '+' || part === '/' || part === 'on' || part === 'the' || part === 'or' || part === '–' ? (
                        <span key={i} className="mx-0.5 text-[11px] text-mist-400">
                          {part}
                        </span>
                      ) : (
                        <Kbd key={i}>{part}</Kbd>
                      ),
                    )}
                  </dt>
                  <dd className="text-right text-[11.5px] leading-snug text-mist-300">{d}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <IconWave size={16} className="text-sonic-300" />
              <span className="label-mono">Three things to try</span>
            </div>
            <ol className="space-y-2 text-[12.5px] leading-relaxed text-mist-200">
              <li>
                <span className="data-mono mr-1.5 text-sonic-300">01</span> Close your eyes, tab to the world map, and walk it
                with the arrow keys. Enter rings the point you land on — panned to its longitude.
              </li>
              <li>
                <span className="data-mono mr-1.5 text-sonic-300">02</span> Switch on text-only mode. The globe disappears and
                the same story is available as a chart description plus a table.
              </li>
              <li>
                <span className="data-mono mr-1.5 text-sonic-300">03</span> Press <Kbd>V</Kbd> and ask, in your own language,
                “what am I hearing right now?”. The answer is spoken and printed.
              </li>
            </ol>
          </Panel>
        </div>
      </div>
    </section>
  )
}
