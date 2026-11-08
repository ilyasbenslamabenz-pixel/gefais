// Villes : bâtiments en instances fines (tours, immeubles, maisons), fenêtres éclairées la nuit,
// croissance ou déclin visibles selon la population calculée par le serveur.
import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { mulberry32 } from '../../../shared/noise';
import type { CountryDef } from '../../../shared/sim/types';
import { ENV, distToPolyline, type Grid } from './terrain';

interface B { city: number; x: number; z: number; y: number; w: number; d: number; h: number; rot: number; color: Color3; roof: boolean; rank: number }

const PALETTE = {
  tower: ['#9fc5e8', '#7aa6c2', '#b8c4cf', '#5f8fae', '#d6dde4', '#8fb3c9'],
  flat: ['#e8dcc8', '#f1ece2', '#d9b99b', '#c9a98a', '#e3e0da', '#bfc7d1', '#e6d3b3'],
  house: ['#f2e6d0', '#ead7bb', '#f5efe6', '#e0cdb0', '#f0e2c8'],
};

export const GROWTH_CAP = 1.6;

function cityBuildings(country: CountryDef, grid: Grid, ci: number): B[] {
  const c = country.cities[ci];
  const rnd = mulberry32(country.seed * 31 + ci * 977);
  const base = c.kind === 'metropole' ? (c.capital ? 1300 : 900) : c.kind === 'ville' ? 220 : 45;
  const cap = Math.round(base * GROWTH_CAP);
  const spacing = c.kind === 'metropole' ? 0.34 : c.kind === 'ville' ? 0.3 : 0.26;
  const R = c.radius * 1.25;
  const used = new Set<string>();
  const out: B[] = [];
  let guard = 0;
  while (out.length < cap && guard++ < cap * 12) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.75) * R;
    const ix = Math.round((c.x + Math.cos(a) * d) / spacing);
    const iz = Math.round((c.z + Math.sin(a) * d) / spacing);
    const key = ix + ',' + iz;
    if (used.has(key)) continue;
    const gx = ix * spacing;
    const gz = iz * spacing;
    if (grid.sample(gx, gz) < 0.015) continue;
    if (country.lakes.some((l) => Math.hypot(l.x - gx, l.z - gz) < l.r * 1.3)) continue;
    if (country.rivers.some((r) => distToPolyline(gx, gz, r.points) < r.width * 1.6)) continue;
    used.add(key);
    const dr = Math.hypot(gx - c.x, gz - c.z) / R;
    const core = c.kind === 'metropole' ? 0.28 : c.kind === 'ville' ? 0.18 : 0;
    let w: number, dd: number, h: number, color: string, roof = false;
    if (dr < core) {
      w = spacing * (0.55 + rnd() * 0.3); dd = spacing * (0.55 + rnd() * 0.3);
      h = (0.5 + rnd() * 1.5) * (1 - (dr / core) * 0.6) * (c.capital ? 1.35 : 1);
      color = PALETTE.tower[Math.floor(rnd() * PALETTE.tower.length)];
    } else if (dr < (c.kind === 'commune' ? 0.25 : 0.62)) {
      w = spacing * (0.6 + rnd() * 0.3); dd = spacing * (0.5 + rnd() * 0.35);
      h = 0.12 + rnd() * (c.kind === 'metropole' ? 0.45 : 0.25);
      color = PALETTE.flat[Math.floor(rnd() * PALETTE.flat.length)];
    } else {
      w = spacing * (0.38 + rnd() * 0.18); dd = spacing * (0.38 + rnd() * 0.18);
      h = 0.07 + rnd() * 0.05;
      color = PALETTE.house[Math.floor(rnd() * PALETTE.house.length)];
      roof = true;
    }
    out.push({ city: ci, x: gx, z: gz, y: grid.y(gx, gz), w, d: dd, h, rot: rnd() < 0.85 ? 0 : rnd() * 0.5, color: Color3.FromHexString(color), roof, rank: dr + rnd() * 0.15 });
  }
  out.sort((p, q) => p.rank - q.rank);
  return out;
}

export function createCities(scene: Scene, grid: Grid, country: CountryDef) {
  const all = country.cities.map((_, i) => cityBuildings(country, grid, i));
  const flat = all.flatMap((list) => list.map((b, k) => ({ b, k })));
  const houses = flat.filter((f) => f.b.roof);

  const box = MeshBuilder.CreateBox('buildings', { size: 1 }, scene);
  box.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  const mat = new CustomMaterial('buildingMat', scene);
  mat.specularColor = new Color3(0.15, 0.15, 0.15);
  mat.AddUniform('uNight', 'float', 0);
  mat.Fragment_Definitions('float bHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }');
  mat.Fragment_Before_FragColor(/* glsl */ `
    float wall = 1.0 - step(0.5, abs(vNormalW.y));
    vec2 uvw = abs(vNormalW.x) > 0.5 ? vPositionW.zy : vPositionW.xy;
    vec2 cell = floor(uvw * vec2(26.0, 30.0));
    vec2 f = fract(uvw * vec2(26.0, 30.0));
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.78);
    float lit = step(0.42, bHash(cell));
    color.rgb *= 1.0 - wall * win * 0.22 * (1.0 - uNight);
    color.rgb += wall * win * lit * uNight * vec3(1.0, 0.8, 0.45) * 0.9;
  `);
  mat.onBindObservable.add(() => mat.getEffect()?.setFloat('uNight', ENV.night));
  box.material = mat;
  box.isPickable = true;
  box.thinInstanceEnablePicking = true;
  box.receiveShadows = true;

  const roof = MeshBuilder.CreateCylinder('roofs', { diameterTop: 0, diameterBottom: 1.45, height: 0.6, tessellation: 4 }, scene);
  roof.bakeTransformIntoVertices(Matrix.RotationY(Math.PI / 4).multiply(Matrix.Translation(0, 1.3, 0)));
  const roofMat = new StandardMaterial('roofMat', scene);
  roofMat.diffuseColor = new Color3(0.66, 0.33, 0.24);
  roofMat.specularColor = Color3.Black();
  roof.material = roofMat;
  roof.isPickable = false;

  const bMat = new Float32Array(flat.length * 16);
  const bCol = new Float32Array(flat.length * 4);
  const rMat = new Float32Array(Math.max(1, houses.length) * 16);
  flat.forEach(({ b }, i) => bCol.set([b.color.r, b.color.g, b.color.b, 1], i * 4));
  box.thinInstanceSetBuffer('matrix', bMat, 16, false);
  box.thinInstanceSetBuffer('color', bCol, 4, true);
  roof.thinInstanceSetBuffer('matrix', rMat, 16, false);

  const m = new Matrix();
  const q = new Quaternion();
  const s = new Vector3();
  const t = new Vector3();
  /** Affiche, pour chaque ville, un nombre de bâtiments proportionnel à sa population relative. */
  const update = (ratios: number[]) => {
    const visible = all.map((list, i) => Math.round((list.length / GROWTH_CAP) * Math.min(GROWTH_CAP, Math.max(0.4, ratios[i] ?? 1))));
    let r = 0;
    flat.forEach(({ b, k }, i) => {
      const on = k < visible[b.city];
      Quaternion.RotationYawPitchRollToRef(b.rot, 0, 0, q);
      s.set(on ? b.w : 0, on ? b.h : 0, on ? b.d : 0);
      t.set(b.x, b.y, b.z);
      Matrix.ComposeToRef(s, q, t, m);
      m.copyToArray(bMat, i * 16);
      if (b.roof) { m.copyToArray(rMat, r * 16); r++; }
    });
    box.thinInstanceBufferUpdated('matrix');
    roof.thinInstanceBufferUpdated('matrix');
    box.thinInstanceRefreshBoundingInfo(false);
    roof.thinInstanceRefreshBoundingInfo(false);
  };
  update(country.cities.map(() => 1));
  /** Ville correspondant à une instance de bâtiment cliquée. */
  const cityOfInstance = (i: number) => flat[i]?.b.city ?? -1;
  return { box, roof, update, cityOfInstance };
}
