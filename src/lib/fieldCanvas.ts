/**
 * Rasterises a spatial field into a canvas — the same pixels feed the 2D world map,
 * the 3D globe's data shell, and the frame analyser that sonifies "a visual frame".
 */

import { FIELD_GRID, rasteriseField } from './fields'
import { sampleColormap, type ColormapName } from './colormap'
import type { SpatialFieldKind } from '@/data/types'

let scratch: HTMLCanvasElement | null = null
let scratchCtx: CanvasRenderingContext2D | null = null

function getScratch(): CanvasRenderingContext2D {
  if (!scratch) {
    scratch = document.createElement('canvas')
    scratch.width = FIELD_GRID.w
    scratch.height = FIELD_GRID.h
    scratchCtx = scratch.getContext('2d', { willReadFrequently: false })
  }
  if (!scratchCtx) throw new Error('2D canvas unavailable')
  return scratchCtx
}

export interface RenderFieldOptions {
  kind: SpatialFieldKind
  year: number
  value: number
  norm: number
  delta: number
  colormap: ColormapName
  /** 0..1 — how opaque the field sits over the base map. */
  alphaScale?: number
}

/**
 * Draw the field into `target` (scaled up smoothly). Returns the low-res grid canvas too,
 * so callers can read pixels for hit-testing without re-rasterising.
 */
export function renderField(target: HTMLCanvasElement, opts: RenderFieldOptions): HTMLCanvasElement {
  const ctx2 = getScratch()
  const image = rasteriseField(
    opts.kind,
    opts.year,
    opts.value,
    opts.norm,
    opts.delta,
    (t) => sampleColormap(opts.colormap, t),
    opts.alphaScale ?? 0.8,
  )
  ctx2.putImageData(image, 0, 0)
  const tctx = target.getContext('2d')
  if (tctx) {
    tctx.clearRect(0, 0, target.width, target.height)
    tctx.imageSmoothingEnabled = true
    tctx.imageSmoothingQuality = 'high'
    tctx.drawImage(scratch!, 0, 0, target.width, target.height)
  }
  return scratch!
}

/** Sample the field value (0..1 colour position) at a lat/lon without rasterising. */
export { fieldValue } from './fields'

export function colormapLegend(name: ColormapName, steps = 24): string[] {
  const out: string[] = []
  for (let i = 0; i < steps; i++) {
    const [r, g, b] = sampleColormap(name, i / (steps - 1))
    out.push(`rgb(${r},${g},${b})`)
  }
  return out
}
