/**
 * The jukebox itself: six Earth "vital signs", each with a dataset, a spatial field,
 * a colour ramp, a set of annotated events and a sonification preset.
 */

import type { DataPoint, Track } from './types'
import {
  co2Series,
  emissionsSeries,
  oceanHeatSeries,
  seaIceSeries,
  seaLevelSeries,
  temperatureSeries,
} from './series'
import { fmt, fmtSigned } from '@/lib/format'

const extent = (series: DataPoint[]): [number, number] => {
  let lo = Infinity
  let hi = -Infinity
  for (const p of series) {
    if (p.v < lo) lo = p.v
    if (p.v > hi) hi = p.v
  }
  return [lo, hi]
}

const band = (t: number, labels: string[]): string => labels[Math.min(labels.length - 1, Math.max(0, Math.floor(t * labels.length)))]

/* ------------------------------------------------------------------ */

export const temperature: Track = {
  id: 'temperature',
  title: 'A Planet Running a Fever',
  shortTitle: 'Temperature',
  kicker: 'NASA GISTEMP v4 · 1880–2024',
  tagline: 'Global land + ocean temperature anomaly',
  description:
    'One hundred and forty-five years of the planet’s surface temperature, measured against the 1951–1980 average. The record is quiet for eighty years, then it starts to climb — and the climb steepens. Sonified, the twentieth century sounds like a held breath, and the last four decades like a string section slowly transposing upward until the room is uncomfortable.',
  unit: '°C',
  unitSpoken: 'degrees Celsius',
  digits: 2,
  color: '#ff6b57',
  colorSoft: 'rgba(255,107,87,0.16)',
  glyph: '▲',
  series: temperatureSeries,
  yearSpan: [1880, 2024],
  domain: [-0.55, 1.35],
  colormap: 'rdbu',
  divergeAt: 0,
  spatial: 'temperature',
  spatialNote:
    'Modelled field: the observed global anomaly is distributed with published Arctic amplification (≈3–4× the global mean above 65°N), a land-vs-ocean contrast derived from the Blue Marble land mask, and smooth regional noise. See Sources for the original gridded product.',
  events: [
    { year: 1883.6, title: 'Krakatoa erupts', detail: 'Aerosols briefly cool the planet; the record dips for two years.', kind: 'eruption', lat: -6.1, lon: 105.4, place: 'Krakatoa, Indonesia' },
    { year: 1912.4, title: 'Novarupta erupts', detail: 'The largest eruption of the 20th century; 1912–1913 stay cold.', kind: 'eruption', lat: 58.3, lon: -155.2, place: 'Alaska, USA' },
    { year: 1963.2, title: 'Mount Agung erupts', detail: 'A sharp −0.2 °C setback in the middle of the century.', kind: 'eruption', lat: -8.3, lon: 115.5, place: 'Bali, Indonesia' },
    { year: 1982.3, title: 'El Chichón erupts', detail: 'Stratospheric sulfate dims the following two years.', kind: 'eruption', lat: 17.4, lon: -93.2, place: 'Chiapas, Mexico' },
    { year: 1991.4, title: 'Mount Pinatubo erupts', detail: 'The biggest volcanic cooling of the satellite era: about −0.3 °C for two years.', kind: 'eruption', lat: 15.1, lon: 120.3, place: 'Luzon, Philippines' },
    { year: 1998, title: 'Super El Niño', detail: '1998 becomes the warmest year on record at the time (+0.61 °C).', kind: 'phenomenon' },
    { year: 2016, title: 'New record: +1.01 °C', detail: 'A strong El Niño pushes the annual mean above 1 °C for the first time.', kind: 'record' },
    { year: 2023, title: 'Record broken again: +1.17 °C', detail: 'WMO confirms 2023 as the warmest year in the instrumental record.', kind: 'record' },
    { year: 2024, title: 'First calendar year above 1.5 °C', detail: '+1.28 °C against the 1951–1980 base — about 1.55 °C above pre-industrial levels.', kind: 'record' },
  ],
  sonification: {
    scale: 'aeolian',
    rootMidi: 45,
    octaves: 3,
    bpm: [54, 94],
    timbre: 'pad',
    layers: { drone: true, melody: true, rhythm: false, shimmer: true, sub: true },
    reverb: 0.55,
    tension: 0.62,
    mood: 'A slow fever',
    rule: 'Anomaly → pitch height · warming rate → tempo and filter brightness · record years → a struck bell',
  },
  sources: ['gistemp', 'nasaSvs', 'wmo', 'sonificationHandbook'],
  stats: [
    { label: '1880 → 2024', value: '+1.44 °C' },
    { label: 'Warmest year', value: '2024 · +1.28 °C' },
    { label: 'Since 1980', value: '+0.23 °C / decade' },
  ],
  audioDescription:
    'A line chart of global temperature anomaly from 1880 to 2024. It hovers between minus nought point five and plus nought point two degrees Celsius until about 1975, then rises steadily, accelerating after 2000 and reaching plus one point two eight degrees Celsius in 2024. Volcanic eruptions in 1963, 1982 and 1991 appear as short downward dips.',
  describe(year, value, delta) {
    const y = Math.floor(year)
    const trend = delta > 0.004 ? 'warming' : delta < -0.004 ? 'cooling' : 'holding steady'
    const level = band((value + 0.55) / 1.9, ['much colder than the 20th-century average', 'below average', 'near average', 'above average', 'far above average', 'in record territory'])
    return `In ${y}, the global temperature anomaly was ${fmtSigned(value)} °C — ${level}, ${trend} at about ${fmt(Math.abs(delta) * 10, 1)} °C per decade.`
  },
}

export const co2: Track = {
  id: 'co2',
  title: 'The Keeling Breath',
  shortTitle: 'CO₂',
  kicker: 'NOAA / Scripps · 1880–2024',
  tagline: 'Atmospheric carbon dioxide concentration',
  description:
    'Charles David Keeling began measuring CO₂ on Mauna Loa in 1958 and never stopped. Before that we reconstruct the air from bubbles trapped in Antarctic ice. The curve has no reversal in it — only a sawtooth of northern summers layered on a relentless climb from 290 parts per million to more than 424.',
  unit: 'ppm',
  unitSpoken: 'parts per million',
  digits: 1,
  color: '#ffb347',
  colorSoft: 'rgba(255,179,71,0.16)',
  glyph: '◍',
  series: co2Series,
  yearSpan: [1880, 2024],
  domain: [288, 428],
  colormap: 'carbon',
  spatial: 'co2',
  spatialNote:
    'Modelled field: a hemispheric gradient (the north carries more CO₂ than the south) plus emission plumes from the major industrial regions, following the inter-hemispheric difference reported by NOAA GML. Before 1958 values are ice-core reconstructions.',
  events: [
    { year: 1958.2, title: 'Keeling starts on Mauna Loa', detail: 'The continuous record begins at 315 ppm — the most important curve in climate science.', kind: 'instrument', lat: 19.5, lon: -155.6, place: 'Mauna Loa, Hawai‘i' },
    { year: 1988, title: 'IPCC founded', detail: 'The same year CO₂ passes 351 ppm, the world sets up its climate assessment body.', kind: 'policy' },
    { year: 1997.9, title: 'Kyoto Protocol', detail: 'CO₂ at 364 ppm. The first binding emissions treaty is adopted.', kind: 'policy' },
    { year: 2013.3, title: '400 ppm for the first time', detail: 'Mauna Loa records a daily mean above 400 ppm — a symbolic threshold.', kind: 'record' },
    { year: 2015.9, title: 'Paris Agreement', detail: 'Adopted at 401 ppm, aiming to hold warming well below 2 °C.', kind: 'policy' },
    { year: 2024, title: '424.6 ppm annual mean', detail: 'Growth now runs at about 2.6 ppm per year — six times the 1960s rate.', kind: 'record' },
  ],
  sonification: {
    scale: 'phrygian',
    rootMidi: 38,
    octaves: 2,
    bpm: [46, 108],
    timbre: 'drone',
    layers: { drone: true, melody: true, rhythm: true, shimmer: true, sub: true },
    reverb: 0.6,
    tension: 0.8,
    mood: 'An engine that never idles',
    rule: 'ppm → drone pitch and pulse rate · growth rate (ppm/yr) → percussion density · plume intensity → stereo width',
  },
  sources: ['noaaCo2', 'scrippsCo2', 'lawDome', 'sonificationHandbook'],
  stats: [
    { label: '1880 → 2024', value: '290.7 → 424.6 ppm' },
    { label: 'Growth rate', value: '+0.9 → +2.6 ppm/yr' },
    { label: 'Context', value: 'Above the 800,000-yr ice-core record' },
  ],
  audioDescription:
    'Atmospheric carbon dioxide rises monotonically from about 290 parts per million in 1880 to 424.6 parts per million in 2024. The slope roughly doubles after 1960. A seasonal cycle of about six parts per million is visible in the raw monthly data; this app shows annual means.',
  describe(year, value, delta) {
    const y = Math.floor(year)
    const growth = delta
    const pre = y < 1958 ? ' (ice-core reconstruction)' : ''
    return `In ${y}, atmospheric carbon dioxide was ${fmt(value, 1)} parts per million${pre}, growing at about ${fmt(growth, 2)} parts per million per year.`
  },
}

export const emissions: Track = {
  id: 'emissions',
  title: 'Combustion',
  shortTitle: 'Emissions',
  kicker: 'Global Carbon Budget · 1900–2024',
  tagline: 'Fossil CO₂ emissions per year',
  description:
    'Where the carbon actually leaves the ground. In 1900 the plumes sit over the coalfields of Britain, the Ruhr and Pennsylvania. By 2024 the brightest cells have moved to East and South Asia. Sonified as a machine rhythm: the beat rate is the global total, and each plume adds its own voice to the stereo field.',
  unit: 'GtCO₂/yr',
  unitSpoken: 'gigatonnes of carbon dioxide per year',
  digits: 1,
  color: '#a78bfa',
  colorSoft: 'rgba(167,139,250,0.16)',
  glyph: '⌁',
  series: emissionsSeries,
  yearSpan: [1900, 2024],
  domain: [0, 40],
  colormap: 'inferno',
  spatial: 'emissions',
  spatialNote:
    'Modelled field: regional shares from the Global Carbon Budget placed as Gaussian plumes at industrial centroids, interpolated across three anchor years (1900, 1970, 2024). The animation shows the geographic shift of emissions, not a 1-km inventory grid.',
  events: [
    { year: 1900, title: 'The coal century begins', detail: 'About 2 GtCO₂ per year, mostly from Britain, the United States and Germany.', kind: 'phenomenon' },
    { year: 1945, title: 'Post-war boom', detail: 'Emissions accelerate steeply through the 1950s and 60s on cheap oil.', kind: 'phenomenon' },
    { year: 1973.8, title: 'Oil crisis', detail: 'The first visible plateau in the growth curve.', kind: 'phenomenon' },
    { year: 1991.9, title: 'Soviet collapse', detail: 'A sharp drop in the former USSR’s output shows up as a dent in the global total.', kind: 'phenomenon' },
    { year: 2000, title: 'East Asian surge', detail: 'Rapid industrialisation lifts the global total by a third in a single decade.', kind: 'phenomenon' },
    { year: 2020.3, title: 'Pandemic dip', detail: 'Emissions fall about 5.4 % — the largest drop since the Second World War — then rebound.', kind: 'phenomenon', lat: 35, lon: 108, place: 'Global, led by East Asia' },
    { year: 2024, title: '37.7 GtCO₂', detail: 'A new record for fossil CO₂ emissions.', kind: 'record' },
  ],
  sonification: {
    scale: 'harmonicMinor',
    rootMidi: 40,
    octaves: 2,
    bpm: [70, 148],
    timbre: 'percussive',
    layers: { drone: true, melody: true, rhythm: true, shimmer: false, sub: true },
    reverb: 0.34,
    tension: 0.9,
    mood: 'Industrial',
    rule: 'Global total → beat rate · number of active plumes → voices in the pattern · plume longitude → stereo pan',
  },
  sources: ['globalCarbon', 'gcpRegional', 'ipccAr6'],
  stats: [
    { label: '1900 → 2024', value: '2.0 → 37.7 GtCO₂/yr' },
    { label: 'Factor', value: '≈ 19×' },
    { label: '2020 dip', value: '−5.4 %' },
  ],
  audioDescription:
    'Fossil carbon dioxide emissions rise from about 2 gigatonnes of CO₂ per year in 1900 to 37.7 in 2024. Growth is fastest between 1950 and 1980 and again between 2000 and 2010, with visible plateaus after the 1973 oil crisis and the 1991 Soviet collapse, and a short drop in 2020.',
  describe(year, value, delta) {
    const y = Math.floor(year)
    return `In ${y}, the world emitted about ${fmt(value, 1)} gigatonnes of carbon dioxide from fossil fuels, changing by ${fmtSigned(delta, 2)} per year at that point.`
  },
}

export const seaIce: Track = {
  id: 'seaice',
  title: 'The Thinning White',
  shortTitle: 'Sea Ice',
  kicker: 'NSIDC Sea Ice Index v3 · 1979–2024',
  tagline: 'Arctic sea ice extent, September minimum',
  description:
    'Every September the Arctic reaches its smallest ice cover of the year. Satellites have counted it since 1979. The number falls by about twelve per cent per decade — and the sound thins with it: a glass arpeggio that loses notes as the ice loses area, until the low years ring almost alone.',
  unit: 'M km²',
  unitSpoken: 'million square kilometres',
  digits: 2,
  color: '#7dd3fc',
  colorSoft: 'rgba(125,211,252,0.16)',
  glyph: '❄',
  series: seaIceSeries,
  yearSpan: [1979, 2024],
  domain: [3.4, 8.0],
  colormap: 'ice',
  spatial: 'seaice',
  spatialNote:
    'Modelled field: an ice-edge that retreats poleward with the observed September extent, with regional modifiers so the Barents, Kara and Laptev Seas lose ice earlier than the Canadian Archipelago — the pattern reported by NSIDC.',
  events: [
    { year: 1979, title: 'Satellite era begins', detail: 'Passive microwave sensors give the first continuous, whole-Arctic record: 7.05 M km².', kind: 'instrument', lat: 82, lon: -45, place: 'Central Arctic' },
    { year: 1996, title: 'A late high year', detail: '7.68 M km² — the largest September extent of the satellite era.', kind: 'record' },
    { year: 2007, title: 'The 2007 crash', detail: 'Extent falls to 4.32 M km², startling researchers with a step change.', kind: 'record' },
    { year: 2012, title: 'Record minimum', detail: '3.63 M km² — the lowest September extent ever measured.', kind: 'record', lat: 74, lon: 105, place: 'Laptev / East Siberian Seas' },
    { year: 2020, title: 'Second lowest', detail: '3.92 M km², with the fastest ice loss ever observed in July.', kind: 'record' },
    { year: 2024, title: '4.28 M km²', detail: 'Still roughly 40 % below the 1981–2010 September average.', kind: 'phenomenon' },
  ],
  sonification: {
    scale: 'lydian',
    rootMidi: 57,
    octaves: 3,
    bpm: [38, 74],
    timbre: 'glass',
    layers: { drone: true, melody: true, rhythm: false, shimmer: true, sub: false },
    reverb: 0.74,
    tension: 0.5,
    mood: 'Crystal thinning',
    rule: 'Extent → pitch and number of bells · rate of loss → decay time · ice-edge latitude → filter brightness',
  },
  sources: ['nsidc', 'ipccAr6', 'nasaSvs'],
  stats: [
    { label: '1979 → 2024', value: '7.05 → 4.28 M km²' },
    { label: 'Trend', value: '−12.2 % / decade' },
    { label: 'Lowest', value: '2012 · 3.63 M km²' },
  ],
  audioDescription:
    'September Arctic sea ice extent falls from 7.05 million square kilometres in 1979 to 4.28 in 2024, a decline of about twelve per cent per decade. The sharpest drops are in 2007 and 2012; the lowest value on record is 3.63 million square kilometres in September 2012.',
  describe(year, value, delta) {
    const y = Math.floor(year)
    const pct = ((value - 7.05) / 7.05) * 100
    return `In September ${y}, Arctic sea ice covered ${fmt(value, 2)} million square kilometres — ${fmt(pct, 0)} per cent compared with 1979, changing at ${fmtSigned(delta, 2)} million square kilometres per year.`
  },
}

export const seaLevel: Track = {
  id: 'sealevel',
  title: 'A Tide That Only Rises',
  shortTitle: 'Sea Level',
  kicker: 'Tide gauges 1900–1992 · Altimetry 1993–2024',
  tagline: 'Global mean sea level',
  description:
    'Two instruments, one curve. Tide gauges carry the story from 1900 to 1992; satellites take over in 1993 and show the rise accelerating. The ocean has climbed about twenty-two centimetres since 1900, and more than half of that happened in the last thirty years. Sonified as a sub-bass tide that never quite comes back down.',
  unit: 'mm',
  unitSpoken: 'millimetres',
  digits: 0,
  color: '#38bdf8',
  colorSoft: 'rgba(56,189,248,0.16)',
  glyph: '≈',
  series: seaLevelSeries,
  yearSpan: [1900, 2024],
  domain: [0, 240],
  colormap: 'plasma',
  spatial: 'sealevel',
  spatialNote:
    'Modelled field: the global mean plus the published regional pattern — higher rise in the western Pacific and along the US east coast, lower in the eastern Pacific — from satellite altimetry climatology.',
  events: [
    { year: 1900, title: 'The tide-gauge baseline', detail: 'Global mean sea level is defined as 0 mm here.', kind: 'instrument' },
    { year: 1964, title: 'Great Alaska earthquake', detail: 'Regional land-level changes remind us that gauges measure relative sea level.', kind: 'phenomenon' },
    { year: 1992.9, title: 'TOPEX/Poseidon launches', detail: 'Satellite altimetry begins; the record becomes globally continuous.', kind: 'instrument', lat: -6.4, lon: -155.3, place: 'Kwajalein, Pacific' },
    { year: 2001, title: 'Rate crosses 3 mm/yr', detail: 'The twentieth-century average was about 1.2 mm/yr.', kind: 'record' },
    { year: 2020.7, title: 'Sentinel-6 Michael Freilich', detail: 'A new generation of altimeters extends the record into the 2030s.', kind: 'instrument' },
    { year: 2024, title: '+225 mm since 1900', detail: 'Roughly 3.7 mm per year over the satellite era.', kind: 'record' },
  ],
  sonification: {
    scale: 'minorPentatonic',
    rootMidi: 33,
    octaves: 2,
    bpm: [32, 60],
    timbre: 'drone',
    layers: { drone: true, melody: false, rhythm: true, shimmer: true, sub: true },
    reverb: 0.66,
    tension: 0.42,
    mood: 'Deep water',
    rule: 'Millimetres → sub-bass depth · rate of rise → tide-pulse tempo · regional hotspots → shimmering overtones',
  },
  sources: ['nasaSeaLevel', 'churchWhite', 'ipccAr6'],
  stats: [
    { label: '1900 → 2024', value: '0 → 225 mm' },
    { label: 'Satellite era', value: '3.7 mm / yr' },
    { label: '20th century', value: '1.2 mm / yr' },
  ],
  audioDescription:
    'Global mean sea level rises by about 225 millimetres between 1900 and 2024. The slope is gentle until the 1990s and steepens after 1993, when satellite altimetry begins: about 1.2 millimetres per year early in the century, rising to about 3.7 millimetres per year today.',
  describe(year, value, delta) {
    const y = Math.floor(year)
    const source = y < 1993 ? 'tide-gauge reconstruction' : 'satellite altimetry'
    return `In ${y}, global mean sea level stood ${fmt(value, 0)} millimetres above the 1900 level, rising at about ${fmt(delta * 10, 1)} millimetres per decade, from ${source}.`
  },
}

export const oceanHeat: Track = {
  id: 'oceanheat',
  title: 'Heat Hiding Underwater',
  shortTitle: 'Ocean Heat',
  kicker: 'IPCC AR6 · 1971–2024',
  tagline: 'Ocean heat content, 0–2000 m',
  description:
    'The ocean takes in about ninety-one per cent of the extra heat trapped by greenhouse gases — and it keeps it. This is the accumulated energy, in zettajoules, stored between the surface and two thousand metres since 1971. It never goes back down. Sonified as a granular swarm that thickens and rises, like a room filling with sound you cannot see.',
  unit: 'ZJ',
  unitSpoken: 'zettajoules',
  digits: 0,
  color: '#f472b6',
  colorSoft: 'rgba(244,114,182,0.16)',
  glyph: '◬',
  series: oceanHeatSeries,
  yearSpan: [1971, 2024],
  domain: [0, 500],
  colormap: 'magma',
  spatial: 'oceanheat',
  spatialNote:
    'Modelled field: warming concentrated in the Southern Ocean, the North Atlantic and western boundary currents, following the AR6 pattern; values since 2018 extend the published record with an estimated trend and are labelled as such.',
  events: [
    { year: 1971, title: 'Baseline year', detail: 'The ocean heat record is conventionally measured from 1971.', kind: 'instrument' },
    { year: 2005, title: 'Argo is complete', detail: 'About 3,000 autonomous floats give full global coverage to 2,000 m.', kind: 'instrument', lat: -35, lon: 40, place: 'Southern Ocean / global' },
    { year: 2018, title: '≈396 ZJ', detail: 'IPCC AR6: the cumulative ocean heat gain from 1971 to 2018.', kind: 'record' },
    { year: 2023, title: 'Record ocean temperatures', detail: 'Marine heatwaves hit the North Atlantic and the Caribbean.', kind: 'record' },
    { year: 2024, title: '≈470 ZJ', detail: 'Estimated cumulative gain — roughly twelve zettajoules added every year.', kind: 'record' },
  ],
  sonification: {
    scale: 'dorian',
    rootMidi: 41,
    octaves: 3,
    bpm: [42, 86],
    timbre: 'granular',
    layers: { drone: true, melody: true, rhythm: true, shimmer: true, sub: true },
    reverb: 0.68,
    tension: 0.55,
    mood: 'Submerged',
    rule: 'Stored energy → granular density and pitch centre · annual uptake → shimmer rate · Southern Ocean weighting → low-pass depth',
  },
  sources: ['ipccAr6', 'argo', 'nasaSvs'],
  stats: [
    { label: '1971 → 2024', value: '0 → ≈470 ZJ' },
    { label: 'Share of excess heat', value: '91 %' },
    { label: 'Recent uptake', value: '≈12 ZJ / yr' },
  ],
  audioDescription:
    'Cumulative ocean heat content between the surface and two thousand metres rises from zero zettajoules in 1971 to about 470 zettajoules in 2024. The curve is convex: the ocean stores heat faster each decade, at roughly twelve zettajoules per year in the 2020s.',
  describe(year, value, delta) {
    const y = Math.floor(year)
    const note = y > 2018 ? ' (estimated extension of the published record)' : ''
    return `By ${y}, the world ocean had stored about ${fmt(value, 0)} zettajoules of extra heat below two thousand metres${note}, gaining around ${fmt(delta, 1)} zettajoules per year.`
  },
}

/* ------------------------------------------------------------------ */

export const TRACKS: Track[] = [temperature, co2, emissions, seaIce, seaLevel, oceanHeat]

export const trackById = (id: string | null | undefined): Track =>
  TRACKS.find((t) => t.id === id) ?? TRACKS[0]

export const seriesExtent = extent

export const DEFAULT_YEAR: Record<string, number> = {
  temperature: 1900,
  co2: 1900,
  emissions: 1900,
  seaice: 1979,
  sealevel: 1900,
  oceanheat: 1971,
}
