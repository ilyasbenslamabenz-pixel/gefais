// Paysage : relief (shader saisonnier), mer, lacs, rivières, forêts, routes et voies ferrées.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/noise';
import { HALF_D, HALF_W, MAP_D, MAP_W, coastX } from '../../../shared/sim/country';
import type { CountryDef } from '../../../shared/sim/types';
import { ENV, VS, densify, distToPolyline, forestMask, ribbon, terrainGeometry, type Grid } from './terrain';

const GLSL_NOISE = /* glsl */ `
  float enHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float enNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(enHash(i), enHash(i + vec2(1.0, 0.0)), u.x), mix(enHash(i + vec2(0.0, 1.0)), enHash(i + vec2(1.0, 1.0)), u.x), u.y); }
  float enFbm(vec2 p) { return enNoise(p) * 0.5 + enNoise(p * 2.03) * 0.25 + enNoise(p * 4.1) * 0.125; }
`;

export function Terrain({ grid, country, step }: { grid: Grid; country: CountryDef; step: number }) {
  const geom = useMemo(() => terrainGeometry(grid, step), [grid, step]);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
    const cities = country.cities.slice(0, 64).map((c) => new THREE.Vector3(c.x, c.z, c.radius));
    while (cities.length < 64) cities.push(new THREE.Vector3(9999, 9999, 0));
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWinter = ENV.winter;
      sh.uniforms.uAutumn = ENV.autumn;
      sh.uniforms.uSnow = ENV.snow;
      sh.uniforms.uWet = ENV.wet;
      sh.uniforms.uCities = { value: cities };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWN; uniform float uWinter; uniform float uAutumn; uniform float uSnow; uniform float uWet; uniform vec3 uCities[64];
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
          float h = vWPos.y / ${VS.toFixed(1)};
          float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
          vec2 p = vWPos.xz;
          float n1 = enFbm(p * 0.08);
          float n2 = enNoise(p * 0.9);
          vec3 summer = mix(vec3(0.33, 0.52, 0.22), vec3(0.50, 0.62, 0.30), n1);
          vec3 winterC = mix(vec3(0.45, 0.45, 0.33), vec3(0.55, 0.52, 0.40), n1);
          vec3 autumnC = mix(vec3(0.55, 0.50, 0.25), vec3(0.62, 0.45, 0.22), n1);
          vec3 col = mix(summer, winterC, uWinter * 0.8);
          col = mix(col, autumnC, uAutumn * 0.6);
          // champs cultivés dans les plaines
          float fieldZone = smoothstep(0.42, 0.55, enFbm(p * 0.03 + 7.0)) * (1.0 - smoothstep(0.35, 0.55, h));
          vec2 fp = mat2(0.87, 0.5, -0.5, 0.87) * p / 1.3;
          float fid = enHash(floor(fp));
          vec3 fieldC = fid < 0.33 ? mix(vec3(0.78, 0.68, 0.30), vec3(0.45, 0.36, 0.22), uWinter) :
                        fid < 0.66 ? mix(vec3(0.42, 0.62, 0.25), vec3(0.42, 0.38, 0.26), uWinter) : vec3(0.52, 0.42, 0.28);
          float edge = step(0.06, fract(fp.x)) * step(0.06, fract(fp.y));
          col = mix(col, fieldC * (0.85 + 0.15 * edge), fieldZone * 0.9);
          // forêts (sombres)
          float forest = smoothstep(0.52, 0.6, enFbm(p * 0.035 + vec2(50.0, -20.0))) * step(0.12, h) * (1.0 - step(1.3, h));
          col = mix(col, mix(vec3(0.16, 0.30, 0.14), vec3(0.35, 0.25, 0.12), uAutumn * 0.7), forest * 0.6);
          // sable littoral, roche, fonds marins
          col = mix(vec3(0.82, 0.76, 0.58), col, smoothstep(0.0, 0.05, h));
          col = mix(col, vec3(0.45, 0.43, 0.40) * (0.8 + 0.4 * n2), smoothstep(0.32, 0.55, slope + (h - 0.9) * 0.5));
          col = mix(col, vec3(0.30, 0.40, 0.45), step(h, -0.001));
          // neige : altitude dépendant de la saison
          float snowLine = mix(1.9, 0.75, uWinter) - uSnow * 0.7;
          float snow = smoothstep(snowLine, snowLine + 0.15, h + n2 * 0.1) * (1.0 - smoothstep(0.65, 0.85, slope));
          col = mix(col, vec3(0.95, 0.96, 1.0), snow);
          // villes : sol urbanisé
          float urban = 0.0;
          for (int i = 0; i < 64; i++) {
            vec3 c = uCities[i];
            float d = distance(p, c.xy);
            urban = max(urban, 1.0 - smoothstep(c.z * 0.6, c.z * 1.15, d));
          }
          col = mix(col, vec3(0.50, 0.50, 0.52) * (0.9 + 0.2 * n2), urban * 0.75);
          col *= 1.0 - uWet * 0.15;
          diffuseColor.rgb = col;
        `);
    };
    return m;
  }, [country]);
  return <mesh geometry={geom} material={mat} receiveShadow />;
}

export function Water({ country, grid }: { country: CountryDef; grid: Grid }) {
  const sea = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a6f97', roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.92 }), []);
  const lakeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a86b4', roughness: 0.1, metalness: 0.2 }), []);
  const rivers = useMemo(() => country.rivers.map((r) => ribbon(densify(r.points, 0.8), r.width * 2.2, grid, 0.06, 0.01)), [country, grid]);
  useEffect(() => () => rivers.forEach((g) => g.dispose()), [rivers]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={sea}>
        <planeGeometry args={[MAP_W * 3, MAP_D * 3]} />
      </mesh>
      {country.lakes.map((l, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[l.x, l.level * VS + 0.03, l.z]} material={lakeMat}>
          <circleGeometry args={[l.r * 1.25, 48]} />
        </mesh>
      ))}
      {rivers.map((g, i) => <mesh key={i} geometry={g} material={lakeMat} />)}
    </group>
  );
}

export function Network({ country, grid }: { country: CountryDef; grid: Grid }) {
  const { roads, nat, rails } = useMemo(() => {
    const make = (kind: string, w: number, lift: number) => {
      const geos = country.links.filter((l) => l.kind === kind).map((l) => ribbon(densify(l.points, 0.7), w, grid, lift, 0.04));
      return geos;
    };
    return { roads: make('autoroute', 0.42, 0.07), nat: make('nationale', 0.24, 0.06), rails: make('rail', 0.2, 0.09) };
  }, [country, grid]);
  const mA = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b3f46', roughness: 0.8 }), []);
  const mN = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b6e73', roughness: 0.9 }), []);
  const mR = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6d4c3d', roughness: 0.9 }), []);
  return (
    <group>
      {roads.map((g, i) => <mesh key={'a' + i} geometry={g} material={mA} receiveShadow />)}
      {nat.map((g, i) => <mesh key={'n' + i} geometry={g} material={mN} receiveShadow />)}
      {rails.map((g, i) => <mesh key={'r' + i} geometry={g} material={mR} />)}
    </group>
  );
}

export function Forests({ country, grid, count }: { country: CountryDef; grid: Grid; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.ConeGeometry(0.35, 1.2, 6).translate(0, 0.9, 0), []);
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.06, 0.08, 0.35, 5).translate(0, 0.17, 0), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uAutumn = ENV.autumn;
      sh.uniforms.uWinter = ENV.winter;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uAutumn; uniform float uWinter;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.6, 1.0, 0.45), uAutumn * 0.5);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.88, 0.9), uWinter * 0.35);');
    };
    return m;
  }, []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5b4030' }), []);
  const placed = useMemo(() => {
    const rnd = mulberry32(country.seed + 5);
    const out: { x: number; z: number; s: number; y: number; c: THREE.Color }[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 25) {
      const x = -HALF_W + rnd() * MAP_W;
      const z = -HALF_D + rnd() * MAP_D;
      if (x < coastX(country.seed, z) + 1) continue;
      if (forestMask(x, z) < 0.12 + rnd() * 0.06) continue;
      const h = grid.sample(x, z);
      if (h < 0.06 || h > 1.35) continue;
      if (country.cities.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius * 1.2)) continue;
      if (country.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r * 1.4)) continue;
      if (country.rivers.some((r) => distToPolyline(x, z, r.points) < 1.2)) continue;
      const c = new THREE.Color().setHSL(0.27 + rnd() * 0.08, 0.45 + rnd() * 0.2, 0.2 + rnd() * 0.12);
      out.push({ x, z, s: 0.7 + rnd() * 0.9, y: grid.y(x, z), c });
    }
    return out;
  }, [country, grid, count]);
  useEffect(() => {
    const o = new THREE.Object3D();
    placed.forEach((t, i) => {
      o.position.set(t.x, t.y, t.z);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      ref.current!.setColorAt(i, t.c);
      trunkRef.current!.setMatrixAt(i, o.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    trunkRef.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [placed]);
  return (
    <group>
      <instancedMesh ref={ref} args={[geo, mat, placed.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={trunkRef} args={[trunk, trunkMat, placed.length]} frustumCulled={false} />
    </group>
  );
}
