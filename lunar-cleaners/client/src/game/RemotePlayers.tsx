// Affichage des autres joueurs (interpolés à partir des snapshots du serveur).
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOOLS, VEHICLES } from '../../../shared/data';
import { heightAt } from '../../../shared/world';
import type { RosterEntry } from '../../../shared/protocol';
import { useStore } from '../store';
import { Astronaut, Drone, SEAT, VehicleModel, type AnimRef } from './models';
import { G, serverNow } from './state';
import { droneAngleClient, makeLabelTexture } from './util';

function RemotePlayer({ entry }: { entry: RosterEntry }) {
  const group = useRef<THREE.Group>(null);
  const astroWrap = useRef<THREE.Group>(null);
  const label = useRef<THREE.Sprite>(null);
  const droneRef = useRef<THREE.Group>(null);
  const anim = useRef<AnimRef>({ speed: 0, cleaning: false, air: false, sit: false });
  const spin = useRef(0);
  const vehRef = useRef<string>('');
  const [, force] = useForce();
  const tex = useMemo(() => makeLabelTexture(entry.name, entry.level, entry.look.accent), [entry.name, entry.level, entry.look.accent]);
  useEffect(() => () => tex.dispose(), [tex]);
  const emitAcc = useRef(0);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const r = G.remotes.get(entry.id);
    if (!group.current) return;
    if (!r) { group.current.visible = false; return; }
    group.current.visible = true;
    if (r.vehicle !== vehRef.current) { vehRef.current = r.vehicle; force(); }
    const k = 1 - Math.exp(-dt * 12);
    if (r.pos.distanceToSquared(r.target) > 400) r.pos.copy(r.target);
    r.pos.lerp(r.target, k);
    let d = r.tRy - r.ry;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.ry += d * k;
    let dv = r.tVr - r.vr;
    dv = Math.atan2(Math.sin(dv), Math.cos(dv));
    r.vr += dv * k;
    group.current.position.copy(r.pos);
    group.current.rotation.y = r.vehicle ? r.vr : r.ry;
    anim.current = { speed: r.vehicle ? 0 : r.speed, cleaning: r.cleaning, air: r.anim === 3, sit: !!r.vehicle };
    spin.current = r.cleaning ? 1 : Math.min(1, r.speed / 4);
    if (label.current) label.current.position.y = r.vehicle ? (SEAT[r.vehicle]?.[1] ?? 1) + 2.6 : 2.5;
    // particules de nettoyage des coéquipiers
    if (r.cleaning && G.emit) {
      const tool = TOOLS.find((t) => t.id === r.tool) ?? TOOLS[0];
      const v = VEHICLES.find((q) => q.id === r.vehicle);
      const rad = v ? v.radius : tool.radius;
      emitAcc.current += dt * (20 + rad * 20);
      const n = Math.floor(emitAcc.current);
      emitAcc.current -= n;
      if (n > 0) G.emit(r.cx + (Math.random() - 0.5) * rad, NaN, r.cz + (Math.random() - 0.5) * rad, n, '#d8c7a3', 'puff');
    }
    if (droneRef.current) {
      const show = r.tool === 6 && !r.vehicle;
      droneRef.current.visible = show;
      if (show) {
        const a = droneAngleClient(serverNow(), entry.id);
        const dx = r.pos.x + Math.cos(a) * 3.4;
        const dz = r.pos.z + Math.sin(a) * 3.4;
        droneRef.current.position.set(dx, heightAt(dx, dz) + 1.3 + Math.sin(clock.elapsedTime * 3) * 0.1, dz);
      }
    }
  });

  const r = G.remotes.get(entry.id);
  const vehicle = r?.vehicle ?? '';
  const vdef = VEHICLES.find((v) => v.id === vehicle);
  return (
    <>
      <group ref={group}>
        {vdef ? (
          <>
            <VehicleModel id={vdef.id} spin={spin} color={vdef.color} />
            <group position={SEAT[vdef.id]}>
              <Astronaut look={entry.look} tool={0} anim={anim} />
            </group>
          </>
        ) : (
          <group ref={astroWrap}>
            <Astronaut look={entry.look} tool={entry.tool} anim={anim} />
          </group>
        )}
        <sprite ref={label} position={[0, 2.5, 0]} scale={[2.4, 0.6, 1]}>
          <spriteMaterial map={tex} depthWrite={false} transparent />
        </sprite>
      </group>
      <group ref={droneRef} visible={false}>
        <Drone />
      </group>
    </>
  );
}

function useForce() {
  return useReducer((x: number) => x + 1, 0);
}

export function RemotePlayers() {
  const roster = useStore((s) => s.roster);
  const others = roster.filter((r) => r.id !== G.me.id);
  return (
    <>
      {others.map((e) => <RemotePlayer key={e.id} entry={e} />)}
    </>
  );
}
