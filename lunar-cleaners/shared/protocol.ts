// Types échangés entre client et serveur.
import type { DailyDef, ResourceId, Stats } from './data';

export interface PlayerLook {
  suit: string;
  visor: string;
  accent: string;
  hat: 'none' | 'antenna' | 'crest' | 'halo' | 'cap';
}

export const DEFAULT_LOOK: PlayerLook = { suit: '#f4f4f8', visor: '#ffb347', accent: '#4ecdc4', hat: 'antenna' };

export interface DailyState extends DailyDef {
  progress: number;
  claimed: boolean;
}

/** Profil persistant d'un joueur (envoyé au client propriétaire uniquement). */
export interface Profile {
  id: string; // identifiant public
  name: string;
  look: PlayerLook;
  money: number;
  xp: number;
  level: number;
  inventory: Record<ResourceId, number>;
  tools: number[];
  equipped: number;
  vehicles: string[];
  upgrades: Record<string, number>;
  stats: Stats;
  missionsClaimed: string[];
  daily: { day: string; list: DailyState[] };
  capacity: number; // calculée par le serveur
}

export interface RoomInfo {
  id: string;
  name: string;
  players: number;
  max: number;
  permanent: boolean;
}

export interface RosterEntry {
  id: string;
  name: string;
  level: number;
  look: PlayerLook;
  tool: number;
}

/**
 * Snapshot compact d'un joueur :
 * [id, x, y, z, rotY, anim, vehicleId|'' , vehRot, tool, cleaning(0/1), cx, cz, speed]
 */
export type PlayerSnap = [string, number, number, number, number, number, string, number, number, number, number, number, number];

export interface DebrisState {
  id: number;
  type: import('./data').DebrisType;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  rot: number;
  s: number;
}

export interface ZoneProgress {
  id: string;
  clean: number; // 0..1
  completions: number;
  storm: number; // timestamp (ms) de la prochaine tempête, 0 sinon
}

export interface ClientState {
  p: [number, number, number];
  ry: number;
  a: number; // anim : 0 idle, 1 marche, 2 course, 3 saut
  v: string; // véhicule ('' = à pied)
  vr: number;
  c: [number, number] | null; // point de nettoyage
  sp: number; // vitesse
}

export interface JoinPayload {
  room: RoomInfo;
  you: string;
  dust: ArrayBuffer;
  debris: DebrisState[];
  zones: ZoneProgress[];
  roster: RosterEntry[];
  serverTime: number;
}

export interface ChatMessage {
  from: string;
  color: string;
  text: string;
  sys?: boolean;
  t: number;
}

export interface GainEvent {
  items: Partial<Record<ResourceId, number>>;
  money?: number;
  xp?: number;
  at?: [number, number];
}
