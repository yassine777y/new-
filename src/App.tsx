import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { TRACKS } from '@/data/tracks'
import { useJukebox } from '@/audio/useJukebox'
import { engine } from '@/audio/engine'
import { loadBaseMap } from '@/lib/basemap'
import { loadLandMask } from '@/lib/landmask'
import { onBus } from '@/lib/bus'
import { clamp, invLerp, sampleSeries } from '@/lib/math'
import { TopBar } from '@/components/layout/TopBar'
import { About, Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/hero/Hero'
import { Jukebox } from '@/components/jukebox/Jukebox'
import { Studio } from '@/components/studio/Studio'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { AccessibilitySection } from '@/components/sections/AccessibilitySection'
import { Gallery } from '@/components/sections/Gallery'
import { Sources } from '@/components/sections/Sources'
import { VoiceAgent } from '@/components/agent/VoiceAgent'
import { Announcer } from '@/components/Announcer'

/** Mirrors the accessibility settings onto <html> so CSS can react. */
function useA11yAttributes() {
  const highContrast = useStore((s) => s.a11y.highContrast)
  const reduceMotion = useStore((s) => s.a11y.reduceMotion)
  useEffect(() => {
    const el = document.documentElement
    el.dataset.contrast = highContrast ? 'high' : 'normal'
    el.dataset.motion = reduceMotion ? 'reduced' : 'full'
  }, [highContrast, reduceMotion])
}

/** Handles `scroll-to` bus events, honouring reduced motion. */
function useScrollBus() {
  useEffect(
    () =>
      onBus((e) => {
        if (e.type !== 'scroll-to') return
        const el = document.getElementById(e.section)
        if (!el) return
        const reduce = useStore.getState().a11y.reduceMotion
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      }),
    [],
  )
  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1))
      el?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }, [])
}

/** Global keyboard shortcuts — the app is fully drivable without a pointer. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const st = useStore.getState()

      if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'A') {
        e.preventDefault()
        void engine.init()
        st.setIsPlaying(!st.isPlaying)
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowRight' ? 1 : -1)
        const track = st.activeTrack()
        const year = clamp(st.year + step, st.range[0], st.range[1])
        const scoreTime = invLerp(st.range[0], st.range[1], year) * st.duration
        st.setYear(year)
        st.setScoreTime(scoreTime)
        engine.seek(scoreTime)
        if (e.shiftKey) {
          const v = sampleSeries(track.series, year)
          st.announce(track.describe(year, v, (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2))
        }
        return
      }
      if (/^[1-6]$/.test(e.key)) {
        const t = TRACKS[Number(e.key) - 1]
        if (t) {
          st.setActiveTrack(t.id, { play: false })
          engine.uiBlip('select')
        }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'm') {
        st.toggleMute()
        engine.setMuted(st.muted)
        return
      }
      if (k === 'v') {
        st.setAgentOpen(!st.agentOpen)
        return
      }
      if (k === 'g') {
        st.toggleGrid?.()
        return
      }
      if (k === 'e') {
        st.toggleEvents()
        return
      }
      // 2 / 3 / 4 already used for datasets; use letters for views
      if (k === 'w') st.setViewMode('2d')
      if (k === 'd') st.setViewMode('3d')
      if (k === 'c') st.setViewMode('chart')
      if (k === 'f') {
        st.setViewMode('frame')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  useJukebox()
  useA11yAttributes()
  useScrollBus()
  useShortcuts()

  useEffect(() => {
    // Warm the caches the maps depend on (land mask + base imagery) without blocking paint.
    const id = window.setTimeout(() => {
      void loadBaseMap(1440)
      void loadLandMask()
    }, 600)
    return () => window.clearTimeout(id)
  }, [])

  const askByVoice = () => {
    useStore.getState().setAgentOpen(true)
    window.setTimeout(() => engine.init().catch(() => undefined), 0)
  }

  return (
    <div className="relative min-h-screen">
      <a
        href="#listen"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-sonic-300 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-void-950"
      >
        Skip to the jukebox
      </a>
      <a
        href="#studio"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-48 focus:z-[100] focus:rounded-lg focus:bg-mist-50 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-void-950"
      >
        Skip to the studio
      </a>

      <TopBar />

      <main id="main">
        <Hero onAskVoice={askByVoice} />
        <Jukebox />
        <Studio />
        <HowItWorks />
        <AccessibilitySection />
        <Gallery />
        <Sources />
        <About />
      </main>

      <Footer />
      <VoiceAgent />
      <Announcer />
    </div>
  )
}
