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
    size[i] = 0.8 + m * 3.2;
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
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(R, 128, 96),
    new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughnessMap, metalness: 0, roughness: 1 }),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.006, 128, 96),
    new THREE.MeshStandardMaterial({ map: t.clouds, transparent: true, depthWrite: false, roughness: 1, metalness: 0 }),
  );
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
  group.add(surface, clouds, atmo);
  group.position.set(-25, -104, -50);
  group.rotation.set(0.3, 2.2, 0.15);
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
  g.globalAlpha = 0.85;
  g.drawImage(earth, 0, H * 0.58, W, H * 0.42);
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
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 14);
  sg.addColorStop(0, 'rgba(255,255,255,1)');
  sg.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = sg;
  g.fillRect(sx - 16, sy - 16, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(t).texture;
  t.dispose();
  pmrem.dispose();
  return env;
}
