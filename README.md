# 🌍 Earth Jukebox — hear the planet change

**NASA Space Apps Challenge 2026 · Earth Information Center sonification**

Earth Jukebox turns NASA's Earth-science records into music you can navigate, interrogate
and download — and it is built so that a blind or low-vision listener is not an afterthought
but the primary user. A raw pixel-to-pitch mapping is noise; this is a composed, rule-driven
sonification that stays musical while remaining faithful to the data.

Everything runs in the browser. There is no backend, no API key, no pre-recorded audio and no
network dependency at runtime: the synthesis, the convolution reverb, the data, the textures
and the typefaces are all local.

---

## The experience

| # | Screen | What happens |
|---|--------|--------------|
| 1 | **Hero** | A realistic 3D Earth — Blue Marble day map, night city lights, ocean glint, normal-mapped relief, a separately drifting cloud shell, 23.44° axial tilt, two-layer atmosphere, the Moon and a starfield. The limb glow breathes with the live audio level, so the planet visibly sings. A search field takes datasets, years, events, views and spoken commands (`/` focuses it). |
| 2 | **Jukebox** | "What do you want to hear?" — six dataset cards, each with a sparkline of the real series, its ruleset, its sources, a 3-second preview and a full open-in-studio action. |
| 4 | **Studio** | The chosen phenomenon as a 2D world map, a 3D data globe, a chart or a frame scan, plus a **1900 → 2000** timeline with presets, transport, live readout, spectrum/waveform visualiser, sonification controls, a spoken description, a data table and the source list. |
| 3 | **How it works** | The translation algorithm, exposed: seven audible mappings you can audition one at a time, every scale in the palette, and each track's ruleset. |
| 5 | **Accessibility** | Live switches — high contrast, reduced motion, verbose announcements, haptics, and a text-only mode that disables WebGL entirely while leaving charts, tables and audio intact — plus the full keyboard map. |
| 6 | **Gallery** | Six 45-second pieces, one per dataset, rendered offline through the *same* synthesis code as live playback and downloadable as 16-bit 44.1 kHz stereo WAV. |
| 7 | **Sources** | All 22 entries: publisher, URL, licence, exactly what was taken, and which tracks use it. Every source badge anywhere in the app scrolls here and flashes its entry. |
| — | **Voice agent** | A dock, bottom-right, always one keystroke (`V`) away. Ask by microphone, by typed text, or by recording your question as an audio message; answers are spoken aloud and always transcribed. It understands English and Darija, and it can actually drive the app. |

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
npm run preview    # serve the built bundle
npm run verify     # types + logic checks + headless runtime smoke test
```

`npm run verify` is three gates: `tsc --noEmit`, a pure-function check of the datasets, score
builder, scales, spatial fields and agent knowledge, and a jsdom run that mounts the real
`<App/>` and drives the actual user flows. The jsdom gate is deliberately WebGL-free and
AudioContext-free — it is the proof that the app degrades instead of crashing.

---

## The translation algorithm

`buildScore(track, yearStart, yearEnd, duration, opts)` is a pure function: dataset + window +
ruleset → a timed list of musical events. The identical score object drives real-time playback,
the offline WAV render and the ruleset printed in the UI, so what you hear is what you download
and what you can read.

| Data property | Audio parameter |
|---|---|
| Value (normalised in-window) | Pitch height, quantised to the track's mode |
| Rate of change | Tempo (bpm), filter cutoff, percussion density |
| Longitude | Stereo pan |
| Latitude | Pitch offset |
| Colour / palette (frame mode) | Chord quality and root |
| Pixel density & contrast | Rhythm subdivision, shimmer, reverb send |
| Decade boundaries | Cadence back to the root |
| Annotated events (eruptions, records, treaties) | Struck bells, glass harmonics, sub thumps |

Each dataset also gets an artistic identity, because the story is different every time:

- **Temperature** — a slow string fever in Aeolian minor (GISTEMP anomaly → pitch).
- **CO₂** — a Phrygian drone with an accelerating pulse; an engine that never idles.
- **Emissions** — percussion, with the plume centroid panning east across the century.
- **Sea ice** — Lydian glass bells that thin out as the September extent falls.
- **Sea level** — a sub-bass tide in minor pentatonic.
- **Ocean heat** — a granular swarm that keeps accumulating, because the number never goes down.

A musical safety rail clamps every note into the piano's range (A0–C7), so no window of any
dataset can produce inaudible sub-bass or piercing glass.

---

## Accessibility

This is the reason the project exists, not a feature bolted onto it.

- **Screen-reader first** — the timeline is a real slider with spoken value text; charts carry a
  long description plus a full data table; every state change is published to a polite live
  region; an optional verbose mode reads the playhead continuously.
- **Keyboard-only** — nothing needs a pointer. The map has an arrow-key cursor that announces
  each coordinate, and Enter sonifies the point under it. `Space` plays, `←/→` step a year
  (`Shift` for ten), `1–6` switch dataset, `W/D/C/F` switch view, `M` mutes, `V` opens the agent,
  `/` focuses search.
- **Sound as the map** — longitude becomes pan, latitude becomes pitch, and clicking anywhere on
  the globe answers with a note, so geography is locatable without sight.
- **No meaning in colour alone** — palettes are named in words, field values are printed as
  percentages, confirmations arrive as sound, text and (where supported) vibration.
- **Sensory off-ramps** — `prefers-reduced-motion` is honoured automatically, high contrast is
  one switch away, and text-only mode removes WebGL while keeping every number audible.

---

## Data and provenance

Time series are published annual records, copied into `src/data/series.ts` and cited in
`src/data/sources.ts`: NASA GISS **GISTEMP v4**, NOAA GML / Scripps **Mauna Loa CO₂** with
Law Dome and EPICA ice-core anchors, the **Global Carbon Budget**, **NSIDC Sea Ice Index v3**,
NASA/JPL satellite altimetry with the Church & White reconstruction, **IPCC AR6** ocean heat
content, and **Argo**.

Two honesty rules are enforced in the interface:

1. Where a record only exists as sparse anchors (emissions, sea level before 1993, ocean heat),
   the series is interpolated and labelled *reconstructed from published anchors*.
2. The **spatial fields** on the 2D map and 3D globe are *modelled* from published
   characteristics — Arctic amplification, the CO₂ inter-hemispheric gradient, the regional
   sea-ice edge, emission plume geography, the AR6 ocean warming pattern. They are illustrative,
   not pixel copies of a gridded product, and each panel says so next to the visualisation and
   links to the real dataset.

The land/ocean mask is derived at runtime from the Blue Marble texture itself and was checked
against the published land fraction (≈29 %): the derived mask gives ≈31 % including ice. Where
the texture cannot be read, an analytic fallback takes over.

---

## Architecture

```
src/
  data/        types · series (1880–2024) · sources (22 cited entries) · tracks (6 rulesets)
  audio/       scales · voices · score (the algorithm) · engine (real-time) · render (offline WAV)
               · frameAnalysis (image → columns, palette, chord) · useJukebox (the transport hook)
  lib/         math · colormap · fields · fieldCanvas · landmask · basemap · wav · format · bus · hooks
  state/       one zustand store — flat enough that the voice agent can drive the whole app
  voice/       knowledge (17-entry offline engine, EN + Darija) · speech · useVoiceAgent
  three/       shaders (hand-written GLSL) · HeroEarth · DataGlobe
  components/  hero · jukebox · studio · agent · sections · layout · ui
scripts/       verify.mjs + the two check suites
```

Design notes worth knowing:

- **One clock.** The audio context is the source of truth; a rAF loop publishes
  `scoreTime`/`year`/`bpm` to the store, so visuals follow audio rather than the other way round.
- **One bus.** A tiny typed event bus (`scroll-to`, `rebuild-score`, `highlight-source`,
  `sonify-frame`, `start-mic`, `agent-ask`, `ping`, `unlock-audio`) keeps components decoupled and
  lets the voice agent act on the UI exactly as a click would.
- **The agent works offline.** `answerAgent()` resolves locally first — intent, dataset, years,
  view, transport — and only optionally calls an OpenAI-compatible endpoint if you configure one.
- **Lazy by construction.** `AudioContext` is created on the first gesture, never on load, which
  is why the app never trips an autoplay warning.
- **StrictMode is off on purpose**: double-invoked effects would open a second AudioContext and a
  second WebGL context on every mount.

## Stack

React 19 · TypeScript · Vite 7 · Tailwind CSS v4 · three.js + react-three-fiber + drei ·
zustand · Web Audio API · Web Speech API · MediaRecorder. Typefaces: Space Grotesk and IBM Plex
Mono, self-hosted under the SIL Open Font License 1.1.

---

*Not an official NASA product. Data and imagery belong to their publishers and are used under the
licences listed in Sources.*
