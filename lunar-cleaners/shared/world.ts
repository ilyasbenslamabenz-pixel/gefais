// Définition du monde lunaire : relief, zones, décors, poussière initiale.
// Code 100 % déterministe : client et serveur obtiennent exactement le même monde.

import { fbm, mulberry32, noise2, smoothstep } from './noise';
import type { DebrisType, ResourceId } from './data';

export const WORLD_HALF = 128; // zone jouable : [-128, 128]
export const WORLD_SIZE = WORLD_HALF * 2;
export const TERRAIN_HALF = 220; // le maillage déborde (montagnes)
export const DUST_RES = 512;
export const CELL = WORLD_SIZE / DUST_RES; // 0.5 m
export const MAX_PLAYERS = 16;
export const ZONE_GOAL = 0.6; // 60 % de propreté pour certifier une zone

export const STATION = {
  spawn: { x: 0, z: 6 },
  hub: { x: 0, z: -12, r: 7.5 },
  sell: { x: 9, z: -3 },
  shop: { x: -9, z: -3 },
  garage: { x: 0, z: 16 },
  interactRadius: 3.6,
};

export interface ZoneDef {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  hardness: number; // diviseur de puissance
  yield: number; // unités récoltées par cellule pleine
  dust: number; // densité initiale 0..1
  level: number; // niveau conseillé
  color: string;
  drops: Partial<Record<ResourceId, number>>; // probabilité par unité de poussière
  debris: Partial<Record<DebrisType, number>>; // nombre de débris
  reward: number; // récompense collective de certification
  desc: string;
}

export const ZONES: ZoneDef[] = [
  { id: 'start', name: 'Zone de départ', x: 0, z: 0, r: 42, hardness: 1, yield: 1, dust: 0.75, level: 1, color: '#7ee8a2', drops: { mineral: 0.012 }, debris: { rock: 14, junk: 8 }, reward: 400, desc: 'Les abords de la station. Idéal pour débuter.' },
  { id: 'oldbase', name: 'Ancienne base spatiale', x: -74, z: -58, r: 34, hardness: 1.5, yield: 1.3, dust: 0.85, level: 3, color: '#ffb86b', drops: { metal: 0.03, mineral: 0.01 }, debris: { junk: 16, rock: 6 }, reward: 1200, desc: 'Vestiges de la première colonie. Riche en métal.' },
  { id: 'crater', name: 'Cratère des débris', x: 72, z: -62, r: 36, hardness: 2, yield: 1.6, dust: 0.9, level: 5, color: '#ff6b6b', drops: { metal: 0.03, mineral: 0.03 }, debris: { rock: 16, junk: 12, crystal: 4 }, reward: 2500, desc: 'Un cratère d\'impact rempli de satellites écrasés.' },
  { id: 'industrial', name: 'Zone industrielle', x: -76, z: 62, r: 34, hardness: 2.6, yield: 2.1, dust: 0.95, level: 7, color: '#ffd93d', drops: { metal: 0.05, mineral: 0.015 }, debris: { junk: 20, rock: 6 }, reward: 5000, desc: 'Hangars, citernes et grues. Une crasse épaisse.' },
  { id: 'abandoned', name: 'Station abandonnée', x: 74, z: 64, r: 32, hardness: 3.2, yield: 2.6, dust: 1, level: 9, color: '#c46bff', drops: { xeno: 0.006, metal: 0.03 }, debris: { pod: 6, junk: 10, crystal: 4 }, reward: 9000, desc: 'Une station mystérieusement désertée...' },
  { id: 'rare', name: 'Gisement de minéraux rares', x: 0, z: 104, r: 26, hardness: 4, yield: 3.2, dust: 1, level: 11, color: '#6ff3ff', drops: { crystal: 0.03, xeno: 0.006 }, debris: { crystal: 12, pod: 4 }, reward: 15000, desc: 'Le gisement le plus précieux de la Lune.' },
];

export const ZONE_INDEX: Record<string, number> = Object.fromEntries(ZONES.map((z, i) => [z.id, i]));

/** Index de zone (0..5) ou -1 si hors zone. */
export function zoneIndexAt(x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ZONES.length; i++) {
    const zo = ZONES[i];
    const d = Math.hypot(x - zo.x, z - zo.z) / zo.r;
    if (d <= 1 && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

// ---------- Relief ----------
interface Crater { x: number; z: number; r: number; depth: number }

export const CRATERS: Crater[] = (() => {
  const list: Crater[] = [
    { x: 72, z: -62, r: 30, depth: 7 },
    { x: -40, z: 20, r: 9, depth: 2.2 },
    { x: 34, z: 30, r: 12, depth: 2.8 },
    { x: 0, z: 104, r: 14, depth: 3 },
    { x: -100, z: -10, r: 16, depth: 3.5 },
    { x: 105, z: 5, r: 13, depth: 3 },
  ];
  const rnd = mulberry32(42);
  let tries = 0;
  while (list.length < 46 && tries < 1000) {
    tries++;
    const x = (rnd() * 2 - 1) * 120;
    const z = (rnd() * 2 - 1) * 120;
    if (Math.hypot(x, z) < 26) continue;
    const r = 2 + Math.pow(rnd(), 2) * 8;
    list.push({ x, z, r, depth: r * (0.18 + rnd() * 0.12) });
  }
  return list;
})();

function craterProfile(d: number, r: number, depth: number) {
  const t = d / r;
  const rim = depth * 0.35;
  if (t < 1) return depth * (t * t - 1) + rim * Math.pow(t, 8);
  const u = (t - 1) / 0.4;
  return rim * Math.exp(-u * u);
}

export function heightAt(x: number, z: number): number {
  let h = fbm(x * 0.012, z * 0.012, 4) * 2.4 + fbm(x * 0.06 + 10, z * 0.06, 3) * 0.45;
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i];
    const dx = x - c.x;
    const dz = z - c.z;
    const lim = c.r * 1.8;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    h += craterProfile(Math.sqrt(dx * dx + dz * dz), c.r, c.depth);
  }
  // Montagnes en bordure de carte
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 112) {
    const k = e - 112;
    const n = noise2(x * 0.03, z * 0.03) * 0.5 + 0.5;
    h += (22 * smoothstep(0, 45, k) + k * 0.12) * (0.6 + 0.8 * n);
  }
  // Plateforme plane de la station
  const ds = Math.hypot(x - 0, z - 0);
  const f = smoothstep(18, 30, ds);
  return h * f + 0.15 * (1 - f);
}

export function clampToWorld(v: number) {
  return Math.max(-WORLD_HALF + 4, Math.min(WORLD_HALF - 4, v));
}

// ---------- Poussière ----------
export function cellIndex(x: number, z: number) {
  const ix = Math.floor((x + WORLD_HALF) / CELL);
  const iz = Math.floor((z + WORLD_HALF) / CELL);
  if (ix < 0 || iz < 0 || ix >= DUST_RES || iz >= DUST_RES) return -1;
  return iz * DUST_RES + ix;
}

export function cellCenter(idx: number): [number, number] {
  const ix = idx % DUST_RES;
  const iz = (idx / DUST_RES) | 0;
  return [-WORLD_HALF + (ix + 0.5) * CELL, -WORLD_HALF + (iz + 0.5) * CELL];
}

/** Zone de chaque cellule (255 = hors zone). */
export function buildZoneMap(): Uint8Array {
  const map = new Uint8Array(DUST_RES * DUST_RES);
  for (let iz = 0; iz < DUST_RES; iz++) {
    for (let ix = 0; ix < DUST_RES; ix++) {
      const x = -WORLD_HALF + (ix + 0.5) * CELL;
      const z = -WORLD_HALF + (iz + 0.5) * CELL;
      const zi = zoneIndexAt(x, z);
      map[iz * DUST_RES + ix] = zi < 0 ? 255 : zi;
    }
  }
  return map;
}

export function buildInitialDust(): Uint8Array {
  const g = new Uint8Array(DUST_RES * DUST_RES);
  for (let iz = 0; iz < DUST_RES; iz++) {
    for (let ix = 0; ix < DUST_RES; ix++) {
      const x = -WORLD_HALF + (ix + 0.5) * CELL;
      const z = -WORLD_HALF + (iz + 0.5) * CELL;
      const zi = zoneIndexAt(x, z);
      const base = zi < 0 ? 0.55 : ZONES[zi].dust;
      const n = fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
      let v = base * (0.62 + 0.45 * n);
      // La plateforme de la station est déjà propre
      const ds = Math.hypot(x, z);
      v *= smoothstep(8, 15, ds);
      g[iz * DUST_RES + ix] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  }
  return g;
}

export function zoneHardness(zoneMap: Uint8Array, idx: number) {
  const z = zoneMap[idx];
  return z === 255 ? 1.2 : ZONES[z].hardness;
}
export function zoneYield(zoneMap: Uint8Array, idx: number) {
  const z = zoneMap[idx];
  return z === 255 ? 1 : ZONES[z].yield;
}

/**
 * Applique un coup de nettoyage circulaire sur la grille de poussière.
 * Retourne la quantité récoltée (en unités) par zone (index 6 = hors zone).
 */
export function applyClean(
  grid: Uint8Array,
  zoneMap: Uint8Array,
  x: number,
  z: number,
  radius: number,
  power: number,
  dt: number,
  onChange?: (idx: number) => void,
  maxUnits = Infinity,
): { total: number; perZone: number[] } {
  const perZone = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  const minX = Math.max(0, Math.floor((x - radius + WORLD_HALF) / CELL));
  const maxX = Math.min(DUST_RES - 1, Math.floor((x + radius + WORLD_HALF) / CELL));
  const minZ = Math.max(0, Math.floor((z - radius + WORLD_HALF) / CELL));
  const maxZ = Math.min(DUST_RES - 1, Math.floor((z + radius + WORLD_HALF) / CELL));
  const r2 = radius * radius;
  for (let iz = minZ; iz <= maxZ; iz++) {
    const cz = -WORLD_HALF + (iz + 0.5) * CELL - z;
    for (let ix = minX; ix <= maxX; ix++) {
      const cx = -WORLD_HALF + (ix + 0.5) * CELL - x;
      const d2 = cx * cx + cz * cz;
      if (d2 > r2) continue;
      const idx = iz * DUST_RES + ix;
      const cur = grid[idx];
      if (cur === 0) continue;
      const zi = zoneMap[idx];
      const hard = zi === 255 ? 1.2 : ZONES[zi].hardness;
      const yld = zi === 255 ? 1 : ZONES[zi].yield;
      const fall = 1 - 0.55 * (d2 / r2);
      let rem = Math.ceil((power * dt * fall) / hard);
      if (rem > cur) rem = cur;
      // les dernières traces disparaissent d'un coup
      if (cur - rem < 10) rem = cur;
      const units = (rem / 255) * yld;
      if (total + units > maxUnits) continue;
      grid[idx] = cur - rem;
      total += units;
      perZone[zi === 255 ? 6 : zi] += units;
      onChange?.(idx);
    }
  }
  return { total, perZone };
}

// ---------- Décors ----------
export type PropType =
  | 'hub' | 'terminal_sell' | 'terminal_shop' | 'garage' | 'antenna' | 'solar' | 'lamp' | 'flag'
  | 'module_ruin' | 'satellite' | 'container' | 'tank' | 'crane' | 'dome_broken' | 'tower'
  | 'crystal_spire' | 'rock' | 'pipe' | 'rocket';

export interface Prop {
  type: PropType;
  x: number;
  z: number;
  rot: number;
  s: number;
  col: number; // rayon de collision (0 = aucun)
  color?: string;
}

export const PROPS: Prop[] = (() => {
  const P: Prop[] = [];
  const rnd = mulberry32(777);
  const add = (type: PropType, x: number, z: number, s = 1, col = 0, rot = rnd() * Math.PI * 2, color?: string) =>
    P.push({ type, x, z, s, col, rot, color });
  // Station principale
  add('hub', STATION.hub.x, STATION.hub.z, 1, STATION.hub.r, 0);
  add('terminal_sell', STATION.sell.x, STATION.sell.z, 1, 1.1, -Math.PI / 2);
  add('terminal_shop', STATION.shop.x, STATION.shop.z, 1, 1.1, Math.PI / 2);
  add('garage', STATION.garage.x, STATION.garage.z, 1, 0, 0);
  add('antenna', 12, -18, 1.2, 1, 0);
  add('rocket', -15, -20, 1, 2.6, 0);
  for (let i = 0; i < 4; i++) add('solar', 15 + (i % 2) * 5, -6 + Math.floor(i / 2) * 5 - 6, 1, 1.4, 0.3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    add('lamp', Math.cos(a) * 22, Math.sin(a) * 22, 1, 0.4, 0);
  }
  add('flag', -5, 10, 1, 0.2, 0);

  const inZone = (zi: number, minR = 0, maxR = 0.95) => {
    const zo = ZONES[zi];
    const a = rnd() * Math.PI * 2;
    const d = zo.r * (minR + rnd() * (maxR - minR));
    return [zo.x + Math.cos(a) * d, zo.z + Math.sin(a) * d] as const;
  };
  // Ancienne base
  for (let i = 0; i < 7; i++) { const [x, z] = inZone(1, 0.1, 0.8); add('module_ruin', x, z, 0.8 + rnd() * 0.6, 2.4); }
  for (let i = 0; i < 3; i++) { const [x, z] = inZone(1, 0.2, 0.9); add('antenna', x, z, 0.9, 0.8); }
  add('flag', ZONES[1].x + 2, ZONES[1].z + 3, 1, 0.2, 0);
  // Cratère
  add('satellite', ZONES[2].x, ZONES[2].z, 1.8, 3.5);
  for (let i = 0; i < 4; i++) { const [x, z] = inZone(2, 0.3, 0.8); add('satellite', x, z, 0.7 + rnd() * 0.5, 1.6); }
  // Zone industrielle
  for (let i = 0; i < 10; i++) { const [x, z] = inZone(3, 0.15, 0.85); add('container', x, z, 1, 2, rnd() * Math.PI, ['#ff6b35', '#3a86ff', '#ffbe0b', '#8338ec'][i % 4]); }
  for (let i = 0; i < 4; i++) { const [x, z] = inZone(3, 0.2, 0.8); add('tank', x, z, 1 + rnd() * 0.4, 2.6); }
  for (let i = 0; i < 2; i++) { const [x, z] = inZone(3, 0.3, 0.7); add('crane', x, z, 1, 1.2); }
  for (let i = 0; i < 5; i++) { const [x, z] = inZone(3, 0.1, 0.9); add('pipe', x, z, 1, 0); }
  // Station abandonnée
  add('dome_broken', ZONES[4].x, ZONES[4].z, 1.4, 7);
  for (let i = 0; i < 4; i++) { const [x, z] = inZone(4, 0.5, 0.85); add('tower', x, z, 1, 1.4); }
  for (let i = 0; i < 6; i++) { const [x, z] = inZone(4, 0.3, 0.9); add('crystal_spire', x, z, 0.6 + rnd() * 0.5, 0.9, undefined, '#c46bff'); }
  // Gisement rare
  for (let i = 0; i < 14; i++) { const [x, z] = inZone(5, 0.15, 0.95); add('crystal_spire', x, z, 0.8 + rnd() * 1.2, 1.2, undefined, ['#6ff3ff', '#ff6bd6', '#7ee8a2'][i % 3]); }
  // Rochers décoratifs
  let n = 0;
  while (n < 220) {
    const x = (rnd() * 2 - 1) * 124;
    const z = (rnd() * 2 - 1) * 124;
    if (Math.hypot(x, z) < 26) continue;
    const s = 0.4 + Math.pow(rnd(), 3) * 3.2;
    add('rock', x, z, s, s > 1.4 ? 0.8 : 0);
    n++;
  }
  return P;
})();

export const COLLIDERS = PROPS.filter((p) => p.col > 0);

/** Repousse une position hors des obstacles (collision cercle/cercle). */
export function resolveCollisions(pos: { x: number; z: number }, radius: number) {
  for (const c of COLLIDERS) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const min = c.col * c.s + radius;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 0.0001) {
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
}
