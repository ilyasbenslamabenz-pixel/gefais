// Gestion des profils joueurs : création, économie, progression.
import crypto from 'node:crypto';
import {
  DEBRIS, MISSIONS, RESOURCES, RESOURCE_IDS, TOOLS, UPGRADES, VEHICLES,
  dayKey, generateDailies, upgradePrice, xpToNext,
  type DailyKind, type ResourceId,
} from '../../shared/data';
import { hashString } from '../../shared/noise';
import { DEFAULT_LOOK, type PlayerLook, type Profile } from '../../shared/protocol';

export function emptyInventory(): Record<ResourceId, number> {
  return { dust: 0, mineral: 0, metal: 0, crystal: 0, xeno: 0 };
}

export function newProfile(name: string, look?: PlayerLook): Profile {
  return {
    id: crypto.randomBytes(5).toString('hex'),
    name: sanitizeName(name),
    look: sanitizeLook(look),
    money: 0,
    xp: 0,
    level: 1,
    inventory: emptyInventory(),
    tools: [1],
    equipped: 1,
    vehicles: [],
    upgrades: {},
    stats: { dustCollected: 0, sells: 0, debrisDestroyed: 0, zonesVisited: [], crystals: 0, totalEarned: 0, zoneDust: {}, zonesCompleted: 0 },
    missionsClaimed: [],
    daily: { day: '', list: [] },
    capacity: TOOLS[0].capacity,
  };
}

/** Complète un profil chargé avec d'éventuels champs ajoutés depuis. */
export function migrateProfile(p: Profile): Profile {
  const base = newProfile(p.name, p.look);
  const merged = { ...base, ...p, stats: { ...base.stats, ...p.stats }, inventory: { ...base.inventory, ...p.inventory } };
  return merged;
}

export function sanitizeName(n: unknown): string {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  return s || 'Astronaute' + Math.floor(Math.random() * 1000);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const HATS = ['none', 'antenna', 'crest', 'halo', 'cap'] as const;
export function sanitizeLook(l: unknown): PlayerLook {
  const o = (l ?? {}) as Partial<PlayerLook>;
  return {
    suit: HEX.test(o.suit ?? '') ? o.suit! : DEFAULT_LOOK.suit,
    visor: HEX.test(o.visor ?? '') ? o.visor! : DEFAULT_LOOK.visor,
    accent: HEX.test(o.accent ?? '') ? o.accent! : DEFAULT_LOOK.accent,
    hat: (HATS as readonly string[]).includes(o.hat as string) ? (o.hat as PlayerLook['hat']) : DEFAULT_LOOK.hat,
  };
}

export function toolOf(p: Profile) {
  return TOOLS.find((t) => t.id === p.equipped) ?? TOOLS[0];
}

export function capacityOf(p: Profile, vehicle: string) {
  const base = toolOf(p).capacity * (1 + 0.25 * (p.upgrades.backpack || 0));
  const v = VEHICLES.find((x) => x.id === vehicle);
  return Math.round(base + (v ? v.capacityBonus * (1 + 0.25 * (p.upgrades.backpack || 0)) : 0));
}

export function loadOf(p: Profile) {
  let s = 0;
  for (const r of RESOURCE_IDS) s += p.inventory[r];
  return s;
}

export function powerMul(p: Profile) {
  return 1 + 0.15 * (p.upgrades.motor || 0);
}

export function rareMul(p: Profile) {
  return 1 + 0.3 * (p.upgrades.scanner || 0);
}

/** Ajoute de l'XP ; retourne le nombre de niveaux gagnés. */
export function addXp(p: Profile, xp: number): number {
  p.xp += xp;
  let gained = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    gained++;
  }
  return gained;
}

export function ensureDaily(p: Profile) {
  const day = dayKey();
  if (p.daily.day !== day) {
    const defs = generateDailies(hashString(p.id + day), p.level);
    p.daily = { day, list: defs.map((d) => ({ ...d, progress: 0, claimed: false })) };
  }
}

export function trackDaily(p: Profile, kind: DailyKind, amount: number) {
  ensureDaily(p);
  for (const d of p.daily.list) if (d.kind === kind && !d.claimed) d.progress = Math.min(d.target, d.progress + amount);
}

export type Result = { ok: true; msg?: string } | { ok: false; msg: string };

export function sellAll(p: Profile): { ok: boolean; money: number; items: Partial<Record<ResourceId, number>> } {
  const mul = 1 + 0.1 * (p.upgrades.refinery || 0);
  let money = 0;
  const items: Partial<Record<ResourceId, number>> = {};
  for (const r of RESOURCE_IDS) {
    const q = r === 'dust' ? Math.floor(p.inventory[r]) : p.inventory[r];
    if (q <= 0) continue;
    items[r] = q;
    money += q * RESOURCES[r].price * mul;
    p.inventory[r] -= q;
  }
  money = Math.round(money);
  if (money <= 0) return { ok: false, money: 0, items };
  p.money += money;
  p.stats.totalEarned += money;
  p.stats.sells++;
  trackDaily(p, 'earn', money);
  return { ok: true, money, items };
}

export function buy(p: Profile, kind: string, id: string | number): Result {
  if (kind === 'tool') {
    const t = TOOLS.find((x) => x.id === Number(id));
    if (!t) return { ok: false, msg: 'Outil inconnu' };
    if (p.tools.includes(t.id)) return { ok: false, msg: 'Déjà possédé' };
    if (p.level < t.level) return { ok: false, msg: `Niveau ${t.level} requis` };
    if (p.money < t.price) return { ok: false, msg: 'Crédits insuffisants' };
    p.money -= t.price;
    p.tools.push(t.id);
    p.equipped = t.id;
    return { ok: true, msg: `${t.name} acheté et équipé !` };
  }
  if (kind === 'vehicle') {
    const v = VEHICLES.find((x) => x.id === id);
    if (!v) return { ok: false, msg: 'Véhicule inconnu' };
    if (p.vehicles.includes(v.id)) return { ok: false, msg: 'Déjà possédé' };
    if (p.level < v.level) return { ok: false, msg: `Niveau ${v.level} requis` };
    if (p.money < v.price) return { ok: false, msg: 'Crédits insuffisants' };
    p.money -= v.price;
    p.vehicles.push(v.id);
    return { ok: true, msg: `${v.name} livré ! Touche V pour le conduire.` };
  }
  if (kind === 'upgrade') {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return { ok: false, msg: 'Amélioration inconnue' };
    const lvl = p.upgrades[u.id] || 0;
    if (lvl >= u.maxLevel) return { ok: false, msg: 'Niveau maximum atteint' };
    const price = upgradePrice(u, lvl);
    if (p.money < price) return { ok: false, msg: 'Crédits insuffisants' };
    p.money -= price;
    p.upgrades[u.id] = lvl + 1;
    return { ok: true, msg: `${u.name} niveau ${lvl + 1} !` };
  }
  return { ok: false, msg: 'Achat invalide' };
}

export function claimMission(p: Profile, id: string): Result & { reward?: number; xp?: number } {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return { ok: false, msg: 'Mission inconnue' };
  if (p.missionsClaimed.includes(id)) return { ok: false, msg: 'Déjà réclamée' };
  // les missions se débloquent dans l'ordre
  const idx = MISSIONS.indexOf(m);
  if (idx > 0 && !p.missionsClaimed.includes(MISSIONS[idx - 1].id)) return { ok: false, msg: 'Terminez d\'abord la mission précédente' };
  if (m.progress(p.stats, { tools: p.tools, vehicles: p.vehicles }) < m.target) return { ok: false, msg: 'Objectif non atteint' };
  p.missionsClaimed.push(id);
  p.money += m.reward;
  p.stats.totalEarned += m.reward;
  return { ok: true, msg: `Mission « ${m.title} » accomplie ! +${m.reward} ¢`, reward: m.reward, xp: m.xp };
}

export function claimDaily(p: Profile, id: string): Result & { reward?: number } {
  ensureDaily(p);
  const d = p.daily.list.find((x) => x.id === id);
  if (!d) return { ok: false, msg: 'Objectif inconnu' };
  if (d.claimed) return { ok: false, msg: 'Déjà réclamé' };
  if (d.progress < d.target) return { ok: false, msg: 'Objectif non atteint' };
  d.claimed = true;
  p.money += d.reward;
  p.stats.totalEarned += d.reward;
  return { ok: true, msg: `Objectif quotidien accompli ! +${d.reward} ¢`, reward: d.reward };
}

export function rollLoot(type: keyof typeof DEBRIS): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [r, range] of Object.entries(DEBRIS[type].loot) as [ResourceId, [number, number]][]) {
    const q = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
    if (q > 0) out[r] = q;
  }
  return out;
}
