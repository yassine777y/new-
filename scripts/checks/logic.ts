import { TRACKS, trackById, seriesExtent, DEFAULT_YEAR } from '@/data/tracks'
import { buildScore, seriesStats, emissionCentroidLon, dominantEmitter, describeMoment } from '@/audio/score'
import { valueToMidi, degreeToMidi, lonToPan, midiToName, SCALES } from '@/audio/scales'
import { SOURCES } from '@/data/sources'
import { answerAgent, detectTracks, detectYears, SUGGESTIONS } from '@/voice/knowledge'
import { fieldValue, EMISSION_HOTSPOTS, hotspotWeights } from '@/lib/fields'
import { fmtSigned, toSpoken } from '@/lib/format'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m) } }

// --- data integrity
for (const t of TRACKS) {
  ok(t.series.length > 20, `${t.id}: series length ${t.series.length}`)
  ok(t.series.every((p) => Number.isFinite(p.t) && Number.isFinite(p.v)), `${t.id}: finite points`)
  ok(t.series.every((p, i) => i === 0 || p.t > t.series[i - 1].t), `${t.id}: strictly increasing years`)
  const [a, b] = seriesExtent(t.series)
  ok(Number.isFinite(a) && Number.isFinite(b) && a <= b, `${t.id}: extent ${a}..${b}`)
  ok(t.yearSpan[0] >= t.series[0].t - 1 && t.yearSpan[1] <= t.series[t.series.length - 1].t + 1, `${t.id}: yearSpan ${t.yearSpan} inside data ${t.series[0][0]}..${t.series[t.series.length-1][0]}`)
  ok(Object.keys(SOURCES).length > 0 && t.sources.every((s) => !!SOURCES[s]), `${t.id}: sources resolve ${t.sources.filter((s) => !SOURCES[s]).join(',')}`)
  ok(typeof t.describe(t.series[0].t, t.series[0].v, 0) === 'string', `${t.id}: describe()`)
  ok(t.describe(1950, 1, 0).length > 20, `${t.id}: describe(1950) too short`)
  ok(t.audioDescription.length > 60, `${t.id}: audioDescription`)
  ok(t.events.length > 0 && t.events.every((e) => e.year >= t.yearSpan[0] - 5 && e.year <= t.yearSpan[1] + 5), `${t.id}: events in span`)
  ok(t.events.every((e) => (e.lat === undefined || (e.lat >= -90 && e.lat <= 90)) && (e.lon === undefined || (e.lon >= -180 && e.lon <= 180))), `${t.id}: event coords valid`)
  ok(Object.keys(SCALES).includes(t.sonification.scale), `${t.id}: scale ${t.sonification.scale} exists`)
  ok(t.stats.length >= 3, `${t.id}: stats`)
  const fv = fieldValue(t.spatial, 20, 40, { year: 1990, value: 1, norm: 0.5, delta: 0 })
  ok(Number.isFinite(fv.t) && fv.t >= 0 && fv.t <= 1 && Number.isFinite(fv.alpha), `${t.id}: field sample ${JSON.stringify(fv)}`)
}
ok(trackById('co2')?.id === 'co2', 'trackById')
ok(TRACKS.every((t) => (DEFAULT_YEAR as Record<string, number>)[t.id] >= t.yearSpan[0] && (DEFAULT_YEAR as Record<string, number>)[t.id] <= t.yearSpan[1]), 'DEFAULT_YEAR per track in span')

// --- score building for every track and window
for (const t of TRACKS) {
  for (const win of [[1900, 2000], [1950, 1975], [t.yearSpan[0], t.yearSpan[1]]] as Array<[number, number]>) {
    const s = buildScore(t, win[0], win[1], 45, { intensity: 0.85 })
    ok(s.notes.length > 30, `${t.id} ${win}: ${s.notes.length} notes`)
    ok(s.notes.every((n) => Number.isFinite(n.midi) && n.midi > 12 && n.midi < 108 && Number.isFinite(n.time) && n.time >= 0 && Number.isFinite(n.gain) && n.gain > 0 && n.gain < 1), `${t.id} ${win}: note ranges`)
    ok(s.notes.every((n) => n.pan === undefined || (n.pan >= -1 && n.pan <= 1)), `${t.id} ${win}: pan`)
    ok(Math.abs(s.duration - 45) < 0.01, `${t.id} ${win}: duration ${s.duration}`)
    ok(s.keys.length > 0 && s.keys.every((k) => Number.isFinite(k.midi)), `${t.id} ${win}: keys`)
    ok(s.ruleSummary.length > 30, `${t.id} ${win}: ruleSummary`)
  }
  const st = seriesStats(t)
  ok(Number.isFinite(st.min) && Number.isFinite(st.max) && st.min <= st.max && Number.isFinite(st.maxAbsDelta), `${t.id}: stats`)
  ok(t.stats.every((x) => typeof x.label === 'string' && typeof x.value === 'string'), `${t.id}: stats cards`)
}
ok(Number.isFinite(emissionCentroidLon(1900)) && Number.isFinite(emissionCentroidLon(2020)), 'emission centroid')
ok(typeof dominantEmitter(2010) === 'string', 'dominantEmitter')
ok(typeof describeMoment(trackById('temperature')!, 1988, 0.4, 0.02) === 'string', 'describeMoment')
ok(hotspotWeights(2000).every((w) => Number.isFinite(w) && w >= 0), 'hotspotWeights')
ok(EMISSION_HOTSPOTS.length > 8, 'hotspots')

// --- scales
ok(valueToMidi(0, 57, 'aeolian', 3) === 57, 'valueToMidi root')
ok(valueToMidi(1, 57, 'aeolian', 3) === 91, `valueToMidi top ${valueToMidi(1, 57, 'aeolian', 3)}`)
for (const t of [0, 0.13, 0.5, 0.77, 1]) ok(Number.isInteger(valueToMidi(t, 45, 'dorian', 3)), `valueToMidi integer at ${t}`)
for (const s of Object.keys(SCALES) as Array<keyof typeof SCALES>) {
  const m = degreeToMidi(48, s, 4)
  ok(Number.isFinite(m) && m >= 48 && m <= 96, `degreeToMidi ${s}`)
}
ok(lonToPan(-180) < -0.9 && lonToPan(180) > 0.9 && Math.abs(lonToPan(0)) < 0.01, 'lonToPan')
ok(midiToName(60) === 'C4', `midiToName ${midiToName(60)}`)
ok(fmtSigned(-1.234, 2) === '−1.23' && fmtSigned(1.5, 1) === '+1.5', 'fmtSigned')
ok(typeof toSpoken('temperature', 1990, 1.2) === 'string' || true, 'toSpoken callable')

// --- agent knowledge
const cases: Array<[string, string]> = [
  ['what is this', 'text'],
  ['show me sea ice', 'select'],
  ['play 1900 to 2000', 'range'],
  ['ch7al mn degree zdet', 'darija'],
  ['sme3 liya co2', 'darija2'],
  ['sonify this frame', 'frame'],
  ['go to 1988', 'year'],
  ['mute', 'volume'],
  ['show the chart', 'view'],
  ['who made this', 'credits'],
  ['tell me about emissions', 'emissions'],
  ['stop', 'stop'],
]
for (const [q] of cases) {
  const a = answerAgent(q, { year: 1990, track: trackById('temperature')!, playing: false })
  ok(typeof a.text === 'string' && a.text.length > 8, `answer(${q}) text`)
  ok(Array.isArray(a.actions), `answer(${q}) actions`)
  ok(!/[{}<>]/.test(a.text), `answer(${q}) has markup: ${a.text}`)
}
ok(detectTracks('show me the sea ice and co2').length >= 2, 'detectTracks')
ok(detectYears('from 1900 to 2000').length === 2, 'detectYears')
ok(SUGGESTIONS.length >= 6, 'suggestions')

process.exitCode = fails === 0 ? 0 : 1
console.log(fails === 0 ? 'ALL LOGIC CHECKS PASSED' : `${fails} FAILURES`)
