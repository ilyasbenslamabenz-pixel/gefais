// Modèles 3D procéduraux style cartoon : astronaute, outils, véhicules, drone.
import { forwardRef, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerLook } from '../../../shared/protocol';

// ---------- Géométries partagées ----------
const geo = {
  torso: new THREE.CapsuleGeometry(0.3, 0.38, 6, 14),
  helmet: new THREE.SphereGeometry(0.33, 24, 18),
  visor: new THREE.SphereGeometry(0.335, 24, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.38),
  limb: new THREE.CapsuleGeometry(0.1, 0.36, 4, 10),
  leg: new THREE.CapsuleGeometry(0.12, 0.34, 4, 10),
  boot: new THREE.BoxGeometry(0.22, 0.14, 0.32),
  pack: new THREE.BoxGeometry(0.46, 0.55, 0.26),
  hand: new THREE.SphereGeometry(0.1, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  torus: new THREE.TorusGeometry(0.22, 0.03, 8, 24),
  cone: new THREE.ConeGeometry(1, 1, 12),
  disc: new THREE.CylinderGeometry(1, 1, 1, 28),
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { r?: number; m?: number; e?: string; ei?: number } = {}) {
  const key = `${color}|${opts.r ?? 0.6}|${opts.m ?? 0}|${opts.e ?? ''}|${opts.ei ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.6, metalness: opts.m ?? 0, emissive: opts.e ?? '#000000', emissiveIntensity: opts.ei ?? 0 });
    matCache.set(key, m);
  }
  return m;
}

type V3 = [number, number, number];
function Part({ g, m, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], shadow = true }: { g: THREE.BufferGeometry; m: THREE.Material; p?: V3; s?: V3 | number; r?: V3; shadow?: boolean }) {
  const sc: V3 = typeof s === 'number' ? [s, s, s] : s;
  return <mesh geometry={g} material={m} position={p} scale={sc} rotation={r} castShadow={shadow} receiveShadow={false} />;
}

// ---------- Outils ----------
export function ToolModel({ id, spin }: { id: number; spin?: MutableRefObject<number> }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * (spin?.current ?? 0) * 25;
  });
  const metal = mat('#c8d0dc', { r: 0.3, m: 0.7 });
  const dark = mat('#2b2f3a', { r: 0.5 });
  switch (id) {
    case 1:
      return (
        <group rotation={[Math.PI / 2.3, 0, 0]}>
          <Part g={geo.box} m={mat('#ff6b6b')} p={[0, 0.25, 0]} s={[0.05, 0.5, 0.05]} />
          <Part g={geo.box} m={mat('#ffffff')} p={[0, 0.5, 0.03]} s={[0.07, 0.12, 0.06]} />
          <Part g={geo.box} m={mat('#4ecdc4')} p={[0, 0.5, 0.07]} s={[0.06, 0.11, 0.04]} />
        </group>
      );
    case 2:
      return (
        <group rotation={[Math.PI / 2.6, 0, 0]}>
          <Part g={geo.cyl} m={mat('#ffb347')} p={[0, 0.55, 0]} s={[0.03, 1.2, 0.03]} />
          <Part g={geo.box} m={mat('#7a4a2a')} p={[0, 1.18, 0]} s={[0.55, 0.08, 0.12]} />
          <Part g={geo.box} m={mat('#ffe9a8')} p={[0, 1.3, 0]} s={[0.52, 0.2, 0.1]} />
        </group>
      );
    case 3:
      return (
        <group rotation={[Math.PI / 2.2, 0, 0]}>
          <Part g={geo.cyl} m={mat('#4ecdc4', { r: 0.35 })} p={[0, 0.15, 0]} s={[0.1, 0.35, 0.1]} />
          <Part g={geo.cyl} m={metal} p={[0, 0.6, 0]} s={[0.035, 0.7, 0.035]} />
          <Part g={geo.box} m={dark} p={[0, 0.97, 0.03]} s={[0.25, 0.06, 0.1]} />
        </group>
      );
    case 4:
      return (
        <group rotation={[Math.PI / 2.2, 0, 0]}>
          <Part g={geo.cyl} m={mat('#45b7ff', { r: 0.35 })} p={[0, 0.5, 0]} s={[0.05, 1.0, 0.05]} />
          <Part g={geo.box} m={dark} p={[0, 1.05, 0.04]} s={[0.4, 0.08, 0.14]} />
          <Part g={geo.box} m={mat('#ffd93d')} p={[0, 0.05, 0]} s={[0.1, 0.12, 0.1]} />
        </group>
      );
    default:
      return null;
  }
}

/** Outils 5 et 6 : monobrosse posée au sol devant le joueur. */
function FloorMachine({ id, spin }: { id: number; spin: MutableRefObject<number> }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * (1 + spin.current * 24);
  });
  const c = id === 6 ? '#ff6bd6' : '#a66bff';
  return (
    <group position={[0, 0, 0.9]}>
      <Part g={geo.disc} m={mat(c, { r: 0.35 })} p={[0, 0.2, 0]} s={[0.46, 0.14, 0.46]} />
      <Part g={geo.cyl} m={mat('#2b2f3a')} p={[0, 0.32, -0.1]} s={[0.16, 0.14, 0.16]} />
      <group ref={rotor} position={[0, 0.08, 0]}>
        <Part g={geo.disc} m={mat('#ffe9a8')} s={[0.44, 0.07, 0.44]} />
        <Part g={geo.box} m={mat('#2b2f3a')} p={[0, -0.03, 0]} s={[0.86, 0.03, 0.07]} />
      </group>
      <Part g={geo.cyl} m={mat('#c8d0dc', { r: 0.3, m: 0.7 })} p={[0, 0.62, -0.26]} r={[-0.55, 0, 0]} s={[0.035, 0.9, 0.035]} />
      <Part g={geo.box} m={mat('#2b2f3a')} p={[0, 1.0, -0.5]} s={[0.6, 0.06, 0.06]} />
    </group>
  );
}

// ---------- Astronaute ----------
export interface AnimRef {
  speed: number; // m/s
  cleaning: boolean;
  air: boolean;
  sit: boolean;
}

export const Astronaut = forwardRef<THREE.Group, { look: PlayerLook; tool: number; anim: MutableRefObject<AnimRef> }>(function Astronaut({ look, tool, anim }, ref) {
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const spin = useRef(0);
  const suit = mat(look.suit, { r: 0.55 });
  const accent = mat(look.accent, { r: 0.45 });
  const visor = useMemo(() => new THREE.MeshStandardMaterial({ color: look.visor, roughness: 0.08, metalness: 0.9, emissive: look.visor, emissiveIntensity: 0.25 }), [look.visor]);
  const dark = mat('#2b2f3a', { r: 0.6 });

  useFrame((_, dt) => {
    const a = anim.current;
    const sp = Math.min(a.speed, 12);
    phase.current += dt * (2 + sp * 1.4);
    const swing = a.air ? 0 : Math.min(1, sp / 5) * 0.75;
    const s = Math.sin(phase.current) * swing;
    spin.current = a.cleaning ? 1 : 0;
    if (legL.current && legR.current) {
      if (a.sit) {
        legL.current.rotation.x = legR.current.rotation.x = -1.4;
      } else if (a.air) {
        legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, -0.5, 0.1);
        legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, 0.3, 0.1);
      } else {
        legL.current.rotation.x = s;
        legR.current.rotation.x = -s;
      }
    }
    if (armL.current && armR.current) {
      armL.current.rotation.x = a.air ? -2.4 : -s * 0.8;
      armL.current.rotation.z = a.air ? 0.4 : 0.12;
      if (tool === 5 || tool === 6) {
        armR.current.rotation.x = -0.75;
        armR.current.rotation.z = 0.25;
        armL.current.rotation.x = -0.75;
        armL.current.rotation.z = -0.25;
      } else if (a.cleaning) {
        const scrub = Math.sin(phase.current * (tool <= 2 ? 3.5 : 1.6) + 1) * (tool <= 2 ? 0.35 : 0.1);
        armR.current.rotation.x = -1.0 + scrub;
        armR.current.rotation.z = -0.1;
      } else {
        armR.current.rotation.x = a.air ? -2.4 : s * 0.8 - 0.25;
        armR.current.rotation.z = a.air ? -0.4 : -0.12;
      }
    }
    if (body.current) body.current.position.y = a.air || a.sit ? 0 : Math.abs(Math.sin(phase.current)) * 0.05 * swing;
  });

  return (
    <group ref={ref}>
      <group ref={body}>
        {/* torse */}
        <Part g={geo.torso} m={suit} p={[0, 1.02, 0]} />
        <Part g={geo.box} m={accent} p={[0, 1.1, 0.27]} s={[0.26, 0.16, 0.06]} />
        <Part g={geo.box} m={mat('#7ee8a2', { e: '#7ee8a2', ei: 0.8 })} p={[0.06, 1.12, 0.305]} s={[0.05, 0.05, 0.02]} />
        <Part g={geo.box} m={mat('#ff6b6b', { e: '#ff6b6b', ei: 0.8 })} p={[-0.06, 1.12, 0.305]} s={[0.05, 0.05, 0.02]} />
        <Part g={geo.cyl} m={accent} p={[0, 0.8, 0]} s={[0.31, 0.08, 0.31]} />
        {/* sac dorsal */}
        <Part g={geo.pack} m={suit} p={[0, 1.08, -0.3]} />
        <Part g={geo.cyl} m={accent} p={[0.13, 1.3, -0.36]} s={[0.06, 0.18, 0.06]} />
        <Part g={geo.cyl} m={accent} p={[-0.13, 1.3, -0.36]} s={[0.06, 0.18, 0.06]} />
        {tool === 4 && <Part g={geo.cyl} m={mat('#45b7ff', { r: 0.3, m: 0.3 })} p={[0, 1.1, -0.5]} s={[0.2, 0.6, 0.2]} />}
        {/* casque */}
        <Part g={geo.helmet} m={suit} p={[0, 1.6, 0]} />
        <mesh geometry={geo.visor} material={visor} position={[0, 1.6, 0]} rotation={[0, Math.PI / 2, 0]} />
        <Part g={geo.torus} m={accent} p={[0, 1.36, 0]} r={[Math.PI / 2, 0, 0]} s={1.15} />
        {look.hat === 'antenna' && (
          <>
            <Part g={geo.cyl} m={dark} p={[0.18, 1.98, -0.05]} s={[0.012, 0.3, 0.012]} />
            <Part g={geo.sphere} m={mat(look.accent, { e: look.accent, ei: 1 })} p={[0.18, 2.14, -0.05]} s={0.05} />
          </>
        )}
        {look.hat === 'crest' && <Part g={geo.box} m={accent} p={[0, 1.92, -0.02]} s={[0.05, 0.16, 0.42]} />}
        {look.hat === 'halo' && <Part g={geo.torus} m={mat('#ffd93d', { e: '#ffd93d', ei: 1.2 })} p={[0, 2.08, 0]} r={[Math.PI / 2, 0, 0]} s={0.9} shadow={false} />}
        {look.hat === 'cap' && (
          <>
            <Part g={geo.cyl} m={accent} p={[0, 1.9, 0]} s={[0.26, 0.1, 0.26]} />
            <Part g={geo.box} m={accent} p={[0, 1.87, 0.25]} s={[0.3, 0.03, 0.2]} />
          </>
        )}
        {/* bras */}
        <group ref={armL} position={[-0.38, 1.22, 0]}>
          <Part g={geo.limb} m={suit} p={[0, -0.24, 0]} />
          <Part g={geo.hand} m={accent} p={[0, -0.5, 0]} />
        </group>
        <group ref={armR} position={[0.38, 1.22, 0]}>
          <Part g={geo.limb} m={suit} p={[0, -0.24, 0]} />
          <Part g={geo.hand} m={accent} p={[0, -0.5, 0]} />
          {tool < 5 && (
            <group position={[0, -0.52, 0.02]} rotation={[0, 0, 0]}>
              <ToolModel id={tool} spin={spin} />
            </group>
          )}
        </group>
      </group>
      {/* jambes */}
      <group ref={legL} position={[-0.15, 0.62, 0]}>
        <Part g={geo.leg} m={suit} p={[0, -0.26, 0]} />
        <Part g={geo.boot} m={dark} p={[0, -0.52, 0.04]} />
      </group>
      <group ref={legR} position={[0.15, 0.62, 0]}>
        <Part g={geo.leg} m={suit} p={[0, -0.26, 0]} />
        <Part g={geo.boot} m={dark} p={[0, -0.52, 0.04]} />
      </group>
      {tool === 7 && !anim.current.sit && <HoverScrubber spin={spin} />}
      {(tool === 5 || tool === 6) && <FloorMachine id={tool} spin={spin} />}
    </group>
  );
});

/** Outil 7 : plateforme flottante de récurage sous les pieds. */
function HoverScrubber({ spin }: { spin: MutableRefObject<number> }) {
  const r1 = useRef<THREE.Group>(null);
  const r2 = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const k = dt * (2 + spin.current * 20);
    if (r1.current) r1.current.rotation.y += k;
    if (r2.current) r2.current.rotation.y -= k;
  });
  return (
    <group position={[0, -0.12, 0]}>
      <Part g={geo.box} m={mat('#ffd93d', { r: 0.35 })} p={[0, 0, 0]} s={[1.3, 0.16, 1.6]} />
      <Part g={geo.box} m={mat('#2b2f3a')} p={[0, 0.1, -0.7]} s={[1.0, 0.08, 0.15]} />
      <Part g={geo.cyl} m={mat('#c8d0dc', { m: 0.7, r: 0.3 })} p={[0, 0.6, 0.62]} s={[0.04, 1.1, 0.04]} />
      <Part g={geo.box} m={mat('#2b2f3a')} p={[0, 1.15, 0.62]} s={[0.6, 0.06, 0.06]} />
      <Part g={geo.disc} m={mat('#6ff3ff', { e: '#6ff3ff', ei: 2 })} p={[0.45, -0.1, -0.55]} s={[0.15, 0.04, 0.15]} shadow={false} />
      <Part g={geo.disc} m={mat('#6ff3ff', { e: '#6ff3ff', ei: 2 })} p={[-0.45, -0.1, -0.55]} s={[0.15, 0.04, 0.15]} shadow={false} />
      <group ref={r1} position={[0.4, -0.12, 0.55]}>
        <Part g={geo.disc} m={mat('#ffe9a8')} s={[0.42, 0.06, 0.42]} />
        <Part g={geo.box} m={mat('#ff8c42')} s={[0.8, 0.07, 0.08]} />
      </group>
      <group ref={r2} position={[-0.4, -0.12, 0.55]}>
        <Part g={geo.disc} m={mat('#ffe9a8')} s={[0.42, 0.06, 0.42]} />
        <Part g={geo.box} m={mat('#ff8c42')} s={[0.8, 0.07, 0.08]} />
      </group>
    </group>
  );
}

// ---------- Drone autonome (outil 6) ----------
export function Drone() {
  const prop = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (prop.current) prop.current.rotation.y += dt * 30;
  });
  return (
    <group>
      <Part g={geo.sphere} m={mat('#ff6bd6', { r: 0.3 })} s={[0.35, 0.22, 0.35]} />
      <Part g={geo.sphere} m={mat('#6ff3ff', { e: '#6ff3ff', ei: 1.5 })} p={[0, 0, 0.28]} s={0.08} shadow={false} />
      <Part g={geo.cone} m={mat('#2b2f3a')} p={[0, -0.32, 0]} s={[0.2, 0.3, 0.2]} r={[Math.PI, 0, 0]} />
      <group ref={prop} position={[0, 0.25, 0]}>
        <Part g={geo.box} m={mat('#ffffff')} s={[1.0, 0.02, 0.08]} />
        <Part g={geo.box} m={mat('#ffffff')} s={[0.08, 0.02, 1.0]} />
      </group>
    </group>
  );
}

// ---------- Véhicules ----------
function Brush({ p, s, spin, color = '#ffe9a8' }: { p: V3; s: number; spin: MutableRefObject<number>; color?: string }) {
  const r = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (r.current) r.current.rotation.y += dt * (1 + spin.current * 18);
  });
  return (
    <group ref={r} position={p}>
      <Part g={geo.disc} m={mat(color)} s={[s, 0.12, s]} />
      <Part g={geo.box} m={mat('#ff8c42')} s={[s * 1.9, 0.13, 0.12]} />
      <Part g={geo.box} m={mat('#ff8c42')} s={[0.12, 0.13, s * 1.9]} />
    </group>
  );
}

function Wheel({ p, r, w, spin }: { p: V3; r: number; w: number; spin: MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.x += dt * spin.current * 3;
  });
  return (
    <group position={p}>
      <group ref={ref}>
        <Part g={geo.cyl} m={mat('#2b2f3a', { r: 0.9 })} s={[r, w, r]} r={[0, 0, Math.PI / 2]} />
        <Part g={geo.box} m={mat('#c8d0dc', { m: 0.6, r: 0.3 })} s={[w * 1.05, r * 1.2, r * 0.25]} />
      </group>
    </group>
  );
}

/** spin : vitesse/nettoyage normalisés pour animer roues et brosses. */
export function VehicleModel({ id, spin, color }: { id: string; spin: MutableRefObject<number>; color: string }) {
  const body = mat(color, { r: 0.4, m: 0.1 });
  const dark = mat('#2b2f3a', { r: 0.6 });
  const metal = mat('#c8d0dc', { r: 0.3, m: 0.7 });
  const glow = mat('#6ff3ff', { e: '#6ff3ff', ei: 2 });
  const lights = mat('#fffbe0', { e: '#fffbe0', ei: 2 });
  switch (id) {
    case 'robot':
      return (
        <group>
          <Part g={geo.disc} m={body} p={[0, 0.35, 0]} s={[1.0, 0.35, 1.0]} />
          <Part g={geo.disc} m={dark} p={[0, 0.56, 0]} s={[0.8, 0.08, 0.8]} />
          <Part g={geo.disc} m={glow} p={[0, 0.12, 0]} s={[0.95, 0.04, 0.95]} shadow={false} />
          <Part g={geo.box} m={lights} p={[0, 0.4, 0.98]} s={[0.5, 0.08, 0.05]} shadow={false} />
          <Brush p={[0.55, 0.12, 0.6]} s={0.3} spin={spin} />
          <Brush p={[-0.55, 0.12, 0.6]} s={0.3} spin={spin} />
        </group>
      );
    case 'tractor':
      return (
        <group>
          <Part g={geo.box} m={body} p={[0, 0.95, -0.2]} s={[1.3, 0.7, 2.0]} />
          <Part g={geo.box} m={body} p={[0, 1.15, 0.9]} s={[1.0, 0.5, 0.8]} />
          <Part g={geo.cyl} m={metal} p={[0.35, 1.7, 0.95]} s={[0.08, 0.6, 0.08]} />
          <Part g={geo.box} m={lights} p={[0.35, 1.2, 1.31]} s={[0.2, 0.12, 0.03]} shadow={false} />
          <Part g={geo.box} m={lights} p={[-0.35, 1.2, 1.31]} s={[0.2, 0.12, 0.03]} shadow={false} />
          <Wheel p={[0.85, 0.75, -0.7]} r={0.75} w={0.45} spin={spin} />
          <Wheel p={[-0.85, 0.75, -0.7]} r={0.75} w={0.45} spin={spin} />
          <Wheel p={[0.75, 0.45, 0.9]} r={0.45} w={0.35} spin={spin} />
          <Wheel p={[-0.75, 0.45, 0.9]} r={0.45} w={0.35} spin={spin} />
          <Part g={geo.box} m={dark} p={[0, 0.35, 1.65]} s={[2.2, 0.3, 0.3]} />
          <Brush p={[0.6, 0.15, 1.9]} s={0.45} spin={spin} />
          <Brush p={[-0.6, 0.15, 1.9]} s={0.45} spin={spin} />
        </group>
      );
    case 'industrial':
      return (
        <group>
          <Part g={geo.box} m={body} p={[0, 1.1, 0]} s={[2.4, 1.2, 3.6]} />
          <Part g={geo.box} m={mat('#a8dcff', { r: 0.1, m: 0.5 })} p={[0, 1.95, 0.9]} s={[1.6, 0.6, 1.2]} />
          <Part g={geo.box} m={dark} p={[0, 0.45, 0]} s={[2.5, 0.3, 3.8]} />
          <Part g={geo.cyl} m={mat('#ff6b35', { e: '#ff6b35', ei: 1 })} p={[0, 2.35, -0.6]} s={[0.15, 0.2, 0.15]} shadow={false} />
          <Part g={geo.box} m={lights} p={[0.8, 1.2, 1.81]} s={[0.4, 0.15, 0.03]} shadow={false} />
          <Part g={geo.box} m={lights} p={[-0.8, 1.2, 1.81]} s={[0.4, 0.15, 0.03]} shadow={false} />
          <Brush p={[1.0, 0.15, 2.2]} s={0.75} spin={spin} />
          <Brush p={[-1.0, 0.15, 2.2]} s={0.75} spin={spin} />
          <Brush p={[0, 0.15, 2.5]} s={0.75} spin={spin} />
          <Wheel p={[1.2, 0.45, -1.2]} r={0.45} w={0.3} spin={spin} />
          <Wheel p={[-1.2, 0.45, -1.2]} r={0.45} w={0.3} spin={spin} />
        </group>
      );
    case 'truck':
      return (
        <group>
          <Part g={geo.box} m={body} p={[0, 1.4, 1.9]} s={[2.3, 1.6, 1.4]} />
          <Part g={geo.box} m={mat('#a8dcff', { r: 0.1, m: 0.5 })} p={[0, 1.8, 2.61]} s={[1.9, 0.7, 0.05]} />
          <Part g={geo.box} m={mat('#e8eef5', { r: 0.5 })} p={[0, 1.65, -0.8]} s={[2.5, 2.1, 3.8]} />
          <Part g={geo.box} m={body} p={[0, 2.0, -0.8]} s={[2.52, 0.4, 3.82]} />
          <Part g={geo.box} m={dark} p={[0, 0.55, 0.3]} s={[2.2, 0.3, 5.6]} />
          <Part g={geo.box} m={lights} p={[0.8, 1.0, 2.61]} s={[0.35, 0.15, 0.03]} shadow={false} />
          <Part g={geo.box} m={lights} p={[-0.8, 1.0, 2.61]} s={[0.35, 0.15, 0.03]} shadow={false} />
          {[[1.25, 1.9], [-1.25, 1.9], [1.25, -0.3], [-1.25, -0.3], [1.25, -1.9], [-1.25, -1.9]].map(([x, z], i) => (
            <Wheel key={i} p={[x, 0.6, z]} r={0.6} w={0.4} spin={spin} />
          ))}
          <Brush p={[0.8, 0.15, 3.0]} s={0.5} spin={spin} />
          <Brush p={[-0.8, 0.15, 3.0]} s={0.5} spin={spin} />
        </group>
      );
    case 'giant':
      return <GiantRobot spin={spin} body={body} />;
    default:
      return null;
  }
}

function GiantRobot({ spin, body }: { spin: MutableRefObject<number>; body: THREE.Material }) {
  const legs = useRef<THREE.Group[]>([]);
  const ph = useRef(0);
  useFrame((_, dt) => {
    ph.current += dt * spin.current * 4;
    legs.current.forEach((l, i) => {
      if (l) l.rotation.x = Math.sin(ph.current + (i % 2) * Math.PI) * 0.35;
    });
  });
  const dark = mat('#2b2f3a', { r: 0.6 });
  const glow = mat('#6ff3ff', { e: '#6ff3ff', ei: 2.5 });
  return (
    <group>
      {[[-1.6, 1], [1.6, 1], [-1.6, -1.2], [1.6, -1.2]].map(([x, z], i) => (
        <group key={i} position={[x, 3.2, z]} ref={(el) => { if (el) legs.current[i] = el; }}>
          <Part g={geo.box} m={dark} p={[0, -1.4, 0]} s={[0.6, 2.8, 0.6]} />
          <Part g={geo.box} m={body} p={[0, -2.9, 0.2]} s={[1.0, 0.4, 1.4]} />
        </group>
      ))}
      <Part g={geo.box} m={body} p={[0, 4.1, 0]} s={[4.2, 1.8, 3.6]} />
      <Part g={geo.sphere} m={mat('#a8dcff', { r: 0.05, m: 0.6 })} p={[0, 5.2, 0.6]} s={[1.2, 0.9, 1.2]} />
      <Part g={geo.box} m={glow} p={[0, 4.2, 1.81]} s={[3.2, 0.25, 0.04]} shadow={false} />
      <Part g={geo.cyl} m={dark} p={[0, 2.2, 2.0]} s={[0.25, 2.5, 0.25]} />
      <Brush p={[0, 0.2, 2.8]} s={1.6} spin={spin} />
      <Brush p={[2.2, 0.2, 1.4]} s={1.0} spin={spin} />
      <Brush p={[-2.2, 0.2, 1.4]} s={1.0} spin={spin} />
      <Part g={geo.cyl} m={mat('#ff6b35', { e: '#ff6b35', ei: 1.5 })} p={[1.8, 5.2, -1.4]} s={[0.12, 0.6, 0.12]} shadow={false} />
    </group>
  );
}

/** Hauteur du siège du conducteur pour chaque véhicule. */
export const SEAT: Record<string, V3> = {
  robot: [0, 0.6, -0.1],
  tractor: [0, 1.3, -0.4],
  industrial: [0, 1.7, 0.6],
  truck: [0, 1.35, 1.7],
  giant: [0, 4.9, 0.6],
};
export const VEHICLE_CAM: Record<string, number> = { robot: 7, tractor: 9, industrial: 11, truck: 13, giant: 18 };

export { geo, Part };
