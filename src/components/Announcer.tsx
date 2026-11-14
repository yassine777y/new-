/** Live region: the app's running commentary, for screen readers. */

import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { sampleSeries } from '@/lib/math'
import { fmtSigned } from '@/lib/format'

export function Announcer() {
  const announcement = useStore((s) => s.announcement)
  const verbose = useStore((s) => s.a11y.verbose)
  const listening = useStore((s) => s.listening)
  const recording = useStore((s) => s.recording)

  useEffect(() => {
    if (!verbose) return
    const id = window.setInterval(() => {
      const st = useStore.getState()
      if (!st.isPlaying) return
      const t = st.activeTrack()
      const v = sampleSeries(t.series, st.year)
      st.announce(`${t.shortTitle}, ${Math.floor(st.year)}: ${fmtSigned(v, t.digits)} ${t.unit}`)
    }, 4000)
    return () => window.clearInterval(id)
  }, [verbose])

  const micStatus = listening ? 'Microphone is listening' : recording ? 'Recording your question' : ''

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {micStatus}
      </div>
    </>
  )
}
