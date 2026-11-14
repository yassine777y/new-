/**
 * The globe mark's maths — pure, DOM-free and unit-tested.
 *
 * An orthographic projection of the real Earth, rasterised per pixel:
 *   1. every pixel of the disc is mapped to a latitude/longitude on a sphere tilted by
 *      23.44°, with all lighting terms precomputed (the sun is fixed relative to the viewer,
 *      exactly like the hero Earth);
 *   2. each frame only re-resolves longitude by the spin angle and looks the cell up in the
 *      NASA-derived land mask;
 *   3. the ocean takes the colour of the climate anomaly, so the mark warms as time advances.
 *
 * `paintGlobe` writes straight into an ImageData buffer — no allocations per frame.
 */

import { clamp, deg2rad, fbm3, invLerp } from '@/lib/math'
import { sampleColormap } from '@/lib/colormap'
import { ICE, LAND, MASK_H, MASK_W } from '@/lib/landmask'

const TILT = deg2rad(23.44)
const COS_T = Math.cos(TILT)
const SIN_T = Math.sin(TILT)
const RAD2DEG = 180 / Math.PI

/** Camera-space sun — matches `SUN` in `three/HeroEarth.tsx`. */
const SUN = norm3(1, 0.32, 0.55)
/** Half-vector for the ocean glint; the viewer sits at +z under orthographic projection. */
const HALF = norm3(SUN[0], SUN[1], SUN[2] + 1)

/** One idle pass through a whole record, in seconds. */
export const DRIFT_SECONDS = 26
/** ≈28 s per revolution. */
export const SPIN_DEG_PER_SEC = 13

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

export interface GlobeGeometry {
  size: number
  /** Indices into the ImageData pixel array (i.e. y*size+x, not ×4). */
  indices: Int32Array
  /** Mask row per pixel, or -1 for atmosphere-only pixels. */
  latIdx: Int16Array
  /** Tilt-rotated x and camera-space z, used for the per-frame spin. */
  cx: Float32Array
  cz: Float32Array
  /** Full tilt-rotated world point, for the procedural fallback. */
  wx: Float32Array
  wy: Float32Array
  shade: Float32Array
  rim: Float32Array
  glint: Float32Array
  /** >0 for pixels in the atmosphere band outside the disc. */
  halo: Float32Array
}

/** Precompute everything that does not depend on the spin angle. */
export function buildGlobeGeometry(size: number): GlobeGeometry {
  const S = Math.max(8, Math.round(size))
  const R = S * 0.395
  const c = S / 2 - 0.5
  const haloOut = 1.26

  const indices: number[] = []
  const latIdx: number[] = []
  const cx: number[] = []
  const cz: number[] = []
  const wx: number[] = []
  const wy: number[] = []
  const shade: number[] = []
  const rim: number[] = []
  const glint: number[] = []
  const halo: number[] = []

  const pushDisc = (i: number, row: number, ax: number, az: number, ay: number, sh: number, rm: number, gl: number) => {
    indices.push(i)
    latIdx.push(row)
    cx.push(ax)
    cz.push(az)
    wx.push(ax)
    wy.push(ay)
    shade.push(sh)
    rim.push(rm)
    glint.push(gl)
    halo.push(0)
  }
  const pushHalo = (i: number, h: number) => {
    indices.push(i)
    latIdx.push(-1)
    cx.push(0)
    cz.push(0)
    wx.push(0)
    wy.push(0)
    shade.push(0)
    rim.push(0)
    glint.push(0)
    halo.push(h)
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x - c) / R
      const ny = (y - c) / R
      const r2 = nx * nx + ny * ny
      if (r2 > haloOut * haloOut) continue
      const i = y * S + x
      if (r2 > 1) {
        pushHalo(i, Math.pow(clamp(1 - (Math.sqrt(r2) - 1) / (haloOut - 1)), 2.2))
        continue
      }
      const z = Math.sqrt(Math.max(0, 1 - r2))
      const py = -ny // canvas y grows downwards
      // w = Rz(-tilt) · c ; the spin about the tilted axis is applied per frame
      const ax = nx * COS_T + py * SIN_T
      const ay = -nx * SIN_T + py * COS_T
      const lat = Math.asin(clamp(ay, -1, 1))
      const ndl = nx * SUN[0] + py * SUN[1] + z * SUN[2]
      const spec = Math.max(0, nx * HALF[0] + py * HALF[1] + z * HALF[2])
      pushDisc(
        i,
        clamp(Math.floor((Math.PI / 2 - lat) * (MASK_H / Math.PI)), 0, MASK_H - 1),
        ax,
        z,
        ay,
        0.1 + 1.02 * Math.max(0, ndl) + 0.22 * clamp((ndl + 0.42) * 1.6, 0, 1),
        Math.pow(1 - z, 3.1),
        Math.pow(spec, 46),
      )
    }
  }

  return {
    size: S,
    indices: Int32Array.from(indices),
    latIdx: Int16Array.from(latIdx),
    cx: Float32Array.from(cx),
    cz: Float32Array.from(cz),
    wx: Float32Array.from(wx),
    wy: Float32Array.from(wy),
    shade: Float32Array.from(shade),
    rim: Float32Array.from(rim),
    glint: Float32Array.from(glint),
    halo: Float32Array.from(halo),
  }
}

export interface PaintOptions {
  /** Spin angle in degrees. */
  spin: number
  /** Normalised climate value in [0,1]: 0 = cold end of the record, 1 = warm end. */
  t: number
  /** Live audio level in [0,1]; brightens the limb and the atmosphere. */
  level?: number
  /** Land mask; when absent a procedural stand-in is used so the mark is never blank. */
  mask?: Uint8Array | null
  highContrast?: boolean
}

/**
 * Paint one frame into an RGBA buffer (`ImageData.data`). Returns the mean disc colour and
 * the land fraction — handy for tests and for debugging the palette.
 */
export function paintGlobe(
  geo: GlobeGeometry,
  data: Uint8ClampedArray,
  opts: PaintOptions,
): { meanR: number; meanG: number; meanB: number; landFraction: number; painted: number } {
  const level = clamp(opts.level ?? 0)
  const t = clamp(opts.t)
  const warm = sampleColormap('rdbu', t)
  const atmo = opts.highContrast ? [150, 240, 255] : [96 + warm[0] * 0.35, 190 + warm[1] * 0.16, 255]

  const oc = [10 + warm[0] * 0.42, 24 + warm[1] * 0.4, 58 + warm[2] * 0.34]
  const ld = [118 + warm[0] * 0.42, 128 + warm[1] * 0.3, 140 + warm[2] * 0.26]
  const ic = [214 + warm[0] * 0.1, 232 + warm[1] * 0.06, 244]
  const haloBoost = 0.5 + level * 0.9

  const cosS = Math.cos(opts.spin / RAD2DEG)
  const sinS = Math.sin(opts.spin / RAD2DEG)
  const mask = opts.mask ?? null
  const n = geo.indices.length

  data.fill(0)
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let disc = 0
  let land = 0

  for (let k = 0; k < n; k++) {
    const p = geo.indices[k] * 4
    const h = geo.halo[k]
    if (h > 0) {
      data[p] = atmo[0]
      data[p + 1] = atmo[1]
      data[p + 2] = atmo[2]
      data[p + 3] = clamp(h * haloBoost * 150, 0, 200)
      continue
    }
    const ax = geo.cx[k]
    const az = geo.cz[k]
    const x2 = ax * cosS - az * sinS
    const z2 = ax * sinS + az * cosS
    const lat = geo.latIdx[k]
    let cls: number
    if (mask) {
      const lon = Math.atan2(x2, z2) * RAD2DEG
      let lonIdx = (Math.round(lon) + 180) % MASK_W
      if (lonIdx < 0) lonIdx += MASK_W
      cls = mask[lat * MASK_W + lonIdx]
    } else {
      // procedural stand-in until the texture-derived mask has loaded
      const f = fbm3(geo.wx[k] * 1.7, geo.wy[k] * 1.7, z2 * 1.7)
      const absLat = Math.abs(lat - MASK_H / 2) * (180 / MASK_H)
      cls = absLat > 74 ? ICE : f > 0.045 ? LAND : 0
    }
    const base = cls === ICE ? ic : cls === LAND ? ld : oc
    const sh = geo.shade[k]
    let r = base[0] * sh
    let g = base[1] * sh
    let b = base[2] * sh
    if (cls !== LAND) {
      const gl = geo.glint[k] * (cls === ICE ? 0.4 : 1)
      r += 250 * gl
      g += 244 * gl
      b += 232 * gl
    }
    const rm = geo.rim[k] * (0.34 + level * 0.5)
    r += atmo[0] * rm
    g += atmo[1] * rm
    b += atmo[2] * rm
    data[p] = r > 255 ? 255 : r
    data[p + 1] = g > 255 ? 255 : g
    data[p + 2] = b > 255 ? 255 : b
    data[p + 3] = 255
    sumR += data[p]
    sumG += data[p + 1]
    sumB += data[p + 2]
    disc++
    if (cls !== 0) land++
  }

  return {
    meanR: disc ? sumR / disc : 0,
    meanG: disc ? sumG / disc : 0,
    meanB: disc ? sumB / disc : 0,
    landFraction: disc ? land / disc : 0,
    painted: disc,
  }
}

/** Map a value inside a record's extent onto the mark's cold→warm ramp. */
export function anomalyT(value: number, min: number, max: number): number {
  return max > min ? clamp(invLerp(min, max, value)) : 0.5
}
