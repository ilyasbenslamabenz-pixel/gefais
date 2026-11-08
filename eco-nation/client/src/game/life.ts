// Vie du pays : voitures, trains, avions, navires (instances fines animées), météo.
import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import { mulberry32 } from '../../../shared/noise';
import { coastX } from '../../../shared/sim/country';
import type { CountryDef } from '../../../shared/sim/types';
import { ENV, densify, type Grid } from './terrain';

interface Path { pts: Vector3[]; cum: number[]; len: number }
function makePath(points: [number, number][], grid: Grid, lift: number): Path {
  const pts = densify(points, 0.15).map(([x, z]) => new Vector3(x, Math.max(0.03, grid.y(x, z)) + lift, z));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Vector3.Distance(pts[i], pts[i - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function at(p: Path, d: number, out: Vector3, dir: Vector3) {
  d = ((d % p.len) + p.len) % p.len;
  let lo = 0, hi = p.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] < d) lo = mid; else hi = mid; }
  const t = (d - p.cum[lo]) / Math.max(1e-6, p.cum[hi] - p.cum[lo]);
  Vector3.LerpToRef(p.pts[lo], p.pts[hi], t, out);
  p.pts[hi].subtractToRef(p.pts[lo], dir);
  dir.normalize();
}

export function createTraffic(scene: Scene, grid: Grid, country: CountryDef, maxCars: number) {
  const rnd = mulberry32(country.seed + 77);
  const roads = country.links.filter((l) => l.kind !== 'rail').map((l) => ({ p: makePath(l.points, grid, 0.008), kind: l.kind }));
  const rails = country.links.filter((l) => l.kind === 'rail').map((l) => makePath(l.points, grid, 0.01));
  const totalLen = roads.reduce((s, r) => s + r.p.len * (r.kind === 'autoroute' ? 3 : 1), 0) || 1;
  const cars: { r: number; d: number; v: number; lane: number }[] = [];
  roads.forEach((r, ri) => {
    const n = Math.round((maxCars * r.p.len * (r.kind === 'autoroute' ? 3 : 1)) / totalLen);
    for (let k = 0; k < n; k++) {
      const fwd = rnd() < 0.5;
      cars.push({ r: ri, d: rnd() * r.p.len, v: (r.kind === 'autoroute' ? 0.09 : 0.05) * (0.8 + rnd() * 0.4) * (fwd ? 1 : -1), lane: fwd ? 1 : -1 });
    }
  });
  const trains = rails.map((p) => ({ p, d: rnd() * p.len, v: 0.14 * (rnd() < 0.5 ? 1 : -1) }));

  const car = MeshBuilder.CreateBox('cars', { width: 0.007, height: 0.005, depth: 0.014 }, scene);
  car.bakeTransformIntoVertices(Matrix.Translation(0, 0.0025, 0));
  const carMat = new StandardMaterial('carMat', scene);
  carMat.diffuseColor = Color3.White();
  carMat.specularColor = new Color3(0.4, 0.4, 0.4);
  car.material = carMat;
  car.isPickable = false;
  const carBuf = new Float32Array(Math.max(1, cars.length) * 16);
  const carCol = new Float32Array(Math.max(1, cars.length) * 4);
  const palette = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#ffb703', '#adb5bd', '#2a9d8f', '#222222'];
  cars.forEach((_, i) => { const c = Color3.FromHexString(palette[Math.floor(rnd() * palette.length)]); carCol.set([c.r, c.g, c.b, 1], i * 4); });
  car.thinInstanceSetBuffer('matrix', carBuf, 16, false);
  car.thinInstanceSetBuffer('color', carCol, 4, true);

  const wagon = MeshBuilder.CreateBox('trains', { width: 0.01, height: 0.01, depth: 0.045 }, scene);
  wagon.bakeTransformIntoVertices(Matrix.Translation(0, 0.005, 0));
  const tMat = new StandardMaterial('trainMat', scene);
  tMat.diffuseColor = Color3.FromHexString('#e63946');
  wagon.material = tMat;
  wagon.isPickable = false;
  const trainBuf = new Float32Array(Math.max(1, trains.length * 4) * 16);
  wagon.thinInstanceSetBuffer('matrix', trainBuf, 16, false);

  const v = new Vector3();
  const dir = new Vector3();
  const m = new Matrix();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const zero = new Vector3(0, 0, 0);
  let activity = 1;
  const update = (dt: number) => {
    const visible = Math.floor(cars.length * Math.min(1, 0.65 * activity) * (1 - ENV.night * 0.55));
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const r = roads[c.r];
      c.d += c.v * dt;
      at(r.p, c.d, v, dir);
      const side = r.kind === 'autoroute' ? 0.013 : 0.008;
      v.x += -dir.z * side * c.lane;
      v.z += dir.x * side * c.lane;
      Quaternion.FromEulerAnglesToRef(0, Math.atan2(dir.x * c.lane, dir.z * c.lane), 0, q);
      Matrix.ComposeToRef(i < visible ? one : zero, q, v, m);
      m.copyToArray(carBuf, i * 16);
    }
    car.thinInstanceBufferUpdated('matrix');
    carMat.emissiveColor.set(ENV.night * 0.9, ENV.night * 0.8, ENV.night * 0.5);
    let k = 0;
    for (const t of trains) {
      t.d += t.v * dt;
      for (let w = 0; w < 4; w++) {
        at(t.p, t.d - Math.sign(t.v) * w * 0.05, v, dir);
        Quaternion.FromEulerAnglesToRef(0, Math.atan2(dir.x, dir.z), 0, q);
        Matrix.ComposeToRef(one, q, v, m);
        m.copyToArray(trainBuf, k++ * 16);
      }
    }
    wagon.thinInstanceBufferUpdated('matrix');
    tMat.emissiveColor.set(ENV.night * 0.6, ENV.night * 0.4, ENV.night * 0.3);
  };
  car.alwaysSelectAsActiveMesh = true;
  wagon.alwaysSelectAsActiveMesh = true;
  return { update, setActivity: (a: number) => { activity = Math.max(0.3, Math.min(1.4, a)); } };
}

export function createAirSea(scene: Scene, grid: Grid, country: CountryDef) {
  const airports = country.infra.filter((i) => i.type === 'aeroport');
  const ports = country.infra.filter((i) => i.type === 'port');
  const white = new StandardMaterial('planeMat', scene);
  white.diffuseColor = Color3.FromHexString('#f8f9fa');
  const hull = new StandardMaterial('hullMat', scene);
  hull.diffuseColor = Color3.FromHexString('#264653');
  const deck = new StandardMaterial('deckMat', scene);
  deck.diffuseColor = Color3.FromHexString('#e76f51');
  const planes = airports.map(() => {
    const n = new TransformNode('plane', scene);
    const body = MeshBuilder.CreateBox('pb', { width: 0.006, height: 0.006, depth: 0.05 }, scene);
    const wing = MeshBuilder.CreateBox('pw', { width: 0.05, height: 0.002, depth: 0.012 }, scene);
    for (const p of [body, wing]) { p.material = white; p.parent = n; p.isPickable = false; }
    return n;
  });
  const ships = ports.flatMap(() => [0, 1].map(() => {
    const n = new TransformNode('ship', scene);
    const h = MeshBuilder.CreateBox('sh', { width: 0.04, height: 0.015, depth: 0.22 }, scene);
    const d = MeshBuilder.CreateBox('sd', { width: 0.03, height: 0.02, depth: 0.05 }, scene);
    h.material = hull; d.material = deck; d.position.set(0, 0.016, -0.06);
    for (const p of [h, d]) { p.parent = n; p.isPickable = false; }
    return n;
  }));
  let t = 0;
  return {
    update: (dt: number) => {
      t += dt;
      airports.forEach((a, i) => {
        const g = planes[i];
        const cycle = (t * 0.05 + i * 0.37) % 1;
        const dx = Math.cos(a.rot), dz = -Math.sin(a.rot);
        const dist = cycle < 0.15 ? (cycle / 0.15) * 1.6 : 1.6 + (cycle - 0.15) * 50;
        const alt = cycle < 0.08 ? 0.003 : Math.min(2.5, (cycle - 0.08) * 10);
        g.position.set(a.x + dx * (dist - 1.2), grid.y(a.x, a.z) + 0.005 + alt, a.z + dz * (dist - 1.2));
        g.rotation.set(cycle > 0.08 && alt < 2.5 ? -0.15 : 0, a.rot + Math.PI / 2, 0);
        g.setEnabled(cycle < 0.95);
      });
      white.emissiveColor.set(ENV.night * 0.8, ENV.night * 0.8, ENV.night * 0.8);
      ports.forEach((p, i) => {
        for (let k = 0; k < 2; k++) {
          const g = ships[i * 2 + k];
          const ph = (t * 0.01 + k * 0.5 + i * 0.21) % 1;
          const z = p.z + (k - 0.5) * 0.8 + Math.sin(ph * 6) * 0.2;
          const x = Math.min(p.x - 0.3 - Math.sin(ph * Math.PI) * 6, coastX(country.seed, z) - 0.4);
          g.position.set(x, 0.035, z);
          g.rotation.y = Math.PI / 2 + (ph > 0.5 ? Math.PI : 0);
        }
      });
    },
  };
}

// ---------- Météo (déterministe par mois et saison) ----------
export type Weather = 'clair' | 'nuageux' | 'pluie' | 'orage' | 'neige' | 'brouillard';
export function weatherFor(seed: number, month: number): Weather {
  const r = mulberry32(seed * 13 + month * 101)();
  const m = month % 12;
  const winter = m === 11 || m <= 1;
  const summer = m >= 5 && m <= 7;
  if (winter) return r < 0.3 ? 'neige' : r < 0.55 ? 'nuageux' : r < 0.7 ? 'brouillard' : r < 0.8 ? 'pluie' : 'clair';
  if (summer) return r < 0.6 ? 'clair' : r < 0.78 ? 'nuageux' : r < 0.9 ? 'orage' : 'pluie';
  return r < 0.35 ? 'clair' : r < 0.6 ? 'nuageux' : r < 0.85 ? 'pluie' : r < 0.93 ? 'brouillard' : 'orage';
}
export const WEATHER_LABEL: Record<Weather, string> = { clair: '☀️ Ensoleillé', nuageux: '⛅ Nuageux', pluie: '🌧️ Pluie', orage: '⛈️ Orage', neige: '🌨️ Neige', brouillard: '🌫️ Brouillard' };
export type { Mesh };
