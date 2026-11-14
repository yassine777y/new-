/** Accessible alternative to every chart: the numbers themselves, in a real table. */

import { useMemo, useState } from 'react'
import type { Track } from '@/data/types'
import { useStore } from '@/state/store'
import { fmt, fmtSigned } from '@/lib/format'
import { sampleSeries } from '@/lib/math'
import { Button } from '@/components/ui/Primitives'

export function DataTable({ track }: { track: Track }) {
  const range = useStore((s) => s.range)
  const year = useStore((s) => s.year)
  const setYear = useStore((s) => s.setYear)
  const setScoreTime = useStore((s) => s.setScoreTime)
  const duration = useStore((s) => s.duration)
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo(() => {
    const inWindow = track.series.filter((p) => p.t >= range[0] && p.t <= range[1])
    // Annual rows are the readable unit; sub-annual samples exist for the interpolated series.
    const annual = inWindow.filter((p) => Math.abs(p.t - Math.round(p.t)) < 0.01)
    const list = annual.length >= 3 ? annual : inWindow
    if (showAll) return list
    const stride = Math.max(1, Math.ceil(list.length / 40))
    return list.filter((_, i) => i % stride === 0)
  }, [range, showAll, track.series])

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="label-mono">
          Data table · {range[0]}–{range[1]} · {rows.length} rows
        </span>
        <Button size="xs" variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer rows' : 'Show every year'}
        </Button>
      </div>
      <div className="max-h-72 overflow-auto rounded-xl border border-white/10">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">
            {track.title}: {track.tagline}, values in {track.unitSpoken} from {range[0]} to {range[1]}. Selecting a row moves
            the playhead to that year.
          </caption>
          <thead className="sticky top-0 bg-void-850/95 backdrop-blur">
            <tr>
              <th scope="col" className="data-mono px-3 py-2 text-[10.5px] tracking-wider text-mist-400 uppercase">Year</th>
              <th scope="col" className="data-mono px-3 py-2 text-[10.5px] tracking-wider text-mist-400 uppercase">
                Value ({track.unit})
              </th>
              <th scope="col" className="data-mono px-3 py-2 text-[10.5px] tracking-wider text-mist-400 uppercase">Change / decade</th>
              <th scope="col" className="data-mono px-3 py-2 text-[10.5px] tracking-wider text-mist-400 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const y = Math.round(p.t)
              const perDecade = sampleSeries(track.series, y + 5) - sampleSeries(track.series, y - 5)
              const events = track.events.filter((e) => Math.floor(e.year) === y)
              const active = Math.floor(year) === y
              return (
                <tr
                  key={p.t}
                  tabIndex={0}
                  onClick={() => {
                    setYear(y)
                    setScoreTime(((y - range[0]) / Math.max(1, range[1] - range[0])) * duration)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setYear(y)
                      setScoreTime(((y - range[0]) / Math.max(1, range[1] - range[0])) * duration)
                    }
                  }}
                  className={`cursor-pointer border-t border-white/6 transition hover:bg-white/6 ${active ? 'bg-sonic-300/12' : ''}`}
                >
                  <th scope="row" className="data-mono px-3 py-1.5 text-[12px] font-medium text-mist-100">
                    {y}
                    {active && <span className="ms-1.5 text-[10px] text-sonic-300">◂ playhead</span>}
                  </th>
                  <td className="data-mono px-3 py-1.5 text-[12px]" style={{ color: track.color }}>
                    {fmtSigned(p.v, track.digits)}
                  </td>
                  <td className="data-mono px-3 py-1.5 text-[12px] text-mist-300">{fmtSigned(perDecade, track.digits)}</td>
                  <td className="px-3 py-1.5 text-[11.5px] text-mist-300">
                    {events.map((e) => e.title).join(' · ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-mist-400">
        Source: {track.kicker}. Values are the published annual figures bundled with this app; see the Sources section for
        publisher, licence and exactly what was copied.
      </p>
    </div>
  )
}
