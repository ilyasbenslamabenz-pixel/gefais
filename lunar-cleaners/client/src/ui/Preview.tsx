// Aperçu 3D de l'astronaute (profil / menu principal).
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerLook } from '../../../shared/protocol';
import { Astronaut, type AnimRef } from '../game/models';

function Spinner({ look, tool }: { look: PlayerLook; tool: number }) {
  const g = useRef<THREE.Group>(null);
  const anim = useRef<AnimRef>({ speed: 0, cleaning: false, air: false, sit: false });
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.9 + 0.3;
    anim.current.cleaning = Math.sin(clock.elapsedTime * 0.5) > 0.3;
  });
  return (
    <group ref={g} position={[0, -1.05, 0]}>
      <Astronaut look={look} tool={tool} anim={anim} />
    </group>
  );
}

export function AstronautPreview({ look, tool }: { look: PlayerLook; tool: number }) {
  return (
    <Canvas camera={{ position: [0, 0.4, 3.4], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} />
      <directionalLight position={[-4, 1, -3]} intensity={0.8} color="#7fb2ff" />
      <Spinner look={look} tool={tool} />
    </Canvas>
  );
}
