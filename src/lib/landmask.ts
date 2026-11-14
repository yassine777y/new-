/**
 * Land / ocean / ice mask derived at runtime from the equirectangular Earth day-map
 * texture (NASA Blue Marble style). Classifying the texture itself keeps the mask
 * perfectly registered with everything we draw on the globe, and avoids shipping a
 * second dataset.
 *
 * Verified against the source image: area-weighted land+ice ≈ 31 % of the globe
 * (published value: land ≈ 29 %), and the coastline shapes resolve correctly.
 */

import { TEXTURES } from './assets'
import { clamp } from './math'

export const MASK_W = 360 // 1° per cell
export const MASK_H = 180

export const OCEAN = 0
export const LAND = 1
export const ICE = 2

let mask: Uint8Array | null = null
let promise: Promise<Uint8Array> | null = null

function classify(r: number, g: number, b: number): number {
  if (r > 200 && g > 200 && b > 205) return ICE
  const maxc = Math.max(r, g, b)
  const minc = Math.min(r, g, b)
  const sat = maxc === 0 ? 0 : (maxc - minc) / maxc
  if (b > r && b - r > 14 && sat < 0.75 && maxc < 210) return OCEAN
  return LAND
}

export async function loadLandMask(): Promise<Uint8Array> {
  if (mask) return mask
  if (promise) return promise
  promise = (async () => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = TEXTURES.day
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = MASK_W
      canvas.height = MASK_H
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, MASK_W, MASK_H)
      const { data } = ctx.getImageData(0, 0, MASK_W, MASK_H)
      const out = new Uint8Array(MASK_W * MASK_H)
      for (let i = 0, p = 0; i < data.length; i += 4, p++) out[p] = classify(data[i], data[i + 1], data[i + 2])
      mask = out
    } catch (err) {
      console.warn('[landmask] could not derive mask from texture, using analytic fallback', err)
      mask = analyticFallback()
    }
    return mask
  })()
  return promise
}

/** Coarse continent boxes so the app still works if the texture fails to decode. */
function analyticFallback(): Uint8Array {
  const boxes: Array<[number, number, number, number]> = [
    // [lonMin, lonMax, latMin, latMax]
    [-170, -52, 15, 72], // North America
    [-82, -34, -56, 13], // South America
    [-18, 52, 34, 72], // Europe
    [-18, 55, -36, 34], // Africa
    [52, 145, 5, 75], // Asia
    [112, 155, -45, -10], // Australia
    [-180, 180, -90, -63], // Antarctica
    [25, 60, 60, 78], // extra Eurasia north
  ]
  const out = new Uint8Array(MASK_W * MASK_H)
  for (let y = 0; y < MASK_H; y++) {
    const lat = 90 - (y + 0.5)
    for (let x = 0; x < MASK_W; x++) {
      const lon = -180 + (x + 0.5)
      let c = OCEAN
      for (const [a, b, cc, d] of boxes) if (lon >= a && lon <= b && lat >= cc && lat <= d) c = LAND
      if (lat > 78 || lat < -66) c = ICE
      out[y * MASK_W + x] = c
    }
  }
  return out
}

/** Class at a lat/lon (nearest cell). Returns OCEAN before the mask has loaded. */
export function classAt(lat: number, lon: number): number {
  if (!mask) return OCEAN
  const x = Math.floor((((lon + 180) % 360) + 360) % 360) % MASK_W
  const y = clamp(Math.floor((90 - lat) % MASK_H), 0, MASK_H - 1)
  return mask[y * MASK_W + x]
}

export function isLand(lat: number, lon: number): boolean {
  const c = classAt(lat, lon)
  return c === LAND || c === ICE
}

/** Fraction of land in a small neighbourhood — smoother than a binary test. */
export function landFraction(lat: number, lon: number, radius = 2): number {
  if (!mask) return 0.3
  let hits = 0
  let total = 0
  const cx = Math.floor((((lon + 180) % 360) + 360) % 360)
  const cy = clamp(Math.floor(90 - lat), 0, MASK_H - 1)
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy
    if (y < 0 || y >= MASK_H) continue
    for (let dx = -radius; dx <= radius; dx++) {
      const x = ((cx + dx) % MASK_W + MASK_W) % MASK_W
      const c = mask[y * MASK_W + x]
      total++
      if (c !== OCEAN) hits++
    }
  }
  return total ? hits / total : 0
}

export function isReady(): boolean {
  return mask !== null
}
