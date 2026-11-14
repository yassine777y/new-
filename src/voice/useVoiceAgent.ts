import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import { answerAgent, type AgentAction, type AgentContext } from './knowledge'
import { cancelSpeech, createRecognition, recognitionSupported, speak, synthesisSupported, type SpeechRecognitionLike } from './speech'
import { toSpoken } from '@/lib/format'
import { emit } from '@/lib/bus'
import { clamp } from '@/lib/math'
import type { ChatMessage } from '@/data/types'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** Optional OpenAI-compatible endpoint (VITE_AGENT_API_URL or the settings field). */
async function remoteAnswer(query: string, ctx: AgentContext, endpoint: string, history: ChatMessage[]): Promise<string | null> {
  try {
    const system = [
      'You are the guide agent inside Earth Jukebox, a NASA Space Apps sonification interface.',
      'Answer in 2-4 sentences, spoken-aloud friendly (no markdown, no lists, no URLs).',
      `Current state: track "${ctx.track.title}" (${ctx.track.tagline}), playhead year ${Math.floor(ctx.year)}, value at playhead, window ${ctx.range[0]}-${ctx.range[1]}, ${ctx.isPlaying ? 'playing' : 'paused'}, view ${ctx.viewMode}.`,
      'Be precise about numbers and always mention that maps are modelled from published characteristics.',
    ].join(' ')
    const messages = [
      { role: 'system', content: system },
      ...history.slice(-6).map((m) => ({ role: m.role === 'agent' ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: query },
    ]
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.4 }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content ?? json?.text ?? json?.response
    return typeof text === 'string' && text.trim() ? text.trim() : null
  } catch {
    return null
  }
}

export function useVoiceAgent() {
  const store = useStore
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recordStartRef = useRef(0)
  const modeRef = useRef<'tap' | 'record' | null>(null)
  const transcriptRef = useRef('')

  const micSupported = recognitionSupported()
  const ttsSupported = synthesisSupported()

  useEffect(() => {
    if (!synthesisSupported()) return
    let alive = true
    import('./speech').then(({ loadVoices }) => loadVoices().then((v) => alive && setVoices(v)))
    return () => {
      alive = false
    }
  }, [])

  const applyActions = useCallback((actions: AgentAction[]) => {
    const s = store.getState()
    actions.forEach((a, i) => {
      window.setTimeout(() => {
        const st = store.getState()
        switch (a.type) {
          case 'selectTrack':
            st.setActiveTrack(a.trackId, { play: false })
            emit({ type: 'rebuild-score', reason: 'agent' })
            break
          case 'setRange':
            st.setRange([a.from, a.to])
            emit({ type: 'rebuild-score', reason: 'agent' })
            break
          case 'setYear': {
            st.setYear(a.year)
            const [lo, hi] = st.range
            st.setScoreTime(clamp((a.year - lo) / Math.max(1e-6, hi - lo), 0, 1) * st.duration)
            break
          }
          case 'play':
            st.setIsPlaying(true)
            break
          case 'pause':
            st.setIsPlaying(false)
            break
          case 'stop':
            st.setIsPlaying(false)
            st.setScoreTime(0)
            break
          case 'view':
            st.setViewMode(a.mode)
            break
          case 'openStudio':
            st.setStudioOpen(true)
            emit({ type: 'scroll-to', section: 'studio' })
            break
          case 'goto':
            emit({ type: 'scroll-to', section: a.section })
            break
          case 'volume': {
            if (a.mute !== undefined) st.toggleMute()
            else if (a.value !== undefined) st.setVolume(clamp(a.value))
            else if (a.delta !== undefined) st.setVolume(clamp(st.volume + a.delta))
            break
          }
          case 'sonifyFrame':
            st.setViewMode('frame')
            emit({ type: 'sonify-frame' })
            break
        }
        void s
      }, 120 * i)
    })
  }, [])

  const speakText = useCallback(
    (text: string) => {
      const { agent, setSpeaking, a11y } = store.getState()
      if (!agent.speakAnswers || !ttsSupported) return
      cancelSpeech()
      speak(toSpoken(text), {
        voiceName: agent.voiceName,
        rate: agent.rate,
        pitch: agent.pitch,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      })
      if (a11y.haptics && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(12)
        } catch {
          /* unsupported */
        }
      }
    },
    [ttsSupported],
  )

  /** Ask the agent (typed, transcribed speech, or a recorded audio question). */
  const ask = useCallback(
    async (
      text: string,
      extra?: { audioUrl?: string; audioSeconds?: number; spoken?: boolean },
    ) => {
      const st = store.getState()
      const clean = text.trim()
      if (!clean && !extra?.audioUrl) return
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text: clean || (extra?.audioUrl ? 'Audio question (no transcript available in this browser).' : ''),
        audioUrl: extra?.audioUrl,
        audioSeconds: extra?.audioSeconds,
        at: Date.now(),
      }
      st.pushMessage(userMsg)
      const pendingId = uid()
      st.pushMessage({ id: pendingId, role: 'agent', text: '…', at: Date.now(), pending: true })

      const ctx: AgentContext = {
        track: st.activeTrack(),
        year: st.year,
        range: st.range,
        isPlaying: st.isPlaying,
        viewMode: st.viewMode,
        volume: st.volume,
        muted: st.muted,
        intensity: st.intensity,
      }

      let reply = answerAgent(clean || 'what is this', ctx)
      if (st.agent.endpoint) {
        const remote = await remoteAnswer(clean, ctx, st.agent.endpoint, st.messages)
        if (remote) reply = { text: remote, actions: reply.actions, lang: reply.lang }
      }

      // If the user asked in Darija and we have a local Darija line, use it.
      if (reply.lang === 'darija') {
        const { DARIJA } = await import('./knowledge')
        const key = Object.keys(DARIJA).find((k) => reply.text.toLowerCase().includes(k.toLowerCase()))
        if (key) reply = { ...reply, text: DARIJA[key] }
      }

      st.patchMessage(pendingId, { text: reply.text, pending: false })
      st.announce(`Guide agent replied: ${reply.text}`)
      applyActions(reply.actions)
      speakText(reply.text)
    },
    [applyActions, speakText],
  )

  const stopMic = useCallback(() => {
    const s = store.getState()
    if (recRef.current) {
      try {
        recRef.current.stop()
      } catch {
        /* already stopped */
      }
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    s.setListening(false)
    s.setRecording(false)
  }, [])

  const finishRecordedAudio = useCallback(
    (blob: Blob, seconds: number) => {
      const url = URL.createObjectURL(blob)
      const transcript = transcriptRef.current.trim()
      transcriptRef.current = ''
      void ask(transcript, { audioUrl: url, audioSeconds: seconds, spoken: true })
      if (!transcript) {
        store.getState().patchMessage
        const st = store.getState()
        st.pushMessage({
          id: uid(),
          role: 'system',
          text: 'Audio attached. This browser has no on-device speech-to-text, so I could not read it — type the same question and I will answer it aloud.',
          at: Date.now(),
        })
      }
    },
    [ask],
  )

  /**
   * Start a microphone session.
   * mode 'tap'    → speech-to-text only, sends automatically when you stop talking.
   * mode 'record' → records the question as an audio message *and* transcribes it.
   */
  const startMic = useCallback(
    async (mode: 'tap' | 'record' = 'tap') => {
      const st = store.getState()
      modeRef.current = mode
      transcriptRef.current = ''
      st.setInterim('')

      // 1) transcription (optional)
      if (micSupported) {
        const rec = createRecognition('en-US')
        if (rec) {
          recRef.current = rec
          rec.continuous = mode === 'record'
          rec.interimResults = true
          rec.onstart = () => st.setListening(true)
          rec.onresult = (e) => {
            let interim = ''
            let finalText = ''
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i]
              if (r.isFinal) finalText += r[0].transcript
              else interim += r[0].transcript
            }
            if (interim) st.setInterim(interim)
            if (finalText) {
              transcriptRef.current = (transcriptRef.current + ' ' + finalText).trim()
              st.setInterim('')
              if (mode === 'tap') {
                st.setListening(false)
                void ask(transcriptRef.current)
                transcriptRef.current = ''
              }
            }
          }
          rec.onerror = (e) => {
            console.warn('[speech] recognition error', e.error)
            st.setListening(false)
            if (e.error === 'not-allowed') {
              st.pushMessage({
                id: uid(),
                role: 'system',
                text: 'Microphone permission was denied. You can still type your question below, and I will answer out loud.',
                at: Date.now(),
              })
            }
          }
          rec.onend = () => {
            st.setListening(false)
            if (mode === 'tap' && transcriptRef.current.trim()) {
              void ask(transcriptRef.current.trim())
              transcriptRef.current = ''
            }
          }
          try {
            rec.start()
          } catch {
            /* double start */
          }
        }
      }

      // 2) audio recording (always attempted in record mode)
      if (mode === 'record' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamRef.current = stream
          const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m))
          const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
          recorderRef.current = rec
          chunksRef.current = []
          recordStartRef.current = performance.now()
          rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
          rec.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
            const seconds = (performance.now() - recordStartRef.current) / 1000
            store.getState().setRecording(false)
            if (blob.size > 1000) finishRecordedAudio(blob, seconds)
          }
          rec.start(200)
          st.setRecording(true)
          st.announce('Recording your question. Tap stop when you are done.')
          // hard stop after 40 s
          window.setTimeout(() => {
            if (recorderRef.current?.state === 'recording') stopMic()
          }, 40000)
        } catch (err) {
          console.warn('[speech] recorder unavailable', err)
          st.pushMessage({
            id: uid(),
            role: 'system',
            text: 'I could not open the microphone, so recording is unavailable. Type your question and I will still answer with voice.',
            at: Date.now(),
          })
        }
      } else if (mode === 'record' && !micSupported) {
        st.pushMessage({
          id: uid(),
          role: 'system',
          text: 'This browser supports neither audio recording nor speech-to-text. Type your question instead — answers are still spoken aloud.',
          at: Date.now(),
        })
      }
    },
    [ask, finishRecordedAudio, micSupported, stopMic],
  )

  const toggleMic = useCallback(
    (mode: 'tap' | 'record' = 'tap') => {
      const st = store.getState()
      if (st.listening || st.recording) stopMic()
      else void startMic(mode)
    },
    [startMic, stopMic],
  )

  useEffect(() => () => {
    cancelSpeech()
    stopMic()
  }, [stopMic])

  return {
    ask,
    startMic,
    stopMic,
    toggleMic,
    speakText,
    stopSpeaking: cancelSpeech,
    micSupported,
    ttsSupported,
    voices,
  }
}
