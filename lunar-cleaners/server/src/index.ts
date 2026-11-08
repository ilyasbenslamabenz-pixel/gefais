// Serveur Lunar Cleaners : Express (fichiers statiques + API) + Socket.IO (temps réel).
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { MAX_PLAYERS } from '../../shared/world';
import type { ClientState } from '../../shared/protocol';
import { leaderboard, loadProfile, saveProfile } from './db';
import {
  addXp, buy, claimDaily, claimMission, ensureDaily, migrateProfile, newProfile, sanitizeLook, sanitizeName, sellAll, toolOf,
} from './profiles';
import { Room, sendProfile, type Session } from './room';
import { STATION } from '../../shared/world';

const PORT = Number(process.env.PORT) || 3001;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true },
  maxHttpBufferSize: 1e5,
  perMessageDeflate: { threshold: 2048 },
});

// ---------- Parties ----------
const rooms = new Map<string, Room>();
const DEFAULT_ROOM = 'ALPHA';
rooms.set(DEFAULT_ROOM, new Room(io, DEFAULT_ROOM, 'Base Alpha (publique)', MAX_PLAYERS, true));

function newRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  do {
    id = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join('');
  } while (rooms.has(id));
  return id;
}

const privateRooms = new Set<string>();
function publicRooms() {
  return [...rooms.values()].filter((r) => !privateRooms.has(r.id)).map((r) => r.info());
}

// ---------- API HTTP ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: sessions.size });
});
app.get('/api/rooms', (_req, res) => res.json(publicRooms()));
app.get('/api/leaderboard', (_req, res) => res.json(leaderboard(20)));

const dist = path.resolve(process.cwd(), 'client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Serveur Lunar Cleaners actif. Lancez le client avec « npm run dev » ou construisez-le avec « npm run build ».'));
}

// ---------- Sessions ----------
const sessions = new Map<string, Session>(); // socket.id -> session
const byToken = new Map<string, Session>();

function persist(s: Session) {
  if (!s.saveDirty) return;
  s.saveDirty = false;
  try {
    saveProfile(s.token, s.profile);
  } catch (e) {
    console.error('Erreur de sauvegarde', e);
  }
}

setInterval(() => sessions.forEach(persist), 10000);

setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (!r.permanent && r.sessions.size === 0 && r.emptySince && now - r.emptySince > 120000) {
      r.destroy();
      rooms.delete(r.id);
      privateRooms.delete(r.id);
    }
  }
}, 15000);

type Ack = (res: unknown) => void;
const safeAck = (a: unknown): Ack => (typeof a === 'function' ? (a as Ack) : () => {});

io.on('connection', (socket) => {
  let s: Session | null = null;

  socket.on('hello', (msg: { token?: string; name?: string; look?: unknown }, ack) => {
    const reply = safeAck(ack);
    let token = typeof msg?.token === 'string' && /^[a-f0-9]{32}$/.test(msg.token) ? msg.token : '';
    let profile = token ? loadProfile(token) : null;
    if (!token || !profile) {
      token = token || crypto.randomBytes(16).toString('hex');
      profile = newProfile(msg?.name ?? '', msg?.look as never);
      saveProfile(token, profile);
    } else {
      profile = migrateProfile(profile);
    }
    // Une seule connexion par profil : on déconnecte l'ancienne
    const old = byToken.get(token);
    if (old && old.socket.id !== socket.id) {
      old.socket.emit('toast', { text: 'Connexion ouverte depuis un autre onglet.', kind: 'warn' });
      persist(old);
      old.room?.leave(old);
      old.socket.disconnect(true);
    }
    ensureDaily(profile);
    s = {
      socket, token, profile, room: null,
      st: { x: 0, y: 0, z: 0, ry: 0, a: 0, v: '', vr: 0, c: null, sp: 0 },
      lastClean: 0, lastFullMsg: 0, lastChat: 0, invDirty: false, lastInvSend: 0, saveDirty: true, zoneIdx: -2,
    };
    sessions.set(socket.id, s);
    byToken.set(token, s);
    profile.capacity = toolOf(profile).capacity;
    sendProfile(s);
    reply({ token });
  });

  const need = (fn: (s: Session, ...args: any[]) => void) => (...args: any[]) => {
    if (!s) return;
    try {
      fn(s, ...args);
    } catch (e) {
      console.error(e);
    }
  };

  socket.on('rooms:list', need((_s, ack) => safeAck(ack)(publicRooms())));

  socket.on('room:create', need((s, msg: { name?: string; max?: number; private?: boolean }, ack) => {
    if (rooms.size > 200) return safeAck(ack)({ ok: false, msg: 'Trop de parties en cours' });
    const id = newRoomId();
    const name = String(msg?.name ?? '').replace(/[<>]/g, '').trim().slice(0, 28) || `Équipe de ${s.profile.name}`;
    const max = Math.max(2, Math.min(MAX_PLAYERS, Number(msg?.max) || MAX_PLAYERS));
    rooms.set(id, new Room(io, id, name, max));
    if (msg?.private) privateRooms.add(id);
    safeAck(ack)({ ok: true, id });
  }));

  socket.on('room:join', need((s, msg: { id?: string }, ack) => {
    const id = String(msg?.id ?? DEFAULT_ROOM).toUpperCase().trim();
    const room = rooms.get(id);
    if (!room) return safeAck(ack)({ ok: false, msg: 'Partie introuvable' });
    if (room.sessions.size >= room.max) return safeAck(ack)({ ok: false, msg: 'Partie complète' });
    s.room?.leave(s);
    room.join(s, Date.now());
    safeAck(ack)({ ok: true });
  }));

  socket.on('room:leave', need((s) => {
    s.room?.leave(s);
    persist(s);
  }));

  socket.on('state', need((s, m: ClientState) => s.room?.handleState(s, m)));

  socket.on('sell', need((s, ack) => {
    const reply = safeAck(ack);
    if (!s.room) return reply({ ok: false, msg: 'Rejoignez une partie' });
    const d = Math.hypot(s.st.x - STATION.sell.x, s.st.z - STATION.sell.z);
    if (d > STATION.interactRadius + 3) return reply({ ok: false, msg: 'Rapprochez-vous du Collecteur' });
    const r = sellAll(s.profile);
    if (!r.ok) return reply({ ok: false, msg: 'Rien à vendre' });
    s.saveDirty = true;
    sendProfile(s);
    persist(s);
    reply({ ok: true, money: r.money, items: r.items });
  }));

  socket.on('buy', need((s, msg: { kind: string; id: string | number }, ack) => {
    const r = buy(s.profile, msg?.kind, msg?.id);
    if (r.ok) {
      s.saveDirty = true;
      sendProfile(s);
      persist(s);
      s.room?.broadcastRoster();
    }
    safeAck(ack)(r);
  }));

  socket.on('equip', need((s, id: number) => {
    if (!s.profile.tools.includes(Number(id))) return;
    s.profile.equipped = Number(id);
    s.saveDirty = true;
    sendProfile(s);
    s.room?.broadcastRoster();
  }));

  socket.on('claim', need((s, msg: { kind: 'mission' | 'daily'; id: string }, ack) => {
    const r = msg?.kind === 'daily' ? claimDaily(s.profile, msg.id) : claimMission(s.profile, msg?.id);
    if (r.ok) {
      const xp = 'xp' in r ? Number(r.xp) || 0 : 0;
      if (xp) {
        if (s.room) s.room.gainXp(s, xp);
        else addXp(s.profile, xp);
      }
      s.saveDirty = true;
      sendProfile(s);
      persist(s);
    }
    safeAck(ack)(r);
  }));

  socket.on('profile:update', need((s, msg: { name?: string; look?: unknown }) => {
    if (msg?.name !== undefined) s.profile.name = sanitizeName(msg.name);
    if (msg?.look !== undefined) s.profile.look = sanitizeLook(msg.look);
    s.saveDirty = true;
    sendProfile(s);
    persist(s);
    s.room?.broadcastRoster();
  }));

  socket.on('chat', need((s, text: string) => {
    if (!s.room) return;
    const now = Date.now();
    if (now - s.lastChat < 600) return;
    s.lastChat = now;
    const t = String(text ?? '').trim().slice(0, 200);
    if (!t) return;
    io.to(s.room.id).emit('chat', { from: s.profile.name, color: s.profile.look.accent, text: t, t: now });
  }));

  socket.on('leaderboard', need((_s, ack) => safeAck(ack)(leaderboard(20))));

  socket.on('disconnect', () => {
    if (!s) return;
    s.room?.leave(s);
    s.saveDirty = true;
    persist(s);
    sessions.delete(socket.id);
    if (byToken.get(s.token) === s) byToken.delete(s.token);
  });
});

function shutdown() {
  console.log('\nSauvegarde des profils...');
  sessions.forEach((s) => {
    s.saveDirty = true;
    persist(s);
  });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`🌕 Lunar Cleaners — serveur prêt sur http://localhost:${PORT}`);
});
