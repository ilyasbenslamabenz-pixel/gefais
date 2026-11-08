// Tissu urbain de la mégapole : bâtiments îlot par îlot (gratte-ciel du centre, immeubles, maisons,
// entrepôts), en instances fines. Fenêtres éclairées la nuit ; densification ou déclin visibles selon
// la population de chaque quartier calculée par le serveur.
import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { mulberry32 } from '../../../shared/noise';
import { HALF_D, HALF_W, parkMask, urbanDensity } from '../../../shared/sim/country';
import type { CountryDef } from '../../../shared/sim/types';
import { ENV, densify, type Grid } from './terrain';

interface B { district: number; x: number; z: number; y: number; w: number; d: number; h: number; rot: number; color: Color3; roof: boolean; threshold: number }

const PAL = {
  tower: ['#9fc5e8', '#7aa6c2', '#b8c4cf', '#5f8fae', '#d6dde4', '#8fb3c9', '#c9d6df'],
  flat: ['#e8dcc8', '#f1ece2', '#d9b99b', '#c9a98a', '#e3e0da', '#bfc7d1', '#e6d3b3', '#d4c4a8'],
  house: ['#f2e6d0', '#ead7bb', '#f5efe6', '#e0cdb0', '#f0e2c8'],
  ware: ['#9aa5b1', '#b5bec8', '#8d99ae', '#c7ccd1'],
};
export const GROWTH_CAP = 1.5;

export function createCities(scene: Scene, grid: Grid, country: CountryDef, block: number) {
  const rnd = mulberry32(country.seed * 31 + 7);
  const cap = country.cities.find((c) => c.capital) ?? country.cities[0];
  // cellules occupées par les grandes voies et le métro
  const blocked = new Set<string>();
  const key = (i: number, j: number) => i * 10000 + j;
  const toCell = (v: number, half: number) => Math.floor((v + half) / block);
  for (const l of country.links) {
    const w = l.kind === 'autoroute' ? 1 : 0;
    for (const [x, z] of densify(l.points, block * 0.5)) {
      const i = toCell(x, HALF_W), j = toCell(z, HALF_D);
      for (let di = -w; di <= w; di++) for (let dj = -w; dj <= w; dj++) blocked.add(String(key(i + di, j + dj)));
    }
  }
  for (const inf of country.infra) {
    const r = inf.type === 'aeroport' ? 2.2 : inf.type === 'port' ? 1.2 : ['centrale_nucleaire', 'zone_industrielle', 'centrale_charbon'].includes(inf.type) ? 0.6 : 0.2;
    const i0 = toCell(inf.x - r, HALF_W), i1 = toCell(inf.x + r, HALF_W), j0 = toCell(inf.z - r, HALF_D), j1 = toCell(inf.z + r, HALF_D);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) blocked.add(String(key(i, j)));
  }
  const industrial = country.infra.filter((i) => i.type === 'zone_industrielle' || i.type === 'port');
  const out: B[] = [];
  const nI = Math.floor((HALF_W * 2) / block);
  const nJ = Math.floor((HALF_D * 2) / block);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < nI; i++) {
    for (let j = 0; j < nJ; j++) {
      const x = -HALF_W + (i + 0.5) * block;
      const z = -HALF_D + (j + 0.5) * block;
      const dens = urbanDensity(country, x, z);
      if (dens < 0.06) continue;
      if (grid.sample(x, z) < 0.024) continue; // mer, rivières, lacs
      if (blocked.has(String(key(i, j)))) continue;
      if (parkMask(country.seed, x, z) > 0.5) continue;
      const p = Math.min(1, Math.pow(dens, 0.55) * 1.08);
      const u = rnd();
      if (u > p * GROWTH_CAP) continue;
      const threshold = u / Math.max(0.01, p);
      // quartier de rattachement
      let district = 0;
      let best = Infinity;
      for (const c of country.cities) { const v = Math.hypot(c.x - x, c.z - z) / c.radius; if (v < best) { best = v; district = c.id; } }
      const dc = country.cities[district];
      const y = grid.y(x, z);
      const dCap = Math.hypot(x - cap.x, z - cap.z);
      const nearInd = industrial.some((n) => Math.hypot(n.x - x, n.z - z) < 1.3);
      const push = (bx: number, bz: number, w: number, d: number, h: number, color: string, roof = false) =>
        out.push({ district, x: bx, z: bz, y: grid.y(bx, bz) || y, w, d, h, rot: 0, color: Color3.FromHexString(color), roof, threshold });
      if (nearInd) {
        push(x, z, block * (0.55 + rnd() * 0.3), block * (0.4 + rnd() * 0.3), 0.01 + rnd() * 0.008, pick(PAL.ware));
      } else if (dCap < 2.6 || (dc.kind === 'metropole' && best < 0.32)) {
        const core = dCap < 2.6 ? 1 - dCap / 2.6 : 0.5;
        const h = (0.06 + Math.pow(rnd(), 1.4) * 0.38) * (0.45 + core) * (dc.capital ? 1 : 0.6);
        push(x, z, block * (0.55 + rnd() * 0.25), block * (0.55 + rnd() * 0.25), Math.max(0.04, h), pick(PAL.tower));
        if (rnd() < 0.5) push(x + block * 0.3, z - block * 0.3, block * 0.3, block * 0.3, 0.02 + rnd() * 0.03, pick(PAL.flat));
      } else if (dens > 0.58) {
        // îlot d'immeubles : deux bâtiments
        const off = block * 0.22;
        push(x - off, z, block * 0.4, block * 0.82, 0.018 + rnd() * 0.035, pick(PAL.flat));
        push(x + off, z, block * 0.4, block * 0.82, 0.018 + rnd() * 0.035, pick(PAL.flat));
      } else if (dens > 0.3) {
        push(x, z, block * (0.6 + rnd() * 0.25), block * (0.55 + rnd() * 0.25), 0.011 + rnd() * 0.016, pick(PAL.flat));
      } else {
        // pavillons : quatre maisons par îlot
        const o = block * 0.24;
        for (const [ox, oz] of [[-o, -o], [o, -o], [-o, o], [o, o]]) if (rnd() < 0.85) push(x + ox, z + oz, block * 0.24, block * 0.2, 0.0065, pick(PAL.house), true);
      }
    }
  }

  const box = MeshBuilder.CreateBox('buildings', { size: 1 }, scene);
  box.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  const mat = new CustomMaterial('buildingMat', scene);
  mat.specularColor = new Color3(0.18, 0.18, 0.2);
  mat.AddUniform('uNight', 'float', 0);
  mat.Fragment_Definitions('float bHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }');
  mat.Fragment_Before_FragColor(/* glsl */ `
    float wall = 1.0 - step(0.5, abs(vNormalW.y));
    vec2 uvw = abs(vNormalW.x) > 0.5 ? vPositionW.zy : vPositionW.xy;
    vec2 cell = floor(uvw * vec2(260.0, 300.0));
    vec2 f = fract(uvw * vec2(260.0, 300.0));
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.78);
    float lit = step(0.45, bHash(cell));
    color.rgb *= 1.0 - wall * win * 0.18 * (1.0 - uNight);
    color.rgb += wall * win * lit * uNight * vec3(1.0, 0.8, 0.45) * 0.95;
  `);
  mat.onBindObservable.add(() => mat.getEffect()?.setFloat('uNight', ENV.night));
  box.material = mat;
  box.isPickable = true;
  box.thinInstanceEnablePicking = true;
  box.receiveShadows = true;
  box.alwaysSelectAsActiveMesh = true;

  const roof = MeshBuilder.CreateCylinder('roofs', { diameterTop: 0, diameterBottom: 1.45, height: 0.6, tessellation: 4 }, scene);
  roof.bakeTransformIntoVertices(Matrix.RotationY(Math.PI / 4).multiply(Matrix.Translation(0, 1.3, 0)));
  const roofMat = new StandardMaterial('roofMat', scene);
  roofMat.diffuseColor = new Color3(0.66, 0.33, 0.24);
  roofMat.specularColor = Color3.Black();
  roof.material = roofMat;
  roof.isPickable = false;
  roof.alwaysSelectAsActiveMesh = true;

  const houses = out.filter((b) => b.roof);
  const bMat = new Float32Array(Math.max(1, out.length) * 16);
  const bCol = new Float32Array(Math.max(1, out.length) * 4);
  const rMat = new Float32Array(Math.max(1, houses.length) * 16);
  out.forEach((b, i) => bCol.set([b.color.r, b.color.g, b.color.b, 1], i * 4));
  box.thinInstanceSetBuffer('matrix', bMat, 16, false);
  box.thinInstanceSetBuffer('color', bCol, 4, true);
  roof.thinInstanceSetBuffer('matrix', rMat, 16, false);

  const m = new Matrix();
  const q = Quaternion.Identity();
  const s = new Vector3();
  const t = new Vector3();
  const update = (ratios: number[]) => {
    let r = 0;
    out.forEach((b, i) => {
      const on = b.threshold < Math.min(GROWTH_CAP, Math.max(0.3, ratios[b.district] ?? 1));
      s.set(on ? b.w : 0, on ? b.h : 0, on ? b.d : 0);
      t.set(b.x, b.y, b.z);
      Matrix.ComposeToRef(s, q, t, m);
      m.copyToArray(bMat, i * 16);
      if (b.roof) { m.copyToArray(rMat, r * 16); r++; }
    });
    box.thinInstanceBufferUpdated('matrix');
    roof.thinInstanceBufferUpdated('matrix');
  };
  update(country.cities.map(() => 1));
  return { box, roof, update, count: out.length, cityOfInstance: (i: number) => out[i]?.district ?? -1 };
}
