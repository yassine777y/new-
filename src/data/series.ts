/**
 * Time series used by the jukebox.
 *
 * Every array below is a compact copy of a published record, rounded for
 * distribution inside the app. Full citations (publisher, DOI / URL, licence and
 * exactly what was copied) live in `sources.ts` and are surfaced in the UI on the
 * Sources panel and next to every chart. Nothing here is invented:
 *   • temperature  — NASA GISS GISTEMP v4 annual land-ocean index (base 1951-1980)
 *   • co2          — NOAA/Scripps Mauna Loa annual means 1959+, ice-core anchors before
 *   • emissions    — Global Carbon Budget fossil CO2 (GtCO2/yr), 5-year anchors
 *   • seaIce       — NSIDC Sea Ice Index v3, September Arctic extent (million km2)
 *   • seaLevel     — reconstruction 1900-1992 + satellite altimetry 1993-2024 (mm vs 1900)
 *   • oceanHeat    — IPCC AR6 cumulative ocean heat gain 0-2000 m (zettajoules since 1971)
 *
 * Series stored as anchors are interpolated for display and clearly labelled as
 * "interpolated from published anchors" wherever they appear.
 */

import type { DataPoint } from './types'

export const zip = (years: number[], values: number[]): DataPoint[] =>
  values.map((v, i) => ({ t: years[i], v }))

export const seq = (from: number, to: number, step = 1): number[] => {
  const out: number[] = []
  for (let t = from; t <= to + 1e-9; t += step) out.push(Number(t.toFixed(4)))
  return out
}

/** Linear interpolation across irregular anchors → dense series. */
export function densify(anchors: Array<[number, number]>, stepYears = 0.5): DataPoint[] {
  const out: DataPoint[] = []
  const [t0] = anchors[0]
  const [t1] = anchors[anchors.length - 1]
  for (let t = t0; t <= t1 + 1e-9; t += stepYears) {
    let i = 0
    while (i < anchors.length - 2 && anchors[i + 1][0] < t) i++
    const a = anchors[i]
    const b = anchors[i + 1]
    const f = (t - a[0]) / (b[0] - a[0] || 1)
    out.push({ t: Number(t.toFixed(3)), v: a[1] + (b[1] - a[1]) * f })
  }
  return out
}

/* ---------------------------------------------------------------- *
 * 1 · Global temperature anomaly (GISTEMP v4, °C vs 1951-1980)
 * ---------------------------------------------------------------- */
const TEMP_YEARS = seq(1880, 2024)
const TEMP_VALUES = [
  -0.16, -0.08, -0.1, -0.16, -0.27, -0.32, -0.3, -0.34, -0.16, -0.09, -0.34, -0.21, -0.26, -0.3, -0.29, -0.22,
  -0.1, -0.11, -0.26, -0.17, -0.08, -0.15, -0.27, -0.37, -0.46, -0.27, -0.21, -0.38, -0.43, -0.47, -0.43, -0.44,
  -0.35, -0.33, -0.15, -0.1, -0.32, -0.43, -0.29, -0.27, -0.24, -0.18, -0.27, -0.25, -0.26, -0.21, -0.1, -0.17,
  -0.18, -0.33, -0.13, -0.06, -0.11, -0.24, -0.13, -0.17, -0.11, -0.01, -0.02, -0.02, 0.13, 0.19, 0.07, 0.09, 0.2,
  0.09, -0.07, -0.03, -0.11, -0.11, -0.17, -0.07, 0.01, 0.08, -0.13, -0.14, -0.19, 0.05, 0.06, 0.03, -0.03, 0.06,
  0.03, 0.05, -0.2, -0.11, -0.06, -0.02, -0.08, 0.05, 0.03, -0.08, 0.01, 0.16, -0.07, -0.01, -0.1, 0.18, 0.07,
  0.16, 0.26, 0.32, 0.14, 0.31, 0.16, 0.12, 0.18, 0.32, 0.39, 0.27, 0.45, 0.41, 0.22, 0.23, 0.31, 0.45, 0.33,
  0.46, 0.61, 0.38, 0.39, 0.53, 0.63, 0.62, 0.54, 0.68, 0.64, 0.66, 0.54, 0.65, 0.72, 0.61, 0.64, 0.67, 0.75, 0.9,
  1.01, 0.92, 0.85, 0.98, 1.02, 0.85, 0.89, 1.17, 1.28,
]
export const temperatureSeries = zip(TEMP_YEARS, TEMP_VALUES)

/* ---------------------------------------------------------------- *
 * 2 · Atmospheric CO2 (ppm)
 *    ice-core / early-instrument anchors 1880-1958, Mauna Loa 1959+
 * ---------------------------------------------------------------- */
const CO2_ANCHORS: Array<[number, number]> = [
  [1880, 290.7],
  [1890, 294.2],
  [1900, 295.8],
  [1910, 299.5],
  [1920, 303.0],
  [1930, 306.8],
  [1940, 310.6],
  [1950, 311.3],
  [1958, 315.3],
]
const MAUNA_LOA: Array<[number, number]> = [
  [1959, 315.98],
  [1960, 316.91],
  [1961, 317.64],
  [1962, 318.45],
  [1963, 318.99],
  [1964, 319.62],
  [1965, 320.04],
  [1966, 321.37],
  [1967, 322.18],
  [1968, 323.05],
  [1969, 324.62],
  [1970, 325.68],
  [1971, 326.32],
  [1972, 327.46],
  [1973, 329.68],
  [1974, 330.19],
  [1975, 331.13],
  [1976, 332.03],
  [1977, 333.84],
  [1978, 335.41],
  [1979, 336.84],
  [1980, 338.76],
  [1981, 340.12],
  [1982, 341.48],
  [1983, 343.15],
  [1984, 344.87],
  [1985, 346.35],
  [1986, 347.61],
  [1987, 349.31],
  [1988, 351.69],
  [1989, 353.2],
  [1990, 354.45],
  [1991, 355.7],
  [1992, 356.54],
  [1993, 357.21],
  [1994, 358.96],
  [1995, 360.97],
  [1996, 362.74],
  [1997, 363.88],
  [1998, 366.84],
  [1999, 368.54],
  [2000, 369.71],
  [2001, 371.32],
  [2002, 373.45],
  [2003, 375.98],
  [2004, 377.7],
  [2005, 379.98],
  [2006, 382.09],
  [2007, 384.02],
  [2008, 385.83],
  [2009, 387.64],
  [2010, 390.1],
  [2011, 391.85],
  [2012, 394.06],
  [2013, 396.74],
  [2014, 398.87],
  [2015, 401.01],
  [2016, 404.41],
  [2017, 406.76],
  [2018, 408.72],
  [2019, 411.66],
  [2020, 414.24],
  [2021, 416.45],
  [2022, 418.53],
  [2023, 421.08],
  [2024, 424.61],
]
export const co2Series: DataPoint[] = [...densify(CO2_ANCHORS, 1), ...zip(MAUNA_LOA.map((a) => a[0]), MAUNA_LOA.map((a) => a[1]))]

/* ---------------------------------------------------------------- *
 * 3 · Fossil CO2 emissions (GtCO2/yr) — 5-year anchors, interpolated
 * ---------------------------------------------------------------- */
export const emissionsSeries = densify(
  [
    [1900, 2.0],
    [1905, 2.3],
    [1910, 2.6],
    [1915, 2.9],
    [1920, 3.4],
    [1925, 3.5],
    [1930, 3.7],
    [1935, 4.2],
    [1940, 4.8],
    [1945, 4.4],
    [1950, 6.0],
    [1955, 7.4],
    [1960, 9.4],
    [1965, 11.9],
    [1970, 15.0],
    [1975, 16.6],
    [1980, 19.5],
    [1985, 20.5],
    [1990, 22.5],
    [1995, 23.5],
    [2000, 24.8],
    [2005, 29.0],
    [2010, 33.2],
    [2015, 35.6],
    [2019, 36.9],
    [2020, 34.9],
    [2021, 36.3],
    [2022, 36.8],
    [2023, 37.4],
    [2024, 37.7],
  ],
  0.5,
)

/* ---------------------------------------------------------------- *
 * 4 · Arctic sea ice — September extent (million km2, NSIDC)
 * ---------------------------------------------------------------- */
const SEAICE_VALUES = [
  7.05, 7.67, 7.14, 7.3, 7.39, 6.81, 6.7, 7.24, 7.14, 7.37, 7.01, 6.24, 6.55, 7.3, 6.47, 7.11, 6.13, 7.68, 6.74,
  6.56, 6.13, 6.32, 6.75, 5.96, 6.15, 6.05, 5.57, 5.92, 4.32, 4.73, 5.39, 4.93, 4.63, 3.63, 5.35, 5.28, 4.63, 4.54,
  4.83, 4.79, 4.32, 3.92, 4.92, 4.87, 4.37, 4.28,
]
export const seaIceSeries = zip(seq(1979, 2024), SEAICE_VALUES)

/* ---------------------------------------------------------------- *
 * 5 · Global mean sea level (mm above the 1900 level)
 * ---------------------------------------------------------------- */
export const seaLevelSeries = densify(
  [
    [1900, 0],
    [1910, 12],
    [1920, 24],
    [1930, 36],
    [1940, 48],
    [1950, 60],
    [1960, 70],
    [1970, 81],
    [1980, 92],
    [1990, 105],
    [1993, 110],
    [1995, 117],
    [2000, 132],
    [2005, 148],
    [2010, 165],
    [2015, 185],
    [2020, 208],
    [2022, 216],
    [2024, 225],
  ],
  0.25,
)

/* ---------------------------------------------------------------- *
 * 6 · Ocean heat content — cumulative gain 0-2000 m (zettajoules since 1971)
 * ---------------------------------------------------------------- */
export const oceanHeatSeries = densify(
  [
    [1971, 0],
    [1975, 20],
    [1980, 42],
    [1985, 68],
    [1990, 100],
    [1995, 138],
    [2000, 180],
    [2005, 228],
    [2010, 285],
    [2015, 348],
    [2018, 396],
    [2020, 420],
    [2022, 445],
    [2024, 470],
  ],
  0.5,
)
