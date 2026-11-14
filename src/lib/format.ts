/** Formatting helpers for readouts, ARIA labels and spoken text. */

export const fmt = (v: number, digits = 2): string =>
  Number.isFinite(v)
    ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—'

export const fmtSigned = (v: number, digits = 2): string => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), digits)}`

export const fmtYear = (year: number): string => {
  const y = Math.floor(year)
  const frac = year - y
  if (frac < 0.001) return String(y)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Math.min(11, Math.floor(frac * 12))]} ${y}`
}

export const fmtClock = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export const latLabel = (lat: number): string =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`

export const lonLabel = (lon: number): string =>
  `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`

/**
 * Turn written text into something a speech synthesiser reads naturally:
 * "424.6 ppm" → "424.6 parts per million", "+1.28 °C" → "plus 1.28 degrees Celsius".
 */
export function toSpoken(text: string): string {
  return text
    .replace(/°C/g, ' degrees Celsius')
    .replace(/°F/g, ' degrees Fahrenheit')
    .replace(/km²/g, ' square kilometres')
    .replace(/km\^2/g, ' square kilometres')
    .replace(/\bppm\b/g, ' parts per million')
    .replace(/\bGtC\b/g, ' gigatonnes of carbon')
    .replace(/\bGtCO2\b/g, ' gigatonnes of carbon dioxide')
    .replace(/\bZJ\b/g, ' zettajoules')
    .replace(/\bmm\b/g, ' millimetres')
    .replace(/CO₂|CO2/g, ' carbon dioxide')
    .replace(/CH₄|CH4/g, ' methane')
    .replace(/H₂O/g, ' water')
    .replace(/\bNASA\b/g, 'NASA')
    .replace(/\bEIC\b/g, 'Earth Information Center')
    .replace(/\bNSIDC\b/g, 'National Snow and Ice Data Center')
    .replace(/\bNOAA\b/g, 'NOAA')
    .replace(/\bIPCC\b/g, 'I P C C')
    .replace(/\bpH\b/g, 'pH')
    .replace(/\+/g, 'plus ')
    .replace(/−/g, 'minus ')
    .replace(/–/g, ' to ')
    .replace(/→/g, ' to ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export const pluralise = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
