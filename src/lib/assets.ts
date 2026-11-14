/** Resolve a path inside /public with Vite's configured base URL. */
export function assetUrl(path: string): string {
  const base = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export const TEXTURES = {
  day: assetUrl('/textures/earth_day_4096.jpg'),
  night: assetUrl('/textures/earth_night_4096.jpg'),
  normal: assetUrl('/textures/earth_normal_2048.jpg'),
  specular: assetUrl('/textures/earth_specular_2048.jpg'),
  clouds: assetUrl('/textures/earth_clouds_1024.png'),
  lights: assetUrl('/textures/earth_lights_2048.png'),
  moon: assetUrl('/textures/moon_1024.jpg'),
} as const
