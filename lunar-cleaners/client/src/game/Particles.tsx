// Système de particules (poussière soulevée, aspiration, éclats) en un seul draw call.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '../../../shared/world';
import { G } from './state';

export function Particles({ max = 3000 }: { max?: number }) {
  const sys = useMemo(() => {
    const pos = new Float32Array(max * 3);
    const vel = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    const life = new Float32Array(max); // durée restante
    const maxLife = new Float32Array(max);
    const size = new Float32Array(max);
    const alpha = new Float32Array(max);
    const target = new Float32Array(max * 3);
    const mode = new Uint8Array(max); // 0 puff, 1 suck, 2 burst, 3 spark
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uScale: { value: 300 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.1, r) * vA; gl_FragColor = vec4(vC, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { pos, vel, col, life, maxLife, size, alpha, target, mode, g, m, cursor: 0 };
  }, [max]);

  useEffect(() => {
    const c = new THREE.Color();
    G.emit = (x, y, z, n, color, mode = 'puff', tx = 0, ty = 0, tz = 0) => {
      c.set(color);
      const gy = Number.isNaN(y) ? heightAt(x, z) + 0.3 : y;
      for (let k = 0; k < n; k++) {
        const i = sys.cursor;
        sys.cursor = (sys.cursor + 1) % max;
        const md = mode === 'puff' ? 0 : mode === 'suck' ? 1 : mode === 'burst' ? 2 : 3;
        sys.mode[i] = md;
        const spread = md === 2 ? 0.6 : 0.5;
        sys.pos[i * 3] = x + (Math.random() - 0.5) * spread * 2;
        sys.pos[i * 3 + 1] = gy + Math.random() * 0.2;
        sys.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread * 2;
        const a = Math.random() * Math.PI * 2;
        const sp = md === 2 ? 2 + Math.random() * 4 : md === 3 ? 1 + Math.random() * 2 : 0.4 + Math.random() * 1.2;
        sys.vel[i * 3] = Math.cos(a) * sp;
        sys.vel[i * 3 + 1] = md === 2 ? 2 + Math.random() * 4 : md === 3 ? 1.5 + Math.random() * 2 : 0.5 + Math.random() * 1.4;
        sys.vel[i * 3 + 2] = Math.sin(a) * sp;
        sys.target[i * 3] = tx; sys.target[i * 3 + 1] = ty; sys.target[i * 3 + 2] = tz;
        const l = md === 1 ? 0.45 : md === 2 ? 1.4 + Math.random() * 0.6 : 0.8 + Math.random() * 0.8;
        sys.life[i] = l;
        sys.maxLife[i] = l;
        const shade = 0.85 + Math.random() * 0.3;
        sys.col[i * 3] = c.r * shade; sys.col[i * 3 + 1] = c.g * shade; sys.col[i * 3 + 2] = c.b * shade;
        sys.size[i] = md === 2 ? 0.25 + Math.random() * 0.25 : md === 3 ? 0.12 : 0.18 + Math.random() * 0.3;
      }
    };
    return () => { G.emit = null; };
  }, [sys, max]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const cam = state.camera as THREE.PerspectiveCamera;
    sys.m.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 60) / 2));
    const { pos, vel, life, maxLife, alpha, target, mode } = sys;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      const t = life[i] / maxLife[i];
      const k = i * 3;
      if (mode[i] === 1) {
        // aspiration : attirée vers la buse
        pos[k] += (target[k] - pos[k]) * Math.min(1, dt * 7);
        pos[k + 1] += (target[k + 1] - pos[k + 1]) * Math.min(1, dt * 7);
        pos[k + 2] += (target[k + 2] - pos[k + 2]) * Math.min(1, dt * 7);
      } else {
        vel[k + 1] -= (mode[i] === 2 ? 4 : 0.6) * dt;
        vel[k] *= 1 - dt * 1.2;
        vel[k + 2] *= 1 - dt * 1.2;
        pos[k] += vel[k] * dt;
        pos[k + 1] += vel[k + 1] * dt;
        pos[k + 2] += vel[k + 2] * dt;
      }
      alpha[i] = Math.min(1, t * 2) * (mode[i] === 0 ? 0.65 : 0.95);
    }
    (sys.g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (sys.g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (sys.g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (sys.g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  });

  return <points geometry={sys.g} material={sys.m} frustumCulled={false} />;
}
