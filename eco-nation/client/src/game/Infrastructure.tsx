// Infrastructures sélectionnables : hôpitaux, universités, aéroports, ports, gares, centrales, zones d'activité.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CountryDef, Infra } from '../../../shared/sim/types';
import { useStore } from '../store';
import { ENV, type Grid } from './terrain';

const cache = new Map<string, THREE.MeshStandardMaterial>();
function m(color: string, e?: string, ei = 0) {
  const k = color + (e ?? '') + ei;
  let v = cache.get(k);
  if (!v) { v = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: e ?? '#000', emissiveIntensity: ei }); cache.set(k, v); }
  return v;
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20).translate(0, 0.5, 0),
  tower: new THREE.LatheGeometry([0.9, 0.75, 0.6, 0.55, 0.58, 0.68].map((r, i) => new THREE.Vector2(r, i * 0.4)), 24),
  sphere: new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  blade: new THREE.BoxGeometry(0.06, 1.1, 0.02).translate(0, 0.55, 0),
};
type V3 = [number, number, number];
const P = ({ g, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0] }: { g: THREE.BufferGeometry; mat: THREE.Material; p?: V3; s?: V3; r?: V3 }) => (
  <mesh geometry={g} material={mat} position={p} scale={s} rotation={r} castShadow />
);

function WindFarm() {
  const rotors = useRef<THREE.Group[]>([]);
  useFrame((_, dt) => rotors.current.forEach((r) => r && (r.rotation.z += dt * 2.2)));
  const pos: [number, number][] = [];
  for (let i = 0; i < 9; i++) pos.push([((i % 3) - 1) * 1.2, (Math.floor(i / 3) - 1) * 1.2]);
  return (
    <group>
      {pos.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <P g={G.cyl} mat={m('#f2f4f7')} s={[0.05, 1.6, 0.05]} />
          <group position={[0, 1.6, 0.06]} ref={(el) => { if (el) rotors.current[i] = el; }}>
            {[0, 1, 2].map((k) => <mesh key={k} geometry={G.blade} material={m('#ffffff')} rotation={[0, 0, (k * Math.PI * 2) / 3]} />)}
          </group>
        </group>
      ))}
    </group>
  );
}

function Model({ i }: { i: Infra }) {
  switch (i.type) {
    case 'hopital':
      return (<group><P g={G.box} mat={m('#f4f6f8')} s={[0.9, 0.5, 0.6]} /><P g={G.box} mat={m('#e63946', '#e63946', 0.6)} p={[0, 0.5, 0]} s={[0.35, 0.04, 0.1]} /><P g={G.box} mat={m('#e63946', '#e63946', 0.6)} p={[0, 0.5, 0]} s={[0.1, 0.04, 0.35]} /></group>);
    case 'universite':
      return (<group><P g={G.box} mat={m('#d9c5a0')} s={[1, 0.35, 0.5]} /><P g={G.box} mat={m('#d9c5a0')} p={[0.6, 0, 0.6]} s={[0.4, 0.3, 0.8]} /><P g={G.cyl} mat={m('#2a9d8f')} p={[0, 0.35, 0]} s={[0.15, 0.25, 0.15]} /></group>);
    case 'ecole':
      return (<group><P g={G.box} mat={m('#f4a261')} s={[0.45, 0.2, 0.3]} /></group>);
    case 'gare':
      return (<group><P g={G.box} mat={m('#cfd8dc')} s={[0.9, 0.25, 0.35]} /><P g={G.box} mat={m('#264653')} p={[0, 0.25, 0]} s={[0.95, 0.05, 0.4]} /></group>);
    case 'aeroport':
      return (<group><P g={G.box} mat={m('#2f3437')} s={[4.2, 0.03, 0.35]} /><P g={G.box} mat={m('#2f3437')} p={[0, 0, 0.9]} s={[3.2, 0.03, 0.25]} /><P g={G.box} mat={m('#e9ecef')} p={[0, 0, -0.8]} s={[1.4, 0.3, 0.45]} /><P g={G.cyl} mat={m('#adb5bd')} p={[0.9, 0, -0.8]} s={[0.07, 0.7, 0.07]} /></group>);
    case 'port':
      return (<group><P g={G.box} mat={m('#8d99ae')} p={[-0.6, 0, 0]} s={[1.6, 0.06, 2.4]} />{[-0.6, 0.6].map((z) => <group key={z}><P g={G.box} mat={m('#e76f51')} p={[-1.1, 0, z]} s={[0.08, 0.9, 0.08]} /><P g={G.box} mat={m('#e76f51')} p={[-1.3, 0.85, z]} s={[0.7, 0.07, 0.07]} /></group>)}<P g={G.box} mat={m('#457b9d')} p={[-0.3, 0.06, 0.2]} s={[0.4, 0.2, 0.3]} /><P g={G.box} mat={m('#e9c46a')} p={[-0.3, 0.06, -0.4]} s={[0.4, 0.2, 0.3]} /></group>);
    case 'centrale_charbon':
      return (<group><P g={G.box} mat={m('#6c757d')} s={[1.2, 0.5, 0.7]} /><P g={G.cyl} mat={m('#495057')} p={[0.4, 0, 0.6]} s={[0.12, 1.8, 0.12]} /><P g={G.cyl} mat={m('#495057')} p={[-0.2, 0, 0.6]} s={[0.12, 1.8, 0.12]} /><P g={G.box} mat={m('#212529')} p={[0, 0, -0.8]} s={[0.9, 0.15, 0.5]} /></group>);
    case 'centrale_gaz':
      return (<group><P g={G.box} mat={m('#adb5bd')} s={[0.9, 0.4, 0.5]} /><P g={G.cyl} mat={m('#868e96')} p={[0.3, 0, 0.4]} s={[0.1, 1.1, 0.1]} /><P g={G.cyl} mat={m('#dee2e6')} p={[-0.5, 0, 0.5]} s={[0.25, 0.3, 0.25]} /></group>);
    case 'centrale_nucleaire':
      return (<group><mesh geometry={G.tower} material={m('#e9ecef')} position={[-0.9, 0, 0]} castShadow /><mesh geometry={G.tower} material={m('#e9ecef')} position={[0.9, 0, 0]} castShadow /><P g={G.sphere} mat={m('#ced4da')} p={[0, 0, 1.2]} s={[0.45, 0.6, 0.45]} /><P g={G.box} mat={m('#adb5bd')} p={[0, 0, -1.2]} s={[1.2, 0.35, 0.5]} /></group>);
    case 'barrage':
      return (<group><P g={G.box} mat={m('#b0b7bf')} s={[0.4, 0.9, 3.4]} /><P g={G.box} mat={m('#868e96')} p={[0.3, 0, 0]} s={[0.4, 0.3, 0.8]} /></group>);
    case 'parc_eolien':
      return <WindFarm />;
    case 'parc_solaire':
      return (<group>{Array.from({ length: 24 }, (_, k) => <P key={k} g={G.box} mat={m('#1d3557', '#1d3557', 0.15)} p={[((k % 6) - 2.5) * 0.45, 0.05, (Math.floor(k / 6) - 1.5) * 0.4]} s={[0.38, 0.03, 0.28]} r={[-0.4, 0, 0]} />)}</group>);
    case 'zone_industrielle':
      return (<group>{[[-0.7, -0.5], [0.6, -0.4], [-0.5, 0.7], [0.7, 0.6]].map(([x, z], k) => <P key={k} g={G.box} mat={m(k % 2 ? '#8d99ae' : '#adb5bd')} p={[x, 0, z]} s={[0.9, 0.25 + k * 0.05, 0.6]} />)}<P g={G.cyl} mat={m('#6c757d')} p={[0, 0, 0]} s={[0.08, 1.0, 0.08]} /></group>);
    case 'zone_commerciale':
      return (<group><P g={G.box} mat={m('#e9ecef')} s={[1.4, 0.2, 0.8]} /><P g={G.box} mat={m('#ffb703', '#ffb703', 0.5)} p={[0, 0.2, 0.41]} s={[0.8, 0.06, 0.02]} /><P g={G.box} mat={m('#495057')} p={[0, 0, 1.1]} s={[1.6, 0.01, 0.9]} /></group>);
    case 'commissariat':
      return (<group><P g={G.box} mat={m('#1d3557')} s={[0.4, 0.25, 0.3]} /><P g={G.box} mat={m('#a8dadc', '#a8dadc', 0.8)} p={[0, 0.25, 0]} s={[0.1, 0.06, 0.1]} /></group>);
    case 'stade':
      return (<group><P g={G.cyl} mat={m('#ced4da')} s={[0.6, 0.18, 0.45]} /><P g={G.cyl} mat={m('#52b788')} p={[0, 0.01, 0]} s={[0.45, 0.18, 0.32]} /></group>);
    default:
      return null;
  }
}

const SCALE: Partial<Record<Infra['type'], number>> = { aeroport: 1.3, port: 1.2, centrale_nucleaire: 1.1, parc_eolien: 1.2, parc_solaire: 1.3, barrage: 1.3, ecole: 0.8 };

export function Infrastructure({ country, grid }: { country: CountryDef; grid: Grid }) {
  const select = useStore((s) => s.set);
  const items = useMemo(() => country.infra.map((i) => ({ i, y: grid.y(i.x, i.z) })), [country, grid]);
  return (
    <group>
      {items.map(({ i, y }) => (
        <group
          key={i.id}
          position={[i.x, y, i.z]}
          rotation={[0, i.rot, 0]}
          scale={SCALE[i.type] ?? 1}
          onClick={(e) => { e.stopPropagation(); select({ selection: { kind: 'infra', id: i.id } }); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        >
          <Model i={i} />
        </group>
      ))}
    </group>
  );
}

/** Fumées et vapeurs (intensité liée aux émissions réelles calculées par le serveur). */
export function Smoke({ country, grid, max = 600 }: { country: CountryDef; grid: Grid; max?: number }) {
  const sources = useMemo(() => country.infra.filter((i) => ['centrale_charbon', 'centrale_gaz', 'centrale_nucleaire', 'zone_industrielle'].includes(i.type)).map((i) => {
    const local = i.type === 'centrale_charbon' ? [[0.4, 1.9, 0.6], [-0.2, 1.9, 0.6]] : i.type === 'centrale_gaz' ? [[0.3, 1.2, 0.4]] : i.type === 'centrale_nucleaire' ? [[-0.9, 2.1, 0], [0.9, 2.1, 0]] : [[0, 1.1, 0]];
    const cos = Math.cos(i.rot), sin = Math.sin(i.rot);
    return { type: i.type, pts: local.map(([x, y, z]) => new THREE.Vector3(i.x + x * cos + z * sin, grid.y(i.x, i.z) + y, i.z - x * sin + z * cos)) };
  }), [country, grid]);
  const emissions = useStore((s) => s.snap?.accounts.emissions ?? 1);
  const base = useRef(emissions);
  const sys = useMemo(() => {
    const pos = new Float32Array(max * 3);
    const life = new Float32Array(max);
    const steam = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#c9cdd2', size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.45, depthWrite: false });
    return { pos, life, steam, g, mat, cursor: 0, acc: 0 };
  }, [max]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const k = Math.max(0.15, emissions / Math.max(1, base.current));
    sys.acc += dt * 40 * k;
    while (sys.acc > 1) {
      sys.acc -= 1;
      const src = sources[Math.floor(Math.random() * sources.length)];
      if (!src) break;
      const p = src.pts[Math.floor(Math.random() * src.pts.length)];
      const i = sys.cursor;
      sys.cursor = (sys.cursor + 1) % max;
      sys.pos.set([p.x + (Math.random() - 0.5) * 0.2, p.y, p.z + (Math.random() - 0.5) * 0.2], i * 3);
      sys.life[i] = 4 + Math.random() * 3;
    }
    for (let i = 0; i < max; i++) {
      if (sys.life[i] <= 0) { sys.pos[i * 3 + 1] = -100; continue; }
      sys.life[i] -= dt;
      sys.pos[i * 3] += dt * 0.6;
      sys.pos[i * 3 + 1] += dt * 0.7;
    }
    (sys.g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    sys.mat.color.set(ENV.night.value > 0.5 ? '#6c7178' : '#d2d6db');
  });
  return <points geometry={sys.g} material={sys.mat} frustumCulled={false} />;
}
