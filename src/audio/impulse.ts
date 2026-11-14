/** Convolution reverb impulse — shared by the live engine and the offline renderer. */

export function makeImpulseForRender(ctx: BaseAudioContext, seconds = 3.1, decay = 2.6): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * seconds))
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) {
      const t = i / len
      const early = i < rate * 0.06 ? (Math.random() * 2 - 1) * 0.5 * (1 - i / (rate * 0.06)) : 0
      const tail = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
      d[i] = (early + tail) * (c === 0 ? 1 : 0.92)
    }
  }
  return buf
}
