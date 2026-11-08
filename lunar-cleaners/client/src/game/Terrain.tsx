// Sol lunaire : maillage procédural + couche de poussière dynamique (texture partagée).
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TERRAIN_HALF, WORLD_HALF, heightAt } from '../../../shared/world';
import { G } from './state';

export function buildTerrainGeometry(segments: number) {
  const size = TERRAIN_HALF * 2;
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -TERRAIN_HALF + (i / segments) * size;
      const z = -TERRAIN_HALF + (j / segments) * size;
      const k = (j * n + i) * 3;
      pos[k] = x;
      pos[k + 1] = heightAt(x, z);
      pos[k + 2] = z;
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const NOISE_GLSL = /* glsl */ `
  varying vec3 vWPos;
  uniform sampler2D uDust;
  uniform float uHalf;
  float lcHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lcNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lcHash(i), lcHash(i + vec2(1.0, 0.0)), u.x), mix(lcHash(i + vec2(0.0, 1.0)), lcHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

export function Terrain({ segments }: { segments: number }) {
  const geom = useMemo(() => buildTerrainGeometry(segments), [segments]);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0.0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDust = { value: G.dustTex };
      shader.uniforms.uHalf = { value: WORLD_HALF };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec2 duv = (vWPos.xz + uHalf) / (2.0 * uHalf);
          float inside = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
          float rawDust = mix(0.6, texture2D(uDust, duv).r, inside);
          float n1 = lcNoise(vWPos.xz * 0.9);
          float n2 = lcNoise(vWPos.xz * 0.23 + 7.0);
          float n3 = lcNoise(vWPos.xz * 3.1);
          float dustAmt = smoothstep(0.03, 0.42, rawDust + (n3 - 0.5) * 0.08);
          // sol propre : régolithe bleu-gris éclatant avec reflets
          vec3 cleanCol = mix(vec3(0.36, 0.45, 0.66), vec3(0.50, 0.60, 0.80), n1 * 0.7 + n2 * 0.3);
          float speck = step(0.985, lcHash(floor(vWPos.xz * 14.0)));
          cleanCol += speck * vec3(0.18, 0.22, 0.26);
          // poussière : beige/sable avec variations
          vec3 dustCol = mix(vec3(0.50, 0.42, 0.32), vec3(0.62, 0.53, 0.40), n2);
          dustCol = mix(dustCol, vec3(0.40, 0.33, 0.25), n3 * 0.4 * rawDust);
          // hors zone jouable : roche plus sombre
          float edge = 1.0 - inside;
          vec3 col = mix(cleanCol, dustCol, dustAmt);
          float rim = smoothstep(0.02, 0.14, rawDust) * (1.0 - smoothstep(0.14, 0.38, rawDust));
          col *= 1.0 - rim * 0.28;
          col = mix(col, vec3(0.42, 0.39, 0.37) * (0.8 + 0.3 * n1), edge);
          diffuseColor.rgb = col;
          `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42, 0.97, max(dustAmt, edge));',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.05, 0.09, 0.16) * (1.0 - dustAmt) * (1.0 - edge);',
        );
    };
    return m;
  }, []);

  useFrame(() => {
    if (G.dustDirty) {
      G.dustTex.needsUpdate = true;
      G.dustDirty = false;
    }
  });

  return <mesh geometry={geom} material={mat} receiveShadow />;
}
