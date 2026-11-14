/**
 * Spatial fields — the modelled "EIC-style frame" for each track.
 *
 * These are *not* pixel copies of a NASA grid: they are smooth, physically-motivated
 * reconstructions built from the published characteristics of each record (Arctic
 * amplification, the CO₂ inter-hemispheric gradient, the regional sea-ice edge,
 * emission plume geography …) so that the same dataset drives the time series,
 * the 2D map, the 3D globe and the sonification without shipping gigabytes of
 * gridded data. Every panel that uses them says so, and links to the real product
 * in Sources.
 */

import { clamp, deg2rad, fbm3, geoGauss, invLerp, lerp, smoothstep } from './math'
import { landFraction } from './landmask'
import type { SpatialFieldKind } from '@/data/types'

/** Anisotropic geographic bump. */
function bump(lat: number, lon: number, clat: number, clon: number, sigLat: number, sigLon: number): number {
  let dLon = lon - clon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  dLon *= Math.cos(deg2rad(clat))
  const dLat = lat - clat
  return Math.exp(-(dLat * dLat) / (2 * sigLat * sigLat) - (dLon * dLon) / (2 * sigLon * sigLon))
}

function lonDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

export interface EmissionHotspot {
  name: string
  lat: number
  lon: number
  sigma: number
  /** Relative share of global fossil emissions at 1900 / 1970 / 2024. */
  shares: [number, number, number]
}

/** Centroids and shares behind the emissions plume field (Global Carbon Budget regions). */
export const EMISSION_HOTSPOTS: EmissionHotspot[] = [
  { name: 'United States', lat: 39.5, lon: -89, sigma: 11, shares: [0.3, 0.28, 0.13] },
  { name: 'Europe', lat: 50.5, lon: 11, sigma: 10, shares: [0.28, 0.22, 0.08] },
  { name: 'China', lat: 34, lon: 108, sigma: 12, shares: [0.02, 0.07, 0.31] },
  { name: 'Russia', lat: 55, lon: 45, sigma: 11, shares: [0.06, 0.17, 0.05] },
  { name: 'India', lat: 22, lon: 79, sigma: 9, shares: [0.01, 0.02, 0.07] },
  { name: 'Japan', lat: 36.5, lon: 138, sigma: 5, shares: [0.01, 0.05, 0.03] },
  { name: 'Middle East', lat: 26, lon: 46, sigma: 8, shares: [0.005, 0.02, 0.04] },
  { name: 'Southeast Asia', lat: 2, lon: 112, sigma: 10, shares: [0.005, 0.012, 0.035] },
  { name: 'Korea', lat: 36.5, lon: 127.8, sigma: 4, shares: [0.001, 0.01, 0.02] },
  { name: 'Canada', lat: 52, lon: -100, sigma: 9, shares: [0.02, 0.025, 0.015] },
  { name: 'Brazil', lat: -16, lon: -50, sigma: 9, shares: [0.004, 0.01, 0.015] },
  { name: 'South Africa', lat: -27, lon: 27, sigma: 6, shares: [0.008, 0.02, 0.02] },
  { name: 'Australia', lat: -26, lon: 134, sigma: 7, shares: [0.008, 0.012, 0.012] },
  { name: 'Mexico', lat: 23, lon: -102, sigma: 6, shares: [0.004, 0.012, 0.015] },
  { name: 'UK & Ireland', lat: 54, lon: -2, sigma: 4, shares: [0.06, 0.03, 0.008] },
  { name: 'Indonesia', lat: -2, lon: 118, sigma: 7, shares: [0.002, 0.006, 0.018] },
]

/** Regional emission shares at a given year (normalised so they sum to 1). */
export function hotspotWeights(year: number): number[] {
  const f = year < 1970 ? invLerp(1900, 1970, year) : invLerp(1970, 2024, year)
  const i = year < 1970 ? 0 : 1
  const raw = EMISSION_HOTSPOTS.map((h) => Math.max(0.0005, lerp(h.shares[i], h.shares[i + 1], f)))
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map((r) => r / sum)
}

export interface FieldSample {
  /** Colour-map position, 0..1. */
  t: number
  /** Opacity / presence, 0..1 — lets fields hide where they do not apply (e.g. ice over the tropics). */
  alpha: number
}

export interface FieldContext {
  year: number
  /** Raw global value of the series at this year. */
  value: number
  /** Value normalised into the track domain, 0..1. */
  norm: number
  /** Change per year at this year. */
  delta: number
}

export function fieldValue(kind: SpatialFieldKind, lat: number, lon: number, ctx: FieldContext): FieldSample {
  switch (kind) {
    case 'temperature':
      return temperatureField(lat, lon, ctx)
    case 'co2':
      return co2Field(lat, lon, ctx)
    case 'emissions':
      return emissionsField(lat, lon, ctx)
    case 'seaice':
      return seaIceField(lat, lon, ctx)
    case 'sealevel':
      return seaLevelField(lat, lon, ctx)
    case 'oceanheat':
      return oceanHeatField(lat, lon, ctx)
  }
}

/* ---------------- temperature ---------------- */
function temperatureField(lat: number, lon: number, ctx: FieldContext): FieldSample {
  const absLat = Math.abs(lat)
  const polar = smoothstep(50, 84, absLat)
  const amp = 1 + 2.9 * polar * (lat > 0 ? 1 : 0.82) // Arctic warms faster than Antarctic
  const southOcean = 1 - 0.42 * smoothstep(42, 62, -lat)
  const land = landFraction(lat, lon, 2)
  const landFactor = lerp(0.84, 1.45, land)
  const regional = 0.35 * fbm3(lon * 0.021, lat * 0.021, ctx.year * 0.22, 3)
  const tropical = smoothstep(18, 0, absLat) * 0.35 * Math.sin(deg2rad(lon - 170) * 2 + ctx.year * 1.7)
  const anomaly = ctx.value * amp * southOcean * landFactor + regional + tropical
  return { t: clamp(0.5 + anomaly / 3.9), alpha: 1 }
}

/* ---------------- CO2 ---------------- */
function co2Field(lat: number, lon: number, ctx: FieldContext): FieldSample {
  const gradient = 1 + 0.05 * Math.sin(deg2rad(lat)) // north carries more CO2
  const season = 1 + 0.012 * Math.cos((ctx.year % 1) * Math.PI * 2) * Math.sin(deg2rad(lat))
  const weights = hotspotWeights(ctx.year)
  let plume = 0
  for (let i = 0; i < EMISSION_HOTSPOTS.length; i++) {
    const h = EMISSION_HOTSPOTS[i]
    plume += weights[i] * geoGauss(lat, lon, h.lat, h.lon, h.sigma * 1.5)
  }
  const sink = -0.035 * smoothstep(35, 60, -lat) // Southern Ocean uptake
  const local = ctx.value * (gradient + sink) * season + plume * 26 * (0.35 + ctx.norm)
  return { t: clamp(invLerp(286, 452, local)), alpha: 1 }
}

/* ---------------- emissions ---------------- */
function emissionsField(lat: number, lon: number, ctx: FieldContext): FieldSample {
  const weights = hotspotWeights(ctx.year)
  let intensity = 0
  for (let i = 0; i < EMISSION_HOTSPOTS.length; i++) {
    const h = EMISSION_HOTSPOTS[i]
    intensity += weights[i] * geoGauss(lat, lon, h.lat, h.lon, h.sigma)
  }
  const local = intensity * ctx.value
  const t = clamp(Math.sqrt(local / 11))
  return { t, alpha: clamp(0.25 + t * 1.4) }
}

/* ---------------- sea ice ---------------- */
function seaIceField(lat: number, lon: number, ctx: FieldContext): FieldSample {
  const progress = invLerp(1979, 2024, ctx.year)
  // Observed September ice edge retreats roughly poleward as extent falls.
  const edge = lerp(71.5, 62.5, progress) - (ctx.value - 5.5) * 2.4
  const regional =
    -7.5 * Math.exp(-((lonDist(lon, 50) / 42) ** 2)) -
    5 * Math.exp(-((lonDist(lon, 125) / 38) ** 2)) +
    5 * Math.exp(-((lonDist(lon, -82) / 32) ** 2)) +
    2.5 * Math.exp(-((lonDist(lon, -35) / 26) ** 2))
  const wobble = 2.4 * fbm3(lon * 0.03, 12.5, ctx.year * 0.5, 2)
  const edgeLat = clamp(edge + regional + wobble, 55, 84)
  const north = smoothstep(edgeLat - 3.5, edgeLat + 3.5, lat)
  // Antarctic ring (September is its maximum there) — gentler trend.
  const sEdge = lerp(-56.5, -58.5, progress)
  const south = smoothstep(sEdge, -70, lat)
  const conc = Math.max(north, south * 0.92)
  return { t: clamp(conc), alpha: clamp(conc * 1.5) }
}

/* ---------------- sea level ---------------- */
function seaLevelField(lat: number, lon: number, ctx: FieldContext): FieldSample {
  const westPacific = bump(lat, lon, 6, 138, 16, 22) * 0.5
  const usEast = bump(lat, lon, 36, -72, 12, 10) * 0.34
  const indian = bump(lat, lon, -8, 82, 16, 20) * 0.24
  const eastPacific = -bump(lat, lon, 4, -110, 18, 18) * 0.26
  const southern = -bump(lat, lon, -52, 0, 12, 60) * 0.12
  const noise = 0.1 * fbm3(lon * 0.017, lat * 0.017, ctx.year * 0.14, 3)
  const regional = 1 + westPacific + usEast + indian + eastPacific + southern + noise
  const local = Math.max(0, ctx.value * regional)
  return { t: clamp(local / 290), alpha: clamp(0.35 + local / 200) }
}

/* ---------------- ocean heat ---------------- */
function oceanHeatField(lat: number, lon: number, ctx: FieldContext): FieldSample {
  const southernOcean = bump(lat, lon, -54, 0, 11, 90) * 0.55
  const nAtlantic = bump(lat, lon, 44, -28, 16, 26) * 0.4
  const wbc = bump(lat, lon, 33, 140, 13, 16) * 0.34 + bump(lat, lon, 34, -72, 12, 12) * 0.26
  const eastPacific = -bump(lat, lon, 0, -115, 14, 16) * 0.22
  const land = landFraction(lat, lon, 2)
  const oceanOnly = 1 - 0.85 * land
  const noise = 0.12 * fbm3(lon * 0.02, lat * 0.02, ctx.year * 0.1, 3)
  const pattern = (1 + southernOcean + nAtlantic + wbc + eastPacific + noise) * oceanOnly
  const local = Math.max(0, ctx.value * pattern)
  return { t: clamp(local / 620), alpha: clamp(0.3 + local / 400) * oceanOnly }
}

/* ---------------- shared helpers ---------------- */

/** Grid resolution used to rasterise a field into a frame. */
export const FIELD_GRID = { w: 288, h: 144 } // 1.25° per cell

/**
 * Rasterise a field into RGBA pixels ready for canvas drawImage or a three.js texture.
 * `colormap` maps the field value, `alphaScale` keeps sparse fields (ice, plumes) legible
 * over the base map.
 */
export function rasteriseField(
  kind: SpatialFieldKind,
  year: number,
  value: number,
  norm: number,
  delta: number,
  colormap: (t: number) => [number, number, number],
  alphaScale = 0.82,
): ImageData {
  const { w, h } = FIELD_GRID
  const out = new ImageData(w, h)
  const ctx: FieldContext = { year, value, norm, delta }
  const data = out.data
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180
    for (let x = 0; x < w; x++) {
      const lon = -180 + ((x + 0.5) / w) * 360
      const s = fieldValue(kind, lat, lon, ctx)
      const [r, g, b] = colormap(s.t)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = Math.round(clamp(s.alpha * alphaScale) * 255)
    }
  }
  return out
}
