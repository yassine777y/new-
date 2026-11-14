/**
 * NASA-visualisation-style colormaps.
 * Each map is a list of [position, r, g, b] stops in 0–255 that we interpolate.
 * Names follow the familiar scientific-viz conventions (viridis / inferno / turbo …)
 * so a viewer instantly recognises the "Earth Information Center" look.
 */

import { clamp } from './math'

export type RGB = [number, number, number]
type Stops = Array<[number, number, number, number]>

export type ColormapName =
  | 'rdbu'
  | 'viridis'
  | 'inferno'
  | 'magma'
  | 'plasma'
  | 'turbo'
  | 'blues'
  | 'ice'
  | 'carbon'

const STOPS: Record<ColormapName, Stops> = {
  // diverging blue → white → red : temperature anomaly
  rdbu: [
    [0.0, 33, 62, 128],
    [0.15, 67, 116, 178],
    [0.3, 124, 174, 214],
    [0.42, 186, 214, 235],
    [0.5, 236, 240, 245],
    [0.58, 250, 214, 186],
    [0.7, 239, 154, 116],
    [0.85, 214, 74, 52],
    [1.0, 140, 12, 30],
  ],
  viridis: [
    [0.0, 68, 1, 84],
    [0.25, 59, 82, 139],
    [0.5, 33, 145, 140],
    [0.75, 94, 201, 98],
    [1.0, 253, 231, 37],
  ],
  inferno: [
    [0.0, 0, 0, 4],
    [0.25, 87, 16, 110],
    [0.5, 188, 55, 84],
    [0.75, 249, 142, 9],
    [1.0, 252, 255, 164],
  ],
  magma: [
    [0.0, 0, 0, 4],
    [0.25, 81, 18, 124],
    [0.5, 183, 55, 121],
    [0.75, 251, 137, 78],
    [1.0, 252, 253, 191],
  ],
  plasma: [
    [0.0, 13, 8, 135],
    [0.25, 126, 3, 168],
    [0.5, 204, 71, 120],
    [0.75, 248, 149, 64],
    [1.0, 240, 249, 33],
  ],
  turbo: [
    [0.0, 48, 18, 59],
    [0.15, 30, 108, 231],
    [0.32, 40, 200, 190],
    [0.5, 122, 232, 60],
    [0.66, 226, 205, 36],
    [0.82, 243, 105, 26],
    [1.0, 122, 4, 3],
  ],
  blues: [
    [0.0, 6, 12, 28],
    [0.3, 24, 66, 128],
    [0.55, 66, 140, 200],
    [0.78, 150, 205, 240],
    [1.0, 240, 251, 255],
  ],
  ice: [
    [0.0, 8, 16, 34],
    [0.35, 30, 84, 140],
    [0.6, 96, 170, 220],
    [0.8, 190, 226, 248],
    [1.0, 255, 255, 255],
  ],
  carbon: [
    [0.0, 10, 10, 16],
    [0.25, 52, 40, 92],
    [0.5, 122, 62, 130],
    [0.72, 214, 106, 96],
    [0.88, 250, 182, 78],
    [1.0, 255, 244, 190],
  ],
}

export function sampleColormap(name: ColormapName, t: number): RGB {
  const stops = STOPS[name]
  const p = clamp(t)
  let i = 0
  while (i < stops.length - 2 && stops[i + 1][0] < p) i++
  const a = stops[i]
  const b = stops[i + 1]
  const span = b[0] - a[0] || 1e-6
  const f = clamp((p - a[0]) / span)
  return [Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), Math.round(a[3] + (b[3] - a[3]) * f)]
}

export function colormapCss(name: ColormapName, angle = '90deg'): string {
  const stops = STOPS[name]
  return `linear-gradient(${angle}, ${stops.map((s) => `rgb(${s[1]},${s[2]},${s[3]}) ${(s[0] * 100).toFixed(1)}%`).join(', ')})`
}

export function colormapHex(name: ColormapName, t: number): string {
  const [r, g, b] = sampleColormap(name, t)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
