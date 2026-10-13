/** Space environment: starfield, Earth limb with atmosphere, the Sun, and a matching reflection map. */
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { earthTextures, glowTexture } from './textures';

/** Direction the sunlight comes from (unit vector, world frame). */
export const SUN_DIR = new THREE.Vector3(0.62, 0.62, 0.48).normalize();

export function makeStarfield(count = 6000, radius = 600) {
  const rng = makeRng(2026);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // uniform on the sphere
    const u = rng.next() * 2 - 1;
    const th = rng.next() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([radius * r * Math.cos(th), radius * u, radius * r * Math.sin(th)], i * 3);
    // magnitude-like distribution: most stars faint, a few bright
    const m = Math.pow(rng.next(), 6);
    size[i] = 1.1 + m * 3.6;
    const temp = rng.next();
    // spread from blue-white to warm
    const c = temp < 0.15 ? [0.75, 0.82, 1] : temp > 0.85 ? [1, 0.86, 0.7] : [1, 0.97, 0.94];
    const b = 0.35 + 0.65 * m + 0.25 * rng.next();
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      uniform float pixelRatio;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vColor * a, a);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

/** Large Earth below the spacecraft: only the limb is in view. */
export function makeEarth() {
  const R = 90;
  const group = new THREE.Group();
  const t = earthTextures();
  // Custom shader so the planet gets proper day/night shading, ocean glint, and clouds
  // without the bright PBR lights for the spacecraft blowing it out.
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(R, 160, 120),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: t.map }, clouds: { value: t.clouds }, rough: { value: t.roughnessMap }, sunDir: { value: SUN_DIR.clone() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform sampler2D clouds; uniform sampler2D rough; uniform vec3 sunDir;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          vec3 N = normalize(vN);
          vec3 day = texture2D(map, vUv).rgb;
          float cl = texture2D(clouds, vUv).a;
          float ocean = 1.0 - smoothstep(0.3, 0.6, texture2D(rough, vUv).r);
          float ndl = dot(N, sunDir);
          float lit = max(ndl, 0.0);
          vec3 col = mix(day, vec3(0.92), cl * 0.85) * (0.015 + 1.05 * lit);
          vec3 H = normalize(sunDir + vV);
          col += vec3(1.0, 0.9, 0.75) * pow(max(dot(N, H), 0.0), 60.0) * 0.35 * ocean * (1.0 - cl) * step(0.0, ndl);
          float fres = pow(1.0 - max(dot(N, vV), 0.0), 2.5);
          col = mix(col, vec3(0.32, 0.55, 1.0) * (0.1 + lit), fres * 0.65 * smoothstep(-0.1, 0.3, ndl));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  group.add(surface);
  // Atmosphere: view-angle (fresnel) glow, brighter on the lit side.
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.035, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: SUN_DIR.clone() } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vView; varying vec3 vWorldN;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldN = normalize(mat3(modelMatrix) * normal);
          vN = normalize(normalMatrix * normal);
          vView = normalize(-(viewMatrix * wp).xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir;
        varying vec3 vN; varying vec3 vView; varying vec3 vWorldN;
        void main() {
          float rim = 1.0 - max(dot(vN, vView), 0.0);
          float glow = pow(rim, 3.2);
          float lit = smoothstep(-0.25, 0.4, dot(vWorldN, sunDir));
          vec3 col = mix(vec3(0.25, 0.55, 1.0), vec3(0.55, 0.8, 1.0), rim);
          gl_FragColor = vec4(col * glow * (0.15 + 1.6 * lit), glow * lit);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    }),
  );
  group.add(atmo);
  // Tip the globe so mid-latitudes face up (looking straight down at a pole looks wrong).
  group.position.set(-30, -118, -110);
  group.rotation.set(1.25, 0.2, 0.5);
  return group;
}

export function makeSun() {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff6e8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  sprite.position.copy(SUN_DIR).multiplyScalar(500);
  sprite.scale.setScalar(70);
  sprite.renderOrder = -9;
  return sprite;
}

/**
 * Reflection map that matches the scene: black sky, the Sun, and Earth below.
 * Gold foil and the dish mostly reflect this, which sells the metal.
 */
export function makeEnvMap(renderer: THREE.WebGLRenderer) {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#010204';
  g.fillRect(0, 0, W, H);
  const earth = earthTextures().canvas;
  // Lower hemisphere: Earth, a bit dimmed, with a blue horizon band.
  g.globalAlpha = 1;
  g.drawImage(earth, 0, H * 0.52, W, H * 0.48);
  g.fillStyle = 'rgba(200,215,235,0.18)';
  g.fillRect(0, H * 0.52, W, H * 0.48);
  g.globalAlpha = 1;
  const band = g.createLinearGradient(0, H * 0.5, 0, H * 0.62);
  band.addColorStop(0, 'rgba(60,120,220,0)');
  band.addColorStop(0.6, 'rgba(110,170,255,0.55)');
  band.addColorStop(1, 'rgba(60,120,220,0)');
  g.fillStyle = band;
  g.fillRect(0, H * 0.5, W, H * 0.12);
  // Sun
  const az = Math.atan2(SUN_DIR.z, SUN_DIR.x);
  const el = Math.asin(SUN_DIR.y);
  const sx = ((0.5 - az / (2 * Math.PI)) % 1) * W;
  const sy = (0.5 - el / Math.PI) * H;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 22);
  sg.addColorStop(0, 'rgba(255,255,255,1)');
  sg.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = sg;
  g.fillRect(sx - 24, sy - 24, 48, 48);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(t).texture;
  t.dispose();
  pmrem.dispose();
  return env;
}
