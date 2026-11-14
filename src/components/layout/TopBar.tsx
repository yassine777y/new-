/** Top bar: navigation, the always-visible mini transport, volume, mic and accessibility. */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import { TRACKS } from '@/data/tracks'
import { engine } from '@/audio/engine'
import { emit } from '@/lib/bus'
import { fmtSigned } from '@/lib/format'
import { sampleSeries } from '@/lib/math'
import { Badge, Button, IconButton, Toggle } from '@/components/ui/Primitives'
import { Logo } from './Logo'
import { LANGS, LANG_META } from '@/i18n'
import { useI18n } from '@/i18n/useI18n'
import { IconAccess, IconClose, IconMic, IconMute, IconPause, IconPlay, IconSpark, IconVolume, TrackIcon } from '@/components/ui/Icon'

const NAV = [
  { id: 'listen', key: 'nav.listen' },
  { id: 'studio', key: 'nav.studio' },
  { id: 'method', key: 'nav.method' },
  { id: 'access', key: 'nav.access' },
  { id: 'gallery', key: 'nav.gallery' },
  { id: 'sources', key: 'nav.sources' },
] as const

export function TopBar() {
  const { t } = useI18n()
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const trackId = useStore((s) => s.activeTrackId)
  const track = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0]
  const year = useStore((s) => s.year)
  const isPlaying = useStore((s) => s.isPlaying)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const volume = useStore((s) => s.volume)
  const setVolume = useStore((s) => s.setVolume)
  const muted = useStore((s) => s.muted)
  const toggleMute = useStore((s) => s.toggleMute)
  const a11y = useStore((s) => s.a11y)
  const setA11y = useStore((s) => s.setA11y)
  const agentOpen = useStore((s) => s.agentOpen)
  const setAgentOpen = useStore((s) => s.setAgentOpen)
  const setAmbient = useStore((s) => s.setAmbient)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const level = useStore((s) => s.level)
  const a11yRef = useRef<HTMLDivElement>(null)

  const value = sampleSeries(track.series, year)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* scroll spy */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setSection(visible.target.id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.2, 0.6] },
    )
    NAV.forEach((n) => {
      const el = document.getElementById(n.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [setSection])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (a11yRef.current && !a11yRef.current.contains(e.target as Node)) setA11yOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const go = (id: string) => {
    emit({ type: 'scroll-to', section: id })
    setMenu(false)
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        scrolled ? 'border-b border-white/10 bg-void-950/82 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <button onClick={() => go('hero')} className="group flex shrink-0 items-center gap-2.5" aria-label={t('brand.back')}>
          <span className="relative flex h-9 w-9 items-center justify-center">
            <Logo size={36} />
            {isPlaying && (
              <span className="pointer-events-none absolute -inset-0.5 animate-pulse-ring rounded-full bg-sonic-300/20" aria-hidden />
            )}
          </span>
          <span className="hidden text-start sm:block">
            <span className="block text-[13.5px] leading-tight font-semibold text-mist-50">Earth Jukebox</span>
            <span className="label-mono block text-[9px]">NASA Space Apps 2026</span>
          </span>
        </button>

        <nav className="mx-auto hidden items-center gap-0.5 lg:flex" aria-label={t('nav.menu')}>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              aria-current={section === n.id ? 'true' : undefined}
              className={`relative rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                section === n.id ? 'text-sonic-200' : 'text-mist-300 hover:bg-white/6 hover:text-mist-100'
              }`}
            >
              {t(n.key)}
              {section === n.id && <span className="absolute inset-x-3 -bottom-0.5 h-px bg-sonic-300/70" aria-hidden />}
            </button>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          {/* mini transport */}
          <div className="hidden items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 md:flex">
            <IconButton
              label={isPlaying ? t('top.pause') : t('top.play')}
              variant={isPlaying ? 'primary' : 'ghost'}
              className="h-7 w-7"
              onClick={() => {
                void engine.init()
                setIsPlaying(!isPlaying)
                emit({ type: 'scroll-to', section: 'studio' })
              }}
            >
              {isPlaying ? <IconPause size={13} /> : <IconPlay size={13} />}
            </IconButton>
            <button onClick={() => go('studio')} className="flex min-w-0 items-center gap-2 text-start">
              <span style={{ color: track.color }}>
                <TrackIcon id={track.id} size={15} />
              </span>
              <span className="min-w-0">
                <span className="data-mono block truncate text-[11.5px] leading-tight font-medium text-mist-100">
                  {track.shortTitle} · {Math.floor(year)}
                </span>
                <span className="data-mono block truncate text-[10px] leading-tight" style={{ color: track.color }}>
                  {fmtSigned(value, track.digits)} {track.unit}
                </span>
              </span>
            </button>
            <span className="flex h-5 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full transition-all duration-100"
                  style={{
                    height: `${Math.max(3, Math.min(20, (isPlaying ? level * 90 : 0.6) * (i % 2 === 0 ? 1 : 0.7) + 3))}px`,
                    background: isPlaying ? track.color : 'rgba(255,255,255,0.2)',
                  }}
                />
              ))}
            </span>
          </div>

          {/* volume */}
          <div className="hidden items-center gap-1.5 lg:flex">
            <IconButton label={muted ? t('top.unmute') : t('top.mute')} onClick={toggleMute} className="h-8 w-8">
              {muted ? <IconMute size={15} /> : <IconVolume size={15} />}
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label={t('top.volume')}
              aria-valuetext={`${Math.round(volume * 100)} percent`}
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolume(v)
                engine.setVolume(v)
              }}
              className="w-20"
            />
          </div>

          <div
            className="hidden items-center gap-0.5 rounded-full border border-white/12 bg-white/4 p-0.5 md:flex"
            role="group"
            aria-label={t('top.language')}
          >
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={l === lang}
                title={LANG_META[l].label}
                className={`rounded-full px-2 py-1 text-[10.5px] font-semibold tracking-wide transition ${
                  l === lang ? 'bg-sonic-300/20 text-sonic-100' : 'text-mist-400 hover:text-mist-100'
                }`}
              >
                {l === 'ar' ? 'ع' : l.toUpperCase()}
              </button>
            ))}
          </div>

          <IconButton
            label={t('top.install')}
            className="hidden h-8 w-8 sm:inline-flex"
            onClick={() => {
              const next = !useStore.getState().ambient
              setAmbient(next)
              if (next) void engine.init()
            }}
          >
            <IconSpark size={15} />
          </IconButton>

          <IconButton label={t('top.agent')} variant={agentOpen ? 'outline' : 'ghost'} className="h-8 w-8" onClick={() => setAgentOpen(!agentOpen)}>
            <IconMic size={15} />
          </IconButton>

          <div className="relative" ref={a11yRef}>
            <IconButton label={t('top.a11y')} variant={a11yOpen ? 'outline' : 'ghost'} className="h-8 w-8" onClick={() => setA11yOpen((v) => !v)} aria-expanded={a11yOpen}>
              <IconAccess size={15} />
            </IconButton>
            {a11yOpen && (
              <div className="glass absolute end-0 z-50 mt-2 w-[min(88vw,320px)] rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="label-mono">Accessibility</span>
                  <IconButton label={t('common.close')} className="h-6 w-6" onClick={() => setA11yOpen(false)}>
                    <IconClose size={13} />
                  </IconButton>
                </div>
                <div className="space-y-3">
                  <Toggle
                    label={t('access.highContrast')}
                    description="Stronger borders and pure-white text"
                    checked={a11y.highContrast}
                    onChange={(v) => setA11y({ highContrast: v })}
                  />
                  <Toggle
                    label={t('access.reduceMotion')}
                    description="Stops the globe spinning and disables transitions"
                    checked={a11y.reduceMotion}
                    onChange={(v) => setA11y({ reduceMotion: v })}
                  />
                  <Toggle
                    label={t('access.textOnly')}
                    description="Turns off WebGL; charts, tables and audio remain"
                    checked={a11y.textOnly}
                    onChange={(v) => setA11y({ textOnly: v })}
                  />
                  <Toggle
                    label={t('access.verbose')}
                    description="Announce every value change to a screen reader"
                    checked={a11y.verbose}
                    onChange={(v) => setA11y({ verbose: v })}
                  />
                  <Toggle
                    label="Haptic blips"
                    description="Vibrate on confirmations where the device supports it"
                    checked={a11y.haptics}
                    onChange={(v) => setA11y({ haptics: v })}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-white/8 pt-3">
                  <Badge tone="cyan">prefers-reduced-motion respected</Badge>
                </div>
              </div>
            )}
          </div>

          <IconButton label="Menu" className="h-8 w-8 lg:hidden" onClick={() => setMenu((v) => !v)}>
            {menu ? <IconClose size={16} /> : <IconAccess size={16} />}
          </IconButton>
        </div>
      </div>

      {menu && (
        <div className="border-t border-white/10 bg-void-950/95 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {NAV.map((n) => (
              <Button key={n.id} size="sm" variant={section === n.id ? 'outline' : 'ghost'} onClick={() => go(n.id)}>
                {t(n.key)}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
              {muted ? <IconMute size={15} /> : <IconVolume size={15} />}
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Master volume"
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolume(v)
                engine.setVolume(v)
              }}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </header>
  )
}
