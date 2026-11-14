/**
 * Sources — every dataset, image, standard and idea in the app, with publisher, link,
 * licence and exactly what was used. Clicking any source badge anywhere in the app
 * scrolls here and flashes the matching entry.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { SOURCES } from '@/data/sources'
import { TRACKS } from '@/data/tracks'
import { onBus } from '@/lib/bus'
import { Badge, Panel, Reveal, SectionHeading } from '@/components/ui/Primitives'
import { IconArrow, IconInfo } from '@/components/ui/Icon'

const GROUPS: Array<{ title: string; note: string; ids: string[] }> = [
  {
    title: 'Datasets — the numbers behind the sound',
    note: 'Annual values copied into `src/data/series.ts`, rounded for distribution inside the app. Each entry states what was taken and how it is labelled in the interface.',
    ids: ['gistemp', 'noaaCo2', 'scrippsCo2', 'lawDome', 'nsidc', 'nasaSeaLevel', 'churchWhite', 'ipccAr6', 'globalCarbon', 'gcpRegional', 'argo', 'wmo'],
  },
  {
    title: 'Imagery, frames and the challenge itself',
    note: 'The visual frames this jukebox is built to sonify, and the textures used for the Earth.',
    ids: ['nasaEic', 'nasaSvs', 'nasaEyes', 'worldview', 'blueMarble'],
  },
  {
    title: 'Method, standards and craft',
    note: 'Sonification practice, the Web platform APIs the app is built on, and the typefaces it ships with.',
    ids: ['sonificationHandbook', 'chandraSonification', 'webaudio', 'webspeech', 'fonts'],
  },
]

export function Sources() {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLLIElement | null>>({})

  useEffect(
    () =>
      onBus((e) => {
        if (e.type !== 'highlight-source') return
        setHighlight(e.id)
        const el = refs.current[e.id]
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => setHighlight((h) => (h === e.id ? null : h)), 2600)
      }),
    [],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return Object.values(SOURCES).filter((s) =>
      `${s.title} ${s.publisher} ${s.usedFor} ${s.note ?? ''}`.toLowerCase().includes(q),
    )
  }, [query])

  const renderEntry = (id: string) => {
    const s = SOURCES[id]
    if (!s) return null
    const tracks = TRACKS.filter((t) => t.sources.includes(id))
    const on = highlight === id
    return (
      <li
        key={id}
        id={`source-${id}`}
        ref={(el) => {
          refs.current[id] = el
        }}
        className={`rounded-xl border p-4 transition-all duration-500 ${
          on ? 'border-sonic-300/70 bg-sonic-300/10 shadow-[0_0_40px_-12px_rgba(110,231,255,0.7)]' : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[14px] leading-snug font-semibold text-sonic-200 underline decoration-sonic-300/25 underline-offset-2 hover:decoration-sonic-300"
            >
              {s.title}
            </a>
            <div className="data-mono mt-1 text-[11px] text-mist-400">
              {s.publisher}
              {s.license ? ` · ${s.license}` : ''}
            </div>
          </div>
          <Badge tone="neutral">{id}</Badge>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-200">
          <span className="label-mono mr-1.5">used for</span>
          {s.usedFor}
        </p>
        {s.note && <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-400">{s.note}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="label-mono mr-1">appears in</span>
          {tracks.length ? (
            tracks.map((t) => (
              <span
                key={t.id}
                className="data-mono rounded-full border px-2 py-0.5 text-[10px]"
                style={{ borderColor: `${t.color}44`, color: t.color }}
              >
                {t.shortTitle}
              </span>
            ))
          ) : (
            <span className="data-mono text-[10.5px] text-mist-400">app-wide</span>
          )}
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="data-mono ml-auto inline-flex items-center gap-1 text-[10.5px] text-mist-400 transition hover:text-sonic-200"
          >
            open <IconArrow size={11} />
          </a>
        </div>
      </li>
    )
  }

  return (
    <section id="sources" className="relative mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
      <SectionHeading
        eyebrow="Sources · every claim, cited"
        title={
          <>
            Where every number, pixel <span className="text-gradient">and idea comes from</span>
          </>
        }
        lede="Nothing in this app is unsourced. Each panel carries a badge that lands here; each entry states the publisher, the licence, and precisely what was copied. Where we model rather than measure — the spatial fields on the maps and the globe — the panel says so in plain words next to the visualisation."
      />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-white/12 bg-void-900/70 px-3 py-2">
          <IconInfo size={15} className="text-mist-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sources — try “ice”, “satellite”, “licence”"
            aria-label="Filter sources"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-mist-50 placeholder:text-mist-400 focus:outline-none"
          />
        </label>
        <Badge tone="cyan">{Object.keys(SOURCES).length} entries</Badge>
      </div>

      {filtered ? (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {filtered.map((s) => renderEntry(s.id))}
          {!filtered.length && <li className="text-[13px] text-mist-400">No source matches “{query}”.</li>}
        </ul>
      ) : (
        <div className="mt-10 space-y-10">
          {GROUPS.map((g, gi) => (
            <Reveal key={g.title} delay={gi * 60}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-[16px] font-semibold text-mist-50">{g.title}</h3>
                <p className="max-w-xl text-[11.5px] leading-relaxed text-mist-400">{g.note}</p>
              </div>
              <ul className="grid gap-4 lg:grid-cols-2">{g.ids.map(renderEntry)}</ul>
            </Reveal>
          ))}
        </div>
      )}

      <Reveal className="mt-10">
        <Panel className="p-5">
          <span className="label-mono mb-2 block">Provenance notes — read these with the maps</span>
          <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-mist-200">
            <li>
              <span className="data-mono mr-2 text-sonic-300">01</span>
              Time series are the published annual values, rounded for distribution. Where a record only exists as decade or
              five-year anchors (emissions, sea level before 1993, ocean heat), the series is interpolated and the interface
              labels it as reconstructed.
            </li>
            <li>
              <span className="data-mono mr-2 text-sonic-300">02</span>
              Spatial fields on the 2D map and 3D globe are modelled from published characteristics — Arctic amplification,
              the CO₂ inter-hemispheric gradient, the regional sea-ice edge, emission plume geography, the AR6 ocean warming
              pattern. They are illustrative, not pixel copies of a gridded product. Each map states this beneath it and links
              to the real dataset.
            </li>
            <li>
              <span className="data-mono mr-2 text-sonic-300">03</span>
              The land/ocean mask is derived at runtime from the Blue Marble texture itself, and was checked against the
              published land fraction (≈29 %): the derived mask gives ≈31 % including ice.
            </li>
            <li>
              <span className="data-mono mr-2 text-sonic-300">04</span>
              Earth textures are NASA imagery redistributed through the three.js examples set; typefaces are Space Grotesk and
              IBM Plex Mono under the SIL Open Font License, self-hosted in this repository.
            </li>
          </ul>
        </Panel>
      </Reveal>
    </section>
  )
}
