// Villes : bâtiments instanciés (tours, immeubles, maisons), éclairage nocturne, croissance visible.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/noise';
import type { CountryDef } from '../../../shared/sim/types';
import { ENV, distToPolyline, type Grid } from './terrain';
import { useStore } from '../store';

interface B { city: number; x: number; z: number; y: number; w: number; d: number; h: number; rot: number; color: THREE.Color; roof: boolean; rank: number }

const PALETTE = {
  tower: ['#9fc5e8', '#7aa6c2', '#b8c4cf', '#5f8fae', '#d6dde4'],
  flat: ['#e8dcc8', '#f1ece2', '#d9b99b', '#c9a98a', '#e3e0da', '#bfc7d1'],
  house: ['#f2e6d0', '#ead7bb', '#f5efe6', '#e0cdb0'],
};

/** Génère les bâtiments d'une ville (capacité maximale ×1,6 ; seuls les premiers sont visibles au départ). */
function cityBuildings(country: CountryDef, grid: Grid, cityIdx: number): B[] {
  const c = country.cities[cityIdx];
  const rnd = mulberry32(country.seed * 31 + cityIdx * 977);
  const base = c.kind === 'metropole' ? (c.capital ? 1300 : 900) : c.kind === 'ville' ? 220 : 45;
  const cap = Math.round(base * 1.6);
  const out: B[] = [];
  const spacing = c.kind === 'metropole' ? 0.34 : c.kind === 'ville' ? 0.3 : 0.26;
  const R = c.radius * 1.25;
  let guard = 0;
  while (out.length < cap && guard++ < cap * 12) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.75) * R;
    const gx = Math.round((c.x + Math.cos(a) * d) / spacing) * spacing;
    const gz = Math.round((c.z + Math.sin(a) * d) / spacing) * spacing;
    if (out.some((b) => Math.abs(b.x - gx) < spacing * 0.6 && Math.abs(b.z - gz) < spacing * 0.6)) continue;
    const hgt = grid.sample(gx, gz);
    if (hgt < 0.015) continue;
    if (country.lakes.some((l) => Math.hypot(l.x - gx, l.z - gz) < l.r * 1.3)) continue;
    if (country.rivers.some((r) => distToPolyline(gx, gz, r.points) < r.width * 1.6)) continue;
    const dr = Math.hypot(gx - c.x, gz - c.z) / R;
    const core = c.kind === 'metropole' ? 0.28 : c.kind === 'ville' ? 0.18 : 0;
    let w: number, dd: number, h: number, color: string, roof = false;
    if (dr < core) {
      w = spacing * (0.55 + rnd() * 0.3); dd = spacing * (0.55 + rnd() * 0.3);
      h = (0.5 + rnd() * 1.5) * (1 - dr / core * 0.6) * (c.capital ? 1.35 : 1);
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
    out.push({ city: cityIdx, x: gx, z: gz, y: grid.y(gx, gz), w, d: dd, h, rot: rnd() < 0.85 ? 0 : rnd() * 0.5, color: new THREE.Color(color), roof, rank: dr + rnd() * 0.15 });
  }
  out.sort((p, q) => p.rank - q.rank);
  return out;
}

export function Cities({ country, grid }: { country: CountryDef; grid: Grid }) {
  const boxRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const cities = useStore((s) => s.snap?.cities);
  const initialPop = useRef<number[] | null>(null);
  const data = useMemo(() => {
    const all = country.cities.map((_, i) => cityBuildings(country, grid, i));
    const blocks = all.flat().filter((b) => !b.roof);
    const houses = all.flat().filter((b) => b.roof);
    return { all, blocks, houses };
  }, [country, grid]);

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const roofGeo = useMemo(() => new THREE.ConeGeometry(0.75, 0.6, 4).rotateY(Math.PI / 4).translate(0, 1.3, 0), []);
  const boxMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.05 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = ENV.night;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; varying vec3 vObjN; varying float vSeed; varying vec3 vScale;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLocal = position; vObjN = normal;
          #ifdef USE_INSTANCING
            vSeed = fract(instanceMatrix[3][0] * 13.17 + instanceMatrix[3][2] * 7.31);
            vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          #else
            vSeed = 0.5; vScale = vec3(1.0);
          #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vLocal; varying vec3 vObjN; varying float vSeed; varying vec3 vScale;\nfloat bHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float wall = 1.0 - step(0.5, abs(vObjN.y));
          vec2 uvw = abs(vObjN.x) > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y);
          vec2 cell = floor(uvw * vec2(14.0, 18.0));
          vec2 f = fract(uvw * vec2(14.0, 18.0));
          float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.75);
          float lit = step(0.45, bHash(cell + vSeed * 31.0));
          diffuseColor.rgb *= 1.0 - wall * win * 0.25 * (1.0 - uNight);
          totalEmissiveRadiance += wall * win * lit * uNight * vec3(1.0, 0.82, 0.5) * 1.6;`);
    };
    return m;
  }, []);
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a8553d', roughness: 0.8 }), []);

  // placement + visibilité selon la population (la ville grandit ou rétrécit)
  useEffect(() => {
    if (!cities) return;
    if (!initialPop.current) initialPop.current = cities.map((c) => c.population);
    const ratio = cities.map((c, i) => c.population / Math.max(1, initialPop.current![i]));
    const visibleCount = data.all.map((list, i) => Math.round((list.length / 1.6) * Math.min(1.6, Math.max(0.4, ratio[i]))));
    const o = new THREE.Object3D();
    const rankIdx = new Map<B, number>();
    data.all.forEach((list) => list.forEach((b, k) => rankIdx.set(b, k)));
    const apply = (mesh: THREE.InstancedMesh | null, list: B[], isRoof: boolean) => {
      if (!mesh) return;
      list.forEach((b, i) => {
        const visible = (rankIdx.get(b) ?? 0) < visibleCount[b.city];
        o.position.set(b.x, b.y, b.z);
        o.rotation.set(0, b.rot, 0);
        if (isRoof) o.scale.set(visible ? b.w : 0, visible ? b.h : 0, visible ? b.d : 0);
        else o.scale.set(visible ? b.w : 0, visible ? b.h : 0, visible ? b.d : 0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        if (!isRoof) mesh.setColorAt(i, b.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    apply(boxRef.current, [...data.blocks, ...data.houses], false);
    apply(roofRef.current, data.houses, true);
  }, [cities, data]);

  return (
    <group>
      <instancedMesh ref={boxRef} args={[boxGeo, boxMat, data.blocks.length + data.houses.length]} castShadow receiveShadow />
      <instancedMesh ref={roofRef} args={[roofGeo, roofMat, data.houses.length]} castShadow />
    </group>
  );
}
