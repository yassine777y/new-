/** Small math + signal toolkit shared by the sonification engine and the visual layers. */

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : clamp((v - a) / (b - a)))

export const mapRange = (v: number, inMin: number, inMax: number, outMin: number, outMax: number): number =>
  lerp(outMin, outMax, invLerp(inMin, inMax, v))

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6))
  return t * t * (3 - 2 * t)
}

/** Exponential smoothing helper for frame-to-frame parameter glides. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))

export const deg2rad = (d: number): number => (d * Math.PI) / 180

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export const stddev = (xs: number[]): number => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

export const minMax = (xs: number[]): [number, number] => {
  let lo = Infinity
  let hi = -Infinity
  for (const x of xs) {
    if (x < lo) lo = x
    if (x > hi) hi = x
  }
  return [lo, hi]
}

/** Moving average with a centred window — used to smooth noisy annual series. */
export function movingAverage(xs: number[], window: number): number[] {
  if (window <= 1) return xs.slice()
  const half = Math.floor(window / 2)
  const out: number[] = new Array(xs.length)
  for (let i = 0; i < xs.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(xs.length - 1, i + half); j++) {
      sum += xs[j]
      n++
    }
    out[i] = sum / n
  }
  return out
}

/** Central difference derivative (units per year) of evenly spaced samples. */
export function derivative(xs: number[], stepYears: number): number[] {
  const out: number[] = new Array(xs.length).fill(0)
  for (let i = 0; i < xs.length; i++) {
    const a = xs[Math.max(0, i - 1)]
    const b = xs[Math.min(xs.length - 1, i + 1)]
    const dt = stepYears * (Math.min(xs.length - 1, i + 1) - Math.max(0, i - 1)) || 1
    out[i] = (b - a) / dt
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Deterministic noise — identical on every machine, no RNG seeding
 * needed, and cheap enough to evaluate per pixel of the world map.
 * ------------------------------------------------------------------ */

function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

/** Smooth 3D value noise in [-1, 1]. */
export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const c000 = hash3(xi, yi, zi)
  const c100 = hash3(xi + 1, yi, zi)
  const c010 = hash3(xi, yi + 1, zi)
  const c110 = hash3(xi + 1, yi + 1, zi)
  const c001 = hash3(xi, yi, zi + 1)
  const c101 = hash3(xi + 1, yi, zi + 1)
  const c011 = hash3(xi, yi + 1, zi + 1)
  const c111 = hash3(xi + 1, yi + 1, zi + 1)
  const x00 = lerp(c000, c100, u)
  const x10 = lerp(c010, c110, u)
  const x01 = lerp(c001, c101, u)
  const x11 = lerp(c011, c111, u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1
}

/** Fractal brownian motion — 3 octaves of value noise. */
export function fbm3(x: number, y: number, z: number, octaves = 3, lacunarity = 2.03, gain = 0.5): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** Gaussian bump centred on (clat, clon) in degrees — used for emission plumes. */
export function geoGauss(lat: number, lon: number, clat: number, clon: number, sigmaDeg: number): number {
  let dLon = lon - clon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  const dLat = lat - clat
  const cosLat = Math.cos(deg2rad(clat))
  const x = dLon * cosLat
  const d2 = x * x + dLat * dLat
  return Math.exp(-d2 / (2 * sigmaDeg * sigmaDeg))
}

/** Linear interpolation over an irregularly spaced {t, v} series. */
export function sampleSeries(points: { t: number; v: number }[], t: number): number {
  const n = points.length
  if (n === 0) return 0
  if (t <= points[0].t) return points[0].v
  if (t >= points[n - 1].t) return points[n - 1].v
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  return lerp(a.v, b.v, invLerp(a.t, b.t, t))
}
