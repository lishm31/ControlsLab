/**
 * Procedural textures drawn on canvases at load time. No image assets, so nothing to
 * license and nothing extra to download. Each generator is cached.
 */
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { makeNoise3 } from './noise';

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Height field (0..1 grayscale) to a tangent space normal map. */
function normalFromHeight(height: Float32Array, w: number, h: number, strength: number) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (0.5 - (0.5 * dx) / len) * 255;
      img.data[i + 1] = (0.5 + (0.5 * dy) / len) * 255;
      img.data[i + 2] = (0.5 + 0.5 / len) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Gold multi-layer insulation: crinkled foil. Built from many random fold lines
 * (sharp ridges) over low frequency puckering, then turned into normal and roughness maps.
 */
export function mliTextures() {
  return once('mli', () => {
    const W = 512;
    const rng = makeRng(31);
    const { fbm } = makeNoise3(7);
    const height = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        // Tileable: sample noise on a torus.
        const a = (x / W) * Math.PI * 2;
        const b = (y / W) * Math.PI * 2;
        height[y * W + x] = 0.5 + 0.18 * fbm(Math.cos(a) * 2.2, Math.sin(a) * 2.2 + Math.cos(b) * 2.2, Math.sin(b) * 2.2, 4);
      }
    // Creases: lots of short thin ridges in random directions, like handled foil.
    const [, cg] = canvas(W, W);
    cg.fillStyle = '#000';
    cg.fillRect(0, 0, W, W);
    cg.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = rng.next() * W;
      const y = rng.next() * W;
      const ang = rng.next() * Math.PI;
      const len = 4 + Math.pow(rng.next(), 2) * 46;
      cg.strokeStyle = `rgba(255,255,255,${0.06 + rng.next() * 0.22})`;
      cg.lineWidth = 0.5 + rng.next() * 1.1;
      for (const ox of [-W, 0, W])
        for (const oy of [-W, 0, W]) {
          cg.beginPath();
          cg.moveTo(x + ox, y + oy);
          cg.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
          cg.stroke();
        }
    }
    const crease = cg.getImageData(0, 0, W, W).data;
    for (let i = 0; i < W * W; i++) height[i] += (crease[i * 4] / 255) * 0.35;
    const normal = normalFromHeight(height, W, W, 8);

    // Albedo: gold, only slight tonal variation (foil color is uniform, the look comes from reflections).
    const [ac, ag] = canvas(W, W);
    const img = ag.createImageData(W, W);
    for (let i = 0; i < W * W; i++) {
      const k = 0.94 + 0.12 * (height[i] - 0.5);
      img.data[i * 4] = Math.min(255, 232 * k);
      img.data[i * 4 + 1] = Math.min(255, 164 * k);
      img.data[i * 4 + 2] = Math.min(255, 62 * k);
      img.data[i * 4 + 3] = 255;
    }
    ag.putImageData(img, 0, 0);
    ag.fillStyle = 'rgba(150,100,40,0.35)';
    ag.fillRect(0, W * 0.5 - 4, W, 8); // tape seam
    ag.fillRect(W * 0.25 - 3, 0, 6, W);

    // Roughness: smooth foil, creases a bit rougher.
    const [rc, rg] = canvas(W, W);
    const rimg = rg.createImageData(W, W);
    for (let i = 0; i < W * W; i++) {
      const r = 60 + (crease[i * 4] / 255) * 90 + (height[i] - 0.5) * 40;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.max(0, Math.min(255, r));
      rimg.data[i * 4 + 3] = 255;
    }
    rg.putImageData(rimg, 0, 0);
    return { map: tex(ac, true), normalMap: tex(normal, false), roughnessMap: tex(rc, false) };
  });
}

/**
 * Solar cell panel face: dark blue cells with silver busbars and fine fingers, white
 * gaps between cells. cols x rows cells per panel.
 */
export function solarCellTexture(cols = 6, rows = 5) {
  return once(`cells${cols}x${rows}`, () => {
    const cw = 96;
    const ch = 80;
    const W = cols * cw;
    const H = rows * ch;
    const [c, g] = canvas(W, H);
    const rng = makeRng(5);
    g.fillStyle = '#d9dde3';
    g.fillRect(0, 0, W, H);
    const gap = 3;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = i * cw + gap;
        const y = j * ch + gap;
        const w = cw - 2 * gap;
        const h = ch - 2 * gap;
        const tone = 30 + rng.next() * 10;
        g.fillStyle = `rgb(${tone * 0.35},${tone * 0.55},${tone * 1.6 + 30})`;
        g.fillRect(x, y, w, h);
        // cropped corners like real cells
        g.fillStyle = '#d9dde3';
        const k = 7;
        for (const [cx, cy, dx, dy] of [
          [x, y, 1, 1],
          [x + w, y, -1, 1],
          [x, y + h, 1, -1],
          [x + w, y + h, -1, -1],
        ]) {
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + dx * k, cy);
          g.lineTo(cx, cy + dy * k);
          g.closePath();
          g.fill();
        }
        // fingers
        g.strokeStyle = 'rgba(190,200,215,0.28)';
        g.lineWidth = 0.6;
        for (let f = 4; f < h; f += 4) {
          g.beginPath();
          g.moveTo(x + 2, y + f);
          g.lineTo(x + w - 2, y + f);
          g.stroke();
        }
        // busbars
        g.fillStyle = 'rgba(205,212,222,0.9)';
        g.fillRect(x + w * 0.33 - 1, y, 2.2, h);
        g.fillRect(x + w * 0.66 - 1, y, 2.2, h);
      }
    const t = tex(c, true, false);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Back of a solar panel: white composite face sheet with a darker strut grid. */
export function panelBackTexture() {
  return once('panelback', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#c9ccd0';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#8f949a';
    g.lineWidth = 6;
    for (const p of [32, 128, 224]) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, 256);
      g.stroke();
    }
    g.lineWidth = 4;
    for (const p of [64, 192]) {
      g.beginPath();
      g.moveTo(0, p);
      g.lineTo(256, p);
      g.stroke();
    }
    return tex(c, true, false);
  });
}

/** Radiator: white paint with panel lines and fasteners. */
export function radiatorTexture() {
  return once('radiator', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#e9ebee';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#a7adb5';
    g.lineWidth = 2;
    g.strokeRect(8, 8, 240, 240);
    g.beginPath();
    g.moveTo(128, 8);
    g.lineTo(128, 248);
    g.stroke();
    g.fillStyle = '#8d939b';
    for (let i = 16; i < 248; i += 24)
      for (const x of [14, 122, 134, 242]) {
        g.beginPath();
        g.arc(x, i, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    return tex(c, true, false);
  });
}

/** Aluminium honeycomb, for the exposed panel edges in the cutaway. */
export function honeycombTexture() {
  return once('honeycomb', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#3a3f45';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#6c737b';
    g.lineWidth = 1.2;
    const r = 8;
    const hstep = r * Math.sqrt(3);
    for (let row = -1; row < 256 / (1.5 * r) + 1; row++)
      for (let col = -1; col < 256 / hstep + 1; col++) {
        const cx = col * hstep + (row % 2 ? hstep / 2 : 0);
        const cy = row * 1.5 * r;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
      }
    return tex(c, true);
  });
}

/**
 * Earth: continents from thresholded fBm sampled on the sphere (so there is no seam),
 * ocean with depth tint, polar ice, and a separate cloud layer.
 */
export function earthTextures(seed = 3) {
  return once(`earth${seed}`, () => {
    const W = 2048;
    const H = 1024;
    const land = makeNoise3(seed);
    const cloud = makeNoise3(seed + 100);
    const [c, g] = canvas(W, H);
    const [cc, cg] = canvas(W, H);
    const [rc, rg] = canvas(W, H);
    const img = g.createImageData(W, H);
    const cimg = cg.createImageData(W, H);
    const rimg = rg.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - y / H) * Math.PI;
      for (let x = 0; x < W; x++) {
        const lon = (x / W) * Math.PI * 2;
        const px = Math.cos(lat) * Math.cos(lon);
        const py = Math.sin(lat);
        const pz = Math.cos(lat) * Math.sin(lon);
        const e = land.fbm(px * 1.8 + 3, py * 1.8, pz * 1.8, 6) + 0.05;
        const i = (y * W + x) * 4;
        const polar = Math.abs(lat) > 1.3 + 0.08 * land.noise(px * 6, py * 6, pz * 6);
        let r: number, gg: number, b: number, rough: number;
        if (polar) {
          [r, gg, b, rough] = [235, 240, 245, 200];
        } else if (e > 0.11) {
          const dry = Math.max(0, Math.min(1, 1.6 * (0.45 - Math.abs(lat)) + 0.6 * land.noise(px * 5, py * 5, pz * 5)));
          const m = Math.min(1, (e - 0.11) * 4);
          r = 70 + 90 * dry + 30 * m;
          gg = 90 + 50 * dry + 10 * m;
          b = 50 + 30 * dry;
          rough = 235;
        } else {
          const depth = Math.min(1, (0.11 - e) * 5);
          r = 10 + 12 * (1 - depth);
          gg = 38 + 45 * (1 - depth);
          b = 80 + 60 * (1 - depth);
          rough = 70;
        }
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough;
        rimg.data[i + 3] = 255;
        const cl = cloud.fbm(px * 2.5, py * 5.5, pz * 2.5, 6);
        const a = Math.max(0, Math.min(1, (cl - 0.1) * 3.4));
        cimg.data[i] = cimg.data[i + 1] = cimg.data[i + 2] = 255;
        cimg.data[i + 3] = a * 235;
      }
    }
    g.putImageData(img, 0, 0);
    cg.putImageData(cimg, 0, 0);
    rg.putImageData(rimg, 0, 0);
    const map = tex(c, true, false);
    map.wrapS = THREE.RepeatWrapping;
    const clouds = tex(cc, true, false);
    clouds.wrapS = THREE.RepeatWrapping;
    const rough = tex(rc, false, false);
    rough.wrapS = THREE.RepeatWrapping;
    return { map, clouds, roughnessMap: rough, canvas: c, cloudCanvas: cc };
  });
}

/** Soft radial glow sprite (sun halo). */
export function glowTexture() {
  return once('glow', () => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,250,1)');
    grad.addColorStop(0.12, 'rgba(255,250,235,0.9)');
    grad.addColorStop(0.35, 'rgba(255,230,190,0.18)');
    grad.addColorStop(1, 'rgba(255,220,180,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return tex(c, true, false);
  });
}
