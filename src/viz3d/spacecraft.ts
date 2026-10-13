/**
 * Procedural spacecraft built from primitives. Body frame: +Y is the slew axis (up),
 * +X along the solar array wings, +Z forward. Units are meters.
 *
 * The +X/+Y/+Z corner of the bus is cut away to show the reaction wheel, whose spin
 * angle is set from the simulation every frame (never animated on its own).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { honeycombTexture, mliTextures, panelBackTexture, radiatorTexture, solarCellTexture } from './textures';

export const BUS = { w: 1.4, h: 1.3, d: 1.2 };
const NOTCH = { x0: 0.1, y0: 0.05, z0: 0.05 }; // cutaway corner starts here, runs to the bus faces

export interface Materials {
  gold: THREE.MeshPhysicalMaterial;
  radiator: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  alu: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  cells: THREE.MeshPhysicalMaterial;
  panelBack: THREE.MeshStandardMaterial;
}

function makeMaterials(): Materials {
  const mli = mliTextures();
  return {
    gold: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: mli.map,
      normalMap: mli.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: mli.roughnessMap,
      roughness: 0.55,
      metalness: 1,
      envMapIntensity: 1.25,
    }),
    radiator: new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.62, metalness: 0.05 }),
    interior: new THREE.MeshStandardMaterial({ map: honeycombTexture(), roughness: 0.75, metalness: 0.5, color: 0x9aa0a8 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.38, metalness: 0.9 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x4d535b, roughness: 0.35, metalness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
    cells: new THREE.MeshPhysicalMaterial({
      map: solarCellTexture(),
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.1,
    }),
    panelBack: new THREE.MeshStandardMaterial({ map: panelBackTexture(), roughness: 0.6, metalness: 0.1 }),
  };
}

/** Scale box UVs per face so a tiling texture keeps a constant physical size (tile = `tile` meters). */
function scaleBoxUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, faces: boolean[], tile = 0.9) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    if (!faces[f]) continue;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile + f * 0.37, (uv.getY(i) * dims[f][1]) / tile + f * 0.21);
    }
  }
  uv.needsUpdate = true;
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mats: THREE.Material[], goldFaces: boolean[]) {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const geo = new THREE.BoxGeometry(w, h, d);
  scaleBoxUVs(geo, w, h, d, goldFaces);
  const m = new THREE.Mesh(geo, mats);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r0: number, r1: number, h: number, mat: THREE.Material, seg = 24, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A rod from a to b. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = cyl(r, r, len, mat, 8);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function buildBus(M: Materials) {
  const g = new THREE.Group();
  const { w, h, d } = BUS;
  const X = w / 2;
  const Y = h / 2;
  const Z = d / 2;
  const { x0, y0, z0 } = NOTCH;
  const G = M.gold;
  const R = M.radiator;
  const I = M.interior;
  // Faces: [px, nx, py, ny, pz, nz]. Three boxes make an L shaped bus with the corner removed.
  g.add(box(-X, X, -Y, y0, -Z, Z, [G, G, I, G, G, R], [true, true, false, true, true, false]));
  g.add(box(-X, x0, y0, Y, -Z, Z, [I, G, G, G, G, R], [false, true, true, false, true, false]));
  g.add(box(x0, X, y0, Y, -Z, z0, [G, I, G, I, I, R], [true, false, true, false, false, false]));

  // Edge frame along the outside corners (thin aluminium angles) to give the bus a hard silhouette.
  const t = 0.022;
  const edges: [number, number, number, number, number, number][] = [
    [-X, -X, -Y, Y, -Z, -Z],
    [-X, -X, -Y, Y, Z, Z],
    [X, X, -Y, Y, -Z, -Z],
    [X, X, -Y, y0, Z, Z],
    [-X, X, -Y, -Y, Z, Z],
    [-X, X, -Y, -Y, -Z, -Z],
    [-X, -X, -Y, -Y, -Z, Z],
    [X, X, -Y, -Y, -Z, Z],
    [-X, x0, Y, Y, Z, Z],
    [-X, X, Y, Y, -Z, -Z],
    [-X, -X, Y, Y, -Z, Z],
    [X, X, Y, Y, -Z, z0],
  ];
  for (const [a0, a1, b0, b1, c0, c1] of edges) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(Math.max(t, a1 - a0 + t), Math.max(t, b1 - b0 + t), Math.max(t, c1 - c0 + t)), M.alu);
    e.position.set((a0 + a1) / 2, (b0 + b1) / 2, (c0 + c1) / 2);
    e.castShadow = true;
    g.add(e);
  }
  // Launch adapter ring underneath.
  const ring = cyl(0.42, 0.45, 0.09, M.alu, 48, true);
  ring.position.y = -Y - 0.045;
  g.add(ring);
  // Small details: sun sensor, omni antenna, connector panel.
  const sunSensor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.08), M.black);
  sunSensor.position.set(-0.45, Y + 0.02, 0.35);
  g.add(sunSensor);
  const omni = strut(new THREE.Vector3(0.0, Y, -0.4), new THREE.Vector3(0.0, Y + 0.32, -0.4), 0.008, M.alu);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), M.white);
  knob.position.set(0, Y + 0.33, -0.4);
  g.add(omni, knob);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 12), M.darkMetal);
    c.rotation.z = Math.PI / 2;
    c.position.set(-X - 0.02, -0.45 + i * 0.07, -0.35);
    g.add(c);
  }
  return g;
}

/** Reaction wheel in the cutaway. Returns the rotor and the visual pieces that react to speed. */
function buildWheel(M: Materials) {
  const g = new THREE.Group();
  const cx = (NOTCH.x0 + BUS.w / 2) / 2;
  const cz = (NOTCH.z0 + BUS.d / 2) / 2;
  g.position.set(cx + 0.02, NOTCH.y0, cz + 0.02);
  const rimR = 0.17;
  // Housing: a cylinder with a quarter cut out so the rotor is visible.
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.205, 0.13, 48, 1, true, Math.PI * 0.5, Math.PI * 1.5),
    new THREE.MeshStandardMaterial({ color: 0x9aa1a9, roughness: 0.45, metalness: 0.85, side: THREE.DoubleSide }),
  );
  housing.position.y = 0.075;
  housing.castShadow = true;
  const base = cyl(0.215, 0.215, 0.02, M.alu, 48);
  base.position.y = 0.01;
  g.add(housing, base);

  const rotor = new THREE.Group();
  rotor.position.y = 0.075;
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.3, metalness: 0.95 });
  const rimProfile = [
    new THREE.Vector2(rimR - 0.03, -0.035),
    new THREE.Vector2(rimR, -0.035),
    new THREE.Vector2(rimR, 0.035),
    new THREE.Vector2(rimR - 0.03, 0.035),
    new THREE.Vector2(rimR - 0.03, -0.035),
  ];
  const rim = new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 64), rotorMat);
  rim.castShadow = true;
  const hub = cyl(0.035, 0.035, 0.09, M.alu, 24);
  const spokes = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(rimR - 0.04, 0.012, 0.03), rotorMat);
    const a = (i * Math.PI) / 3;
    s.position.set(Math.cos(a) * (rimR / 2), 0, -Math.sin(a) * (rimR / 2));
    s.rotation.y = a;
    spokes.add(s);
  }
  // White index stripe on the rim so rotation is readable.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.074, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.4, emissive: 0x30302a }),
  );
  stripe.position.set(rimR - 0.012, 0, 0);
  rotor.add(rim, hub, spokes, stripe);

  // Motion smear: when the wheel turns more than ~0.6 rad per frame, a still frame cannot
  // show it honestly, so draw the arc the stripe swept during the frame (like a camera shutter).
  const smearMat = new THREE.ShaderMaterial({
    uniforms: { sweep: { value: 0 }, opacity: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float sweep; uniform float opacity; varying vec2 vP;
      void main(){
        float a = atan(vP.y, vP.x);              // 0 at the stripe, increasing backwards along the sweep
        float back = mod(-a * sign(sweep) + 6.2831853, 6.2831853);
        float s = min(abs(sweep), 6.2831853);
        float on = step(back, s);
        float fade = 1.0 - back / max(s, 1e-3);
        gl_FragColor = vec4(vec3(0.95, 0.94, 0.9), on * opacity * (0.25 + 0.75 * fade));
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const smear = new THREE.Mesh(new THREE.RingGeometry(rimR - 0.03, rimR, 96, 1), smearMat);
  smear.rotation.x = -Math.PI / 2;
  smear.position.y = 0.0375;
  rotor.add(smear);
  g.add(rotor);

  // Electronics box and a harness run, for context.
  const ebox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), M.darkMetal);
  ebox.position.set(-0.2, 0.04, 0.15);
  ebox.castShadow = true;
  g.add(ebox);
  const harness = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.12, 0.05, 0.15),
        new THREE.Vector3(-0.05, 0.03, 0.2),
        new THREE.Vector3(0.05, 0.025, 0.21),
        new THREE.Vector3(0.12, 0.04, 0.16),
      ]),
      24,
      0.01,
      8,
    ),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.7 }),
  );
  g.add(harness);
  return { group: g, rotor, spokes, stripe, smearMat };
}

function buildArrays(M: Materials) {
  const g = new THREE.Group();
  const panelLen = 0.95;
  const panelWid = 0.82;
  const thick = 0.028;
  const gap = 0.045;
  const yMount = -0.28;
  const tips: THREE.Vector3[] = [];
  for (const side of [1, -1]) {
    const wing = new THREE.Group();
    const root = (BUS.w / 2) * side;
    // Boom and yoke: a short tube with a V of struts to the first panel.
    const boomEnd = root + 0.42 * side;
    wing.add(strut(new THREE.Vector3(root, yMount, 0), new THREE.Vector3(boomEnd, yMount, 0), 0.028, M.alu));
    const drive = cyl(0.06, 0.06, 0.1, M.darkMetal, 20);
    drive.rotation.z = Math.PI / 2;
    drive.position.set(root + 0.06 * side, yMount, 0);
    wing.add(drive);
    const pStart = boomEnd + 0.12 * side;
    for (const zz of [-panelWid / 2 + 0.06, panelWid / 2 - 0.06])
      wing.add(strut(new THREE.Vector3(boomEnd, yMount, 0), new THREE.Vector3(pStart, yMount, zz), 0.012, M.alu));
    for (let i = 0; i < 3; i++) {
      const x0 = pStart + side * i * (panelLen + gap);
      const x1 = x0 + side * panelLen;
      const geo = new THREE.BoxGeometry(panelLen, thick, panelWid);
      const p = new THREE.Mesh(geo, [M.alu, M.alu, M.cells, M.panelBack, M.alu, M.alu]);
      p.position.set((x0 + x1) / 2, yMount, 0);
      p.castShadow = true;
      p.receiveShadow = true;
      wing.add(p);
      if (i < 2) {
        for (const zz of [-0.25, 0.25]) {
          const hinge = cyl(0.014, 0.014, 0.08, M.alu, 10);
          hinge.rotation.x = Math.PI / 2;
          hinge.position.set(x1 + (side * gap) / 2, yMount, zz);
          wing.add(hinge);
        }
      }
      if (i === 2) tips.push(new THREE.Vector3(x1, yMount, panelWid / 2));
    }
    g.add(wing);
  }
  return { group: g, tips };
}

function buildDish(M: Materials) {
  const g = new THREE.Group();
  const R = 0.42;
  const f = 0.3;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const r = (R * i) / 24;
    pts.push(new THREE.Vector2(r, (r * r) / (4 * f)));
  }
  const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), M.white);
  dish.castShadow = true;
  dish.receiveShadow = true;
  const rimY = (R * R) / (4 * f);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 8, 72), M.alu);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = rimY;
  g.add(dish, rim);
  const focus = new THREE.Vector3(0, f, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + 0.3;
    g.add(strut(new THREE.Vector3(R * 0.92 * Math.cos(a), rimY * 0.85, R * 0.92 * Math.sin(a)), focus, 0.006, M.alu));
  }
  const horn = cyl(0.045, 0.02, 0.08, M.darkMetal, 16);
  horn.position.copy(focus);
  g.add(horn);
  const back = cyl(0.06, 0.08, 0.06, M.alu, 16);
  back.position.y = -0.02;
  g.add(back);

  // Mount: boom out of the +Z face, dish tipped toward Earth (below).
  const mount = new THREE.Group();
  const boomA = new THREE.Vector3(-0.32, -0.3, BUS.d / 2);
  const boomB = new THREE.Vector3(-0.32, -0.3, BUS.d / 2 + 0.38);
  mount.add(strut(boomA, boomB, 0.03, M.alu));
  const gimbal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M.darkMetal);
  gimbal.position.copy(boomB);
  mount.add(gimbal);
  g.position.copy(boomB).add(new THREE.Vector3(0, 0, 0.06));
  g.rotation.x = Math.PI / 2 + 0.55; // opens toward +Z, tipped down
  mount.add(g);
  return mount;
}

function buildStarTrackers(M: Materials) {
  const g = new THREE.Group();
  for (const [x, z, tilt] of [
    [-0.45, -0.3, 0.45],
    [-0.15, -0.42, -0.45],
  ]) {
    const st = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.13), M.darkMetal);
    body.position.y = 0.04;
    const baffle = cyl(0.075, 0.05, 0.22, M.black, 24, true);
    baffle.position.y = 0.19;
    const vanes = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 24), M.black);
    vanes.rotation.x = Math.PI / 2;
    vanes.position.y = 0.24;
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 24),
      new THREE.MeshPhysicalMaterial({ color: 0x0a1426, roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
    );
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = 0.09;
    st.add(body, baffle, vanes, lens);
    st.position.set(x, BUS.h / 2, z);
    st.rotation.set(tilt * 0.4, 0, tilt);
    g.add(st);
  }
  return g;
}

/**
 * Four thrusters on the bottom corners that make a yaw couple. torqueSign says which
 * way each one turns the body about +Y.
 */
function buildThrusters(M: Materials) {
  const g = new THREE.Group();
  const X = BUS.w / 2;
  const Z = BUS.d / 2;
  const y = -BUS.h / 2 + 0.12;
  const defs = [
    { x: X, z: Z, dir: 1, torqueSign: 1 },
    { x: -X, z: -Z, dir: -1, torqueSign: 1 },
    { x: X, z: -Z, dir: -1, torqueSign: -1 },
    { x: -X, z: Z, dir: 1, torqueSign: -1 },
  ];
  const bell: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    bell.push(new THREE.Vector2(0.016 + 0.034 * s * s, s * 0.09));
  }
  const plumes: { mat: THREE.ShaderMaterial; torqueSign: number }[] = [];
  for (const d of defs) {
    const t = new THREE.Group();
    t.position.set(d.x * 0.93, y, d.z);
    // Lathe axis is +Y; point the bell along +-Z.
    t.rotation.x = (d.dir * Math.PI) / 2;
    const noz = new THREE.Mesh(new THREE.LatheGeometry(bell, 24), new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide }));
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), M.darkMetal);
    valve.position.y = -0.01;
    const mat = new THREE.ShaderMaterial({
      uniforms: { level: { value: 0 } },
      vertexShader: /* glsl */ `varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ vT = uv.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `uniform float level; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){
          float edge = pow(abs(dot(vN, vV)), 1.5);
          float along = pow(vT, 2.2);
          vec3 col = mix(vec3(0.55,0.7,1.0), vec3(1.0,0.95,0.85), along);
          float a = level * along * edge;
          gl_FragColor = vec4(col * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // Cone with its apex at the nozzle throat, opening outward.
    const coneGeo = new THREE.ConeGeometry(0.11, 0.55, 24, 1, true);
    coneGeo.rotateX(Math.PI);
    coneGeo.translate(0, 0.09 + 0.275, 0);
    const plume = new THREE.Mesh(coneGeo, mat);
    plume.renderOrder = 5;
    t.add(noz, valve, plume);
    g.add(t);
    plumes.push({ mat, torqueSign: d.torqueSign });
  }
  return {
    group: g,
    /** u in [-1, 1]: commanded torque as a fraction of max. Fires the matching couple. */
    setThrust(u: number) {
      for (const p of plumes) p.mat.uniforms.level.value = Math.max(0, Math.sign(u) === p.torqueSign ? Math.abs(u) : 0);
    },
  };
}

export interface Spacecraft {
  root: THREE.Group;
  /** Spin angle of the rotor relative to the body [rad], and how far it turned this frame. */
  setWheel(angle: number, sweepPerFrame: number): void;
  setThrust(u: number): void;
  tipsLocal: THREE.Vector3[];
  silhouette: THREE.Group; // simplified shapes for the ghost
}

export function buildSpacecraft(): Spacecraft {
  const M = makeMaterials();
  const root = new THREE.Group();
  const bus = buildBus(M);
  const wheel = buildWheel(M);
  const arrays = buildArrays(M);
  const thrusters = buildThrusters(M);
  root.add(bus, wheel.group, arrays.group, buildDish(M), buildStarTrackers(M), thrusters.group);

  const silhouette = new THREE.Group();
  const busBox = new RoundedBoxGeometry(BUS.w, BUS.h, BUS.d, 2, 0.02);
  silhouette.add(new THREE.Mesh(busBox));
  for (const side of [1, -1]) {
    const len = 3 * 0.95 + 2 * 0.045;
    const start = BUS.w / 2 + 0.54;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.82));
    m.position.set(side * (start + len / 2), -0.28, 0);
    silhouette.add(m);
  }

  return {
    root,
    tipsLocal: arrays.tips,
    silhouette,
    setThrust: thrusters.setThrust,
    setWheel(angle, sweep) {
      wheel.rotor.rotation.y = angle;
      const fast = Math.min(1, Math.max(0, (Math.abs(sweep) - 0.4) / 0.8));
      wheel.spokes.visible = fast < 0.95;
      wheel.stripe.visible = fast < 0.95;
      wheel.smearMat.uniforms.sweep.value = sweep;
      wheel.smearMat.uniforms.opacity.value = fast * 0.85;
    },
  };
}
