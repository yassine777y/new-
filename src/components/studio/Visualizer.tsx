/** Live analyser: spectrum bars + waveform + the note actually sounding right now. */

import { useEffect, useRef, useState } from 'react'
import { engine } from '@/audio/engine'
import { midiToName } from '@/audio/scales'
import { useStore } from '@/state/store'

export function Visualizer({ color = '#6ee7ff', height = 96 }: { color?: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readout, setReadout] = useState({ note: '—', hz: 0, bpm: 0 })
  const bpmStore = useStore((s) => s.bpm)

  useEffect(() => {
    let raf = 0
    const bars = 72
    const spectrum = new Uint8Array(bars)
    const wave = new Uint8Array(240)
    let lastText = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      engine.getSpectrum(spectrum)
      engine.getWaveform(wave)

      const bw = w / bars
      for (let i = 0; i < bars; i++) {
        const v = spectrum[i] / 255
        const bh = Math.max(1.5, v * (h * 0.78))
        const x = i * bw
        const grad = ctx.createLinearGradient(0, h - bh, 0, h)
        grad.addColorStop(0, color)
        grad.addColorStop(1, `${color}22`)
        ctx.fillStyle = grad
        ctx.globalAlpha = 0.25 + v * 0.75
        ctx.fillRect(x + bw * 0.16, h - bh, bw * 0.68, bh)
      }
      ctx.globalAlpha = 1

      // waveform overlay
      ctx.beginPath()
      ctx.lineWidth = 1.4
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w
        const y = h * 0.5 + ((wave[i] - 128) / 128) * h * 0.42
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      const now = performance.now()
      if (now - lastText > 220) {
        lastText = now
        const key = engine.currentKey
        if (key) {
          const note = midiToName(key.midi)
          const hz = 440 * Math.pow(2, (key.midi - 69) / 12)
          setReadout((r) =>
            r.note === note && Math.abs(r.hz - hz) < 0.6 && Math.abs(r.bpm - key.bpm) < 0.6
              ? r
              : { note, hz, bpm: key.bpm },
          )
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [color])

  return (
    <div>
      <canvas ref={canvasRef} className="block w-full" style={{ height }} aria-hidden />
      <div className="data-mono mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-mist-400">
        <span>
          drone <span className="text-sonic-200">{readout.note}</span> · {readout.hz.toFixed(1)} Hz
        </span>
        <span>
          tempo <span className="text-sonic-200">{Math.round(bpmStore || readout.bpm)} bpm</span>
        </span>
        <span className="hidden sm:inline">spectrum 0–8 kHz (log)</span>
      </div>
      <span className="sr-only" aria-live="off">
        Audio spectrum visualiser. Current drone note {readout.note}, tempo {Math.round(bpmStore || readout.bpm)} beats per minute.
      </span>
    </div>
  )
}
