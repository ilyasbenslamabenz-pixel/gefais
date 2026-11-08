// Scène 3D du pays : caméra stratégique, étiquettes, sélection.
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { useStore, type Quality } from '../store';
import { buildGrid, type Grid } from './terrain';
import { Forests, Network, Terrain, Water } from './Landscape';
import { Cities } from './Cities';
import { Infrastructure, Smoke } from './Infrastructure';
import { AirSea, Atmosphere, Traffic } from './Life';
import type { CountryDef } from '../../../shared/sim/types';

const Q: Record<Quality, { dpr: [number, number]; step: number; trees: number; cars: number; shadows: boolean; precip: number; smoke: number }> = {
  low: { dpr: [0.75, 1], step: 2, trees: 2500, cars: 500, shadows: false, precip: 1500, smoke: 250 },
  medium: { dpr: [1, 1.5], step: 1, trees: 6000, cars: 1100, shadows: true, precip: 3000, smoke: 500 },
  high: { dpr: [1, 2], step: 1, trees: 11000, cars: 2000, shadows: true, precip: 5000, smoke: 900 },
};

export const camApi = { focus: (_x: number, _z: number, _dist?: number) => {} };

function Controls({ grid, country }: { grid: Grid; country: CountryDef }) {
  const { camera, gl } = useThree();
  const ctrl = useRef<MapControls | null>(null);
  const keys = useRef(new Set<string>());
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null>(null);
  useEffect(() => {
    const c = new MapControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = false;
    c.minDistance = 4;
    c.maxDistance = 420;
    c.maxPolarAngle = 1.32;
    c.zoomSpeed = 1.2;
    const cap = country.cities.find((x) => x.capital) ?? country.cities[0];
    c.target.set(cap.x, grid.y(cap.x, cap.z), cap.z);
    camera.position.set(cap.x + 30, 70, cap.z + 70);
    c.update();
    ctrl.current = c;
    camApi.focus = (x, z, dist = 25) => {
      const to = new THREE.Vector3(x, grid.y(x, z), z);
      const off = camera.position.clone().sub(c.target).setLength(dist);
      anim.current = { from: c.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().add(off), t: 0 };
    };
    const down = (e: KeyboardEvent) => { if (!(e.target as HTMLElement).closest('input,textarea,select')) keys.current.add(e.code); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { c.dispose(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [camera, gl, grid, country]);
  useFrame((_, dt) => {
    const c = ctrl.current;
    if (!c) return;
    const k = keys.current;
    const dist = camera.position.distanceTo(c.target);
    const speed = dist * 0.9 * Math.min(0.05, dt);
    const f = new THREE.Vector3().subVectors(c.target, camera.position).setY(0).normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) mv.add(f);
    if (k.has('KeyS') || k.has('ArrowDown')) mv.sub(f);
    if (k.has('KeyD') || k.has('ArrowRight')) mv.add(r);
    if (k.has('KeyA') || k.has('ArrowLeft')) mv.sub(r);
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(speed * 1.5);
      c.target.add(mv);
      camera.position.add(mv);
    }
    if (k.has('KeyQ') || k.has('KeyE')) {
      const a = (k.has('KeyQ') ? 1 : -1) * dt * 1.2;
      const off = camera.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      camera.position.copy(c.target).add(off);
    }
    if (anim.current) {
      const A = anim.current;
      A.t = Math.min(1, A.t + dt * 1.6);
      const e = A.t < 0.5 ? 2 * A.t * A.t : 1 - Math.pow(-2 * A.t + 2, 2) / 2;
      c.target.lerpVectors(A.from, A.to, e);
      camera.position.lerpVectors(A.camFrom, A.camTo, e);
      if (A.t >= 1) anim.current = null;
    }
    // garde la caméra au-dessus du relief
    const gy = grid.y(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < gy) camera.position.y = gy;
    c.target.x = THREE.MathUtils.clamp(c.target.x, -200, 200);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -160, 160);
    c.update();
  });
  return null;
}

/** Étiquettes des villes (DOM) positionnées par projection, filtrées selon le zoom. */
function Labels({ country, grid }: { country: CountryDef; grid: Grid }) {
  const { camera, size } = useThree();
  const show = useStore((s) => s.settings.labels);
  const els = useRef<HTMLDivElement[]>([]);
  useEffect(() => {
    const root = document.getElementById('labels');
    if (!root) return;
    root.innerHTML = '';
    els.current = country.cities.map((c) => {
      const d = document.createElement('div');
      d.className = `city-label ${c.kind}${c.capital ? ' capital' : ''}`;
      d.textContent = (c.capital ? '★ ' : '') + c.name;
      d.onclick = () => useStore.getState().set({ selection: { kind: 'city', id: c.id } });
      root.appendChild(d);
      return d;
    });
    return () => { root.innerHTML = ''; };
  }, [country]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const camH = camera.position.y;
    country.cities.forEach((c, i) => {
      const el = els.current[i];
      if (!el) return;
      v.set(c.x, grid.y(c.x, c.z) + (c.kind === 'metropole' ? 3 : 1.2), c.z).project(camera);
      const dist = camera.position.distanceTo(new THREE.Vector3(c.x, 0, c.z));
      const maxD = c.kind === 'metropole' ? 600 : c.kind === 'ville' ? 220 : 90;
      const vis = show && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist < maxD;
      el.style.display = vis ? 'block' : 'none';
      if (vis) el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
      void camH;
    });
  });
  return null;
}

function SelectionRing({ country, grid }: { country: CountryDef; grid: Grid }) {
  const sel = useStore((s) => s.selection);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    let x = 0, z = 0, r = 0;
    if (sel?.kind === 'city') { const c = country.cities[sel.id]; x = c.x; z = c.z; r = c.radius * 1.3; }
    if (sel?.kind === 'infra') { const i = country.infra.find((q) => q.id === sel.id); if (i) { x = i.x; z = i.z; r = i.type === 'aeroport' ? 3.5 : 1.8; } }
    ref.current.visible = !!sel && r > 0;
    ref.current.position.set(x, grid.y(x, z) + 0.4, z);
    ref.current.scale.setScalar(r * (1 + Math.sin(clock.elapsedTime * 3) * 0.04));
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.92, 1, 64]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

/** Zones cliquables invisibles pour sélectionner une ville. */
function CityPickers({ country, grid }: { country: CountryDef; grid: Grid }) {
  const set = useStore((s) => s.set);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 24), []);
  return (
    <group>
      {country.cities.map((c) => (
        <mesh key={c.id} geometry={geo} material={mat} position={[c.x, grid.y(c.x, c.z) + 0.5, c.z]} scale={[c.radius * 1.1, 1.5, c.radius * 1.1]}
          onClick={(e) => { e.stopPropagation(); set({ selection: { kind: 'city', id: c.id } }); }} />
      ))}
    </group>
  );
}

export function MapScene() {
  const country = useStore((s) => s.country);
  const quality = useStore((s) => s.settings.quality);
  const dayLength = useStore((s) => s.settings.dayLength);
  const q = Q[quality];
  const grid = useMemo(() => (country ? buildGrid(country) : null), [country]);
  if (!country || !grid) return null;
  return (
    <Canvas
      key={quality}
      shadows={q.shadows}
      dpr={q.dpr}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', logarithmicDepthBuffer: false }}
      camera={{ fov: 50, near: 0.5, far: 2500 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        scene.fog = new THREE.Fog('#8ec5ff', 250, 900);
      }}
      onPointerMissed={() => useStore.getState().set({ selection: null })}
    >
      <Atmosphere country={country} dayLength={dayLength} particles={q.precip} />
      <Terrain grid={grid} country={country} step={q.step} />
      <Water country={country} grid={grid} />
      <Network country={country} grid={grid} />
      <Forests country={country} grid={grid} count={q.trees} />
      <Cities country={country} grid={grid} />
      <CityPickers country={country} grid={grid} />
      <Infrastructure country={country} grid={grid} />
      <Smoke country={country} grid={grid} max={q.smoke} />
      <Traffic country={country} grid={grid} maxCars={q.cars} />
      <AirSea country={country} grid={grid} />
      <SelectionRing country={country} grid={grid} />
      <Labels country={country} grid={grid} />
      <Controls grid={grid} country={country} />
    </Canvas>
  );
}
