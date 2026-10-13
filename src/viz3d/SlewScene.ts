/**
 * Three.js scene for single axis slews: spacecraft, environment, target ghost, attitude
 * ring, and motion trail. The owner pushes physics state in with update(); this class
 * never advances anything on its own except camera damping.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SUN_DIR, makeEarth, makeEnvMap, makeStarfield, makeSun } from './environment';
import { type Spacecraft, buildSpacecraft } from './spacecraft';

export interface SlewState {
  theta: number; // body angle about +Y [rad]
  theta1: number; // target [rad]
  wheelAngle: number; // rotor angle relative to body [rad]
  wheelSweep: number; // rotor angle change over one displayed frame [rad]
  thrust: number; // -1..1, fires thrusters (0 when the wheel is the actuator)
  trail: number[]; // recent body angles, oldest first
  showGhost: boolean;
}

const ACCENT_DARK = 0xf2a93b;
const RING_R = 3.1;
const RING_Y = -1.15;

export class SlewScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private craft: Spacecraft;
  private ghost: THREE.Group;
  private heading: THREE.Mesh;
  private targetMark: THREE.Mesh;
  private trail: THREE.Line;
  private trailAlpha: Float32Array;
  private raf = 0;
  private visible = true;
  private dirty = true;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private stars: THREE.Points;
  private disposed = false;

  constructor(private host: HTMLElement, opts: { reducedMotion: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'scene3d__canvas';
    host.appendChild(r.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 2000);
    this.camera.position.set(5.6, 2.5, 6.8);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0.2, -0.25, 0);
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 22;
    this.controls.addEventListener('change', () => (this.dirty = true));

    const s = this.scene;
    s.background = new THREE.Color(0x000000);
    s.environment = makeEnvMap(r);
    s.environmentIntensity = 0.9;
    this.stars = makeStarfield();
    (this.stars.material as THREE.ShaderMaterial).uniforms.pixelRatio.value = r.getPixelRatio();
    s.add(this.stars, makeEarth(), makeSun());

    const sun = new THREE.DirectionalLight(0xfff4e6, 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(12);
    sun.castShadow = true;
    const sh = sun.shadow;
    sh.mapSize.set(window.innerWidth < 700 ? 1024 : 2048, window.innerWidth < 700 ? 1024 : 2048);
    sh.camera.left = sh.camera.bottom = -4.5;
    sh.camera.right = sh.camera.top = 4.5;
    sh.camera.near = 2;
    sh.camera.far = 25;
    sh.bias = -0.0004;
    sh.radius = 3;
    sh.normalBias = 0.02;
    s.add(sun);
    // Earth shine from below, faint and blue.
    s.add(new THREE.HemisphereLight(0x000000, 0x23405e, 0.55));

    this.craft = buildSpacecraft();
    s.add(this.craft.root);

    // Target attitude ghost
    this.ghost = new THREE.Group();
    const faceMat = new THREE.MeshBasicMaterial({ color: ACCENT_DARK, transparent: true, opacity: 0.07, depthWrite: false });
    const lineMat = new THREE.LineBasicMaterial({ color: ACCENT_DARK, transparent: true, opacity: 0.55 });
    this.craft.silhouette.children.forEach((c) => {
      const m = c as THREE.Mesh;
      const f = new THREE.Mesh(m.geometry, faceMat);
      f.position.copy(m.position);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), lineMat);
      e.position.copy(m.position);
      this.ghost.add(f, e);
    });
    s.add(this.ghost);

    // Attitude ring: fixed in inertial space, ticks every 10 deg, heavier every 30.
    const ring = new THREE.Group();
    const ringLine = new THREE.Mesh(
      new THREE.RingGeometry(RING_R - 0.008, RING_R + 0.008, 256),
      new THREE.MeshBasicMaterial({ color: 0x8b97a4, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    ringLine.rotation.x = -Math.PI / 2;
    ring.add(ringLine);
    const tickPos: number[] = [];
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180;
      const len = deg % 30 === 0 ? 0.16 : 0.07;
      tickPos.push(RING_R * Math.cos(a), 0, -RING_R * Math.sin(a), (RING_R - len) * Math.cos(a), 0, -(RING_R - len) * Math.sin(a));
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tickPos, 3));
    ring.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0x8b97a4, transparent: true, opacity: 0.55 })));
    ring.position.y = RING_Y;
    s.add(ring);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0.12, 0, 0, -0.06, 0, 0.07, -0.06, 0, -0.07], 3));
    tri.rotateY(Math.PI); // point inward
    this.heading = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: 0xe8edf2, side: THREE.DoubleSide }));
    this.targetMark = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: ACCENT_DARK, side: THREE.DoubleSide }));
    s.add(this.heading, this.targetMark);

    // Trail of the outer array tip.
    const N = 160;
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.trailAlpha = new Float32Array(N);
    tgeo.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlpha, 1));
    this.trail = new THREE.Line(
      tgeo,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `varying float vA; void main(){ gl_FragColor = vec4(0.85, 0.9, 1.0, vA * 0.55); }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.trail.frustumCulled = false;
    s.add(this.trail);

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver((e) => {
      this.visible = e[0]?.isIntersecting ?? true;
      if (this.visible) this.loop();
    });
    this.io.observe(host);
    document.addEventListener('visibilitychange', this.onVis);
    this.loop();
  }

  private onVis = () => {
    if (!document.hidden) this.loop();
  };

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Narrow (portrait) views: widen the field of view so the arrays still fit.
    this.camera.fov = w / h < 1.1 ? 42 : 30;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  update(st: SlewState) {
    const c = this.craft;
    c.root.rotation.y = st.theta;
    c.setWheel(st.wheelAngle, st.wheelSweep);
    c.setThrust(st.thrust);
    this.ghost.rotation.y = st.theta1;
    this.ghost.visible = st.showGhost;
    const place = (m: THREE.Object3D, a: number, r: number) => {
      m.position.set(r * Math.cos(a), RING_Y + 0.005, -r * Math.sin(a));
      m.rotation.y = a;
    };
    place(this.heading, st.theta, RING_R - 0.2);
    place(this.targetMark, st.theta1, RING_R + 0.2);
    this.targetMark.rotation.y = st.theta1 + Math.PI;

    const pos = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const N = pos.count;
    const tip = c.tipsLocal[0];
    const n = st.trail.length;
    for (let i = 0; i < N; i++) {
      const k = n - N + i;
      const th = k >= 0 ? st.trail[k] : n ? st.trail[0] : st.theta;
      const ca = Math.cos(th);
      const sa = Math.sin(th);
      pos.setXYZ(i, tip.x * ca + tip.z * sa, tip.y, -tip.x * sa + tip.z * ca);
      this.trailAlpha[i] = k >= 0 ? i / N : 0;
    }
    pos.needsUpdate = true;
    (this.trail.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    this.dirty = true;
  }

  private loop = () => {
    if (this.disposed) return;
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.disposed || !this.visible || document.hidden) return;
      const moved = this.controls.update();
      if (this.dirty || moved) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  resetView() {
    this.camera.position.set(5.6, 2.5, 6.8);
    this.controls.target.set(0.2, -0.25, 0);
    this.controls.update();
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        // Shared procedural textures are cached module-wide, so only dispose materials here.
        mat.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
