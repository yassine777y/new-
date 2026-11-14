/**
 * Hero: the realistic 3D Earth, the search field and the voice-agent entry point.
 * The globe keeps rendering only while it is on screen, and stops entirely in
 * text-only accessibility mode.
 */

import { useEffect, useState } from 'react'
import { HeroEarth } from '@/three/HeroEarth'
import { SearchPanel } from './SearchPanel'
import { useStore } from '@/state/store'
import { TRACKS } from '@/data/tracks'
import { engine } from '@/audio/engine'
import { useInView } from '@/lib/hooks'
import { emit } from '@/lib/bus'
import { Badge, Button } from '@/components/ui/Primitives'
import { IconAccess, IconArrow, IconMic, IconSpark, IconWave } from '@/components/ui/Icon'

export function Hero({ onAskVoice }: { onAskVoice: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '300px' })
  const audioUnlocked = useStore((s) => s.audioUnlocked)
  const setActiveTrack = useStore((s) => s.setActiveTrack)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const textOnly = useStore((s) => s.a11y.textOnly)
  const level = useStore((s) => s.level)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const startListening = () => {
    void engine.init()
    engine.welcomeChime()
    setIsPlaying(true)
    emit({ type: 'scroll-to', section: 'studio' })
  }

  return (
    <section id="hero" ref={ref} className="relative min-h-[100svh] w-full overflow-hidden">
      {/* the Earth */}
      <div
        className="absolute inset-0 -z-10"
        style={{ transform: `translate3d(0, ${scrollY * 0.14}px, 0)`, opacity: Math.max(0, 1 - scrollY / 900) }}
        aria-hidden={!textOnly}
      >
        <HeroEarth active={inView && !textOnly} interactive={!textOnly} />
        {/* soft bloom behind the planet */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_58%_at_50%_46%,rgba(70,150,255,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-void-950 via-void-950/80 to-transparent" />
      </div>

      {textOnly && (
        <div className="absolute inset-0 -z-10 grid-lines opacity-40" aria-hidden />
      )}

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col justify-center px-4 pt-24 pb-28 sm:px-6 lg:px-10">
        <div className="max-w-3xl">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge tone="cyan">
              <IconSpark size={11} /> NASA Space Apps Challenge 2026
            </Badge>
            <Badge tone="warm">Earth Jukebox · sonification of EIC frames</Badge>
            <Badge tone="neutral">
              <IconAccess size={11} /> built for blind &amp; low-vision listeners
            </Badge>
          </div>

          <h1 className="text-[clamp(2.6rem,7.2vw,5.4rem)] leading-[0.94] font-semibold tracking-tight">
            <span className="block text-mist-50">Hear the Earth</span>
            <span className="text-gradient block">change.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-[15.5px] leading-relaxed text-mist-200 sm:text-[17px]">
            NASA&apos;s Earth Information Center shows us a changing planet. We turned those frames into sound.
            Six vital signs — temperature, carbon dioxide, emissions, sea ice, sea level and ocean heat — are
            synthesised live in your browser: the value becomes pitch, the rate of change becomes tempo, and the
            geography becomes the stereo field.
          </p>

          <div className="mt-8 max-w-2xl">
            <SearchPanel onAskVoice={onAskVoice} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" size="md" onClick={startListening}>
              <IconWave size={16} /> {audioUnlocked ? 'Start the jukebox' : 'Enable sound & start'}
            </Button>
            <Button variant="ghost" size="md" onClick={onAskVoice}>
              <IconMic size={16} className={level > 0.02 ? 'text-sonic-300' : ''} /> Ask by voice
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setActiveTrack(TRACKS[0].id, { play: false })
                emit({ type: 'scroll-to', section: 'listen' })
              }}
            >
              What can I hear? <IconArrow size={15} />
            </Button>
          </div>

          <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              ['6', 'Earth vital signs'],
              ['1880→2024', 'years of record'],
              ['0 ms', 'pre-recorded audio'],
              ['100%', 'synthesised live'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="label-mono">{l}</dt>
                <dd className="data-mono mt-1 text-[19px] font-semibold text-mist-50">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* scroll cue */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <div className="flex flex-col items-center gap-2 opacity-70">
          <span className="label-mono">scroll — choose what to hear</span>
          <span className="relative flex h-8 w-5 items-start justify-center rounded-full border border-white/25 p-1">
            <span className="h-1.5 w-1 rounded-full bg-sonic-300 animate-drift" />
          </span>
        </div>
      </div>

      {!audioUnlocked && (
        <div className="pointer-events-none absolute right-4 bottom-24 sm:right-8">
          <div className="glass-soft animate-pulse-ring rounded-full" aria-hidden />
          <div className="glass absolute right-0 bottom-0 rounded-xl px-3 py-2 text-[11.5px] text-mist-200">
            Click anywhere to unlock audio
          </div>
        </div>
      )}
    </section>
  )
}
