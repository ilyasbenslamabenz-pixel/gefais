// Ciel spatial : étoiles, Terre procédurale avec atmosphère, soleil.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm } from '../../../shared/noise';

export const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.35).normalize();
export const EARTH_DIR = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();

function makeEarthTexture() {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      const px = Math.sin(lat) * Math.cos(lon);
      const py = Math.cos(lat);
      const pz = Math.sin(lat) * Math.sin(lon);
      const n = fbm(px * 1.6 + 5, pz * 1.6 + py * 1.3, 5);
      const cl = fbm(px * 3 + 20, pz * 3 + py * 2.5, 4);
      const k = (y * w + x) * 4;
      let r: number, g: number, b: number;
      if (n > 0.08) {
        const t = Math.min(1, (n - 0.08) * 3);
        r = 70 + t * 90; g = 150 - t * 30; b = 70 - t * 20;
        if (Math.abs(py) > 0.82) { r = g = b = 240; }
      } else {
        const t = Math.max(0, -n);
        r = 25 - t * 10; g = 95 - t * 30; b = 200 - t * 40;
      }
      if (Math.abs(py) > 0.9) { r = g = b = 245; }
      if (cl > 0.12) {
        const a = Math.min(1, (cl - 0.12) * 3) * 0.85;
        r = r * (1 - a) + 255 * a; g = g * (1 - a) + 255 * a; b = b * (1 - a) + 255 * a;
      }
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGlowTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function Sky({ starCount = 2500 }: { starCount?: number }) {
  const group = useRef<THREE.Group>(null);
  const earth = useRef<THREE.Mesh>(null);
  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = new THREE.Vector3(r * Math.cos(a), Math.abs(u) * 0.95 + 0.05 * Math.sign(u), r * Math.sin(a)).normalize().multiplyScalar(900);
      p.set([v.x, v.y, v.z], i * 3);
      const tint = Math.random();
      const c = tint < 0.15 ? [0.7, 0.8, 1] : tint < 0.3 ? [1, 0.9, 0.7] : [1, 1, 1];
      const br = 0.4 + Math.random() * 0.6;
      col.set([c[0] * br, c[1] * br, c[2] * br], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [starCount]);
  const earthTex = useMemo(makeEarthTexture, []);
  const sunTex = useMemo(() => makeGlowTexture('rgba(255,250,235,1)', 'rgba(255,200,120,0)'), []);
  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: {},
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * f * 1.6; }`,
      }),
    [],
  );

  useFrame(({ camera }, dt) => {
    if (group.current) group.current.position.copy(camera.position);
    if (earth.current) earth.current.rotation.y += dt * 0.01;
  });

  const earthPos = EARTH_DIR.clone().multiplyScalar(700);
  const sunPos = SUN_DIR.clone().multiplyScalar(800);
  return (
    <group ref={group}>
      <points geometry={stars} frustumCulled={false}>
        <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors depthWrite={false} fog={false} />
      </points>
      <group position={earthPos}>
        <mesh ref={earth} rotation={[0.4, 0, 0.2]}>
          <sphereGeometry args={[58, 48, 32]} />
          <meshStandardMaterial map={earthTex} roughness={0.7} emissive="#1a3a6a" emissiveIntensity={0.15} fog={false} />
        </mesh>
        <mesh scale={1.12}>
          <sphereGeometry args={[58, 48, 32]} />
          <primitive object={atmoMat} attach="material" />
        </mesh>
      </group>
      <sprite position={sunPos} scale={[160, 160, 1]}>
        <spriteMaterial map={sunTex} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} transparent />
      </sprite>
    </group>
  );
}
