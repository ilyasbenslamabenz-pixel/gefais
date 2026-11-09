// Connexion temps réel au serveur (Socket.IO).
import { io, type Socket } from 'socket.io-client';
import * as THREE from 'three';
import { useStore } from '../store';
import { G } from '../game/state';
import { sfx } from '../audio';
import { RESOURCES, type ResourceId } from '../../../shared/data';
import { STATION } from '../../../shared/world';
import { DEFAULT_LOOK, type ChatMessage, type DebrisState, type GainEvent, type JoinPayload, type PlayerSnap, type Profile, type RosterEntry, type ZoneProgress } from '../../../shared/protocol';

const TOKEN_KEY = 'lc_token';

export const socket: Socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
});

const st = () => useStore.getState();

export function connect() {
  if (socket.connected) return;
  socket.connect();
}

socket.on('connect', () => {
  const token = localStorage.getItem(TOKEN_KEY) || undefined;
  socket.emit('hello', { token, name: '', look: DEFAULT_LOOK }, (res: { token: string }) => {
    localStorage.setItem(TOKEN_KEY, res.token);
    st().set({ connected: true });
    // reconnexion automatique à la partie en cours
    const room = st().room;
    if (room && st().screen === 'game') joinRoom(room.id);
  });
});

socket.on('disconnect', () => {
  st().set({ connected: false });
  if (st().screen === 'game') st().toast('Connexion perdue… reconnexion en cours', 'warn');
});

socket.on('profile', (p: Profile) => {
  const prev = st().profile;
  st().set({ profile: p });
  if (!st().selectedVehicle && p.vehicles.length) st().set({ selectedVehicle: p.vehicles[p.vehicles.length - 1] });
  if (prev && p.level > prev.level) sfx.level();
});

socket.on('joined', (j: JoinPayload) => {
  const bytes = new Uint8Array(j.dust);
  G.dust.set(bytes);
  G.dustDirty = true;
  G.me.id = j.you;
  G.serverOffset = j.serverTime - Date.now();
  G.remotes.clear();
  G.debris.clear();
  for (const d of j.debris) G.debris.set(d.id, { ...d, hitAt: 0 });
  G.me.pos.set(STATION.spawn.x + (Math.random() - 0.5) * 4, 2, STATION.spawn.z + Math.random() * 2);
  G.me.vel.set(0, 0, 0);
  G.me.vehicle = '';
  st().set({ room: j.room, roster: j.roster, zones: j.zones, screen: 'game', panel: null, vehicle: '', chat: [], debrisVersion: st().debrisVersion + 1 });
});

socket.on('roster', (r: RosterEntry[]) => st().set({ roster: r }));
socket.on('zones', (z: ZoneProgress[]) => st().set({ zones: z }));
socket.on('left', (id: string) => G.remotes.delete(id));

socket.on('snap', (snaps: PlayerSnap[]) => {
  const now = performance.now();
  for (const s of snaps) {
    const [id, x, y, z, ry, a, v, vr, tool, c, cx, cz, sp] = s;
    if (id === G.me.id) continue;
    let r = G.remotes.get(id);
    if (!r) {
      r = { id, pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(x, y, z), ry, tRy: ry, anim: a, vehicle: v, vr, tVr: vr, tool, cleaning: false, cx, cz, speed: sp, last: now };
      G.remotes.set(id, r);
    }
    r.target.set(x, y, z);
    r.tRy = ry;
    r.anim = a;
    r.vehicle = v;
    r.tVr = vr;
    r.tool = tool;
    r.cleaning = c === 1;
    r.cx = cx;
    r.cz = cz;
    r.speed = sp;
    r.last = now;
  }
});

socket.on('dust', (buf: ArrayBuffer) => {
  const arr = new Uint32Array(buf);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    G.dust[v >>> 8] = v & 255;
  }
  G.dustDirty = true;
});

socket.on('debris:hp', (list: [number, number][]) => {
  const now = performance.now();
  for (const [id, hp] of list) {
    const d = G.debris.get(id);
    if (d) { d.hp = hp; d.hitAt = now; }
  }
});
socket.on('debris:remove', (m: { id: number; x: number; z: number; type: string }) => {
  G.debris.delete(m.id);
  st().set({ debrisVersion: st().debrisVersion + 1 });
  const color = m.type === 'crystal' ? '#6ff3ff' : m.type === 'pod' ? '#c46bff' : m.type === 'junk' ? '#c9ced6' : '#a59b8a';
  G.emit?.(m.x, NaN, m.z, 40, color, 'burst');
  const dx = m.x - G.me.pos.x;
  const dz = m.z - G.me.pos.z;
  if (dx * dx + dz * dz < 900) sfx.breakIt();
});
socket.on('debris:spawn', (d: DebrisState) => {
  G.debris.set(d.id, { ...d, hitAt: 0 });
  st().set({ debrisVersion: st().debrisVersion + 1 });
});

socket.on('gain', (g: GainEvent) => {
  for (const [r, q] of Object.entries(g.items) as [ResourceId, number][]) {
    if (r === 'dust') st().floater(`+${Math.round(q)} ${RESOURCES[r].icon}`, RESOURCES[r].color);
    else st().floater(`+${q} ${RESOURCES[r].icon} ${RESOURCES[r].name}`, RESOURCES[r].color);
  }
  if (g.money) {
    st().floater(`+${g.money} ¢`, '#ffd93d');
    sfx.coin();
  } else if (Object.keys(g.items).length) sfx.pickup();
});

socket.on('levelup', (lvl: number) => {
  st().toast(`🎉 Niveau ${lvl} atteint ! De nouveaux équipements sont disponibles.`, 'good');
});

socket.on('toast', (t: { text: string; kind: 'info' | 'warn' | 'good' }) => st().toast(t.text, t.kind));

socket.on('chat', (m: ChatMessage) => {
  st().set({ chat: [...st().chat.slice(-60), m] });
  if (!m.sys) sfx.msg();
});

// ---------- Actions ----------
type Res = { ok: boolean; msg?: string; [k: string]: unknown };

export function request<T = Res>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, msg: 'Non connecté au serveur' } as T);
    if (payload === undefined) socket.emit(event, (r: T) => resolve(r));
    else socket.emit(event, payload, (r: T) => resolve(r));
  });
}

export async function joinRoom(id: string) {
  const r = await request('room:join', { id });
  if (!r.ok) {
    st().toast(r.msg || 'Impossible de rejoindre', 'warn');
    sfx.error();
  }
  return r;
}

export function leaveRoom() {
  socket.emit('room:leave');
  st().set({ screen: 'menu', room: null, panel: null, vehicle: '' });
  G.remotes.clear();
}

export async function buy(kind: 'tool' | 'vehicle' | 'upgrade', id: string | number) {
  const r = await request('buy', { kind, id });
  if (r.ok) {
    sfx.buy();
    st().toast(r.msg || 'Achat effectué', 'good');
    if (kind === 'vehicle') { st().set({ selectedVehicle: String(id) }); localStorage.setItem('lc_vehicle', String(id)); }
  } else {
    sfx.error();
    st().toast(r.msg || 'Achat impossible', 'warn');
  }
}

export async function sell() {
  const r = await request<Res & { money?: number }>('sell');
  if (r.ok) {
    sfx.coin();
    st().floater(`+${r.money} ¢`, '#ffd93d');
    st().toast(`Récolte vendue : +${r.money} crédits`, 'good');
  } else {
    sfx.error();
    st().toast(r.msg || 'Vente impossible', 'warn');
  }
}

export async function claim(kind: 'mission' | 'daily', id: string) {
  const r = await request('claim', { kind, id });
  if (r.ok) { sfx.coin(); st().toast(r.msg || 'Récompense obtenue', 'good'); }
  else { sfx.error(); st().toast(r.msg || 'Impossible', 'warn'); }
}

export function equip(id: number) {
  socket.emit('equip', id);
}

export function sendChat(text: string) {
  socket.emit('chat', text);
}

export function updateProfile(p: { name?: string; look?: unknown }) {
  socket.emit('profile:update', p);
}
