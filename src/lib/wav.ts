/** WAV (16-bit PCM) encoder + helpers for the offline "render a piece" feature. */

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate
  const frames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = frames * blockAlign
  const headerSize = 44
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c))

  let offset = headerSize
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i]
      s = s < -1 ? -1 : s > 1 ? 1 : s
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/** Peak envelope (for waveform thumbnails) — `buckets` samples of 0..1. */
export function peakEnvelope(buffer: AudioBuffer, buckets = 320): number[] {
  const data = buffer.getChannelData(0)
  const size = Math.max(1, Math.floor(data.length / buckets))
  const out: number[] = []
  let max = 1e-6
  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const start = b * size
    const end = Math.min(data.length, start + size)
    for (let i = start; i < end; i += 8) {
      const v = Math.abs(data[i])
      if (v > peak) peak = v
    }
    out.push(peak)
    if (peak > max) max = peak
  }
  return out.map((v) => v / max)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
