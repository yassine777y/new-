/** Loads the equirectangular base map once and returns a dimmed, desaturated canvas. */

import { TEXTURES } from './assets'

let baseCanvas: HTMLCanvasElement | null = null
let basePromise: Promise<HTMLCanvasElement | null> | null = null
const listeners = new Set<() => void>()

export function getBaseMap(): HTMLCanvasElement | null {
  return baseCanvas
}

export function onBaseMapReady(fn: () => void): () => void {
  listeners.add(fn)
  if (baseCanvas) fn()
  return () => listeners.delete(fn)
}

export function loadBaseMap(width = 1440): Promise<HTMLCanvasElement | null> {
  if (baseCanvas) return Promise.resolve(baseCanvas)
  if (basePromise) return basePromise
  basePromise = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const h = Math.round((width * img.naturalHeight) / img.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      // dim + desaturate so the data layer reads clearly on top
      let filtered = false
      try {
        ctx.filter = 'saturate(0.42) brightness(0.52) contrast(1.06)'
        ctx.drawImage(img, 0, 0, width, h)
        filtered = ctx.filter !== 'none'
        ctx.filter = 'none'
      } catch {
        filtered = false
      }
      if (!filtered) {
        ctx.drawImage(img, 0, 0, width, h)
      }
      // guaranteed fallback: multiply a dark blue veil over everything
      ctx.globalCompositeOperation = 'source-atop'
      ctx.fillStyle = 'rgba(4,10,22,0.42)'
      ctx.fillRect(0, 0, width, h)
      ctx.globalCompositeOperation = 'source-over'
      baseCanvas = canvas
      listeners.forEach((l) => l())
      resolve(canvas)
    }
    img.onerror = () => {
      baseCanvas = null
      resolve(null)
    }
    img.src = TEXTURES.day
  })
  return basePromise
}
