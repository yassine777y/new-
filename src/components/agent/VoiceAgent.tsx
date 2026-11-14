/**
 * The guide agent dock — talk to the jukebox.
 *
 * Three ways in: type, tap-to-talk (speech-to-text), or record your question as an audio
 * message. Answers are spoken aloud with the Web Speech synthesiser, always transcribed on
 * screen, and published to a polite live region so a screen reader gets them too.
 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import { useVoiceAgent } from '@/voice/useVoiceAgent'
import { SUGGESTIONS } from '@/voice/knowledge'
import { onBus } from '@/lib/bus'
import { fmtClock } from '@/lib/format'
import { Badge, Button, IconButton, Slider, Toggle } from '@/components/ui/Primitives'
import { IconAccess, IconClose, IconMic, IconPause, IconPlay, IconRecord, IconSpark, IconVolume } from '@/components/ui/Icon'

export function VoiceAgent() {
  const open = useStore((s) => s.agentOpen)
  const setOpen = useStore((s) => s.setAgentOpen)
  const messages = useStore((s) => s.messages)
  const listening = useStore((s) => s.listening)
  const recording = useStore((s) => s.recording)
  const speaking = useStore((s) => s.speaking)
  const interim = useStore((s) => s.interim)
  const agent = useStore((s) => s.agent)
  const setAgent = useStore((s) => s.setAgentSettings)

  const { ask, toggleMic, stopMic, stopSpeaking, micSupported, ttsSupported, voices } = useVoiceAgent()
  const [draft, setDraft] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(
    () =>
      onBus((e) => {
        if (e.type === 'start-mic') {
          setOpen(true)
          window.setTimeout(() => toggleMic(e.mode), 120)
        } else if (e.type === 'agent-ask') {
          setOpen(true)
          void ask(e.text)
        }
      }),
    [ask, setOpen, toggleMic],
  )

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 220)
  }, [open])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, interim])

  useEffect(() => {
    if (!recording) {
      setElapsed(0)
      return
    }
    const id = window.setInterval(() => setElapsed((e) => e + 0.1), 100)
    return () => window.clearInterval(id)
  }, [recording])

  const busy = listening || recording

  return (
    <>
      {/* ---------------- dock ---------------- */}
      <div className="pointer-events-none fixed right-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:right-5 sm:bottom-5">
        {open && (
          <div
            role="dialog"
            aria-label="Earth guide agent"
            className="glass pointer-events-auto flex w-[min(94vw,400px)] flex-col overflow-hidden rounded-2xl"
            style={{ maxHeight: 'min(76vh, 660px)' }}
          >
            {/* header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-sonic-300/15 text-sonic-200 ring-1 ring-sonic-300/30">
                  <IconSpark size={16} />
                  {speaking && <span className="absolute inset-0 animate-pulse-ring rounded-xl bg-sonic-300/30" aria-hidden />}
                </span>
                <div>
                  <div className="text-[13.5px] leading-tight font-semibold text-mist-50">Earth guide</div>
                  <div className="data-mono text-[10px] text-mist-400">
                    {speaking ? 'speaking…' : listening ? 'listening…' : recording ? 'recording…' : agent.endpoint ? 'connected model' : 'local knowledge engine'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {speaking && (
                  <IconButton label="Stop speaking" onClick={stopSpeaking}>
                    <IconPause size={15} />
                  </IconButton>
                )}
                <IconButton label="Agent settings" active={showSettings} onClick={() => setShowSettings((v) => !v)}>
                  <IconAccess size={15} />
                </IconButton>
                <IconButton label="Close the agent" onClick={() => setOpen(false)}>
                  <IconClose size={15} />
                </IconButton>
              </div>
            </div>

            {/* settings */}
            {showSettings && (
              <div className="space-y-3 border-b border-white/10 bg-white/[0.02] px-3.5 py-3">
                <label className="block">
                  <span className="label-mono mb-1 block">Voice</span>
                  <select
                    className="data-mono w-full appearance-none rounded-lg border border-white/12 bg-void-900 px-2.5 py-2 text-[11.5px] text-mist-100 outline-none focus:border-sonic-300/60"
                    value={agent.voiceName ?? ''}
                    onChange={(e) => setAgent({ voiceName: e.target.value || null })}
                    disabled={!ttsSupported}
                  >
                    <option value="">Default (best available English)</option>
                    {voices.filter((v) => v.lang.startsWith('en')).map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} · {v.lang}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Slider label="Rate" value={agent.rate} min={0.6} max={1.6} step={0.05} onChange={(v) => setAgent({ rate: v })} format={(v) => `${v.toFixed(2)}×`} />
                  <Slider label="Pitch" value={agent.pitch} min={0.5} max={1.6} step={0.05} onChange={(v) => setAgent({ pitch: v })} format={(v) => v.toFixed(2)} />
                </div>
                <Toggle label="Speak answers aloud" checked={agent.speakAnswers} onChange={(v) => setAgent({ speakAnswers: v })} />
                <label className="block">
                  <span className="label-mono mb-1 block">Model endpoint (optional)</span>
                  <input
                    className="data-mono w-full rounded-lg border border-white/12 bg-void-900 px-2.5 py-2 text-[11.5px] text-mist-100 outline-none focus:border-sonic-300/60"
                    placeholder="https://…/v1/chat/completions"
                    value={agent.endpoint}
                    onChange={(e) => setAgent({ endpoint: e.target.value })}
                  />
                  <span className="mt-1 block text-[10.5px] leading-relaxed text-mist-400">
                    Leave empty to run fully offline. Any OpenAI-compatible chat endpoint works; the app sends the live track,
                    year and value as context.
                  </span>
                </label>
                <Button size="xs" variant="ghost" onClick={() => ask('Introduce yourself in one sentence.')}>
                  <IconVolume size={12} /> Test the voice
                </Button>
              </div>
            )}

            {/* messages */}
            <div ref={listRef} role="log" aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
              {messages.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : m.role === 'system' ? 'flex justify-center' : 'flex justify-start'}>
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] rounded-2xl rounded-br-md border border-sonic-300/30 bg-sonic-300/12 px-3 py-2 text-[13px] leading-relaxed text-mist-50'
                        : m.role === 'system'
                          ? 'max-w-[92%] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] leading-relaxed text-mist-400'
                          : 'max-w-[92%] rounded-2xl rounded-bl-md border border-white/12 bg-void-800/80 px-3 py-2 text-[13px] leading-relaxed text-mist-100'
                    }
                  >
                    {m.audioUrl && (
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-heat-500/25 text-heat-300">
                          <IconRecord size={11} />
                        </span>
                        <audio controls src={m.audioUrl} className="h-8 max-w-[210px]" aria-label="Recorded question" />
                        {m.audioSeconds != null && <span className="data-mono text-[10px] text-mist-400">{fmtClock(m.audioSeconds)}</span>}
                      </div>
                    )}
                    {m.text}
                    {m.pending && <span className="ml-1 inline-block animate-pulse">▍</span>}
                    {m.role === 'agent' && !m.pending && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          className="data-mono rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-mist-400 transition hover:border-sonic-300/40 hover:text-sonic-200"
                          onClick={() => ask(`Repeat that.`)}
                          aria-label="Repeat this answer"
                        >
                          replay
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {interim && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-sonic-300/40 px-3 py-2 text-[13px] text-sonic-100 italic">
                    {interim}…
                  </div>
                </div>
              )}
            </div>

            {/* suggestions */}
            {messages.length <= 2 && (
              <div className="flex flex-wrap gap-1.5 border-t border-white/8 px-3.5 py-2.5">
                {SUGGESTIONS.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    onClick={() => void ask(s)}
                    className="rounded-full border border-white/12 bg-white/[0.03] px-2.5 py-1 text-[11px] text-mist-300 transition hover:border-sonic-300/40 hover:text-sonic-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* input */}
            <form
              className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                const t = draft.trim()
                if (!t) return
                setDraft('')
                void ask(t)
              }}
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={busy ? 'Listening…' : 'Ask anything, or tap the mic'}
                aria-label="Type a question for the guide agent"
                className="min-w-0 flex-1 rounded-xl border border-white/12 bg-void-900 px-3 py-2 text-[13px] text-mist-50 placeholder:text-mist-400 focus:border-sonic-300/50 focus:outline-none"
              />
              <IconButton label="Record your question as an audio message" variant={recording ? 'danger' : 'ghost'} onClick={() => toggleMic('record')}>
                <IconRecord size={15} className={recording ? 'animate-pulse' : ''} />
              </IconButton>
              <IconButton label={busy ? 'Stop listening' : 'Tap to talk'} variant={listening ? 'primary' : 'ghost'} onClick={() => toggleMic('tap')}>
                <IconMic size={16} />
              </IconButton>
              <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
                <IconPlay size={12} />
              </Button>
            </form>

            {recording && (
              <div className="flex items-center justify-between gap-2 border-t border-heat-500/30 bg-heat-500/10 px-3.5 py-2">
                <span className="data-mono flex items-center gap-2 text-[11.5px] text-heat-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-heat-500" />
                  recording {fmtClock(elapsed)} / 0:40
                </span>
                <Button size="xs" variant="danger" onClick={stopMic}>
                  Stop &amp; send
                </Button>
              </div>
            )}
            {!micSupported && (
              <div className="border-t border-white/8 px-3.5 py-2 text-[10.5px] leading-relaxed text-mist-400">
                This browser has no speech recognition{ttsSupported ? ', but answers are still spoken aloud' : ''}. Type your
                question — Chrome, Edge and Safari support the microphone.
              </div>
            )}
          </div>
        )}

        {/* collapsed launcher */}
        <button
          onClick={() => (open ? setOpen(false) : setOpen(true))}
          aria-label={open ? 'Close the Earth guide agent' : 'Open the Earth guide agent and ask by voice'}
          aria-expanded={open}
          className={`pointer-events-auto group relative flex items-center gap-2.5 rounded-full border px-3.5 py-3 transition-all sm:px-4 ${
            open
              ? 'border-white/25 bg-void-800/90 text-mist-100'
              : 'border-sonic-300/40 bg-void-900/85 text-sonic-100 shadow-[0_0_50px_-12px_rgba(110,231,255,0.7)] hover:border-sonic-300/70'
          }`}
        >
          {!open && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-sonic-300/25" aria-hidden />}
          {open ? <IconClose size={17} /> : <IconMic size={17} />}
          <span className="text-[12.5px] font-semibold whitespace-nowrap">{open ? 'Close' : 'Ask the guide'}</span>
          {listening && <Badge tone="cyan">live</Badge>}
        </button>
      </div>
    </>
  )
}
