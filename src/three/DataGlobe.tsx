/**
 * Studio 3D view: the realistic Earth wrapped in a live data shell, with annotated
 * hotspots and events. Click anywhere to sonify that point (longitude → stereo pan,
 * latitude → pitch), which is the tactile/auditory way of "reading" the map.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Earth } from './HeroEarth'
import { dataShellFragment, dataShellVertex } from './shaders'
import { renderField } from '@/lib/fieldCanvas'
import { EMISSION_HOTSPOTS, hotspotWeights, fieldValue } from '@/lib/fields'
import { engine } from '@/audio/engine'
import { useStore } from '@/state/store'
import { clamp, deg2rad, invLerp, sampleSeries } from '@/lib/math'
import type { Track } from '@/data/types'
import { valueToMidi } from '@/audio/scales'

export function latLonToVector3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = deg2rad(lon + 180)
  const theta = deg2rad(90 - lat)
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta))
}

export function vector3ToLatLon(p: THREE.Vector3): { lat: number; lon: number } {
  const r = p.length() || 1
  const lat = 90 - (Math.acos(clamp(p.y / r, -1, 1)) * 180) / Math.PI
  let lon = (Math.atan2(p.z, -p.x) * 180) / Math.PI - 180
  while (lon < -180) lon += 360
  while (lon > 180) lon -= 360
  return { lat, lon }
}

interface GlobeProps {
  track: Track
  active: boolean
}

function DataShell({ track }: { track: Track }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const lastYear = useRef(-999)

  if (!canvasRef.current && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas')
    canvasRef.current.width = 576
    canvasRef.current.height = 288
  }

  const uniforms = useMemo(
    () => ({
      fieldMap: { value: null as THREE.Texture | null },
      opacity: { value: 0.85 },
      level: { value: 0 },
      pulse: { value: 0 },
      sunDir: { value: new THREE.Vector3(1, 0.32, 0.55).normalize() },
    }),
    [],
  )

  useEffect(() => {
    if (!canvasRef.current) return
    const tex = new THREE.CanvasTexture(canvasRef.current)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    textureRef.current = tex
    uniforms.fieldMap.value = tex
    return () => {
      tex.dispose()
      textureRef.current = null
    }
  }, [uniforms])

  useFrame((_, delta) => {
    const st = useStore.getState()
    const year = st.year
    if (!canvasRef.current || !textureRef.current) return
    if (Math.abs(year - lastYear.current) > 0.02 || lastYear.current === -999) {
      lastYear.current = year
      const value = sampleSeries(track.series, year)
      const norm = invLerp(track.domain[0], track.domain[1], value)
      const deltaPerYear = (sampleSeries(track.series, year + 1) - sampleSeries(track.series, year - 1)) / 2
      renderField(canvasRef.current, {
        kind: track.spatial,
        year,
        value,
        norm,
        delta: deltaPerYear,
        colormap: track.colormap,
        alphaScale: 0.9,
      })
      textureRef.current.needsUpdate = true
    }
    if (materialRef.current) {
      const level = engine.ready ? engine.getLevel() : 0
      materialRef.current.uniforms.level.value = level
      materialRef.current.uniforms.pulse.value = Math.min(1, materialRef.current.uniforms.pulse.value + delta * 0.4)
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const st = useStore.getState()
    const local = e.object.worldToLocal(e.point.clone())
    const { lat, lon } = vector3ToLatLon(local)
    st.setSelected({ lat, lon })
    const value = sampleSeries(track.series, st.year)
    const norm = invLerp(track.domain[0], track.domain[1], value)
    const s = fieldValue(track.spatial, lat, lon, {
      year: st.year,
      value,
      norm,
      delta: (sampleSeries(track.series, st.year + 1) - sampleSeries(track.series, st.year - 1)) / 2,
    })
    const midi = valueToMidi(s.t, track.sonification.rootMidi + 24, track.sonification.scale, 2)
    engine.ping(lat, lon, midi, 1, 'glass')
    st.announce(
      `Selected ${Math.abs(lat).toFixed(1)} degrees ${lat >= 0 ? 'north' : 'south'}, ${Math.abs(lon).toFixed(1)} degrees ${
        lon >= 0 ? 'east' : 'west'
      }. Field value ${(s.t * 100).toFixed(0)} percent of the colour range. Pitch panned ${lon < 0 ? 'left' : 'right'}.`,
    )
  }

  return (
    <mesh onClick={handleClick} scale={1.022}>
      <sphereGeometry args={[1, 96, 96]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={dataShellVertex}
        fragmentShader={dataShellFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </mesh>
  )
}

function Graticule({ radius = 1.03 }: { radius?: number }) {
  const geometry = useMemo(() => {
    const pts: number[] = []
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon <= 180; lon += 3) {
        const a = latLonToVector3(lat, lon, radius)
        const b = latLonToVector3(lat, lon + 3, radius)
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -90; lat <= 87; lat += 3) {
        const a = latLonToVector3(lat, lon, radius)
        const b = latLonToVector3(lat + 3, lon, radius)
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [radius])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={'#8fd8ff'} transparent opacity={0.14} depthWrite={false} />
    </lineSegments>
  )
}

function Hotspots({ track }: { track: Track }) {
  const ref = useRef<THREE.Group>(null)
  const weights = useRef<number[]>([])
  const yearRef = useRef(0)

  useFrame(() => {
    const st = useStore.getState()
    if (Math.abs(st.year - yearRef.current) > 0.25) {
      yearRef.current = st.year
      weights.current = hotspotWeights(st.year)
      if (ref.current) {
        ref.current.children.forEach((child, i) => {
          const w = weights.current[i] ?? 0
          const scale = track.id === 'emissions' ? 0.02 + w * 0.55 : 0.03
          child.scale.setScalar(Math.max(0.001, scale))
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
          if (mat) mat.opacity = clamp(0.25 + w * 2.2, 0, 0.95)
        })
      }
    }
  })

  const markers = useMemo(() => {
    const w = hotspotWeights(1900)
    return EMISSION_HOTSPOTS.map((h, i) => ({
      ...h,
      position: latLonToVector3(h.lat, h.lon, 1.035),
      weight: w[i],
    }))
  }, [])

  if (track.id !== 'emissions' && track.id !== 'co2') return null
  return (
    <group ref={ref}>
      {markers.map((m) => (
        <mesh key={m.name} position={m.position}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={track.id === 'emissions' ? '#ffb347' : '#a78bfa'} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function SelectedPin() {
  const selected = useStore((s) => s.selected)
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.18
      ref.current.scale.setScalar(s)
    }
  })
  if (!selected) return null
  const pos = latLonToVector3(selected.lat, selected.lon, 1.05)
  return (
    <group position={pos}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={'#6ee7ff'} />
      </mesh>
      <Html distanceFactor={3} position={[0, 0.06, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="data-mono rounded-md border border-sonic-300/40 bg-void-950/85 px-2 py-1 text-[10px] whitespace-nowrap text-sonic-200">
          {Math.abs(selected.lat).toFixed(1)}°{selected.lat >= 0 ? 'N' : 'S'} {Math.abs(selected.lon).toFixed(1)}°
          {selected.lon >= 0 ? 'E' : 'W'}
        </div>
      </Html>
    </group>
  )
}

function EventRings({ track }: { track: Track }) {
  const year = useStore((s) => s.year)
  const show = useStore((s) => s.showEvents)
  const near = useMemo(
    () => track.events.filter((e) => Math.abs(e.year - year) < 2.5),
    [track.events, year],
  )
  if (!show) return null
  return (
    <group>
      {near.slice(0, 3).map((e, i) => {
        const lat = 25 - i * 22
        const lon = -20 + i * 60
        const pos = latLonToVector3(lat, lon, 1.045)
        return (
          <group key={`${e.year}-${e.title}`} position={pos}>
            <mesh>
              <ringGeometry args={[0.03, 0.038, 32]} />
              <meshBasicMaterial color={track.color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function DataGlobe({ track, active }: GlobeProps) {
  const textOnly = useStore((s) => s.a11y.textOnly)
  if (textOnly) return null
  return (
    <Canvas
      dpr={[1, 1.8]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0.5, 2.65], fov: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <ambientLight intensity={0.08} />
      <Suspense fallback={null}>
        <Earth radius={1} spin={0.012} interactive={false} />
        <DataShell track={track} />
        <Graticule />
        <Hotspots track={track} />
        <SelectedPin />
        <EventRings track={track} />
      </Suspense>
      <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.45} minDistance={1.5} maxDistance={5} />
    </Canvas>
  )
}
