// Génération déterministe du pays : relief, côte, rivières, lacs, villes, réseaux, infrastructures.
import { fbm, mulberry32, noise2, smoothstep } from '../noise';
import { SECTORS, SECTOR_INDEX, type SectorId } from './data';
import type { CityDef, CityKind, CountryConfig, CountryDef, Infra, InfraType, LakeDef, Link, RiverDef } from './types';

export const MAP_W = 360; // km
export const MAP_D = 280; // km
export const HALF_W = MAP_W / 2;
export const HALF_D = MAP_D / 2;

/** Abscisse de la côte (mer à l'ouest) pour une ordonnée z. */
export function coastX(seed: number, z: number) {
  return -HALF_W + 34 + noise2(z * 0.012 + seed * 0.01, 3.3) * 22 + noise2(z * 0.05, seed * 0.02) * 6;
}

function mountainMask(seed: number, x: number, z: number) {
  const n = noise2(x * 0.01 + 11, z * 0.01 + seed * 0.001) * 35;
  return smoothstep(70, 170, x * 0.75 - z * 0.45 + n);
}

/** Relief de base (km), sans rivières ni lacs. */
export function baseHeight(seed: number, x: number, z: number): number {
  const s = seed * 0.0007;
  let h = 0.12 + fbm(x * 0.012 + s, z * 0.012 - s, 4) * 0.1 + fbm(x * 0.05, z * 0.05 + s, 3) * 0.025;
  const m = mountainMask(seed, x, z);
  if (m > 0) {
    const ridge = 1 - Math.abs(noise2(x * 0.03 + s, z * 0.03));
    const ridge2 = 1 - Math.abs(noise2(x * 0.07 - s, z * 0.07 + 5));
    h += m * (ridge * ridge * 1.6 + ridge2 * 0.5 + fbm(x * 0.02, z * 0.02, 3) * 0.3);
  }
  // collines du sud
  h += smoothstep(40, 130, z) * Math.max(0, fbm(x * 0.03 + 3, z * 0.03, 3)) * 0.25;
  // côte : la terre plonge sous la mer à l'ouest
  const cx = coastX(seed, z);
  const t = smoothstep(cx - 1, cx + 14, x);
  h = h * t + (1 - t) * (-0.06 - Math.max(0, cx - x) * 0.004);
  // bordures de la carte : collines frontalières
  const edge = Math.max(Math.abs(z) - (HALF_D - 18), x - (HALF_W - 18), 0);
  h += edge * 0.03;
  return h;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px;
  const qz = az + t * dz - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

/** Fonction de hauteur complète (avec rivières et lacs), à utiliser pour construire une grille. */
export function makeHeightFn(country: Pick<CountryDef, 'seed' | 'rivers' | 'lakes'>) {
  const { seed, rivers, lakes } = country;
  return (x: number, z: number): number => {
    let h = baseHeight(seed, x, z);
    for (const r of rivers) {
      let d = Infinity;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i];
        const b = r.points[i + 1];
        if (Math.abs(x - a[0]) > 12 && Math.abs(x - b[0]) > 12) continue;
        d = Math.min(d, distToSegment(x, z, a[0], a[1], b[0], b[1]));
      }
      if (d < r.width * 4) {
        const k = 1 - smoothstep(r.width * 0.6, r.width * 4, d);
        h = h * (1 - k * 0.55) - k * 0.03;
      }
    }
    for (const l of lakes) {
      const d = Math.hypot(x - l.x, z - l.z);
      if (d < l.r * 1.6) {
        const k = 1 - smoothstep(l.r * 0.7, l.r * 1.6, d);
        h = h * (1 - k) + (l.level - 0.04) * k;
      }
    }
    return h;
  };
}

// ---------- Noms ----------
const PREFIX = ['Val', 'Mont', 'Beau', 'Clair', 'Roche', 'Saint-', 'Port-', 'Haut', 'Bel', 'Pré', 'Fontaine', 'Mir', 'Aur', 'Lor', 'Bris', 'Cor', 'Sel', 'Ver', 'Tal', 'Mar', 'Gran', 'Lune', 'Or', 'Riv'];
const SUFFIX = ['ande', 'elle', 'ville', 'mont', 'bourg', 'court', 'lac', 'gard', 'ac', 'ieu', 'ence', 'ois', 'ar', 'erre', 'ine', 'eau', 'ian', 'oval', 'enne', 'issac', 'ole', 'ades', 'ignan', 'aurel'];

function makeNames(seed: number, n: number): string[] {
  const rnd = mulberry32(seed * 7 + 3);
  const roots = PREFIX.filter((p) => !p.endsWith('-'));
  const word = () => {
    const p = roots[Math.floor(rnd() * roots.length)];
    let s = SUFFIX[Math.floor(rnd() * SUFFIX.length)];
    if (/[aeiouy]$/i.test(p) && /^[aeiouy]/i.test(s)) s = s.slice(1);
    return p + s;
  };
  const set = new Set<string>();
  let guard = 0;
  while (set.size < n && guard++ < 5000) {
    const r = rnd();
    set.add(r < 0.1 ? `Saint-${word()}` : r < 0.16 ? `Port-${word()}` : word());
  }
  return [...set];
}

// ---------- Génération ----------
export const DEFAULT_CONFIG: CountryConfig = { name: "République d'Ilyas", seed: 2030, metropoles: 5, villes: 12, communes: 30, population: 9_600_000 };

function sectorWeights(kind: CityKind, coastal: boolean, industrial: boolean, rnd: () => number): number[] {
  const w = SECTORS.map((s) => s.employmentShare);
  const mul = (id: SectorId, k: number) => { w[SECTOR_INDEX[id]] *= k; };
  if (kind === 'metropole') { mul('finance', 2.2); mul('technologie', 2); mul('services', 1.3); mul('sante', 1.2); mul('education', 1.2); mul('agriculture', 0.05); mul('industrie', 0.7); }
  if (kind === 'ville') { mul('industrie', 1.3); mul('commerce', 1.1); mul('agriculture', 0.6); mul('finance', 0.6); }
  if (kind === 'commune') { mul('agriculture', 6); mul('construction', 1.3); mul('finance', 0.25); mul('technologie', 0.3); mul('services', 0.8); }
  if (industrial) { mul('industrie', 2.2); mul('energie', 2); mul('transport', 1.4); }
  if (coastal) { mul('tourisme', 2); mul('transport', 1.3); }
  return w.map((v) => v * (0.85 + rnd() * 0.3));
}

export function generateCountry(cfg: CountryConfig): CountryDef {
  const seed = cfg.seed;
  const rnd = mulberry32(seed);
  const country: CountryDef = { name: cfg.name, seed, width: MAP_W, depth: MAP_D, seaLevel: 0, cities: [], links: [], rivers: [], lakes: [], infra: [] };

  // Rivières : des montagnes vers la mer en suivant grossièrement la pente
  const riverCount = 3;
  for (let r = 0; r < riverCount; r++) {
    const pts: [number, number][] = [];
    let x = 110 + rnd() * 50;
    let z = -110 + r * 85 + rnd() * 30;
    for (let i = 0; i < 200; i++) {
      pts.push([x, z]);
      if (x < coastX(seed, z) - 6) break;
      // choisit la direction la plus basse parmi un éventail orienté vers l'ouest
      let best = { h: Infinity, x, z };
      for (let a = -0.9; a <= 0.9; a += 0.3) {
        const ang = Math.PI + a + noise2(i * 0.15, r * 10 + seed * 0.01) * 0.4;
        const nx = x + Math.cos(ang) * 3;
        const nz = z + Math.sin(ang) * 3;
        const h = baseHeight(seed, nx, nz) + Math.abs(a) * 0.02;
        if (h < best.h) best = { h, x: nx, z: nz };
      }
      x = best.x;
      z = Math.max(-HALF_D + 10, Math.min(HALF_D - 10, best.z));
    }
    country.rivers.push({ points: pts, width: 0.5 + r * 0.15 });
  }
  // Lacs : un lac de montagne (retenue de barrage) et deux lacs de plaine
  const r0 = country.rivers[0].points;
  const lakeA = r0[Math.min(8, r0.length - 1)];
  country.lakes.push({ x: lakeA[0], z: lakeA[1], r: 4.5, level: baseHeight(seed, lakeA[0], lakeA[1]) - 0.02 });
  for (let i = 0; i < 2; i++) {
    for (let t = 0; t < 50; t++) {
      const x = -60 + rnd() * 120;
      const z = -100 + rnd() * 200;
      const h = baseHeight(seed, x, z);
      if (h > 0.08 && h < 0.35 && x > coastX(seed, z) + 20) {
        country.lakes.push({ x, z, r: 3 + rnd() * 3, level: h - 0.01 });
        break;
      }
    }
  }
  const height = makeHeightFn(country);

  // Villes
  const names = makeNames(seed, cfg.metropoles + cfg.villes + cfg.communes + 10);
  let nameIdx = 0;
  const place = (kind: CityKind, count: number, minDist: number) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries++ < 6000) {
      const x = -HALF_W + 20 + rnd() * (MAP_W - 40);
      const z = -HALF_D + 18 + rnd() * (MAP_D - 36);
      const h = height(x, z);
      const cx = coastX(seed, z);
      if (h < 0.03 || h > (kind === 'commune' ? 0.9 : 0.55) || x < cx + 2) continue;
      if (mountainMask(seed, x, z) > (kind === 'commune' ? 0.8 : 0.35)) continue;
      const scale = tries > 3000 ? 0.7 : 1;
      if (country.cities.some((c) => Math.hypot(c.x - x, c.z - z) < Math.max(minDist, c.kind === 'metropole' ? 26 : c.kind === 'ville' ? 15 : 8) * scale)) continue;
      if (country.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 3)) continue;
      const coastal = x - cx < 14;
      const id = country.cities.length;
      let cname = names[nameIdx++] ?? `Ville ${id}`;
      if (coastal && !cname.startsWith('Port-') && rnd() < 0.35) cname += '-sur-Mer';
      const industrial = kind === 'ville' && rnd() < 0.35;
      country.cities.push({
        id, name: cname, kind, x, z,
        radius: kind === 'metropole' ? 6 + rnd() * 3 : kind === 'ville' ? 2.6 + rnd() * 1.4 : 0.9 + rnd() * 0.6,
        coastal, capital: false, sectorWeights: sectorWeights(kind, coastal, industrial, rnd),
      });
      placed++;
    }
  };
  place('metropole', cfg.metropoles, 70);
  place('ville', cfg.villes, 30);
  place('commune', cfg.communes, 12);
  // capitale : la métropole la plus centrale
  const metros = country.cities.filter((c) => c.kind === 'metropole');
  if (metros.length) {
    const cap = metros.reduce((a, b) => (Math.hypot(a.x + 20, a.z) < Math.hypot(b.x + 20, b.z) ? a : b));
    cap.capital = true;
    cap.radius += 2;
  }

  // Réseaux
  const linkPoints = (a: CityDef, b: CityDef, wobble: number): [number, number][] => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.ceil(d / 2));
    const nx = -(b.z - a.z) / d;
    const nz = (b.x - a.x) / d;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = Math.sin(t * Math.PI) * wobble * d * 0.08 + Math.sin(t * Math.PI * 3) * wobble * 1.2;
      pts.push([a.x + (b.x - a.x) * t + nx * off, a.z + (b.z - a.z) * t + nz * off]);
    }
    return pts;
  };
  const mst = (nodes: CityDef[]) => {
    const edges: [CityDef, CityDef][] = [];
    if (!nodes.length) return edges;
    const inTree = new Set([nodes[0].id]);
    while (inTree.size < nodes.length) {
      let best: [CityDef, CityDef] | null = null;
      let bd = Infinity;
      for (const a of nodes) {
        if (!inTree.has(a.id)) continue;
        for (const b of nodes) {
          if (inTree.has(b.id)) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < bd) { bd = d; best = [a, b]; }
        }
      }
      if (!best) break;
      edges.push(best);
      inTree.add(best[1].id);
    }
    return edges;
  };
  const hasLink = (a: number, b: number, kind: Link['kind']) => country.links.some((l) => l.kind === kind && ((l.a === a && l.b === b) || (l.a === b && l.b === a)));
  for (const [a, b] of mst(metros)) country.links.push({ a: a.id, b: b.id, kind: 'autoroute', points: linkPoints(a, b, 0.6) });
  // liaison supplémentaire entre métropoles proches
  for (const a of metros) {
    const others = metros.filter((b) => b.id !== a.id).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
    const b = others[1];
    if (b && !hasLink(a.id, b.id, 'autoroute') && Math.hypot(b.x - a.x, b.z - a.z) < 170) country.links.push({ a: a.id, b: b.id, kind: 'autoroute', points: linkPoints(a, b, -0.5) });
  }
  const villes = country.cities.filter((c) => c.kind === 'ville');
  for (const v of villes) {
    const big = [...metros, ...villes.filter((w) => w.id < v.id)].sort((p, q) => Math.hypot(p.x - v.x, p.z - v.z) - Math.hypot(q.x - v.x, q.z - v.z))[0];
    if (big) country.links.push({ a: big.id, b: v.id, kind: 'nationale', points: linkPoints(big, v, 0.8) });
  }
  for (const c of country.cities.filter((q) => q.kind === 'commune')) {
    const near = country.cities.filter((q) => q.id !== c.id && q.kind !== 'commune').sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[0];
    if (near) country.links.push({ a: near.id, b: c.id, kind: 'nationale', points: linkPoints(near, c, 1) });
  }
  const railNodes = [...metros, ...villes.slice(0, Math.ceil(villes.length * 0.6))];
  for (const [a, b] of mst(railNodes)) country.links.push({ a: a.id, b: b.id, kind: 'rail', points: linkPoints(a, b, 0.3) });

  // Infrastructures
  let infraId = 0;
  const add = (type: InfraType, name: string, cityId: number | null, x: number, z: number, o: Partial<Infra>) => {
    country.infra.push({
      id: infraId++, type, name, cityId, x, z, rot: rnd() * Math.PI * 2, capacity: 0, capacityUnit: '', employees: 0, maintenance: 0,
      energyMWh: 0, emissions: 0, level: 1, builtYear: 1960 + Math.floor(rnd() * 60), ...o,
    });
  };
  const near = (c: CityDef, k: number): [number, number] => {
    const a = rnd() * Math.PI * 2;
    const d = c.radius * k;
    return [c.x + Math.cos(a) * d, c.z + Math.sin(a) * d];
  };
  const metroSorted = [...metros].sort((a, b) => Number(b.capital) - Number(a.capital));
  metroSorted.forEach((c, i) => {
    for (let h = 0; h < (c.capital ? 3 : 2); h++) { const [x, z] = near(c, 0.5); add('hopital', `CHU de ${c.name}${h ? ' ' + (h + 1) : ''}`, c.id, x, z, { capacity: 900 - h * 250, capacityUnit: 'lits', employees: 4200 - h * 1200, maintenance: 4.2e8 - h * 1.2e8, energyMWh: 30000, emissions: 4500 }); }
    { const [x, z] = near(c, 0.7); add('universite', `Université de ${c.name}`, c.id, x, z, { capacity: c.capital ? 45000 : 28000, capacityUnit: 'étudiants', employees: c.capital ? 4500 : 2800, maintenance: 2.6e8, energyMWh: 22000, emissions: 3000 }); }
    { const [x, z] = near(c, 0.35); add('gare', `Gare centrale de ${c.name}`, c.id, x, z, { capacity: 60000, capacityUnit: 'voyageurs/jour', employees: 600, maintenance: 3e7, energyMWh: 9000, emissions: 400 }); }
    { const [x, z] = near(c, 1.5); add('zone_industrielle', `ZI de ${c.name}`, c.id, x, z, { capacity: 120, capacityUnit: 'entreprises', employees: 9000, maintenance: 6e6, energyMWh: 400000, emissions: 160000 }); }
    { const [x, z] = near(c, 1.1); add('zone_commerciale', `Centre commercial de ${c.name}`, c.id, x, z, { capacity: 180, capacityUnit: 'commerces', employees: 3500, maintenance: 2e6, energyMWh: 40000, emissions: 5000 }); }
    { const [x, z] = near(c, 0.6); add('stade', `Stade de ${c.name}`, c.id, x, z, { capacity: 35000, capacityUnit: 'places', employees: 150, maintenance: 8e6, energyMWh: 3000, emissions: 300 }); }
    { const [x, z] = near(c, 0.3); add('commissariat', `Hôtel de police de ${c.name}`, c.id, x, z, { capacity: 900, capacityUnit: 'agents', employees: 900, maintenance: 6e7, energyMWh: 2500, emissions: 300 }); }
    if (i < 3) { const [x, z] = near(c, 2.4); add('aeroport', `Aéroport de ${c.name}`, c.id, x, z, { capacity: c.capital ? 22e6 : 8e6, capacityUnit: 'passagers/an', employees: c.capital ? 9000 : 3500, maintenance: 1.2e8, energyMWh: 60000, emissions: 25000, rot: rnd() * Math.PI }); }
    if (c.coastal) { add('port', `Port de ${c.name}`, c.id, coastX(seed, c.z) - 1, c.z, { capacity: 25e6, capacityUnit: 't/an', employees: 3000, maintenance: 7e7, energyMWh: 50000, emissions: 30000, rot: 0 }); }
  });
  for (const c of villes) {
    const [x, z] = near(c, 0.5);
    add('hopital', `Hôpital de ${c.name}`, c.id, x, z, { capacity: 320, capacityUnit: 'lits', employees: 1300, maintenance: 1.3e8, energyMWh: 11000, emissions: 1600 });
    { const [x2, z2] = near(c, 0.4); add('ecole', `Lycée de ${c.name}`, c.id, x2, z2, { capacity: 1400, capacityUnit: 'élèves', employees: 110, maintenance: 9e6, energyMWh: 1400, emissions: 180 }); }
    if (railNodes.includes(c)) { const [x2, z2] = near(c, 0.3); add('gare', `Gare de ${c.name}`, c.id, x2, z2, { capacity: 9000, capacityUnit: 'voyageurs/jour', employees: 90, maintenance: 6e6, energyMWh: 1500, emissions: 80 }); }
    if (c.sectorWeights[SECTOR_INDEX.industrie] > SECTORS[SECTOR_INDEX.industrie].employmentShare * 2) { const [x2, z2] = near(c, 1.6); add('zone_industrielle', `Zone industrielle de ${c.name}`, c.id, x2, z2, { capacity: 60, capacityUnit: 'entreprises', employees: 5000, maintenance: 3e6, energyMWh: 300000, emissions: 140000 }); }
    if (c.coastal) add('port', `Port de ${c.name}`, c.id, coastX(seed, c.z) - 1, c.z, { capacity: 6e6, capacityUnit: 't/an', employees: 800, maintenance: 2e7, energyMWh: 12000, emissions: 8000, rot: 0 });
  }
  for (const c of country.cities.filter((q) => q.kind === 'commune')) {
    const [x, z] = near(c, 0.4);
    add('ecole', `École de ${c.name}`, c.id, x, z, { capacity: 250, capacityUnit: 'élèves', employees: 18, maintenance: 1.6e6, energyMWh: 300, emissions: 40 });
    for (let k = 0; k < 2; k++) { const [fx, fz] = near(c, 2.5 + rnd() * 2); add('ferme', `Exploitation agricole de ${c.name}${k ? ' ' + (k + 1) : ''}`, c.id, fx, fz, { capacity: 180, capacityUnit: 'ha', employees: 6, maintenance: 0, energyMWh: 250, emissions: 900 }); }
  }
  // Équipements complémentaires : le pays est entièrement équipé dès le départ
  for (const c of [...metroSorted, ...villes]) {
    const big = c.kind === 'metropole';
    for (let k = 0; k < (big ? 4 : 1); k++) { const [x, z] = near(c, 0.25 + rnd() * 0.5); add('ecole', `${big ? 'Groupe scolaire' : 'Collège'} de ${c.name}${k ? ' ' + (k + 1) : ''}`, c.id, x, z, { capacity: big ? 1800 : 900, capacityUnit: 'élèves', employees: big ? 140 : 70, maintenance: big ? 1.2e7 : 6e6, energyMWh: 1600, emissions: 200 }); }
    { const [x, z] = near(c, 0.45); add('caserne', `Centre de secours de ${c.name}`, c.id, x, z, { capacity: big ? 260 : 70, capacityUnit: 'pompiers', employees: big ? 260 : 70, maintenance: big ? 2.4e7 : 6e6, energyMWh: 900, emissions: 150 }); }
    if (!big) { const [x, z] = near(c, 0.35); add('commissariat', `Commissariat de ${c.name}`, c.id, x, z, { capacity: 160, capacityUnit: 'agents', employees: 160, maintenance: 1.1e7, energyMWh: 600, emissions: 80 }); }
    const ind = country.infra.find((i) => i.cityId === c.id && i.type === 'zone_industrielle');
    if (ind) for (let k = 0; k < (big ? 3 : 2); k++) {
      const a = rnd() * Math.PI * 2;
      add('usine', `Usine ${['métallurgique', 'chimique', 'agroalimentaire', 'automobile', 'électronique'][Math.floor(rnd() * 5)]} de ${c.name}`, c.id, ind.x + Math.cos(a) * 2.2, ind.z + Math.sin(a) * 2.2, { capacity: 600 + Math.floor(rnd() * 1400), capacityUnit: 'salariés', employees: 600 + Math.floor(rnd() * 1400), maintenance: 0, energyMWh: 120000, emissions: 60000 });
    }
  }
  // Production d'électricité (bilan détaillé en phase 4)
  const industrialTown = villes.find((v) => country.infra.some((i) => i.cityId === v.id && i.type === 'zone_industrielle')) ?? villes[0];
  const site = (c: CityDef | undefined, k: number): [number, number] => (c ? near(c, k) : [0, 0]);
  { const [x, z] = site(industrialTown, 3); add('centrale_charbon', 'Centrale thermique de ' + (industrialTown?.name ?? 'Ilyas'), null, x, z, { capacity: 1200, capacityUnit: 'MW', employees: 450, maintenance: 6e7, energyMWh: -6.6e6, emissions: 6.3e6 }); }
  for (let i = 0; i < 2; i++) { const [x, z] = site(metroSorted[(i + 1) % metroSorted.length], 3.2); add('centrale_gaz', `Centrale à gaz n°${i + 1}`, null, x, z, { capacity: 800, capacityUnit: 'MW', employees: 120, maintenance: 3e7, energyMWh: -3.5e6, emissions: 1.3e6 }); }
  { const rp = country.rivers[1].points; const p = rp[Math.floor(rp.length * 0.6)]; add('centrale_nucleaire', 'Centrale nucléaire du Val', null, p[0] + 1.5, p[1] + 1.5, { capacity: 3600, capacityUnit: 'MW', employees: 1800, maintenance: 4e8, energyMWh: -2.6e7, emissions: 0 }); }
  { const l = country.lakes[0]; add('barrage', 'Barrage des Cimes', null, l.x - l.r - 0.5, l.z, { capacity: 600, capacityUnit: 'MW', employees: 60, maintenance: 1.5e7, energyMWh: -2.1e6, emissions: 0, rot: Math.PI / 2 }); }
  for (let i = 0; i < 6; i++) {
    for (let t = 0; t < 100; t++) {
      const z = -HALF_D + 30 + rnd() * (MAP_D - 60);
      const x = coastX(seed, z) + 4 + rnd() * 60;
      const h = height(x, z);
      if (h > 0.15 && h < 0.6 && !country.cities.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + 6)) {
        add('parc_eolien', `Parc éolien n°${i + 1}`, null, x, z, { capacity: 150, capacityUnit: 'MW', employees: 15, maintenance: 6e6, energyMWh: -3.3e5, emissions: 0 });
        break;
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    for (let t = 0; t < 100; t++) {
      const x = -80 + rnd() * 160;
      const z = 50 + rnd() * 70;
      const h = height(x, z);
      if (h > 0.05 && h < 0.4 && !country.cities.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + 5)) {
        add('parc_solaire', `Centrale solaire n°${i + 1}`, null, x, z, { capacity: 120, capacityUnit: 'MW', employees: 10, maintenance: 2e6, energyMWh: -1.7e5, emissions: 0 });
        break;
      }
    }
  }
  return country;
}

/** Répartition initiale de la population entre les villes (somme = 1). */
export function initialPopShares(country: CountryDef): number[] {
  const metros = country.cities.filter((c) => c.kind === 'metropole');
  const villes = country.cities.filter((c) => c.kind === 'ville');
  const communes = country.cities.filter((c) => c.kind === 'commune');
  const rnd = mulberry32(country.seed + 99);
  const shares = new Array(country.cities.length).fill(0);
  const metroW = metros.map((c, i) => (c.capital ? 1.6 : 1) * (1 - i * 0.08) * (0.8 + rnd() * 0.4));
  const mw = metroW.reduce((s, v) => s + v, 0);
  metros.forEach((c, i) => (shares[c.id] = (0.46 * metroW[i]) / mw));
  const vw = villes.map(() => 0.6 + rnd() * 1.4);
  const vs = vw.reduce((s, v) => s + v, 0);
  villes.forEach((c, i) => (shares[c.id] = (0.26 * vw[i]) / vs));
  const cw = communes.map(() => 0.5 + rnd());
  const cs = cw.reduce((s, v) => s + v, 0);
  communes.forEach((c, i) => (shares[c.id] = (0.28 * cw[i]) / cs));
  const tot = shares.reduce((s, v) => s + v, 0) || 1;
  return shares.map((v) => v / tot);
}

export type { RiverDef, LakeDef };
