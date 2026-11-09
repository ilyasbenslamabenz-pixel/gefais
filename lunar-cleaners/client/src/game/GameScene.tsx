// Scène 3D principale du jeu.
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, type Quality } from '../store';
import { Terrain } from './Terrain';
import { Sky, SUN_DIR, EARTH_DIR } from './Sky';
import { Props, DebrisField } from './World';
import { LocalPlayer } from './LocalPlayer';
import { RemotePlayers } from './RemotePlayers';
import { Particles } from './Particles';
import { G } from './state';

const Q: Record<Quality, { dpr: [number, number]; shadows: boolean; shadowSize: number; segments: number; particles: number; stars: number; aa: boolean }> = {
  low: { dpr: [0.75, 1], shadows: false, shadowSize: 512, segments: 180, particles: 1200, stars: 1200, aa: false },
  medium: { dpr: [1, 1.5], shadows: true, shadowSize: 1024, segments: 280, particles: 2500, stars: 2500, aa: true },
  high: { dpr: [1, 2], shadows: true, shadowSize: 2048, segments: 380, particles: 4000, stars: 4000, aa: true },
};

function SunLight({ size, shadows }: { size: number; shadows: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const p = G.me.pos;
    l.position.set(p.x + SUN_DIR.x * 60, p.y + SUN_DIR.y * 60, p.z + SUN_DIR.z * 60);
    l.target.position.set(p.x, p.y, p.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={2.3}
      color="#fff4e0"
      castShadow={shadows}
      shadow-mapSize={[size, size]}
      shadow-camera-left={-32}
      shadow-camera-right={32}
      shadow-camera-top={32}
      shadow-camera-bottom={-32}
      shadow-camera-near={1}
      shadow-camera-far={160}
      shadow-bias={-0.0008}
      shadow-normalBias={0.04}
    />
  );
}

export function GameScene() {
  const quality = useStore((s) => s.settings.quality);
  const q = Q[quality];
  const earthLight = EARTH_DIR.clone().multiplyScalar(100);
  return (
    <Canvas
      key={quality}
      shadows={q.shadows}
      dpr={q.dpr}
      gl={{ antialias: q.aa, powerPreference: 'high-performance' }}
      camera={{ fov: 60, near: 0.1, far: 2000, position: [0, 5, 14] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = new THREE.Color('#04050c');
        scene.fog = new THREE.Fog('#0b0d1c', 140, 330);
      }}
    >
      <hemisphereLight args={['#d6deff', '#7d7688', 0.75]} />
      <ambientLight intensity={0.18} color="#b0c0ff" />
      <directionalLight position={earthLight} intensity={0.45} color="#7fb2ff" />
      <SunLight size={q.shadowSize} shadows={q.shadows} />
      <Sky starCount={q.stars} />
      <Terrain segments={q.segments} />
      <Props />
      <DebrisField />
      <LocalPlayer />
      <RemotePlayers />
      <Particles max={q.particles} />
    </Canvas>
  );
}
