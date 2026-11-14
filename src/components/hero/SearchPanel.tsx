/**
 * Hero search — one field that finds datasets, years, events and commands.
 * Typing "1991" jumps the playhead; "ice" opens the sea-ice track; "3d" switches view.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { TRACKS } from '@/data/tracks'
import { useStore } from '@/state/store'
import { engine } from '@/audio/engine'
import { emit } from '@/lib/bus'
import { fmtSigned } from '@/lib/format'
import { clamp, invLerp, sampleSeries } from '@/lib/math'
import { Badge, Button, IconButton } from '@/components/ui/Primitives'
import { IconArrow, IconChart, IconFrame, IconGlobe, IconMap, IconMic, IconSearch, TrackIcon } from '@/components/ui/Icon'

interface Hit {
  id: string
  kind: 'dataset' | 'moment' | 'event' | 'view' | 'command'
  title: string
  subtitle: string
  icon?: React.ReactNode
  run: () => void
}

export function SearchPanel({ onAskVoice }: { onAskVoice?: () => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const setActiveTrack = useStore((s) => s.setActiveTrack)
  const setViewMode = useStore((s) => s.setViewMode)
  const setRange = useStore((s) => s.setRange)
  const setYear = useStore((s) => s.setYear)
  const setScoreTime = useStore((s) => s.setScoreTime)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const announce = useStore((s) => s.announce)
  const listening = useStore((s) => s.listening)
  const duration = useStore((s) => s.duration)

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    const out: Hit[] = []

    const goto = (trackId: string, year?: number, range?: [number, number], play = true) => {
      const t = TRACKS.find((x) => x.id === trackId)!
      setActiveTrack(trackId, { play: false })
      const r = range ?? [Math.max(t.yearSpan[0], 1900), t.yearSpan[1]]
      setRange(r)
      const y = clamp(year ?? r[0], r[0], r[1])
      setYear(y)
      setScoreTime(invLerp(r[0], r[1], y) * duration)
      emit({ type: 'scroll-to', section: 'studio' })
      if (play) {
        void engine.init()
        setIsPlaying(true)
      }
      announce(`${t.title}. ${t.tagline}. ${range ? `${r[0]} to ${r[1]}.` : ''} ${year ? `Playhead at ${Math.floor(y)}.` : ''}`)
    }

    // datasets
    for (const t of TRACKS) {
      const hay = `${t.title} ${t.shortTitle} ${t.tagline} ${t.description} ${t.kicker}`.toLowerCase()
      let score = 0
      for (const w of query.split(/\s+/)) if (hay.includes(w)) score += w.length
      if (score > 0) {
        out.push({
          id: `track-${t.id}`,
          kind: 'dataset',
          title: t.title,
          subtitle: `${t.tagline} · ${t.kicker}`,
          icon: <TrackIcon id={t.id} size={16} />,
          run: () => goto(t.id),
        })
      }
    }

    // years
    const yearMatch = query.match(/(18\d{2}|19\d{2}|20\d{2})/)
    if (yearMatch) {
      const y = Number(yearMatch[1])
      for (const tr of TRACKS.filter((x) => y >= x.yearSpan[0] && y <= x.yearSpan[1]).slice(0, 3)) {
        const v = sampleSeries(tr.series, y)
        out.push({
          id: `year-${tr.id}-${y}`,
          kind: 'moment',
          title: `${y} · ${tr.shortTitle}`,
          subtitle: `${fmtSigned(v, tr.digits)} ${tr.unit} — jump the playhead here`,
          icon: <IconArrow size={15} />,
          run: () => goto(tr.id, y, [Math.max(tr.yearSpan[0], y - 25), Math.min(tr.yearSpan[1], y + 25)], true),
        })
      }
    }

    // events
    for (const tr of TRACKS) {
      for (const ev of tr.events) {
        const hay = `${ev.title} ${ev.detail} ${Math.floor(ev.year)}`.toLowerCase()
        if (hay.includes(query) || query.split(/\s+/).every((w) => w.length > 2 && hay.includes(w))) {
          out.push({
            id: `ev-${tr.id}-${ev.year}-${ev.title}`,
            kind: 'event',
            title: `${Math.floor(ev.year)} · ${ev.title}`,
            subtitle: `${ev.detail} (${tr.shortTitle})`,
            icon: <IconChart size={15} />,
            run: () => goto(tr.id, ev.year, [Math.max(tr.yearSpan[0], ev.year - 12), Math.min(tr.yearSpan[1], ev.year + 12)], true),
          })
        }
      }
    }

    // views & commands
    const views: Array<[string, string, '2d' | '3d' | 'chart' | 'frame', React.ReactNode]> = [
      ['3d globe', 'spin the Earth with the data wrapped on it', '3d', <IconGlobe key="g" size={15} />],
      ['2d map', 'flat equirectangular field with a keyboard cursor', '2d', <IconMap key="m" size={15} />],
      ['chart', 'the time series with playhead and events', 'chart', <IconChart key="c" size={15} />],
      ['frame scan', 'sonify the pixels of the visual frame itself', 'frame', <IconFrame key="f" size={15} />],
    ]
    for (const [label, sub, mode, icon] of views) {
      if (label.includes(query) || query.includes(mode)) {
        out.push({
          id: `view-${mode}`,
          kind: 'view',
          title: `Open the ${label}`,
          subtitle: sub,
          icon,
          run: () => {
            setViewMode(mode)
            emit({ type: 'scroll-to', section: 'studio' })
            if (mode === 'frame') emit({ type: 'sonify-frame' })
            announce(`${label} view`)
          },
        })
      }
    }
    if (/1900|20th|century|1900 ?(-|to|→) ?2000/.test(query)) {
      out.push({
        id: 'cmd-1900-2000',
        kind: 'command',
        title: 'Set the window to 1900 → 2000',
        subtitle: 'The twentieth century, on the current dataset',
        icon: <IconArrow size={15} />,
        run: () => {
          const st = useStore.getState()
          const t = st.activeTrack()
          setRange([Math.max(t.yearSpan[0], 1900), Math.min(t.yearSpan[1], 2000)])
          setYear(Math.max(t.yearSpan[0], 1900))
          emit({ type: 'scroll-to', section: 'studio' })
          announce('Window set to 1900 to 2000')
        },
      })
    }
    if (/mic|voice|agent|speak|ask/.test(query)) {
      out.push({
        id: 'cmd-voice',
        kind: 'command',
        title: 'Talk to the guide agent',
        subtitle: 'Open the microphone and ask your question by voice',
        icon: <IconMic size={15} />,
        run: () => {
          useStore.getState().setAgentOpen(true)
          onAskVoice?.()
        },
      })
    }

    return out.slice(0, 9)
  }, [announce, duration, onAskVoice, q, setActiveTrack, setIsPlaying, setRange, setScoreTime, setViewMode, setYear])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commit = (hit: Hit) => {
    hit.run()
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div
        className={`flex items-center gap-2 rounded-2xl border bg-void-950/70 px-3 py-2 backdrop-blur-xl transition-all ${
          open ? 'border-sonic-300/50 shadow-[0_0_50px_-14px_rgba(110,231,255,0.55)]' : 'border-white/14'
        }`}
      >
        <IconSearch size={18} className="shrink-0 text-sonic-300" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setCursor(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(hits.length - 1, c + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (hits[cursor]) commit(hits[cursor])
              else if (q.trim()) {
                useStore.getState().setAgentOpen(true)
                setOpen(false)
              }
            }
          }}
          type="search"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-label="Search datasets, years, events and views"
          placeholder="Search a dataset, a year, an event…  e.g. “sea ice”, “1991”, “Pinatubo”, “3d”"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-mist-50 placeholder:text-mist-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <IconButton
          label={listening ? 'Stop listening' : 'Ask by voice'}
          variant={listening ? 'primary' : 'ghost'}
          onClick={() => {
            useStore.getState().setAgentOpen(true)
            onAskVoice?.()
          }}
          className="shrink-0"
        >
          <IconMic size={16} />
        </IconButton>
      </div>

      {open && hits.length > 0 && (
        <ul
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="glass absolute z-40 mt-2 max-h-[60vh] w-full overflow-auto rounded-2xl p-1.5"
        >
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === cursor}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => commit(h)}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  i === cursor ? 'bg-sonic-300/14' : 'hover:bg-white/6'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${i === cursor ? 'text-sonic-200' : 'text-mist-400'}`}>{h.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-mist-50">{h.title}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-mist-400">{h.subtitle}</span>
                </span>
                <Badge tone={h.kind === 'dataset' ? 'cyan' : h.kind === 'event' ? 'warm' : 'neutral'} className="mt-0.5 shrink-0">
                  {h.kind}
                </Badge>
              </button>
            </li>
          ))}
          <li className="px-3 py-2">
            <Button size="xs" variant="ghost" onClick={() => {
              useStore.getState().setAgentOpen(true)
              setOpen(false)
            }}>
              Ask the guide agent: “{q}”
            </Button>
          </li>
        </ul>
      )}

      {open && q.trim() && hits.length === 0 && (
        <div className="glass absolute z-40 mt-2 w-full rounded-2xl p-4 text-[13px] text-mist-300">
          Nothing matched “{q}”. Try <span className="text-sonic-200">temperature</span>,{' '}
          <span className="text-sonic-200">sea ice</span>, <span className="text-sonic-200">1991</span>,{' '}
          <span className="text-sonic-200">Pinatubo</span> or <span className="text-sonic-200">3d</span> — or ask the guide
          agent in your own words.
        </div>
      )}
    </div>
  )
}
