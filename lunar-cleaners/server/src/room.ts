// Une partie multijoueur : monde partagé (poussière, débris, zones) et joueurs connectés.
import type { Server, Socket } from 'socket.io';
import { DEBRIS, VEHICLES, type DebrisType, type ResourceId } from '../../shared/data';
import { hashString } from '../../shared/noise';
import type {
  ClientState, DebrisState, PlayerSnap, Profile, RoomInfo, RosterEntry, ZoneProgress, GainEvent,
} from '../../shared/protocol';
import {
  ZONES, ZONE_GOAL, WORLD_HALF, applyClean, buildInitialDust, buildZoneMap, zoneIndexAt,
} from '../../shared/world';
import { addXp, capacityOf, loadOf, powerMul, rareMul, rollLoot, toolOf, trackDaily } from './profiles';

export const ZONE_MAP = buildZoneMap();
const INITIAL_DUST = buildInitialDust();
const ZONE_INIT_SUM = new Float64Array(ZONES.length);
const ZONE_CELLS: number[][] = ZONES.map(() => []);
for (let i = 0; i < ZONE_MAP.length; i++) {
  const z = ZONE_MAP[i];
  if (z !== 255) {
    ZONE_INIT_SUM[z] += INITIAL_DUST[i];
    ZONE_CELLS[z].push(i);
  }
}

export interface Session {
  socket: Socket;
  token: string;
  profile: Profile;
  room: Room | null;
  st: { x: number; y: number; z: number; ry: number; a: number; v: string; vr: number; c: [number, number] | null; sp: number };
  lastClean: number;
  lastFullMsg: number;
  lastChat: number;
  invDirty: boolean;
  lastInvSend: number;
  saveDirty: boolean;
  zoneIdx: number;
}

interface Debris extends DebrisState {
  zone: number;
  contrib: Map<string, number>;
}

let debrisSeq = 1;

export class Room {
  id: string;
  name: string;
  max: number;
  permanent: boolean;
  sessions = new Map<string, Session>();
  dust = new Uint8Array(INITIAL_DUST);
  changed = new Set<number>();
  zoneSum = new Float64Array(ZONE_INIT_SUM);
  zoneDone = ZONES.map(() => false);
  zoneCompletions = ZONES.map(() => 0);
  zoneStorm = ZONES.map(() => 0);
  zoneContrib = ZONES.map(() => new Set<string>());
  stormQueue: { zone: number; cursor: number }[] = [];
  debris = new Map<number, Debris>();
  debrisDirty = new Set<number>();
  emptySince = Date.now();
  private timers: NodeJS.Timeout[] = [];

  constructor(private io: Server, id: string, name: string, max: number, permanent = false) {
    this.id = id;
    this.name = name;
    this.max = max;
    this.permanent = permanent;
    for (let zi = 0; zi < ZONES.length; zi++) {
      for (const [type, count] of Object.entries(ZONES[zi].debris) as [DebrisType, number][]) {
        for (let k = 0; k < count; k++) this.spawnDebris(zi, type, false);
      }
    }
    this.timers.push(setInterval(() => this.tickFast(), 1000 / 15));
    this.timers.push(setInterval(() => this.tickSlow(), 1000));
  }

  info(): RoomInfo {
    return { id: this.id, name: this.name, players: this.sessions.size, max: this.max, permanent: this.permanent };
  }

  destroy() {
    this.timers.forEach(clearInterval);
  }

  roster(): RosterEntry[] {
    return [...this.sessions.values()].map((s) => ({ id: s.profile.id, name: s.profile.name, level: s.profile.level, look: s.profile.look, tool: s.profile.equipped }));
  }

  broadcastRoster() {
    this.io.to(this.id).emit('roster', this.roster());
  }

  sys(text: string) {
    this.io.to(this.id).emit('chat', { from: 'Station', color: '#ffd93d', text, sys: true, t: Date.now() });
  }

  zones(): ZoneProgress[] {
    return ZONES.map((z, i) => ({ id: z.id, clean: 1 - this.zoneSum[i] / ZONE_INIT_SUM[i], completions: this.zoneCompletions[i], storm: this.zoneStorm[i] }));
  }

  debrisList(): DebrisState[] {
    return [...this.debris.values()].map(({ zone: _z, contrib: _c, ...d }) => d);
  }

  private spawnDebris(zi: number, type: DebrisType, announce: boolean) {
    const z = ZONES[zi];
    const a = Math.random() * Math.PI * 2;
    const r = z.r * (0.15 + Math.random() * 0.8);
    const def = DEBRIS[type];
    const d: Debris = {
      id: debrisSeq++, type, x: z.x + Math.cos(a) * r, z: z.z + Math.sin(a) * r,
      hp: def.hp, maxHp: def.hp, rot: Math.random() * Math.PI * 2, s: 0.8 + Math.random() * 0.5, zone: zi, contrib: new Map(),
    };
    if (zi === 0 && Math.hypot(d.x, d.z) < 24) { d.x *= 1.6; d.z *= 1.6; }
    this.debris.set(d.id, d);
    if (announce) {
      const { zone: _z, contrib: _c, ...pub } = d;
      this.io.to(this.id).emit('debris:spawn', pub);
    }
  }

  join(s: Session, serverTime: number) {
    this.sessions.set(s.socket.id, s);
    s.room = this;
    s.socket.join(this.id);
    s.st = { x: 0 + (Math.random() - 0.5) * 6, y: 1, z: 6 + Math.random() * 3, ry: Math.PI, a: 0, v: '', vr: 0, c: null, sp: 0 };
    this.emptySince = 0;
    s.socket.emit('joined', {
      room: this.info(),
      you: s.profile.id,
      dust: Buffer.from(this.dust.buffer, this.dust.byteOffset, this.dust.byteLength),
      debris: this.debrisList(),
      zones: this.zones(),
      roster: this.roster(),
      serverTime,
    });
    this.broadcastRoster();
    this.sys(`${s.profile.name} a rejoint l'équipe de nettoyage.`);
  }

  leave(s: Session) {
    if (!this.sessions.has(s.socket.id)) return;
    this.sessions.delete(s.socket.id);
    s.socket.leave(this.id);
    s.room = null;
    this.io.to(this.id).emit('left', s.profile.id);
    this.broadcastRoster();
    this.sys(`${s.profile.name} a quitté la partie.`);
    if (this.sessions.size === 0) this.emptySince = Date.now();
  }

  /** Mise à jour de position + nettoyage envoyée par un client (~15 Hz). */
  handleState(s: Session, m: ClientState) {
    if (!m || !Array.isArray(m.p)) return;
    const now = Date.now();
    const x = clampNum(m.p[0], -WORLD_HALF, WORLD_HALF);
    const z = clampNum(m.p[2], -WORLD_HALF, WORLD_HALF);
    const y = clampNum(m.p[1], -50, 200);
    const v = typeof m.v === 'string' && s.profile.vehicles.includes(m.v) ? m.v : '';
    if (v !== s.st.v) s.invDirty = true; // la capacité change
    s.st = { x, y, z, ry: Number(m.ry) || 0, a: m.a | 0, v, vr: Number(m.vr) || 0, c: null, sp: Number(m.sp) || 0 };

    const zi = zoneIndexAt(x, z);
    if (zi !== s.zoneIdx) {
      s.zoneIdx = zi;
      if (zi >= 0 && !s.profile.stats.zonesVisited.includes(ZONES[zi].id)) {
        s.profile.stats.zonesVisited.push(ZONES[zi].id);
        s.invDirty = true;
        s.saveDirty = true;
      }
    }

    if (Array.isArray(m.c) && m.c.length === 2) {
      const cx = Number(m.c[0]);
      const cz = Number(m.c[1]);
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
      const tool = toolOf(s.profile);
      const veh = VEHICLES.find((q) => q.id === v);
      const radius = veh ? veh.radius : tool.radius;
      const power = (veh ? veh.power : tool.power) * powerMul(s.profile);
      const reach = veh ? veh.size + veh.radius + 3 : tool.reach + tool.radius + 2.5;
      if (Math.hypot(cx - x, cz - z) > reach) return;
      s.st.c = [cx, cz];
      const dtRaw = (now - s.lastClean) / 1000;
      const dt = dtRaw > 0.4 ? 1 / 15 : Math.min(dtRaw, 0.15);
      s.lastClean = now;
      this.cleanAt(s, cx, cz, radius, power, dt, veh ? 5 : tool.id);
    }
  }

  private cleanAt(s: Session, x: number, z: number, radius: number, power: number, dt: number, tier: number) {
    const p = s.profile;
    const cap = capacityOf(p, s.st.v);
    const remaining = cap - loadOf(p);
    const now = Date.now();
    if (remaining <= 0.01) {
      if (now - s.lastFullMsg > 4000) {
        s.lastFullMsg = now;
        s.socket.emit('toast', { text: 'Soute pleine ! Retournez vendre au Collecteur de la station.', kind: 'warn' });
      }
    } else {
      const res = applyClean(this.dust, ZONE_MAP, x, z, radius, power, dt, (idx) => this.changed.add(idx), remaining);
      if (res.total > 0) {
        p.inventory.dust += res.total;
        p.stats.dustCollected += res.total;
        trackDaily(p, 'dust', res.total);
        this.gainXp(s, res.total);
        const found: Partial<Record<ResourceId, number>> = {};
        for (let zi = 0; zi < 7; zi++) {
          const u = res.perZone[zi];
          if (u <= 0) continue;
          if (zi < 6) {
            this.zoneSum[zi] -= (u / ZONES[zi].yield) * 255;
            p.stats.zoneDust[ZONES[zi].id] = (p.stats.zoneDust[ZONES[zi].id] || 0) + u;
            this.zoneContrib[zi].add(p.id);
            for (const [r, rate] of Object.entries(ZONES[zi].drops) as [ResourceId, number][]) {
              const expected = rate * u * rareMul(p);
              let n = Math.floor(expected);
              if (Math.random() < expected - n) n++;
              if (n > 0) found[r] = (found[r] || 0) + n;
            }
          }
        }
        if (Object.keys(found).length) this.giveItems(s, found, [x, z]);
        s.invDirty = true;
        s.saveDirty = true;
      }
    }
    // Débris touchés
    for (const d of this.debris.values()) {
      const def = DEBRIS[d.type];
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd > radius + def.radius * d.s) continue;
      if (tier < def.minTier) {
        if (now - s.lastFullMsg > 3000) {
          s.lastFullMsg = now;
          s.socket.emit('toast', { text: `${def.name} : outil trop faible (niveau d'outil ${def.minTier} requis)`, kind: 'warn' });
        }
        continue;
      }
      const dmg = (power * dt) / 6;
      d.hp -= dmg;
      d.contrib.set(s.socket.id, (d.contrib.get(s.socket.id) || 0) + dmg);
      this.debrisDirty.add(d.id);
      if (d.hp <= 0) this.destroyDebris(d);
    }
  }

  private destroyDebris(d: Debris) {
    this.debris.delete(d.id);
    this.debrisDirty.delete(d.id);
    this.io.to(this.id).emit('debris:remove', { id: d.id, x: d.x, z: d.z, type: d.type });
    for (const sid of d.contrib.keys()) {
      const s = this.sessions.get(sid);
      if (!s) continue;
      s.profile.stats.debrisDestroyed++;
      trackDaily(s.profile, 'debris', 1);
      this.gainXp(s, 15);
      this.giveItems(s, rollLoot(d.type), [d.x, d.z]);
      s.invDirty = true;
      s.saveDirty = true;
    }
    const zone = d.zone;
    const type = d.type;
    setTimeout(() => this.debris.size < 400 && this.spawnDebris(zone, type, true), 45000 + Math.random() * 60000);
  }

  giveItems(s: Session, items: Partial<Record<ResourceId, number>>, at?: [number, number]) {
    const p = s.profile;
    const cap = capacityOf(p, s.st.v);
    const got: Partial<Record<ResourceId, number>> = {};
    let lost = false;
    for (const [r, q] of Object.entries(items) as [ResourceId, number][]) {
      const room = Math.floor(cap - loadOf(p));
      const take = Math.max(0, Math.min(q, room));
      if (take < q) lost = true;
      if (take <= 0) continue;
      p.inventory[r] += take;
      got[r] = take;
      if (r !== 'dust') {
        trackDaily(p, 'rare', take);
        this.gainXp(s, take * 4);
      }
      if (r === 'crystal') p.stats.crystals += take;
    }
    if (Object.keys(got).length) s.socket.emit('gain', { items: got, at } satisfies GainEvent);
    if (lost) s.socket.emit('toast', { text: 'Soute pleine : une partie du butin a été perdue.', kind: 'warn' });
  }

  gainXp(s: Session, xp: number) {
    const lv = addXp(s.profile, xp);
    if (lv > 0) {
      s.socket.emit('levelup', s.profile.level);
      this.sys(`🎉 ${s.profile.name} passe au niveau ${s.profile.level} !`);
      this.broadcastRoster();
    }
  }

  private tickFast() {
    if (this.sessions.size === 0) return;
    const now = Date.now();
    // Drones autonomes (outil 6)
    for (const s of this.sessions.values()) {
      if (s.profile.equipped === 6 && !s.st.v) {
        const a = droneAngle(now, s.profile.id);
        const dx = s.st.x + Math.cos(a) * 3.4;
        const dz = s.st.z + Math.sin(a) * 3.4;
        this.cleanAt(s, dx, dz, 1.9, 230 * powerMul(s.profile), 1 / 15, 6);
      }
    }
    // Snapshots des joueurs
    const snaps: PlayerSnap[] = [];
    for (const s of this.sessions.values()) {
      const t = s.st;
      snaps.push([s.profile.id, r2(t.x), r2(t.y), r2(t.z), r2(t.ry), t.a, t.v, r2(t.vr), s.profile.equipped, t.c ? 1 : 0, t.c ? r2(t.c[0]) : 0, t.c ? r2(t.c[1]) : 0, r2(t.sp)]);
      t.c = null;
    }
    this.io.to(this.id).volatile.emit('snap', snaps);
    // Différentiel de poussière (binaire)
    if (this.changed.size) {
      const arr = new Uint32Array(this.changed.size);
      let i = 0;
      for (const idx of this.changed) arr[i++] = (idx << 8) | this.dust[idx];
      this.changed.clear();
      this.io.to(this.id).emit('dust', Buffer.from(arr.buffer));
    }
    if (this.debrisDirty.size) {
      const list: [number, number][] = [];
      for (const id of this.debrisDirty) {
        const d = this.debris.get(id);
        if (d) list.push([id, Math.max(0, Math.round(d.hp))]);
      }
      this.debrisDirty.clear();
      this.io.to(this.id).emit('debris:hp', list);
    }
    // Profils modifiés (max 5 Hz)
    for (const s of this.sessions.values()) {
      if (s.invDirty && now - s.lastInvSend > 200) {
        s.invDirty = false;
        s.lastInvSend = now;
        sendProfile(s);
      }
    }
  }

  private tickSlow() {
    if (this.sessions.size === 0) return;
    const now = Date.now();
    // Régénération lente de la poussière (micrométéorites)
    for (let k = 0; k < 700; k++) {
      const idx = (Math.random() * this.dust.length) | 0;
      const target = INITIAL_DUST[idx];
      const cur = this.dust[idx];
      if (cur < target) {
        const nv = Math.min(target, cur + 10);
        this.dust[idx] = nv;
        const zi = ZONE_MAP[idx];
        if (zi !== 255) this.zoneSum[zi] += nv - cur;
        this.changed.add(idx);
      }
    }
    // Tempêtes de poussière : les zones certifiées se re-salissent
    for (let zi = 0; zi < ZONES.length; zi++) {
      if (this.zoneStorm[zi] && now >= this.zoneStorm[zi]) {
        this.zoneStorm[zi] = 0;
        this.stormQueue.push({ zone: zi, cursor: 0 });
        this.sys(`🌪️ Une tempête de poussière s'abat sur ${ZONES[zi].name} ! La zone peut être certifiée à nouveau.`);
      }
    }
    for (const q of this.stormQueue) {
      const cells = ZONE_CELLS[q.zone];
      const end = Math.min(cells.length, q.cursor + 2500);
      for (let i = q.cursor; i < end; i++) {
        const idx = cells[i];
        const target = Math.round(INITIAL_DUST[idx] * 0.9);
        const cur = this.dust[idx];
        if (cur < target) {
          this.dust[idx] = target;
          this.zoneSum[q.zone] += target - cur;
          this.changed.add(idx);
        }
      }
      q.cursor = end;
      if (q.cursor >= cells.length) this.zoneDone[q.zone] = false;
    }
    this.stormQueue = this.stormQueue.filter((q) => q.cursor < ZONE_CELLS[q.zone].length);
    // Certification des zones
    for (let zi = 0; zi < ZONES.length; zi++) {
      const clean = 1 - this.zoneSum[zi] / ZONE_INIT_SUM[zi];
      if (!this.zoneDone[zi] && clean >= ZONE_GOAL && !this.stormQueue.some((q) => q.zone === zi)) {
        this.zoneDone[zi] = true;
        this.zoneCompletions[zi]++;
        this.zoneStorm[zi] = now + 5 * 60 * 1000;
        const zone = ZONES[zi];
        const contributors = [...this.sessions.values()].filter((s) => this.zoneContrib[zi].has(s.profile.id));
        this.sys(`✅ ${zone.name} certifiée propre à ${Math.round(ZONE_GOAL * 100)} % ! Prime de ${zone.reward} ¢ pour chaque participant (${contributors.length}).`);
        for (const s of contributors) {
          s.profile.money += zone.reward;
          s.profile.stats.totalEarned += zone.reward;
          s.profile.stats.zonesCompleted++;
          this.gainXp(s, Math.round(zone.reward / 4));
          s.socket.emit('gain', { items: {}, money: zone.reward } satisfies GainEvent);
          s.invDirty = true;
          s.saveDirty = true;
        }
        this.zoneContrib[zi].clear();
      }
    }
    this.io.to(this.id).emit('zones', this.zones());
  }
}

export function sendProfile(s: Session) {
  s.profile.capacity = capacityOf(s.profile, s.st?.v || '');
  s.socket.emit('profile', s.profile);
}

export function droneAngle(now: number, id: string) {
  return (now / 1000) * 1.3 + (hashString(id) % 628) / 100;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function clampNum(n: unknown, a: number, b: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(a, Math.min(b, v));
}

