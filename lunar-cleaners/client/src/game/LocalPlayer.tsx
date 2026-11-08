// Joueur local : déplacements, caméra 3e personne, conduite, nettoyage prédit, envoi réseau.
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TOOLS, VEHICLES, RESOURCE_IDS } from '../../../shared/data';
import { STATION, WORLD_HALF, applyClean, clampToWorld, heightAt, resolveCollisions, zoneIndexAt } from '../../../shared/world';
import type { Profile } from '../../../shared/protocol';
import { useStore } from '../store';
import { socket } from '../net/socket';
import { setCleaningSound, sfx } from '../audio';
import { Astronaut, Drone, SEAT, VEHICLE_CAM, VehicleModel, type AnimRef } from './models';
import { G, serverNow } from './state';
import { droneAngleClient } from './util';

const GRAVITY = 6.2;

export function capacityClient(p: Profile, vehicle: string) {
  const tool = TOOLS.find((t) => t.id === p.equipped) ?? TOOLS[0];
  const bp = 1 + 0.25 * (p.upgrades.backpack || 0);
  const v = VEHICLES.find((x) => x.id === vehicle);
  return Math.round(tool.capacity * bp + (v ? v.capacityBonus * bp : 0));
}
export function loadClient(p: Profile) {
  return RESOURCE_IDS.reduce((s, r) => s + p.inventory[r], 0);
}

const tmpV = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const desiredCam = new THREE.Vector3();

export function LocalPlayer() {
  const profile = useStore((s) => s.profile);
  const vehicle = useStore((s) => s.vehicle);
  const root = useRef<THREE.Group>(null);
  const astro = useRef<THREE.Group>(null);
  const vehRef = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const droneRef = useRef<THREE.Group>(null);
  const anim = useRef<AnimRef>({ speed: 0, cleaning: false, air: false, sit: false });
  const spin = useRef(0);
  const lastSend = useRef(0);
  const lastPrompt = useRef('');
  const lastZone = useRef(-2);
  const emitAcc = useRef(0);
  const autoT = useRef(0);
  const { camera } = useThree();

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = useStore.getState();
    const p = st.profile;
    if (!p) return;
    const me = G.me;
    const keys = G.input.keys;
    const blocked = !!st.panel || st.chatOpen;
    const k = (c: string) => !blocked && keys.has(c);
    const tool = TOOLS.find((t) => t.id === p.equipped) ?? TOOLS[0];
    const thr = 1 + 0.08 * (p.upgrades.thrusters || 0);
    const power = 1 + 0.15 * (p.upgrades.motor || 0);
    const joy = G.input.joy;
    let inX = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + (blocked ? 0 : joy.x);
    let inY = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + (blocked ? 0 : joy.y);
    inX = THREE.MathUtils.clamp(inX, -1, 1);
    inY = THREE.MathUtils.clamp(inY, -1, 1);
    const mouseDown = !blocked && (G.input.mouseDown || G.input.touchClean);
    const yaw = G.cam.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let cleanR = tool.radius;
    let cleanPow = tool.power * power;
    me.clean = null;

    const veh = VEHICLES.find((v) => v.id === me.vehicle);
    if (veh) {
      // ---------- Conduite ----------
      let throttle = inY;
      let steer = -inX;
      if (st.autopilot && veh.autopilot) {
        autoT.current += dt;
        throttle = 0.75;
        steer = Math.sin(autoT.current * 0.35) * 0.55;
        const edge = Math.max(Math.abs(me.pos.x), Math.abs(me.pos.z));
        if (edge > WORLD_HALF - 22) {
          const want = Math.atan2(-me.pos.x, -me.pos.z);
          let diff = want - me.vehRot;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          steer = Math.sign(diff);
        }
      }
      me.vehSpeed += throttle * veh.accel * dt;
      if (throttle === 0) me.vehSpeed *= 1 - Math.min(1, dt * 1.5);
      me.vehSpeed = THREE.MathUtils.clamp(me.vehSpeed, -veh.speed * 0.4, veh.speed * (k('ShiftLeft') ? 1.15 : 1));
      const turnK = Math.min(1, Math.abs(me.vehSpeed) / 2.5) * Math.sign(me.vehSpeed || 1);
      me.vehRot += steer * veh.turn * dt * turnK;
      me.pos.x += Math.sin(me.vehRot) * me.vehSpeed * dt;
      me.pos.z += Math.cos(me.vehRot) * me.vehSpeed * dt;
      const before = { x: me.pos.x, z: me.pos.z };
      resolveCollisions(me.pos, veh.size);
      if (Math.hypot(before.x - me.pos.x, before.z - me.pos.z) > 0.01) me.vehSpeed *= 0.9;
      me.pos.x = clampToWorld(me.pos.x);
      me.pos.z = clampToWorld(me.pos.z);
      me.pos.y = heightAt(me.pos.x, me.pos.z);
      me.ry = me.vehRot;
      me.speed = Math.abs(me.vehSpeed);
      me.onGround = true;
      cleanR = veh.radius;
      cleanPow = veh.power * power;
      const active = st.brushes && (Math.abs(me.vehSpeed) > 0.4 || mouseDown);
      if (active) {
        const off = veh.size * 0.75;
        me.clean = [me.pos.x + Math.sin(me.vehRot) * off, me.pos.z + Math.cos(me.vehRot) * off];
      }
      spin.current = active ? 1 : Math.min(1, me.speed / 4);
      anim.current = { speed: 0, cleaning: false, air: false, sit: true };
      if (vehRef.current) {
        vehRef.current.position.copy(me.pos);
        // inclinaison selon le relief
        const s = veh.size;
        const hf = heightAt(me.pos.x + Math.sin(me.vehRot) * s, me.pos.z + Math.cos(me.vehRot) * s);
        const hb = heightAt(me.pos.x - Math.sin(me.vehRot) * s, me.pos.z - Math.cos(me.vehRot) * s);
        const hr = heightAt(me.pos.x + Math.cos(me.vehRot) * s, me.pos.z - Math.sin(me.vehRot) * s);
        const hl = heightAt(me.pos.x - Math.cos(me.vehRot) * s, me.pos.z + Math.sin(me.vehRot) * s);
        vehRef.current.rotation.set(0, 0, 0);
        vehRef.current.rotateY(me.vehRot);
        vehRef.current.rotateX(-Math.atan2(hf - hb, 2 * s));
        vehRef.current.rotateZ(Math.atan2(hr - hl, 2 * s) * -1);
        me.pos.y = (hf + hb + hr + hl) / 4 > me.pos.y ? (hf + hb + hr + hl) / 4 : me.pos.y;
      }
    } else {
      // ---------- À pied ----------
      const ride = tool.kind === 'ride';
      const run = k('ShiftLeft') || k('ShiftRight');
      const speed = 5.2 * tool.speed * thr * (run ? 1.6 : 1);
      // avant = (fx, fz) ; droite = (-fz, fx)
      let wx = fx * inY - fz * inX;
      let wz = fz * inY + fx * inX;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
      const accel = me.onGround ? 12 : 3;
      me.vel.x += (wx * speed - me.vel.x) * Math.min(1, accel * dt);
      me.vel.z += (wz * speed - me.vel.z) * Math.min(1, accel * dt);
      if ((k('Space') || G.input.jump) && me.onGround) {
        me.vel.y = 5.4 * thr;
        me.onGround = false;
        sfx.jump();
      }
      G.input.jump = false;
      me.vel.y -= GRAVITY * dt;
      me.pos.x += me.vel.x * dt;
      me.pos.y += me.vel.y * dt;
      me.pos.z += me.vel.z * dt;
      resolveCollisions(me.pos, ride ? 0.9 : 0.45);
      me.pos.x = clampToWorld(me.pos.x);
      me.pos.z = clampToWorld(me.pos.z);
      const ground = heightAt(me.pos.x, me.pos.z) + (ride ? 0.35 : 0);
      if (me.pos.y <= ground) {
        me.pos.y = ground;
        me.vel.y = 0;
        me.onGround = true;
      } else if (me.pos.y - ground > 0.05) {
        me.onGround = false;
      }
      me.speed = Math.hypot(me.vel.x, me.vel.z);
      // orientation
      let targetRy = me.ry;
      if (mouseDown) targetRy = Math.atan2(fx, fz);
      else if (me.speed > 0.5) targetRy = Math.atan2(me.vel.x, me.vel.z);
      let d = targetRy - me.ry;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.ry += d * Math.min(1, dt * (mouseDown ? 14 : 10));
      const nearGround = me.pos.y - ground < 0.8;
      if (mouseDown && nearGround) {
        me.clean = [me.pos.x + Math.sin(me.ry) * tool.reach, me.pos.z + Math.cos(me.ry) * tool.reach];
      }
      anim.current = { speed: me.speed, cleaning: !!me.clean, air: !me.onGround && !ride, sit: false };
      if (astro.current) {
        astro.current.position.copy(me.pos);
        astro.current.rotation.y = me.ry;
      }
    }

    // ---------- Nettoyage prédit côté client ----------
    const cap = capacityClient(p, me.vehicle);
    const load = loadClient(p);
    me.canCollect = load < cap - 0.01;
    if (me.clean) {
      const [cx, cz] = me.clean;
      if (me.canCollect) {
        applyClean(G.dust, G.zoneMap, cx, cz, cleanR, cleanPow, dt, () => { G.dustDirty = true; });
      }
      // particules
      emitAcc.current += dt * (25 + cleanR * 25);
      const n = Math.floor(emitAcc.current);
      emitAcc.current -= n;
      if (n > 0 && G.emit) {
        const ex = cx + (Math.random() - 0.5) * cleanR;
        const ez = cz + (Math.random() - 0.5) * cleanR;
        const isVac = !veh && tool.id >= 3 && tool.kind !== 'ride';
        if (isVac) {
          const nx = me.pos.x + Math.sin(me.ry) * 1.1;
          const nz = me.pos.z + Math.cos(me.ry) * 1.1;
          G.emit(ex, NaN, ez, n, '#d8c7a3', 'suck', nx, me.pos.y + 0.5, nz);
        } else {
          G.emit(ex, NaN, ez, n, '#d8c7a3', 'puff');
        }
      }
    }
    setCleaningSound(!!me.clean && me.canCollect, tool.id, !!veh);

    // anneau de visée
    if (ring.current) {
      const show = !!me.clean || (!veh && !blocked);
      ring.current.visible = show;
      if (show) {
        const cx = me.clean ? me.clean[0] : me.pos.x + Math.sin(me.ry) * tool.reach;
        const cz = me.clean ? me.clean[1] : me.pos.z + Math.cos(me.ry) * tool.reach;
        ring.current.position.set(cx, heightAt(cx, cz) + 0.08, cz);
        ring.current.scale.setScalar(cleanR);
        const m = ring.current.material as THREE.MeshBasicMaterial;
        m.color.set(!me.canCollect ? '#ff5050' : me.clean ? '#7ee8a2' : '#ffffff');
        m.opacity = me.clean ? 0.9 : 0.35;
      }
    }

    // drone autonome (outil 6)
    if (droneRef.current) {
      const show = tool.id === 6 && !veh;
      droneRef.current.visible = show;
      if (show) {
        const a = droneAngleClient(serverNow(), me.id);
        const dx = me.pos.x + Math.cos(a) * 3.4;
        const dz = me.pos.z + Math.sin(a) * 3.4;
        droneRef.current.position.set(dx, heightAt(dx, dz) + 1.3 + Math.sin(state.clock.elapsedTime * 3) * 0.1, dz);
        droneRef.current.rotation.y = -a;
        if (me.canCollect && Math.random() < 0.5) G.emit?.(dx, NaN, dz, 1, '#d8c7a3', 'suck', dx, heightAt(dx, dz) + 1.0, dz);
      }
    }

    // ---------- Interaction contextuelle ----------
    let prompt = '';
    if (!veh) {
      const dSell = Math.hypot(me.pos.x - STATION.sell.x, me.pos.z - STATION.sell.z);
      const dShop = Math.hypot(me.pos.x - STATION.shop.x, me.pos.z - STATION.shop.z);
      const dGar = Math.hypot(me.pos.x - STATION.garage.x, me.pos.z - STATION.garage.z);
      if (dSell < STATION.interactRadius + 1) prompt = 'sell';
      else if (dShop < STATION.interactRadius + 1) prompt = 'shop';
      else if (dGar < 5.5) prompt = 'garage';
    }
    if (prompt !== lastPrompt.current) {
      lastPrompt.current = prompt;
      st.set({ prompt });
    }
    const zi = zoneIndexAt(me.pos.x, me.pos.z);
    if (zi !== lastZone.current) {
      lastZone.current = zi;
      st.set({ zoneIdx: zi });
    }

    // ---------- Réseau (15 Hz) ----------
    const now = performance.now();
    if (now - lastSend.current > 66 && socket.connected) {
      lastSend.current = now;
      socket.volatile.emit('state', {
        p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)],
        ry: r2(me.ry),
        a: me.onGround ? (me.speed > 6 ? 2 : me.speed > 0.4 ? 1 : 0) : 3,
        v: me.vehicle,
        vr: r2(me.vehRot),
        c: me.clean ? [r2(me.clean[0]), r2(me.clean[1])] : null,
        sp: r2(me.speed),
      });
    }

    // ---------- Caméra ----------
    const camH = veh ? (SEAT[veh.id]?.[1] ?? 1) + 1.2 : 1.5;
    camTarget.set(me.pos.x, me.pos.y + camH, me.pos.z);
    const dist = veh ? Math.max(G.cam.dist, VEHICLE_CAM[veh.id] ?? 8) : G.cam.dist;
    const cp = Math.cos(G.cam.pitch);
    desiredCam.set(
      camTarget.x + Math.sin(yaw) * cp * dist,
      camTarget.y + Math.sin(G.cam.pitch) * dist,
      camTarget.z + Math.cos(yaw) * cp * dist,
    );
    const minY = heightAt(desiredCam.x, desiredCam.z) + 0.6;
    if (desiredCam.y < minY) desiredCam.y = minY;
    camera.position.lerp(desiredCam, 1 - Math.exp(-dt * 14));
    tmpV.copy(camTarget);
    camera.lookAt(tmpV);
  });

  if (!profile) return null;
  const veh = VEHICLES.find((v) => v.id === vehicle);
  const seat = veh ? SEAT[veh.id] : null;
  return (
    <>
      {veh && seat ? (
        <group ref={vehRef}>
          <VehicleModel id={veh.id} spin={spin} color={veh.color} />
          <group position={seat}>
            <Astronaut look={profile.look} tool={0} anim={anim} />
          </group>
        </group>
      ) : (
        <Astronaut ref={astro} look={profile.look} tool={profile.equipped} anim={anim} />
      )}
      <group ref={droneRef} visible={false}>
        <Drone />
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.86, 1, 40]} />
        <meshBasicMaterial color="#7ee8a2" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <group ref={root} />
    </>
  );
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
