/**
 * Builds an actual "visual frame" — the same kind of thing an Earth Information Center
 * animation contains — from the base imagery plus the modelled data field. The frame is
 * what the frame analyser scans, so seeing and hearing come from identical pixels.
 */

import type { Track } from '@/data/types'
import { renderField } from './fieldCanvas'
import { getBaseMap, loadBaseMap } from './basemap'
import { invLerp, sampleSeries } from './math'

export interface FrameOptions {
  width?: number
  height?: number
  /** Draw the base Earth imagery under the field (false = field only). */
  base?: boolean
  graticule?: boolean
  title?: string
}

export async function composeFrameCanvas(track: Track, year: number, opts: FrameOptions = {}): Promise<HTMLCanvasElement> {
  const w = opts.width ?? 960
  const h = opts.height ?? Math.round(w / 2)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#04070f'
  ctx.fillRect(0, 0, w, h)

  if (opts.base !== false) {
    const base = getBaseMap() ?? (await loadBaseMap(1440))
    if (base) ctx.drawImage(base, 0, 0, w, h)
  }

  const field = document.createElement('canvas')
  field.width = 576
  field.height = 288
  const value = sampleSeries(track.series, year)
  const norm = invLerp(track.domain[0], track.domain[1], value)
  const delta = (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2
  renderField(field, {
    kind: track.spatial,
    year,
    value,
    norm,
    delta,
    colormap: track.colormap,
    alphaScale: 0.9,
  })
  ctx.drawImage(field, 0, 0, w, h)

  if (opts.graticule) {
    ctx.strokeStyle = 'rgba(200,225,255,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * w
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * h
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
  }

  if (opts.title) {
    ctx.font = '600 15px "IBM Plex Mono", monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.86)'
    ctx.fillText(opts.title, 14, 26)
    ctx.font = '400 12px "IBM Plex Mono", monospace'
    ctx.fillStyle = 'rgba(190,215,245,0.7)'
    ctx.fillText(`${track.shortTitle} · ${Math.floor(year)} · ${value.toFixed(track.digits)} ${track.unit}`, 14, 44)
  }

  return canvas
}
