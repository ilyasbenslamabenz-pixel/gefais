// État de jeu mutable (hors React) partagé entre les composants 3D et le réseau.
import * as THREE from 'three';
import { DUST_RES, STATION, buildInitialDust, buildZoneMap } from '../../../shared/world';
import type { DebrisState } from '../../../shared/protocol';

export interface Remote {
  id: string;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  ry: number;
  tRy: number;
  anim: number;
  vehicle: string;
  vr: number;
  tVr: number;
  tool: number;
  cleaning: boolean;
  cx: number;
  cz: number;
  speed: number;
  last: number;
}

export interface LocalDebris extends DebrisState {
  hitAt: number;
}

const dust = buildInitialDust(); // remplacé par l'état du serveur à la connexion
void DUST_RES;
const dustTex = new THREE.DataTexture(dust, DUST_RES, DUST_RES, THREE.RedFormat, THREE.UnsignedByteType);
dustTex.magFilter = THREE.LinearFilter;
dustTex.minFilter = THREE.LinearFilter;
dustTex.wrapS = dustTex.wrapT = THREE.ClampToEdgeWrapping;
dustTex.needsUpdate = true;

export const G = {
  dust,
  dustTex,
  dustDirty: true,
  zoneMap: buildZoneMap(),
  me: {
    id: '',
    pos: new THREE.Vector3(STATION.spawn.x, 1, STATION.spawn.z),
    vel: new THREE.Vector3(),
    ry: Math.PI,
    onGround: true,
    anim: 0,
    speed: 0,
    vehicle: '',
    vehRot: 0,
    vehSpeed: 0,
    cleaning: false,
    clean: null as [number, number] | null,
    canCollect: true,
  },
  cam: { yaw: 0, pitch: 0.35, dist: 7 },
  remotes: new Map<string, Remote>(),
  debris: new Map<number, LocalDebris>(),
  serverOffset: 0, // serverTime - Date.now()
  input: { keys: new Set<string>(), mouseDown: false, touchClean: false, jump: false, joy: { x: 0, y: 0 } },
  emit: null as null | ((x: number, y: number, z: number, n: number, color: string, mode?: 'puff' | 'suck' | 'burst' | 'spark', tx?: number, ty?: number, tz?: number) => void),
};

export function serverNow() {
  return Date.now() + G.serverOffset;
}
