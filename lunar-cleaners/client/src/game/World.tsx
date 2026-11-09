// Décors (station, ruines, zones) et débris destructibles.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PROPS, ZONES, heightAt, type Prop } from '../../../shared/world';
import { DEBRIS } from '../../../shared/data';
import { geo, mat, Part } from './models';
import { G } from './state';
import { useStore } from '../store';

type V3 = [number, number, number];

function Hub() {
  const white = mat('#eef2f7', { r: 0.45 });
  const accent = mat('#4ecdc4', { r: 0.4 });
  const glass = mat('#9fd8ff', { r: 0.05, m: 0.6, e: '#3a7bd5', ei: 0.4 });
  return (
    <group>
      <mesh geometry={geo.sphere} material={white} scale={[7, 5, 7]} castShadow receiveShadow>
      </mesh>
      <Part g={geo.cyl} m={accent} p={[0, 0.3, 0]} s={[7.3, 0.6, 7.3]} />
      <Part g={geo.torus} m={accent} p={[0, 2.6, 0]} r={[Math.PI / 2, 0, 0]} s={[28, 28, 10]} />
      <Part g={geo.box} m={white} p={[0, 1.6, 6.8]} s={[3, 3.2, 2.6]} />
      <Part g={geo.box} m={glass} p={[0, 1.5, 8.11]} s={[1.8, 2.4, 0.05]} />
      <Part g={geo.box} m={mat('#ffd93d', { e: '#ffd93d', ei: 1 })} p={[0, 3.3, 8.1]} s={[2.4, 0.25, 0.05]} shadow={false} />
      <Part g={geo.sphere} m={glass} p={[0, 4.6, 0]} s={[2.2, 1.2, 2.2]} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        return <Part key={i} g={geo.disc} m={glass} p={[Math.cos(a) * 6.1, 2.2, Math.sin(a) * 6.1]} r={[0, -a, Math.PI / 2]} s={[0.8, 0.3, 0.8]} shadow={false} />;
      })}
    </group>
  );
}

function Terminal({ kind }: { kind: 'sell' | 'shop' }) {
  const c = kind === 'sell' ? '#ffd93d' : '#4ecdc4';
  const holo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (holo.current) {
      holo.current.rotation.y = clock.elapsedTime * 1.5;
      holo.current.position.y = 3.3 + Math.sin(clock.elapsedTime * 2) * 0.15;
    }
  });
  return (
    <group>
      <Part g={geo.cyl} m={mat('#3a4150')} p={[0, 0.15, 0]} s={[1.3, 0.3, 1.3]} />
      <Part g={geo.box} m={mat('#eef2f7', { r: 0.4 })} p={[0, 1.2, 0]} s={[1.4, 2.0, 0.9]} />
      <Part g={geo.box} m={mat(c, { e: c, ei: 0.9 })} p={[0, 1.6, 0.46]} s={[1.1, 0.7, 0.03]} shadow={false} />
      {kind === 'sell' && <Part g={geo.cone} m={mat('#c8d0dc', { m: 0.7, r: 0.3 })} p={[0, 2.6, 0]} s={[0.8, 0.8, 0.8]} r={[Math.PI, 0, 0]} />}
      {kind === 'shop' && <Part g={geo.box} m={mat(c)} p={[0, 2.35, 0]} s={[1.6, 0.25, 1.1]} />}
      <mesh ref={holo} geometry={kind === 'sell' ? geo.cyl : geo.box} material={mat(c, { e: c, ei: 2 })} scale={kind === 'sell' ? [0.35, 0.08, 0.35] : [0.4, 0.4, 0.4]} position={[0, 3.3, 0]} />
    </group>
  );
}

function PropMesh({ p }: { p: Prop }) {
  const y = heightAt(p.x, p.z);
  const content = useMemo(() => {
    switch (p.type) {
      case 'hub': return <Hub />;
      case 'terminal_sell': return <Terminal kind="sell" />;
      case 'terminal_shop': return <Terminal kind="shop" />;
      case 'garage':
        return (
          <group>
            <Part g={geo.disc} m={mat('#3a4150', { r: 0.7 })} p={[0, 0.05, 0]} s={[5, 0.12, 5]} />
            <Part g={geo.torus} m={mat('#ffd93d', { e: '#ffd93d', ei: 1 })} p={[0, 0.13, 0]} r={[Math.PI / 2, 0, 0]} s={[20, 20, 2]} shadow={false} />
            <Part g={geo.box} m={mat('#ffd93d', { e: '#ffd93d', ei: 0.6 })} p={[0, 0.13, 0]} s={[0.4, 0.02, 4]} shadow={false} />
            <Part g={geo.box} m={mat('#ffd93d', { e: '#ffd93d', ei: 0.6 })} p={[0, 0.13, 0]} s={[4, 0.02, 0.4]} shadow={false} />
          </group>
        );
      case 'antenna':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#c8d0dc', { m: 0.6, r: 0.3 })} p={[0, 3, 0]} s={[0.15, 6, 0.15]} />
            <Part g={geo.sphere} m={mat('#eef2f7')} p={[0, 6.2, 0]} s={[1.2, 0.4, 1.2]} r={[0.5, 0, 0]} />
            <Part g={geo.sphere} m={mat('#ff6b6b', { e: '#ff6b6b', ei: 2 })} p={[0, 6.8, 0]} s={0.15} shadow={false} />
          </group>
        );
      case 'rocket':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#eef2f7', { r: 0.4 })} p={[0, 4, 0]} s={[1.3, 6, 1.3]} />
            <Part g={geo.cone} m={mat('#ff6b6b')} p={[0, 8.2, 0]} s={[1.3, 2.4, 1.3]} />
            <Part g={geo.cyl} m={mat('#3a4150')} p={[0, 0.6, 0]} s={[1.0, 1.2, 1.0]} />
            {[0, 1, 2, 3].map((i) => {
              const a = (i / 4) * Math.PI * 2;
              return <Part key={i} g={geo.box} m={mat('#ff6b6b')} p={[Math.cos(a) * 1.5, 1.6, Math.sin(a) * 1.5]} r={[0, -a, 0]} s={[1, 2, 0.12]} />;
            })}
            <Part g={geo.disc} m={mat('#9fd8ff', { e: '#3a7bd5', ei: 0.5 })} p={[0, 5.6, 1.25]} r={[Math.PI / 2, 0, 0]} s={[0.4, 0.1, 0.4]} />
          </group>
        );
      case 'solar':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#c8d0dc', { m: 0.6 })} p={[0, 0.7, 0]} s={[0.08, 1.4, 0.08]} />
            <Part g={geo.box} m={mat('#1d3a8a', { r: 0.15, m: 0.7, e: '#1d3a8a', ei: 0.2 })} p={[0, 1.5, 0]} r={[-0.6, 0, 0]} s={[3.2, 0.06, 2]} />
          </group>
        );
      case 'lamp':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#3a4150')} p={[0, 1.2, 0]} s={[0.08, 2.4, 0.08]} />
            <Part g={geo.sphere} m={mat('#fffbe0', { e: '#fff1b0', ei: 2.5 })} p={[0, 2.5, 0]} s={0.22} shadow={false} />
          </group>
        );
      case 'flag':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#c8d0dc', { m: 0.6 })} p={[0, 1.5, 0]} s={[0.04, 3, 0.04]} />
            <Part g={geo.box} m={mat('#4ecdc4')} p={[0.6, 2.6, 0]} s={[1.2, 0.7, 0.02]} />
            <Part g={geo.sphere} m={mat('#ffd93d')} p={[0.6, 2.6, 0.02]} s={[0.2, 0.2, 0.02]} />
          </group>
        );
      case 'module_ruin':
        return (
          <group rotation={[0, 0, 0.15]}>
            <Part g={geo.cyl} m={mat('#b9b2a5', { r: 0.8 })} p={[0, 1, 0]} r={[0, 0, Math.PI / 2]} s={[1.6, 5, 1.6]} />
            <Part g={geo.box} m={mat('#ff8c42', { r: 0.8 })} p={[0, 1, 0]} s={[5.1, 0.3, 3.3]} />
            <Part g={geo.box} m={mat('#3a4150')} p={[2.6, 1, 0]} s={[0.3, 1.6, 1.6]} />
          </group>
        );
      case 'satellite':
        return (
          <group rotation={[0.4, 0, 0.3]}>
            <Part g={geo.box} m={mat('#d9b44a', { m: 0.8, r: 0.3 })} p={[0, 1, 0]} s={[1.6, 1.6, 1.6]} />
            <Part g={geo.box} m={mat('#1d3a8a', { m: 0.6, r: 0.2 })} p={[2.4, 1, 0]} s={[3, 0.06, 1.3]} r={[0.3, 0, 0]} />
            <Part g={geo.box} m={mat('#1d3a8a', { m: 0.6, r: 0.2 })} p={[-2.2, 0.6, 0]} s={[2.4, 0.06, 1.3]} r={[-0.5, 0, 0.3]} />
            <Part g={geo.sphere} m={mat('#eef2f7')} p={[0, 2.2, 0]} s={[0.8, 0.3, 0.8]} />
          </group>
        );
      case 'container':
        return (
          <group>
            <Part g={geo.box} m={mat(p.color || '#ff6b35', { r: 0.6 })} p={[0, 1.3, 0]} s={[2.6, 2.6, 6]} />
            <Part g={geo.box} m={mat('#2b2f3a')} p={[0, 1.3, 3.01]} s={[2.4, 2.4, 0.04]} />
          </group>
        );
      case 'tank':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#dfe5ec', { m: 0.4, r: 0.35 })} p={[0, 2.5, 0]} s={[2.4, 5, 2.4]} />
            <Part g={geo.sphere} m={mat('#dfe5ec', { m: 0.4, r: 0.35 })} p={[0, 5, 0]} s={[2.4, 0.8, 2.4]} />
            <Part g={geo.cyl} m={mat('#ffbe0b')} p={[0, 3.5, 0]} s={[2.45, 0.4, 2.45]} />
          </group>
        );
      case 'crane':
        return (
          <group>
            <Part g={geo.box} m={mat('#ffbe0b')} p={[0, 6, 0]} s={[0.8, 12, 0.8]} />
            <Part g={geo.box} m={mat('#ffbe0b')} p={[3.5, 11.6, 0]} s={[9, 0.6, 0.6]} />
            <Part g={geo.cyl} m={mat('#2b2f3a')} p={[7, 9, 0]} s={[0.03, 5, 0.03]} />
            <Part g={geo.box} m={mat('#2b2f3a')} p={[7, 6.4, 0]} s={[1.2, 0.6, 1.2]} />
          </group>
        );
      case 'pipe':
        return (
          <group>
            <Part g={geo.cyl} m={mat('#9aa7b8', { m: 0.6, r: 0.4 })} p={[0, 0.8, 0]} r={[0, 0, Math.PI / 2]} s={[0.4, 10, 0.4]} />
            <Part g={geo.box} m={mat('#3a4150')} p={[-3, 0.4, 0]} s={[0.5, 0.8, 0.5]} />
            <Part g={geo.box} m={mat('#3a4150')} p={[3, 0.4, 0]} s={[0.5, 0.8, 0.5]} />
          </group>
        );
      case 'dome_broken':
        return (
          <group>
            <mesh geometry={new THREE.SphereGeometry(5, 24, 16, 0, Math.PI * 1.4, 0, Math.PI / 2)} material={mat('#8f8a9c', { r: 0.7, e: '#2a1a40', ei: 0.3 })} castShadow receiveShadow />
            <Part g={geo.cyl} m={mat('#3a3550')} p={[0, 0.3, 0]} s={[5.2, 0.6, 5.2]} />
            <Part g={geo.sphere} m={mat('#c46bff', { e: '#c46bff', ei: 2 })} p={[0, 1.2, 0]} s={0.8} shadow={false} />
          </group>
        );
      case 'tower':
        return (
          <group rotation={[0.08, 0, 0.1]}>
            <Part g={geo.cyl} m={mat('#6d6880', { r: 0.7 })} p={[0, 4, 0]} s={[0.9, 8, 0.9]} />
            <Part g={geo.box} m={mat('#c46bff', { e: '#c46bff', ei: 1.2 })} p={[0, 7, 0.92]} s={[0.4, 1.4, 0.04]} shadow={false} />
          </group>
        );
      case 'crystal_spire':
        return (
          <group>
            <Part g={geo.cone} m={mat(p.color || '#6ff3ff', { r: 0.1, m: 0.2, e: p.color || '#6ff3ff', ei: 0.7 })} p={[0, 2, 0]} s={[0.8, 4, 0.8]} />
            <Part g={geo.cone} m={mat(p.color || '#6ff3ff', { r: 0.1, m: 0.2, e: p.color || '#6ff3ff', ei: 0.7 })} p={[0.7, 1.1, 0.3]} r={[0, 0, -0.5]} s={[0.45, 2.2, 0.45]} />
            <Part g={geo.cone} m={mat(p.color || '#6ff3ff', { r: 0.1, m: 0.2, e: p.color || '#6ff3ff', ei: 0.7 })} p={[-0.5, 0.9, -0.4]} r={[0.4, 0, 0.5]} s={[0.4, 1.8, 0.4]} />
          </group>
        );
      default:
        return null;
    }
  }, [p]);
  return (
    <group position={[p.x, y, p.z]} rotation={[0, p.rot, 0]} scale={p.s}>
      {content}
    </group>
  );
}

function Rocks() {
  const rocks = useMemo(() => PROPS.filter((p) => p.type === 'rock'), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const g = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), []);
  useEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    rocks.forEach((r, i) => {
      o.position.set(r.x, heightAt(r.x, r.z) + r.s * 0.2, r.z);
      o.rotation.set(r.rot, r.rot * 2, r.rot * 0.5);
      o.scale.set(r.s * (0.9 + (i % 3) * 0.15), r.s * 0.65, r.s);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      c.setHSL(0.08, 0.07, 0.36 + (i % 5) * 0.04);
      ref.current!.setColorAt(i, c);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [rocks]);
  return <instancedMesh ref={ref} args={[g, m, rocks.length]} castShadow receiveShadow />;
}

/** Anneaux colorés délimitant les zones au sol. */
function ZoneRings() {
  return (
    <group>
      {ZONES.map((z) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          const x = z.x + Math.cos(a) * z.r;
          const zz = z.z + Math.sin(a) * z.r;
          pts.push(new THREE.Vector3(x, heightAt(x, zz) + 0.15, zz));
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        return (
          <line key={z.id}>
            <primitive object={g} attach="geometry" />
            <lineBasicMaterial color={z.color} transparent opacity={0.55} />
          </line>
        );
      })}
    </group>
  );
}

export function Props() {
  const list = useMemo(() => PROPS.filter((p) => p.type !== 'rock'), []);
  return (
    <group>
      {list.map((p, i) => <PropMesh key={i} p={p} />)}
      <Rocks />
      <ZoneRings />
    </group>
  );
}

// ---------- Débris ----------
function DebrisMesh({ id }: { id: number }) {
  const d = G.debris.get(id);
  const ref = useRef<THREE.Group>(null);
  const base = useMemo(() => (d ? heightAt(d.x, d.z) : 0), [d]);
  useFrame(({ clock }) => {
    const cur = G.debris.get(id);
    if (!cur || !ref.current) return;
    const since = performance.now() - cur.hitAt;
    const shake = since < 150 ? (Math.random() - 0.5) * 0.15 : 0;
    const k = 0.45 + 0.55 * (cur.hp / cur.maxHp);
    ref.current.scale.setScalar(cur.s * k);
    ref.current.position.set(cur.x + shake, base + (cur.type === 'pod' ? 0.3 + Math.sin(clock.elapsedTime * 2 + id) * 0.15 : 0), cur.z + shake);
  });
  if (!d) return null;
  let content: React.ReactNode;
  switch (d.type) {
    case 'rock':
      content = (
        <>
          <mesh geometry={geo.sphere} material={mat('#7d7468', { r: 0.95 })} scale={[0.9, 0.6, 0.8]} position={[0, 0.35, 0]} castShadow />
          <mesh geometry={geo.sphere} material={mat('#9aa7b8', { r: 0.4, m: 0.4 })} scale={[0.25, 0.2, 0.25]} position={[0.35, 0.65, 0.2]} />
        </>
      );
      break;
    case 'junk':
      content = (
        <group rotation={[0.3, 0, 0.5]}>
          <Part g={geo.box} m={mat('#c9ced6', { m: 0.8, r: 0.35 })} p={[0, 0.4, 0]} s={[1.1, 0.5, 0.7]} />
          <Part g={geo.cyl} m={mat('#ff6b6b', { m: 0.4 })} p={[0.3, 0.75, 0]} s={[0.2, 0.5, 0.2]} />
          <Part g={geo.box} m={mat('#1d3a8a', { m: 0.6, r: 0.2 })} p={[-0.6, 0.3, 0.2]} r={[0, 0.4, 0.6]} s={[0.8, 0.04, 0.5]} />
        </group>
      );
      break;
    case 'crystal':
      content = (
        <>
          <Part g={geo.cone} m={mat('#6ff3ff', { r: 0.1, e: '#3ac7ff', ei: 1 })} p={[0, 0.6, 0]} s={[0.35, 1.2, 0.35]} />
          <Part g={geo.cone} m={mat('#6ff3ff', { r: 0.1, e: '#3ac7ff', ei: 1 })} p={[0.3, 0.35, 0.1]} r={[0, 0, -0.6]} s={[0.2, 0.7, 0.2]} />
          <Part g={geo.cone} m={mat('#b3fbff', { r: 0.1, e: '#3ac7ff', ei: 1 })} p={[-0.25, 0.3, -0.15]} r={[0.5, 0, 0.6]} s={[0.2, 0.6, 0.2]} />
        </>
      );
      break;
    case 'pod':
      content = (
        <>
          <Part g={geo.sphere} m={mat('#5a2d82', { r: 0.3, m: 0.3 })} p={[0, 0.6, 0]} s={[0.7, 0.9, 0.7]} />
          <Part g={geo.torus} m={mat('#c46bff', { e: '#c46bff', ei: 2 })} p={[0, 0.6, 0]} r={[Math.PI / 2, 0, 0]} s={3.4} shadow={false} />
          <Part g={geo.sphere} m={mat('#e3b5ff', { e: '#c46bff', ei: 2 })} p={[0, 1.4, 0]} s={0.15} shadow={false} />
        </>
      );
      break;
  }
  return (
    <group ref={ref} position={[d.x, base, d.z]} rotation={[0, d.rot, 0]}>
      {content}
    </group>
  );
}

export function DebrisField() {
  const version = useStore((s) => s.debrisVersion);
  const ids = useMemo(() => [...G.debris.keys()], [version]);
  return (
    <group>
      {ids.map((id) => <DebrisMesh key={id} id={id} />)}
    </group>
  );
}

export const DEBRIS_INFO = DEBRIS;
export type { V3 };
