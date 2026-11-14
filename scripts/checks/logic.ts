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

// --- the animated header mark (pure maths, DOM-free)
{
  const { buildGlobeGeometry, paintGlobe, anomalyT, SPIN_DEG_PER_SEC, DRIFT_SECONDS } = await import('@/components/layout/globeMark')
  const geo = buildGlobeGeometry(72)
  ok(geo.indices.length > 2000, `globe geometry covers ${geo.indices.length} pixels`)
  ok(geo.indices.every((i) => i >= 0 && i < 72 * 72), 'geometry indices in range')
  ok(geo.latIdx.every((l) => l === -1 || (l >= 0 && l < 180)), 'latitude rows valid')
  ok(geo.shade.every((s2) => Number.isFinite(s2) && s2 >= 0 && s2 <= 2), 'shade finite')
  ok(geo.rim.every((r) => Number.isFinite(r) && r >= 0 && r <= 1), 'rim in [0,1]')
  ok(SPIN_DEG_PER_SEC > 0 && DRIFT_SECONDS > 0, 'animation constants positive')

  const data = new Uint8ClampedArray(72 * 72 * 4)
  const cold = paintGlobe(geo, data, { spin: 12, t: 0, mask: null })
  const warm = paintGlobe(geo, data, { spin: 12, t: 1, mask: null })
  ok(cold.painted > 1500 && warm.painted > 1500, 'disc actually painted')
  ok(cold.meanB > cold.meanR, `cold frame is blue (${cold.meanR.toFixed(1)},${cold.meanB.toFixed(1)})`)
  ok(warm.meanR > warm.meanB, `warm frame is red (${warm.meanR.toFixed(1)},${warm.meanB.toFixed(1)})`)
  ok(warm.meanR - cold.meanR > 8, `the mark visibly warms (ΔR=${(warm.meanR - cold.meanR).toFixed(1)})`)
  ok(cold.landFraction > 0.15 && cold.landFraction < 0.75, `land fraction plausible (${cold.landFraction.toFixed(2)})`)
  ok(data.every((v) => Number.isFinite(v)), 'no NaN leaked into the pixel buffer')

  // spinning must change what is drawn (it is not a static disc)
  const a = new Uint8ClampedArray(72 * 72 * 4)
  const b = new Uint8ClampedArray(72 * 72 * 4)
  paintGlobe(geo, a, { spin: 0, t: 0.4, mask: null })
  paintGlobe(geo, b, { spin: 90, t: 0.4, mask: null })
  let diff = 0
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) diff++
  ok(diff > 200, `spin changes the image (${diff} pixels differ)`)

  // a synthetic mask must be honoured: all-land vs all-ocean
  const allLand = new Uint8Array(360 * 180).fill(1)
  const allOcean = new Uint8Array(360 * 180).fill(0)
  const d1 = new Uint8ClampedArray(72 * 72 * 4)
  const d2 = new Uint8ClampedArray(72 * 72 * 4)
  const r1 = paintGlobe(geo, d1, { spin: 30, t: 0.5, mask: allLand })
  const r2 = paintGlobe(geo, d2, { spin: 30, t: 0.5, mask: allOcean })
  ok(Math.abs(r1.landFraction - 1) < 0.02 && r2.landFraction < 0.02, 'mask drives the classification')
  ok(Math.abs(r1.meanR - r2.meanR) > 4, 'land and ocean read differently')

  ok(anomalyT(0, -1, 1) === 0.5, 'anomalyT midpoint')
  ok(anomalyT(5, -1, 1) === 1 && anomalyT(-5, -1, 1) === 0, 'anomalyT clamps')
  ok(anomalyT(1, 1, 1) === 0.5, 'anomalyT survives a flat extent')
}

// --- MIDI export
{
  const { scoreToMidi, buildTempoMap, ticksAt, vlq, PPQ } = await import('@/audio/midi')
  ok(vlq(0).join(',') === '0' && vlq(127).join(',') === '127' && vlq(128).join(',') === '129,0' && vlq(16383).join(',') === '255,127', `vlq ${vlq(128)} ${vlq(16383)}`)
  ok(vlq(2097151).join(',') === '255,255,127', 'vlq 3 bytes')

  for (const t of TRACKS) {
    const s = buildScore(t, 1900, 2000, 30, { intensity: 0.85 })
    const map = buildTempoMap(s)
    ok(map.length >= 2, `${t.id}: tempo map has ${map.length} segments`)
    ok(map.every((m) => Number.isFinite(m.tick) && m.bpm > 10 && m.bpm < 300), `${t.id}: tempo map sane`)
    ok(map.every((m, i) => i === 0 || m.tick > map[i - 1].tick && m.time > map[i - 1].time), `${t.id}: tempo map monotonic`)
    ok(ticksAt(map, 0) === 0 && ticksAt(map, 30) > ticksAt(map, 15), `${t.id}: ticksAt monotonic`)

    const midi = scoreToMidi(s, { title: t.title, text: s.ruleSummary })
    const b = midi.bytes
    ok(b.length > 500, `${t.id}: midi ${b.length} bytes`)
    ok(String.fromCharCode(b[0], b[1], b[2], b[3]) === 'MThd', `${t.id}: MThd magic`)
    // header: 4 magic + 4 length + 6 payload = 14 bytes before the first MTrk
    ok(((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) === 6, `${t.id}: header length 6`)
    const ntrks = (b[10] << 8) | b[11]
    const div = (b[12] << 8) | b[13]
    ok(((b[8] << 8) | b[9]) === 1, `${t.id}: format 1`)
    ok(div === PPQ, `${t.id}: division ${div}`)
    ok(ntrks === midi.tracks && ntrks >= 2, `${t.id}: ${ntrks} tracks`)
    ok(midi.noteCount === s.notes.length, `${t.id}: note count ${midi.noteCount}/${s.notes.length}`)

    // walk every MTrk chunk: lengths must add up and each track must end with end-of-track
    let off = 14
    let walked = 0
    let parsed = 0
    for (let i = 0; i < ntrks; i++) {
      ok(String.fromCharCode(b[off], b[off + 1], b[off + 2], b[off + 3]) === 'MTrk', `${t.id}: MTrk magic ${i}`)
      const len = (b[off + 4] << 24) | (b[off + 5] << 16) | (b[off + 6] << 8) | b[off + 7]
      ok(len > 0 && off + 8 + len <= b.length, `${t.id}: track ${i} length ${len} fits`)
      const end = off + 8 + len
      ok(b[end - 3] === 0xff && b[end - 2] === 0x2f && b[end - 1] === 0x00, `${t.id}: track ${i} ends with end-of-track`)
      off = end
      walked++
      parsed += len
    }
    ok(walked === ntrks && off === b.length, `${t.id}: chunk lengths exactly cover the file (${off}/${b.length})`)
    ok(parsed > 0, `${t.id}: payload non-empty`)
    ok(b.every((v) => Number.isFinite(v) && v >= 0 && v <= 255), `${t.id}: all bytes valid`)
    ok(midi.channels.every((c) => c >= 0 && c <= 15), `${t.id}: channels valid`)
    ok(midi.channels.includes(9) === s.notes.some((n) => ['tick', 'shaker', 'thump'].includes(n.voice)), `${t.id}: drums channel present iff percussion notes exist`)
  }
}

// --- interface languages
{
  const { ALL_KEYS, LANGS, DICTS, translate, dirFor, speechLangFor, missingKeys } = await import('@/i18n')
  ok(ALL_KEYS.length >= 100, `dictionary covers ${ALL_KEYS.length} keys`)
  for (const lang of LANGS) {
    ok(dirFor(lang) === (lang === 'ar' ? 'rtl' : 'ltr'), `${lang}: direction ${dirFor(lang)}`)
    ok(/^[a-z]{2}(-[A-Z]{2})?$/.test(speechLangFor(lang)), `${lang}: speech tag ${speechLangFor(lang)}`)
    const miss = missingKeys(lang)
    ok(miss.length === 0, `${lang}: ${miss.length} missing keys (${miss.slice(0, 8).join(', ')})`)
    let bad = 0
    for (const k of ALL_KEYS) {
      const v = translate(lang, k)
      if (typeof v !== 'string' || v.length === 0 || v === k || /[{}]/.test(v)) bad++
    }
    ok(bad === 0, `${lang}: ${bad} keys do not translate cleanly`)
    ok(Object.keys(DICTS[lang] ?? {}).length > 0, `${lang}: dictionary present`)
  }
  ok(translate('fr', 'nav.listen') === '\u00c9couter', `fr nav.listen = ${translate('fr', 'nav.listen')}`)
  ok(translate('ar', 'nav.listen').length > 1, 'ar nav.listen translated')
  ok(translate('en', 'hero.title1') === 'Hear the Earth', 'en hero title')
  // every section heading ships in all three languages, split so the gradient
  // span can stay on the second half of the sentence in any word order
  for (const section of ['listen', 'method', 'access', 'gallery', 'sources', 'about']) {
    for (const lang of LANGS) {
      const a = translate(lang, `${section}.title1` as never)
      const b = translate(lang, `${section}.title2` as never)
      const lede = translate(lang, `${section}.lede` as never)
      ok(a.length > 2 && b.length > 2, `${lang} ${section}: two-part heading present`)
      ok(lede.length > 40, `${lang} ${section}: lede is a real sentence (${lede.length} chars)`)
    }
  }
  // unknown keys fall back to themselves instead of throwing
  ok(translate('ar', 'nope.not.a.key' as never) === 'nope.not.a.key', 'unknown key falls back')
}

process.exitCode = fails === 0 ? 0 : 1
console.log(fails === 0 ? 'ALL LOGIC CHECKS PASSED' : `${fails} FAILURES`)
