/**
 * The hero Earth: NASA Blue Marble day map, night city lights, ocean specular,
 * normal-mapped relief, a separately rotating cloud shell, 23.4° axial tilt,
 * a two-layer atmosphere and the Moon. The limb glow breathes with the live
 * sonification level, so the planet visibly "sings" while you listen.
 */

import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { TEXTURES } from '@/lib/assets'
import { engine } from '@/audio/engine'
import { atmosphereFragment, atmosphereVertex, cloudsFragment, cloudsVertex, earthFragment, earthVertex, haloFragment, haloVertex } from './shaders'
import { useStore } from '@/state/store'

const AXIAL_TILT = THREE.MathUtils.degToRad(23.44)
const SUN = new THREE.Vector3(1.0, 0.32, 0.55).normalize()

interface Textures {
  day: THREE.Texture
  night: THREE.Texture
  normal: THREE.Texture
  spec: THREE.Texture
  clouds: THREE.Texture
  moon: THREE.Texture
}

function useEarthTextures(): Textures {
  const tex = useTexture({
    day: TEXTURES.day,
    night: TEXTURES.night,
    normal: TEXTURES.normal,
    spec: TEXTURES.specular,
    clouds: TEXTURES.clouds,
    moon: TEXTURES.moon,
  }) as Textures
  const { gl } = useThree()
  useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy()
    tex.day.colorSpace = THREE.SRGBColorSpace
    tex.night.colorSpace = THREE.SRGBColorSpace
    tex.clouds.colorSpace = THREE.SRGBColorSpace
    tex.moon.colorSpace = THREE.SRGBColorSpace
    tex.normal.colorSpace = THREE.NoColorSpace
    tex.spec.colorSpace = THREE.NoColorSpace
    for (const t of Object.values(tex)) {
      t.anisotropy = Math.min(8, maxAniso)
      t.needsUpdate = true
    }
  }, [tex, gl])
  return tex
}

interface EarthProps {
  radius?: number
  spin?: number
  interactive?: boolean
  tilt?: boolean
}

export function Earth({ radius = 1, spin = 0.035, interactive = true, tilt = true }: EarthProps) {
  const tex = useEarthTextures()
  const group = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const cloudRef = useRef<THREE.Mesh>(null)
  const reduceMotion = useStore((s) => s.a11y.reduceMotion)

  const uniforms = useMemo(
    () => ({
      dayMap: { value: tex.day },
      nightMap: { value: tex.night },
      specMap: { value: tex.spec },
      normalMap: { value: tex.normal },
      sunDir: { value: SUN.clone() },
      bumpScale: { value: 0.055 },
      nightBoost: { value: 2.35 },
      detail: { value: 0.35 },
      exposure: { value: 1.06 },
    }),
    [tex],
  )

  const cloudUniforms = useMemo(
    () => ({
      cloudMap: { value: tex.clouds },
      sunDir: { value: SUN.clone() },
      opacity: { value: 0.9 },
      softness: { value: 0.12 },
    }),
    [tex],
  )

  const atmoUniforms = useMemo(
    () => ({
      sunDir: { value: SUN.clone() },
      glowColor: { value: new THREE.Color('#5fb2ff') },
      power: { value: 3.1 },
      strength: { value: 0.85 },
    }),
    [],
  )

  const haloUniforms = useMemo(
    () => ({
      sunDir: { value: SUN.clone() },
      color: { value: new THREE.Color('#7cc4ff') },
      intensity: { value: 0.9 },
    }),
    [],
  )

  const pointer = useRef({ x: 0, y: 0 })

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1)
    if (spinRef.current) spinRef.current.rotation.y += d * (reduceMotion ? 0 : spin)
    if (cloudRef.current) cloudRef.current.rotation.y += d * (reduceMotion ? 0 : spin * 1.28)
    if (!interactive || !group.current) return
    // gentle parallax toward the pointer
    const px = state.pointer.x * 0.22
    const py = state.pointer.y * 0.16
    pointer.current.x += (px - pointer.current.x) * Math.min(1, d * 2.4)
    pointer.current.y += (py - pointer.current.y) * Math.min(1, d * 2.4)
    group.current.rotation.y = pointer.current.x
    group.current.rotation.x = -pointer.current.y
    // audio-reactive limb glow
    const level = engine.ready ? engine.getLevel() : 0
    atmoUniforms.strength.value = 0.78 + level * 2.4
    haloUniforms.intensity.value = 0.82 + level * 1.6
  })

  return (
    <group ref={group}>
      <group rotation={[0, 0, tilt ? AXIAL_TILT : 0]}>
        <group ref={spinRef}>
          <mesh>
            <sphereGeometry args={[radius, 128, 128]} />
            <shaderMaterial vertexShader={earthVertex} fragmentShader={earthFragment} uniforms={uniforms} />
          </mesh>
          <mesh ref={cloudRef} scale={1.012}>
            <sphereGeometry args={[radius, 96, 96]} />
            <shaderMaterial
              vertexShader={cloudsVertex}
              fragmentShader={cloudsFragment}
              uniforms={cloudUniforms}
              transparent
              depthWrite={false}
            />
          </mesh>
        </group>
        <mesh scale={1.018}>
          <sphereGeometry args={[radius, 96, 96]} />
          <shaderMaterial
            vertexShader={atmosphereVertex}
            fragmentShader={atmosphereFragment}
            uniforms={atmoUniforms}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      </group>
      <mesh scale={1.14}>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial
          vertexShader={haloVertex}
          fragmentShader={haloFragment}
          uniforms={haloUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}

export function Moon({ radius = 0.27 }: { radius?: number }) {
  const tex = useEarthTextures()
  const ref = useRef<THREE.Mesh>(null)
  const reduceMotion = useStore((s) => s.a11y.reduceMotion)
  useFrame((_, delta) => {
    if (ref.current && !reduceMotion) ref.current.rotation.y += Math.min(delta, 0.1) * 0.02
  })
  return (
    <mesh ref={ref} position={[4.6, 1.35, -4.2]}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial map={tex.moon} roughness={1} metalness={0} color={'#cfd4dc'} />
    </mesh>
  )
}

function SceneContents({ interactive, showMoon }: { interactive: boolean; showMoon: boolean }) {
  return (
    <>
      <ambientLight intensity={0.05} />
      <directionalLight position={[SUN.x * 10, SUN.y * 10, SUN.z * 10]} intensity={2.2} color={'#fff6e8'} />
      <Suspense fallback={null}>
        <Earth interactive={interactive} />
        {showMoon && <Moon />}
      </Suspense>
      <Stars radius={120} depth={60} count={6500} factor={4} saturation={0} fade speed={0.4} />
      {interactive && (
        <OrbitControls
          enablePan={false}
          enableZoom
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.38}
          zoomSpeed={0.5}
          minDistance={1.6}
          maxDistance={7}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI - 0.25}
        />
      )}
    </>
  )
}

export interface HeroEarthProps {
  className?: string
  interactive?: boolean
  showMoon?: boolean
  /** Stop rendering when scrolled out of view. */
  active?: boolean
  cameraZ?: number
}

export function HeroEarth({ className, interactive = true, showMoon = true, active = true, cameraZ = 3.35 }: HeroEarthProps) {
  const textOnly = useStore((s) => s.a11y.textOnly)
  if (textOnly) return null
  return (
    <Canvas
      className={className}
      dpr={[1, 1.9]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0.35, cameraZ], fov: 37, near: 0.1, far: 400 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0)
        scene.fog = null
      }}
    >
      <SceneContents interactive={interactive} showMoon={showMoon} />
    </Canvas>
  )
}
