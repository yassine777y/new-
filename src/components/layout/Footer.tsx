/** About + footer: the brief, the build, how to run it, and the credits. */

import { useStore } from '@/state/store'
import { Badge, Button, Panel, Reveal, SectionHeading, SourceBadge } from '@/components/ui/Primitives'
import { IconArrow, IconSpark, IconWave } from '@/components/ui/Icon'
import { emit } from '@/lib/bus'
import { useI18n } from '@/i18n/useI18n'
import type { I18nKey } from '@/i18n'
import { Logo } from './Logo'

const STACK = [
  ['Interface', 'React 19 + TypeScript, Tailwind CSS v4, Vite'],
  ['3D Earth', 'three.js via react-three-fiber; hand-written GLSL for day/night blending, ocean glint, relief and atmosphere'],
  ['Audio', 'Web Audio API only — oscillators, FM bells, granular clouds, a generated convolution reverb, sample-accurate scheduling and OfflineAudioContext rendering'],
  ['Voice', 'Web Speech API for dictation and spoken answers, MediaRecorder for audio questions, plus a local knowledge engine that works offline'],
  ['Data', 'Published annual records bundled in-repo with citations; spatial fields modelled from published characteristics'],
  ['State', 'zustand — flat enough that the voice agent can drive the whole app'],
]

const BRIEF = [
  'Pair Earth Information Center visual frames with dynamic, real-time sonification.',
  'Make complex Earth science accessible and multi-sensory — translate sight into sound.',
  'Balance data fidelity with musicality; a direct pixel-to-pitch mapping is noise.',
  'Support blind and low-vision users: screen readers, tactile feedback, rich descriptions.',
  'Deliver either an interactive jukebox, a curated playlist of generated audio, or both.',
]

export function About() {
  const { t } = useI18n()
  const setA11y = useStore((s) => s.setA11y)
  const a11y = useStore((s) => s.a11y)

  return (
    <section id="about" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
      <SectionHeading
        eyebrow={t('about.eyebrow')}
        title={
          <>
            {t('about.title1')} <span className="text-gradient">{t('about.title2')}</span>
          </>
        }
        lede={t('about.lede')}
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <Reveal>
          <Panel className="h-full p-5">
            <span className="label-mono mb-3 flex items-center gap-2">
              <IconSpark size={12} /> The brief, as we read it
            </span>
            <ol className="space-y-2.5">
              {BRIEF.map((b, i) => (
                <li key={b} className="flex gap-2.5 text-[12.5px] leading-relaxed text-mist-200">
                  <span className="data-mono shrink-0 text-sonic-300">{String(i + 1).padStart(2, '0')}</span>
                  {b}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge tone="cyan">Arts &amp; Multimedia</Badge>
              <Badge tone="cyan">Earth Science</Badge>
              <Badge tone="cyan">Software</Badge>
              <Badge tone="neutral">Intermediate</Badge>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={80}>
          <Panel className="h-full p-5">
            <span className="label-mono mb-3 flex items-center gap-2">
              <IconWave size={12} /> How it is built
            </span>
            <dl className="space-y-2.5">
              {STACK.map(([k, v]) => (
                <div key={k} className="border-b border-white/6 pb-2.5 last:border-0">
                  <dt className="data-mono text-[11px] tracking-wide text-sonic-200 uppercase">{k}</dt>
                  <dd className="mt-0.5 text-[12px] leading-relaxed text-mist-300">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </Reveal>

        <Reveal delay={160}>
          <Panel className="flex h-full flex-col p-5">
            <span className="label-mono mb-3 block">{t('gallery.reproduce')}</span>
            <pre className="data-mono overflow-auto rounded-xl border border-white/10 bg-void-950 p-3 text-[11.5px] leading-relaxed text-mist-200">
{`npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm run typecheck`}
            </pre>
            <p className="mt-3 text-[12.5px] leading-relaxed text-mist-300">
              The app is a static bundle: no backend, no API keys, no network at runtime. Textures, fonts and data are all
              self-hosted, which is why it survives a conference-hall wifi.
            </p>
            <div className="mt-auto space-y-2 pt-4">
              <Button size="sm" variant="ghost" onClick={() => setA11y({ textOnly: !a11y.textOnly })}>
                {a11y.textOnly ? 'Turn WebGL back on' : 'Try text-only mode'}
              </Button>
              <div className="flex flex-wrap gap-1.5">
                <SourceBadge id="blueMarble" label="NASA Blue Marble" />
                <SourceBadge id="fonts" label="SIL OFL typefaces" />
              </div>
            </div>
          </Panel>
        </Reveal>
      </div>
    </section>
  )
}

const FOOTER_NAV: Array<{ id: string; key: I18nKey | null; fallback: string }> = [
  { id: 'hero', key: null, fallback: 'Earth' },
  { id: 'listen', key: 'nav.listen', fallback: 'Listen' },
  { id: 'studio', key: 'nav.studio', fallback: 'Studio' },
  { id: 'method', key: 'nav.method', fallback: 'Method' },
  { id: 'access', key: 'nav.access', fallback: 'Access' },
  { id: 'gallery', key: 'nav.gallery', fallback: 'Gallery' },
  { id: 'sources', key: 'nav.sources', fallback: 'Sources' },
]

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="relative border-t border-white/8 bg-void-950/70">
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-10">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center">
              <Logo size={36} still />
            </span>
            <div>
              <div className="text-[15px] font-semibold text-mist-50">Earth Jukebox</div>
              <div className="label-mono">NASA Space Apps Challenge 2026</div>
            </div>
          </div>
          <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-mist-300">
            A multi-sensory interface for NASA&apos;s Earth Information Center: six planetary records, sonified live, with a
            voice guide, a frame scanner and a downloadable playlist — built so that hearing the data is not a secondary
            experience but the primary one.
          </p>
          <p className="mt-3 text-[11.5px] leading-relaxed text-mist-400">
            Not an official NASA product. Data and imagery belong to their publishers and are used under the licences listed
            in Sources. This is an independent hackathon entry.
          </p>
        </div>

        <nav aria-label="Footer">
          <span className="label-mono mb-3 block">{t('footer.sections')}</span>
          <ul className="grid grid-cols-2 gap-1.5">
            {FOOTER_NAV.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => emit({ type: 'scroll-to', section: n.id })}
                  className="text-[12.5px] text-mist-300 transition hover:text-sonic-200"
                >
                  {n.key ? t(n.key) : n.fallback}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <span className="label-mono mb-3 block">{t('footer.credits')}</span>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-mist-300">
            <li>NASA GISS GISTEMP v4 · NOAA GML · Scripps CO₂</li>
            <li>NSIDC Sea Ice Index v3 · NASA/AVISO+ altimetry</li>
            <li>Global Carbon Budget · IPCC AR6 WG1 · Argo</li>
            <li>NASA Blue Marble imagery · NASA SVS · NASA EIC</li>
            <li>Space Grotesk &amp; IBM Plex Mono (SIL OFL 1.1)</li>
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => emit({ type: 'scroll-to', section: 'hero' })}
          >
            {t('footer.backToEarth')} <IconArrow size={14} />
          </Button>
        </div>
      </div>
      <div className="border-t border-white/6">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <span className="data-mono text-[10.5px] text-mist-500">
            Synthesised in your browser · Web Audio API · no pre-recorded audio
          </span>
          <span className="data-mono text-[10.5px] text-mist-500">Hear the planet change.</span>
        </div>
      </div>
    </footer>
  )
}
