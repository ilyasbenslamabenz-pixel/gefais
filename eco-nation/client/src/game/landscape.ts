// Paysage Babylon.js : relief texturé (textures Poly Haven CC0, mélange par altitude/pente/saison),
// mer, lacs, rivières, routes, voies ferrées et forêts (instances fines).
import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Texture, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { mulberry32 } from '../../../shared/noise';
import { HALF_D, HALF_W, MAP_D, MAP_W, coastX, parkMask, urbanDensity } from '../../../shared/sim/country';
import type { CountryDef } from '../../../shared/sim/types';
import { ENV, RES, VS, densify, distToPolyline, forestMask, type Grid } from './terrain';

const TEX = (name: string, scene: Scene) => {
  const t = new Texture(`/assets/textures/${name}.jpg`, scene);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
};

export function createTerrain(scene: Scene, grid: Grid, country: CountryDef, step: number) {
  const nx = Math.floor((grid.nx - 1) / step) + 1;
  const nz = Math.floor((grid.nz - 1) / step) + 1;
  const positions = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      positions[k] = -HALF_W + i * step * RES;
      positions[k + 1] = grid.h[j * step * grid.nx + i * step] * VS;
      positions[k + 2] = -HALF_D + j * step * RES;
    }
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      indices[p++] = a; indices[p++] = a + 1; indices[p++] = a + nx;
      indices[p++] = a + 1; indices[p++] = a + nx + 1; indices[p++] = a + nx;
    }
  }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  // masques urbain et parcs précalculés par sommet
  const urban = new Float32Array(nx * nz);
  const park = new Float32Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) {
    const x = positions[k * 3], z = positions[k * 3 + 2];
    urban[k] = urbanDensity(country, x, z);
    park[k] = urban[k] > 0.1 ? parkMask(country.seed, x, z) : 0;
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  const mesh = new Mesh('terrain', scene);
  vd.applyToMesh(mesh);
  mesh.setVerticesData('urban', urban, false, 1);
  mesh.setVerticesData('park', park, false, 1);
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();

  const mat = new CustomMaterial('terrainMat', scene);
  mat.specularColor = new Color3(0.04, 0.04, 0.04);
  mat.AddUniform('tGrass', 'sampler2D', TEX('aerial_grass_rock', scene));
  mat.AddUniform('tRock', 'sampler2D', TEX('aerial_rocks_02', scene));
  mat.AddUniform('tSand', 'sampler2D', TEX('aerial_beach_01', scene));
  mat.AddUniform('tSnow', 'sampler2D', TEX('snow_02', scene));
  mat.AddUniform('tDirt', 'sampler2D', TEX('dirt_aerial_02', scene));
  mat.AddUniform('tUrban', 'sampler2D', TEX('aerial_asphalt_01', scene));
  mat.AddUniform('uWinter', 'float', 0);
  mat.AddUniform('uAutumn', 'float', 0);
  mat.AddUniform('uSnow', 'float', 0);
  mat.AddUniform('uWet', 'float', 0);
  mat.AddUniform('uNight', 'float', 0);
  mat.AddAttribute('urban');
  mat.AddAttribute('park');
  mat.Vertex_Definitions('attribute float urban; attribute float park; varying float vUrban; varying float vPark;');
  mat.Vertex_MainEnd('vUrban = urban; vPark = park;');
  mat.Fragment_Definitions(/* glsl */ `
    float enHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float enNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(enHash(i), enHash(i + vec2(1.0, 0.0)), u.x), mix(enHash(i + vec2(0.0, 1.0)), enHash(i + vec2(1.0, 1.0)), u.x), u.y); }
    float enFbm(vec2 p) { return enNoise(p) * 0.5 + enNoise(p * 2.03) * 0.25 + enNoise(p * 4.1) * 0.125; }
    varying float vUrban; varying float vPark;
  `);
  mat.Fragment_Custom_Diffuse(/* glsl */ `
    vec2 p = vPositionW.xz;
    float h = vPositionW.y / ${VS.toFixed(1)};
    float slope = 1.0 - clamp(vNormalW.y, 0.0, 1.0);
    float n1 = enFbm(p * 0.4);
    // textures en coordonnées monde, deux échelles pour casser la répétition
    vec3 grass = mix(texture2D(tGrass, p * 4.0).rgb, texture2D(tGrass, p * 0.6).rgb, 0.5);
    vec3 rock = mix(texture2D(tRock, p * 2.5).rgb, texture2D(tRock, p * 0.5).rgb, 0.5);
    vec3 sand = texture2D(tSand, p * 3.0).rgb;
    vec3 snowT = texture2D(tSnow, p * 3.5).rgb * 1.08;
    vec3 dirt = texture2D(tDirt, p * 3.0).rgb;
    vec3 urb = texture2D(tUrban, p * 5.0).rgb;
    // saisons sur la végétation
    vec3 veg = grass * vec3(0.92, 1.05, 0.85);
    veg = mix(veg, veg * vec3(1.25, 0.95, 0.6), uAutumn * 0.55);
    veg = mix(veg, vec3(dot(veg, vec3(0.33))) * vec3(1.05, 1.0, 0.9), uWinter * 0.55);
    vec3 col = veg;
    // champs agricoles en parcelles dans les plaines
    float fieldZone = smoothstep(0.42, 0.55, enFbm(p * 0.2 + 7.0)) * (1.0 - smoothstep(0.15, 0.3, h)) * (1.0 - smoothstep(0.05, 0.25, vUrban));
    vec2 fp = mat2(0.87, 0.5, -0.5, 0.87) * p / 0.22;
    float fid = enHash(floor(fp));
    vec3 crop = fid < 0.33 ? mix(vec3(0.78, 0.68, 0.32), dirt, uWinter) : fid < 0.66 ? mix(veg * vec3(0.9, 1.15, 0.7), dirt, uWinter * 0.8) : dirt;
    float edge = step(0.05, fract(fp.x)) * step(0.05, fract(fp.y));
    col = mix(col, crop * (0.92 + 0.08 * edge), fieldZone * 0.55);
    // forêts plus sombres
    float forest = smoothstep(0.52, 0.6, enFbm(p * 0.25 + vec2(50.0, -20.0))) * step(0.03, h) * (1.0 - smoothstep(0.1, 0.3, vUrban));
    col = mix(col, col * vec3(0.55, 0.7, 0.5), forest * 0.6);
    // littoral, roche, fonds marins
    col = mix(sand, col, smoothstep(0.015, 0.03, h));
    col = mix(col, rock, smoothstep(0.25, 0.45, slope));
    col = mix(col, sand * 0.55, step(h, -0.002));
    // neige selon l'altitude et la saison
    float snowLine = mix(0.9, 0.3, uWinter) - uSnow * 0.35;
    float snow = smoothstep(snowLine, snowLine + 0.15, h + n1 * 0.12) * (1.0 - smoothstep(0.62, 0.85, slope));
    col = mix(col, snowT, snow);
    // villes
    float urban = smoothstep(0.08, 0.35, vUrban);
    // trame des rues (îlots de 200 m) et grands boulevards (1 km)
    vec2 g = abs(fract(p / 0.2 + 0.5) - 0.5) * 0.2;
    float street = 1.0 - smoothstep(0.009, 0.014, min(g.x, g.y));
    vec2 g2 = abs(fract(p + 0.5) - 0.5);
    float boulevard = 1.0 - smoothstep(0.018, 0.026, min(g2.x, g2.y));
    vec3 block = mix(urb * 0.9, vec3(0.5, 0.52, 0.48), 0.4);
    vec3 cityCol = mix(block, urb * 0.6, max(street, boulevard) * 0.8);
    col = mix(col, cityCol, urban * 0.92);
    // parcs urbains
    col = mix(col, veg * vec3(0.85, 1.1, 0.8), smoothstep(0.3, 0.6, vPark) * urban);
    col *= 1.0 - uWet * 0.12;
    diffuseColor = col;
  `);
  mat.Fragment_Before_FragColor(/* glsl */ `
    // éclairage public la nuit dans les zones urbaines
    float urbanN = smoothstep(0.1, 0.4, vUrban) * (1.0 - vPark);
    vec2 gn = abs(fract(vPositionW.xz / 0.2 + 0.5) - 0.5) * 0.2;
    float lamp = 1.0 - smoothstep(0.004, 0.016, min(gn.x, gn.y));
    color.rgb += urbanN * uNight * vec3(0.95, 0.65, 0.3) * (0.15 + 0.85 * lamp);
  `);
  mat.onBindObservable.add(() => {
    const e = mat.getEffect();
    if (!e) return;
    e.setFloat('uWinter', ENV.winter);
    e.setFloat('uAutumn', ENV.autumn);
    e.setFloat('uSnow', ENV.snow);
    e.setFloat('uWet', ENV.wet);
    e.setFloat('uNight', ENV.night);
  });
  mesh.material = mat;
  return mesh;
}

/** Ruban posé sur le relief (routes, rails, rivières). */
function ribbonData(points: [number, number][], width: number, grid: Grid, lift: number, minY: number) {
  const n = points.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const ox = -dz * width * 0.5;
    const oz = dx * width * 0.5;
    const y = Math.max(minY, grid.y(x, z)) + lift;
    pos.push(x + ox, y, z + oz, x - ox, y, z - oz);
    if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  return { pos, idx };
}

function mergeRibbons(name: string, list: [number, number][][], width: number, grid: Grid, lift: number, minY: number, scene: Scene, color: Color3) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const pts of list) {
    const r = ribbonData(densify(pts, 0.1), width, grid, lift, minY);
    const off = pos.length / 3;
    pos.push(...r.pos);
    for (const i of r.idx) idx.push(i + off);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  vd.normals = normals;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  const m = new StandardMaterial(name + 'Mat', scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  m.zOffset = -2; // évite le scintillement avec le relief
  mesh.material = m;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

export function createWaterAndNetwork(scene: Scene, grid: Grid, country: CountryDef) {
  const sea = MeshBuilder.CreateGround('sea', { width: MAP_W * 3, height: MAP_D * 3 }, scene);
  sea.position.y = 0.03;
  const seaMat = new StandardMaterial('seaMat', scene);
  seaMat.diffuseColor = new Color3(0.13, 0.38, 0.55);
  seaMat.specularColor = new Color3(0.5, 0.5, 0.5);
  seaMat.specularPower = 64;
  seaMat.alpha = 0.93;
  sea.material = seaMat;
  sea.isPickable = false;
  const lakeMat = new StandardMaterial('lakeMat', scene);
  lakeMat.diffuseColor = new Color3(0.18, 0.45, 0.64);
  lakeMat.specularColor = new Color3(0.5, 0.5, 0.5);
  lakeMat.specularPower = 64;
  lakeMat.zOffset = -1;
  for (const l of country.lakes) {
    const d = MeshBuilder.CreateDisc('lake', { radius: l.r * 1.25, tessellation: 48 }, scene);
    d.rotation.x = Math.PI / 2;
    d.position.set(l.x, l.level * VS + 0.005, l.z);
    d.material = lakeMat;
    d.isPickable = false;
  }
  const riverMesh = mergeRibbons('rivers', country.rivers.map((r) => r.points), 0.34, grid, 0.03, 0.02, scene, new Color3(0.2, 0.47, 0.66));
  const roads = mergeRibbons('autoroutes', country.links.filter((l) => l.kind === 'autoroute').map((l) => l.points), 0.055, grid, 0.006, 0.03, scene, new Color3(0.2, 0.21, 0.23));
  const nat = mergeRibbons('nationales', country.links.filter((l) => l.kind === 'nationale').map((l) => l.points), 0.032, grid, 0.005, 0.03, scene, new Color3(0.3, 0.31, 0.33));
  const rails = mergeRibbons('rails', country.links.filter((l) => l.kind === 'rail').map((l) => l.points), 0.02, grid, 0.008, 0.03, scene, new Color3(0.5, 0.25, 0.25));
  return { sea, seaMat, riverMesh, roads, nat, rails };
}

/** Forêts : des milliers d'arbres en instances fines (un seul appel de rendu). */
export function createForests(scene: Scene, grid: Grid, country: CountryDef, count: number) {
  const rnd = mulberry32(country.seed + 5);
  const placed: { x: number; z: number; s: number; y: number; hue: number }[] = [];
  let guard = 0;
  while (placed.length < count && guard++ < count * 25) {
    const x = -HALF_W + rnd() * MAP_W;
    const z = -HALF_D + rnd() * MAP_D;
    if (x < coastX(country.seed, z) + 0.3) continue;
    const h = grid.sample(x, z);
    if (h < 0.026) continue;
    const u = urbanDensity(country, x, z);
    const inPark = u > 0.1 && parkMask(country.seed, x, z) > 0.55;
    const inWood = u < 0.25 && forestMask(x * 7, z * 7) > 0.1 + rnd() * 0.06;
    if (!inPark && !inWood) continue;
    if (country.lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r * 1.3)) continue;
    if (country.rivers.some((r) => distToPolyline(x, z, r.points) < r.width * 2)) continue;
    placed.push({ x, z, s: 0.012 + rnd() * 0.012, y: grid.y(x, z), hue: rnd() });
  }
  const crown = MeshBuilder.CreateCylinder('tree', { diameterTop: 0, diameterBottom: 0.55, height: 1.0, tessellation: 6 }, scene);
  crown.bakeTransformIntoVertices(Matrix.Translation(0, 0.75, 0));
  const trunk = MeshBuilder.CreateCylinder('trunk', { diameter: 0.1, height: 0.3, tessellation: 5 }, scene);
  trunk.bakeTransformIntoVertices(Matrix.Translation(0, 0.15, 0));
  const tree = Mesh.MergeMeshes([crown, trunk], true, true, undefined, false, false)!;
  tree.name = 'forest';
  const m = new StandardMaterial('treeMat', scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  tree.material = m;
  tree.isPickable = false;
  const n = placed.length;
  const matrices = new Float32Array(n * 16);
  const colors = new Float32Array(n * 4);
  const mtx = new Matrix();
  placed.forEach((t, i) => {
    Matrix.ComposeToRef(new Vector3(t.s, t.s, t.s), Quaternion.Identity(), new Vector3(t.x, t.y, t.z), mtx);
    mtx.copyToArray(matrices, i * 16);
  });
  tree.thinInstanceSetBuffer('matrix', matrices, 16, true);
  tree.thinInstanceSetBuffer('color', colors, 4, false);
  const recolor = () => {
    placed.forEach((t, i) => {
      const g = new Color3(0.13 + t.hue * 0.08, 0.32 + t.hue * 0.12, 0.12 + t.hue * 0.05);
      const autumn = new Color3(0.55 + t.hue * 0.2, 0.32 + t.hue * 0.1, 0.08);
      const c = Color3.Lerp(g, autumn, ENV.autumn * (t.hue > 0.35 ? 0.85 : 0.1));
      const w = Color3.Lerp(c, new Color3(0.8, 0.83, 0.86), ENV.winter * 0.35 + ENV.snow * 0.3);
      colors.set([w.r, w.g, w.b, 1], i * 4);
    });
    tree.thinInstanceBufferUpdated('color');
  };
  recolor();
  return { tree, recolor };
}
