/**
 * Hand-written GLSL for the realistic Earth.
 *
 * Why not MeshStandardMaterial: we need a day map and a night-lights map blended by the
 * sun terminator, ocean specular glint, normal-mapped terrain relief and a twilight band —
 * which is easier to express directly than through three's material patching hooks.
 * `<tonemapping_fragment>` and `<colorspace_fragment>` are included so the output matches
 * the rest of the (colour-managed) scene.
 */

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

export const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform sampler2D normalMap;
  uniform vec3 sunDir;
  uniform float bumpScale;
  uniform float nightBoost;
  uniform float detail;
  uniform float exposure;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);

    // cheap tangent basis (fine for a sphere, degenerate only exactly at the poles)
    vec3 up = abs(n.y) > 0.995 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 t = normalize(cross(up, n));
    vec3 b = cross(n, t);
    vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    vec3 nn = normalize(n + (t * nm.x + b * nm.y) * bumpScale);

    vec3 L = normalize(sunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    float ndl = dot(nn, L);
    float diffuse = max(ndl, 0.0);
    float day = smoothstep(-0.16, 0.3, ndl);

    vec3 dayCol = texture2D(dayMap, vUv).rgb;
    vec3 nightCol = texture2D(nightMap, vUv).rgb;
    float ocean = texture2D(specMap, vUv).r;

    // land/ocean contrast: sharpen continents a touch, keep oceans smooth
    dayCol = mix(dayCol, dayCol * dayCol * 1.12 + dayCol * 0.16, detail * (1.0 - ocean));

    vec3 surface = dayCol * (0.085 + 1.12 * diffuse);

    // city lights only on the night side, boosted near the terminator
    float lightsMask = (1.0 - day) * (0.55 + 0.45 * smoothstep(-0.5, -0.02, ndl));
    surface += nightCol * lightsMask * nightBoost;

    // ocean sun glint
    float shininess = pow(max(dot(nn, H), 0.0), 42.0) * ocean * day;
    surface += vec3(1.0, 0.97, 0.92) * shininess * 0.85;

    // warm twilight band
    float twilight = smoothstep(-0.3, 0.02, ndl) * (1.0 - smoothstep(0.02, 0.5, ndl));
    surface += vec3(0.95, 0.45, 0.2) * twilight * 0.22 * (0.35 + dayCol.r);

    // subtle blue atmospheric scatter on the lit limb
    float rim = 1.0 - max(dot(n, V), 0.0);
    surface += vec3(0.22, 0.45, 0.95) * pow(rim, 3.2) * (0.25 + 0.75 * diffuse) * 0.55;

    gl_FragColor = vec4(surface * exposure, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const cloudsVertex = earthVertex

export const cloudsFragment = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float opacity;
  uniform float softness;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 L = normalize(sunDir);
    float ndl = dot(n, L);
    vec4 tex = texture2D(cloudMap, vUv);
    float alpha = smoothstep(softness, 1.0, tex.a) * opacity;
    float lit = 0.12 + 1.0 * max(ndl, 0.0);
    float twilight = smoothstep(-0.35, 0.15, ndl) * (1.0 - smoothstep(0.15, 0.6, ndl));
    vec3 col = vec3(1.0) * lit + vec3(1.0, 0.62, 0.35) * twilight * 0.35;
    // night side: clouds barely visible, slightly lit by city glow
    col = mix(col, vec3(0.06, 0.08, 0.13), (1.0 - smoothstep(-0.25, 0.0, ndl)) * 0.85);
    gl_FragColor = vec4(col, alpha * (0.25 + 0.85 * smoothstep(-0.35, 0.35, ndl)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Inner rim glow drawn on the planet's own surface (front side, additive). */
export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

export const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 glowColor;
  uniform float power;
  uniform float strength;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(n, V), 0.0);
    float glow = pow(rim, power);
    float sun = smoothstep(-0.55, 0.55, dot(n, normalize(sunDir)));
    float a = glow * (0.12 + 0.95 * sun) * strength;
    gl_FragColor = vec4(glowColor * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Outer halo on a slightly larger back-side sphere — the classic blue "air" ring. */
export const haloVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const haloFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 color;
  uniform float intensity;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    float d = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float glow = pow(max(0.0, 0.72 - d), 3.6);
    float sun = 0.25 + 0.85 * smoothstep(-0.6, 0.7, dot(normalize(vWorldNormal), normalize(sunDir)));
    float a = glow * sun * intensity;
    gl_FragColor = vec4(color * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Data shell: an equirectangular canvas texture of the modelled field, wrapped on a
 * sphere just above the surface. `level` is fed from the audio analyser so the planet
 * visibly breathes with its own sonification.
 */
export const dataShellVertex = earthVertex

export const dataShellFragment = /* glsl */ `
  uniform sampler2D fieldMap;
  uniform float opacity;
  uniform float level;
  uniform float pulse;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 tex = texture2D(fieldMap, vUv);
    vec3 n = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(n, V), 0.0);
    float sun = 0.35 + 0.75 * max(dot(n, normalize(sunDir)), 0.0);
    float a = tex.a * opacity * sun * (0.82 + 0.5 * level + 0.28 * pulse * pow(rim, 2.0));
    vec3 col = tex.rgb * (0.75 + 0.5 * level);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
