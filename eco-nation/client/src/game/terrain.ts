// Grille de hauteurs du pays (1 km) et utilitaires géométriques partagés par la carte 3D.
import * as THREE from 'three';
import { HALF_D, HALF_W, MAP_D, MAP_W, makeHeightFn } from '../../../shared/sim/country';
import { fbm } from '../../../shared/noise';
import type { CountryDef } from '../../../shared/sim/types';

export const VS = 6; // exagération verticale du relief (1 km d'altitude = 6 unités)
export const RES = 1; // km par maille

export interface Grid {
  nx: number;
  nz: number;
  h: Float32Array; // hauteurs en km
  sample: (x: number, z: number) => number; // altitude (km), interpolation bilinéaire
  y: (x: number, z: number) => number; // altitude en unités de rendu
}

export function buildGrid(country: CountryDef): Grid {
  const fn = makeHeightFn(country);
  const nx = Math.round(MAP_W / RES) + 1;
  const nz = Math.round(MAP_D / RES) + 1;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = fn(-HALF_W + i * RES, -HALF_D + j * RES);
  const sample = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(nx - 1.001, (x + HALF_W) / RES));
    const fz = Math.max(0, Math.min(nz - 1.001, (z + HALF_D) / RES));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = h[j * nx + i];
    const b = h[j * nx + i + 1];
    const c = h[(j + 1) * nx + i];
    const d = h[(j + 1) * nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  return { nx, nz, h, sample, y: (x, z) => Math.max(0, sample(x, z)) * VS };
}

export function terrainGeometry(grid: Grid, step: number) {
  const nx = Math.floor((grid.nx - 1) / step) + 1;
  const nz = Math.floor((grid.nz - 1) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const gi = i * step;
      const gj = j * step;
      const k = (j * nx + i) * 3;
      pos[k] = -HALF_W + gi * RES;
      pos[k + 1] = grid.h[gj * grid.nx + gi] * VS;
      pos[k + 2] = -HALF_D + gj * RES;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx[p++] = a; idx[p++] = a + nx; idx[p++] = a + 1;
      idx[p++] = a + 1; idx[p++] = a + nx; idx[p++] = a + nx + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/** Ruban suivant une polyligne posée sur le relief (routes, voies ferrées, rivières). */
export function ribbon(points: [number, number][], width: number, grid: Grid, lift: number, minY = 0) {
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nxv = -dz * width * 0.5;
    const nzv = dx * width * 0.5;
    const y = Math.max(minY, grid.y(x, z)) + lift;
    pos.set([x + nxv, y, z + nzv, x - nxv, y, z - nzv], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Densifie une polyligne (pour suivre le relief). */
export function densify(points: [number, number][], step = 0.8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function forestMask(x: number, z: number) {
  return fbm(x * 0.035 + 50, z * 0.035 - 20, 3);
}

export function distToPolyline(x: number, z: number, pts: [number, number][]) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if (Math.abs(x - ax) > 6 && Math.abs(x - bx) > 6) continue;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    d = Math.min(d, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return d;
}

/** Environnement visuel partagé (cycle jour/nuit, saisons, météo). */
export const ENV = {
  night: { value: 0 },
  winter: { value: 0 }, // 0 été → 1 plein hiver
  autumn: { value: 0 },
  snow: { value: 0 },
  wet: { value: 0 },
  time: { value: 0 },
};
