// Vie du pays : voitures, trains, avions, bateaux, cycle jour/nuit, saisons, météo.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/noise';
import { coastX } from '../../../shared/sim/country';
import type { CountryDef } from '../../../shared/sim/types';
import { useStore } from '../store';
import { ENV, densify, type Grid } from './terrain';

interface Path { pts: THREE.Vector3[]; cum: number[]; len: number }
function makePath(points: [number, number][], grid: Grid, lift: number): Path {
  const pts = densify(points, 0.7).map(([x, z]) => new THREE.Vector3(x, Math.max(0.04, grid.y(x, z)) + lift, z));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function at(p: Path, d: number, out: THREE.Vector3, dir: THREE.Vector3) {
  d = ((d % p.len) + p.len) % p.len;
  let lo = 0, hi = p.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] < d) lo = mid; else hi = mid; }
  const t = (d - p.cum[lo]) / Math.max(1e-6, p.cum[hi] - p.cum[lo]);
  out.lerpVectors(p.pts[lo], p.pts[hi], t);
  dir.subVectors(p.pts[hi], p.pts[lo]).normalize();
}

/** Voitures et trains : la densité du trafic suit l'activité économique (emploi). */
export function Traffic({ country, grid, maxCars }: { country: CountryDef; grid: Grid; maxCars: number }) {
  const carRef = useRef<THREE.InstancedMesh>(null);
  const trainRef = useRef<THREE.InstancedMesh>(null);
  const employed = useStore((s) => s.snap?.demography.employed ?? 1);
  const base = useRef(employed);
  const { roads, rails, cars, trains } = useMemo(() => {
    const rnd = mulberry32(country.seed + 77);
    const roads = country.links.filter((l) => l.kind !== 'rail').map((l) => ({ p: makePath(l.points, grid, 0.12), kind: l.kind }));
    const rails = country.links.filter((l) => l.kind === 'rail').map((l) => makePath(l.points, grid, 0.15));
    const totalLen = roads.reduce((s, r) => s + r.p.len * (r.kind === 'autoroute' ? 3 : 1), 0);
    const cars: { r: number; d: number; v: number; lane: number }[] = [];
    roads.forEach((r, ri) => {
      const n = Math.round((maxCars * r.p.len * (r.kind === 'autoroute' ? 3 : 1)) / totalLen);
      for (let k = 0; k < n; k++) {
        const fwd = rnd() < 0.5;
        cars.push({ r: ri, d: rnd() * r.p.len, v: (r.kind === 'autoroute' ? 2.2 : 1.3) * (0.8 + rnd() * 0.4) * (fwd ? 1 : -1), lane: fwd ? 1 : -1 });
      }
    });
    const trains = rails.map((p) => ({ p, d: rnd() * p.len, v: 3.5 * (rnd() < 0.5 ? 1 : -1) }));
    return { roads, rails, cars, trains };
  }, [country, grid, maxCars]);
  const carGeo = useMemo(() => new THREE.BoxGeometry(0.1, 0.07, 0.2).translate(0, 0.035, 0), []);
  const carMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#fff3c4', emissiveIntensity: 0 }), []);
  const trainGeo = useMemo(() => new THREE.BoxGeometry(0.14, 0.12, 0.55).translate(0, 0.06, 0), []);
  const trainMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.4, emissive: '#ffd6a5', emissiveIntensity: 0 }), []);
  useEffect(() => {
    const rnd = mulberry32(3);
    const colors = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#ffb703', '#adb5bd', '#2a9d8f', '#222'];
    const c = new THREE.Color();
    cars.forEach((_, i) => carRef.current!.setColorAt(i, c.set(colors[Math.floor(rnd() * colors.length)])));
    if (carRef.current!.instanceColor) carRef.current!.instanceColor.needsUpdate = true;
  }, [cars]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const activity = Math.max(0.3, Math.min(1.4, employed / Math.max(1, base.current)));
    const visible = Math.floor(cars.length * Math.min(1, 0.65 * activity) * (1 - ENV.night.value * 0.55));
    const mesh = carRef.current!;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const r = roads[car.r];
      car.d += car.v * dt;
      at(r.p, car.d, v, dir);
      const side = r.kind === 'autoroute' ? 0.1 : 0.06;
      o.position.set(v.x - dir.z * side * car.lane, v.y, v.z + dir.x * side * car.lane);
      o.lookAt(o.position.x + dir.x * car.lane, o.position.y + dir.y * car.lane, o.position.z + dir.z * car.lane);
      o.scale.setScalar(i < visible ? 1 : 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    carMat.emissiveIntensity = ENV.night.value * 1.2;
    const tm = trainRef.current!;
    let k = 0;
    for (const t of trains) {
      t.d += t.v * dt;
      for (let w = 0; w < 4; w++) {
        at(t.p, t.d - Math.sign(t.v) * w * 0.6, v, dir);
        o.position.copy(v);
        o.lookAt(v.x + dir.x, v.y + dir.y, v.z + dir.z);
        o.scale.setScalar(1);
        o.updateMatrix();
        tm.setMatrixAt(k++, o.matrix);
      }
    }
    tm.instanceMatrix.needsUpdate = true;
    trainMat.emissiveIntensity = ENV.night.value * 0.8;
  });
  return (
    <group>
      <instancedMesh ref={carRef} args={[carGeo, carMat, Math.max(1, cars.length)]} frustumCulled={false} />
      <instancedMesh ref={trainRef} args={[trainGeo, trainMat, Math.max(1, trains.length * 4)]} frustumCulled={false} />
      {rails.length === 0 && null}
    </group>
  );
}

/** Avions au départ des aéroports et navires au large des ports. */
export function AirSea({ country, grid }: { country: CountryDef; grid: Grid }) {
  const airports = useMemo(() => country.infra.filter((i) => i.type === 'aeroport'), [country]);
  const ports = useMemo(() => country.infra.filter((i) => i.type === 'port'), [country]);
  const planes = useRef<THREE.Group[]>([]);
  const ships = useRef<THREE.Group[]>([]);
  const planeGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(0.12, 0.1, 0.9);
    return g;
  }, []);
  const wingGeo = useMemo(() => new THREE.BoxGeometry(1.0, 0.03, 0.2), []);
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f8f9fa', emissive: '#ffffff', emissiveIntensity: 0 }), []);
  const hull = useMemo(() => new THREE.MeshStandardMaterial({ color: '#264653' }), []);
  const deck = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e76f51' }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    airports.forEach((a, i) => {
      const g = planes.current[i];
      if (!g) return;
      const cycle = (t * 0.05 + i * 0.37) % 1; // décollage puis vol
      const dirx = Math.cos(a.rot), dirz = -Math.sin(a.rot);
      const dist = cycle < 0.15 ? cycle / 0.15 * 2.5 : 2.5 + (cycle - 0.15) * 160;
      const alt = cycle < 0.08 ? 0.05 : Math.min(14, (cycle - 0.08) * 60);
      g.position.set(a.x + dirx * (dist - 2), grid.y(a.x, a.z) + 0.1 + alt, a.z + dirz * (dist - 2));
      g.rotation.set(0, a.rot + Math.PI / 2, 0);
      g.rotateX(cycle > 0.08 && alt < 14 ? -0.15 : 0);
      g.visible = cycle < 0.95;
    });
    white.emissiveIntensity = ENV.night.value;
    ports.forEach((p, i) => {
      for (let k = 0; k < 2; k++) {
        const g = ships.current[i * 2 + k];
        if (!g) continue;
        const ph = (t * 0.01 + k * 0.5 + i * 0.21) % 1;
        const x = p.x - 2 - Math.sin(ph * Math.PI) * 30;
        const z = p.z + (k - 0.5) * 4 + Math.sin(ph * 6) * 0.5;
        g.position.set(Math.min(x, coastX(country.seed, z) - 2), 0.05, z);
        g.rotation.y = Math.PI / 2 + (ph > 0.5 ? Math.PI : 0);
      }
    });
  });
  return (
    <group>
      {airports.map((a, i) => (
        <group key={a.id} ref={(el) => { if (el) planes.current[i] = el; }}>
          <mesh geometry={planeGeo} material={white} />
          <mesh geometry={wingGeo} material={white} position={[0, 0, 0.05]} />
        </group>
      ))}
      {ports.flatMap((p, i) => [0, 1].map((k) => (
        <group key={`${p.id}-${k}`} ref={(el) => { if (el) ships.current[i * 2 + k] = el; }}>
          <mesh material={hull}><boxGeometry args={[0.5, 0.18, 2.2]} /></mesh>
          <mesh material={deck} position={[0, 0.2, -0.6]}><boxGeometry args={[0.4, 0.25, 0.5]} /></mesh>
        </group>
      )))}
    </group>
  );
}

// ---------- Météo ----------
export type Weather = 'clair' | 'nuageux' | 'pluie' | 'orage' | 'neige' | 'brouillard';
export function weatherFor(seed: number, month: number): Weather {
  const r = mulberry32(seed * 13 + month * 101)();
  const m = month % 12;
  const winter = m === 11 || m <= 1;
  const summer = m >= 5 && m <= 7;
  if (winter) return r < 0.3 ? 'neige' : r < 0.55 ? 'nuageux' : r < 0.7 ? 'brouillard' : r < 0.8 ? 'pluie' : 'clair';
  if (summer) return r < 0.6 ? 'clair' : r < 0.78 ? 'nuageux' : r < 0.9 ? 'orage' : 'pluie';
  return r < 0.35 ? 'clair' : r < 0.6 ? 'nuageux' : r < 0.85 ? 'pluie' : r < 0.93 ? 'brouillard' : 'orage';
}
export const WEATHER_LABEL: Record<Weather, string> = { clair: '☀️ Ensoleillé', nuageux: '⛅ Nuageux', pluie: '🌧️ Pluie', orage: '⛈️ Orage', neige: '🌨️ Neige', brouillard: '🌫️ Brouillard' };

/** Cycle jour/nuit, saisons et précipitations autour de la caméra. */
export function Atmosphere({ country, dayLength, particles }: { country: CountryDef; dayLength: number; particles: number }) {
  const month = useStore((s) => s.snap?.month ?? 0);
  const weather = weatherFor(country.seed, month);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene, camera } = useThree();
  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      p.set([Math.cos(a) * Math.cos(e) * 900, Math.sin(e) * 900, Math.sin(a) * Math.cos(e) * 900], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  const starMat = useMemo(() => new THREE.PointsMaterial({ color: '#ffffff', size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
  const precip = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(particles * 3);
    for (let i = 0; i < particles; i++) p.set([(Math.random() - 0.5) * 120, Math.random() * 50, (Math.random() - 0.5) * 120], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, [particles]);
  const precipMat = useMemo(() => new THREE.PointsMaterial({ color: '#cfe3ff', size: 0.25, transparent: true, opacity: 0.6, depthWrite: false }), []);
  const precipRef = useRef<THREE.Points>(null);
  const bg = useMemo(() => new THREE.Color(), []);
  const flash = useRef(0);

  useEffect(() => {
    const m = month % 12;
    ENV.winter.value = (1 + Math.cos((m / 12) * Math.PI * 2)) / 2;
    ENV.autumn.value = Math.exp(-((m - 9.5) ** 2) / 2.5);
    ENV.snow.value = weather === 'neige' ? 1 : 0;
    ENV.wet.value = weather === 'pluie' || weather === 'orage' ? 1 : 0;
  }, [month, weather]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const t = (clock.elapsedTime / dayLength + 0.3) % 1; // 0 = minuit, 0.5 = midi
    const ang = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const night = THREE.MathUtils.clamp(0.5 - elev * 2.2, 0, 1);
    ENV.night.value = night;
    ENV.time.value = t;
    const cloudy = weather === 'nuageux' ? 0.35 : weather === 'pluie' || weather === 'brouillard' ? 0.55 : weather === 'orage' ? 0.75 : weather === 'neige' ? 0.5 : 0;
    if (sun.current) {
      sun.current.position.set(Math.cos(ang) * 300, Math.max(20, elev * 300), 120);
      sun.current.intensity = Math.max(0, elev) * 3.0 * (1 - cloudy * 0.6) + 0.05;
      const dusk = 1 - Math.min(1, Math.abs(elev) * 4);
      sun.current.color.setRGB(1, 0.92 - dusk * 0.3, 0.82 - dusk * 0.45);
    }
    if (hemi.current) hemi.current.intensity = 0.25 + (1 - night) * 0.55;
    const day = new THREE.Color(cloudy > 0.4 ? '#9aa8b8' : '#8ec5ff');
    const duskC = new THREE.Color('#f4a261');
    const nightC = new THREE.Color('#070b16');
    const duskK = THREE.MathUtils.clamp(1 - Math.abs(elev) * 5, 0, 1) * (1 - cloudy);
    bg.copy(day).lerp(duskC, duskK * 0.6).lerp(nightC, night);
    if (weather === 'orage' && Math.random() < dt * 0.4) flash.current = 1;
    flash.current = Math.max(0, flash.current - dt * 4);
    bg.lerp(new THREE.Color('#ffffff'), flash.current * 0.5);
    scene.background = bg;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(bg);
      scene.fog.near = weather === 'brouillard' ? 20 : 250;
      scene.fog.far = weather === 'brouillard' ? 140 : 900 - cloudy * 300;
    }
    starMat.opacity = night * (1 - cloudy);
    // précipitations
    const pr = precipRef.current;
    if (pr) {
      const active = weather === 'pluie' || weather === 'orage' || weather === 'neige';
      pr.visible = active;
      if (active) {
        const snow = weather === 'neige';
        precipMat.color.set(snow ? '#ffffff' : '#bcd4f2');
        precipMat.size = snow ? 0.4 : 0.22;
        const target = (camera as THREE.PerspectiveCamera).position;
        pr.position.set(target.x, Math.max(0, target.y - 30), target.z);
        const a = precip.attributes.position as THREE.BufferAttribute;
        const arr = a.array as Float32Array;
        const vy = snow ? 4 : 30;
        for (let i = 0; i < particles; i++) {
          arr[i * 3 + 1] -= vy * dt;
          if (snow) arr[i * 3] += Math.sin(clock.elapsedTime + i) * dt * 0.8;
          if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 50;
        }
        a.needsUpdate = true;
      }
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dbe9ff', '#5a5040', 0.7]} />
      <directionalLight ref={sun} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-200} shadow-camera-right={200} shadow-camera-top={160} shadow-camera-bottom={-160} shadow-camera-far={800} shadow-bias={-0.0005} />
      <points geometry={stars} material={starMat} frustumCulled={false} />
      <points ref={precipRef} geometry={precip} material={precipMat} frustumCulled={false} />
    </>
  );
}
