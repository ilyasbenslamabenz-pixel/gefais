// Équipements sélectionnables (hôpitaux, universités, gares, aéroports, ports, centrales, zones d'activité)
// et fumées des installations émettrices (débit lié aux émissions calculées par le serveur).
import { Color3, Color4, DynamicTexture, Matrix, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, TransformNode, Vector3, type Scene } from '@babylonjs/core';
import type { CountryDef, Infra } from '../../../shared/sim/types';
import type { Grid } from './terrain';

export function createInfrastructure(scene: Scene, grid: Grid, country: CountryDef) {
  const mats = new Map<string, StandardMaterial>();
  const mat = (hex: string, emissive = 0) => {
    const k = hex + emissive;
    let m = mats.get(k);
    if (!m) {
      m = new StandardMaterial('m' + k, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(0.1, 0.1, 0.1);
      if (emissive) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
      mats.set(k, m);
    }
    return m;
  };
  const parts: Mesh[] = [];
  const box = (hex: string, x: number, y: number, z: number, w: number, h: number, d: number, e = 0, ry = 0, rx = 0) => {
    const b = MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scene);
    b.position.set(x, y + h / 2, z);
    b.rotation.set(rx, ry, 0);
    b.material = mat(hex, e);
    parts.push(b);
  };
  const cyl = (hex: string, x: number, y: number, z: number, r: number, h: number, e = 0, top?: number) => {
    const c = MeshBuilder.CreateCylinder('p', { diameterBottom: r * 2, diameterTop: (top ?? r) * 2, height: h, tessellation: 18 }, scene);
    c.position.set(x, y + h / 2, z);
    c.material = mat(hex, e);
    parts.push(c);
  };
  const rotors: TransformNode[] = [];
  const smokeSources: { pos: Vector3; steam: boolean }[] = [];

  const build = (i: Infra) => {
    parts.length = 0;
    switch (i.type) {
      case 'hopital': box('#f4f6f8', 0, 0, 0, 0.9, 0.5, 0.6); box('#e63946', 0, 0.5, 0, 0.35, 0.04, 0.1, 0.6); box('#e63946', 0, 0.5, 0, 0.1, 0.04, 0.35, 0.6); break;
      case 'universite': box('#d9c5a0', 0, 0, 0, 1, 0.35, 0.5); box('#d9c5a0', 0.6, 0, 0.6, 0.4, 0.3, 0.8); cyl('#2a9d8f', 0, 0.35, 0, 0.15, 0.25); break;
      case 'ecole': box('#f4a261', 0, 0, 0, 0.45, 0.2, 0.3); break;
      case 'gare': box('#cfd8dc', 0, 0, 0, 0.9, 0.25, 0.35); box('#264653', 0, 0.25, 0, 0.95, 0.05, 0.4); break;
      case 'aeroport': box('#2f3437', 0, 0, 0, 4.2, 0.03, 0.35); box('#2f3437', 0, 0, 0.9, 3.2, 0.03, 0.25); box('#e9ecef', 0, 0, -0.8, 1.4, 0.3, 0.45); cyl('#adb5bd', 0.9, 0, -0.8, 0.07, 0.7); break;
      case 'port':
        box('#8d99ae', -0.6, 0, 0, 1.6, 0.06, 2.4);
        for (const z of [-0.6, 0.6]) { box('#e76f51', -1.1, 0, z, 0.08, 0.9, 0.08); box('#e76f51', -1.3, 0.85, z, 0.7, 0.07, 0.07); }
        box('#457b9d', -0.3, 0.06, 0.2, 0.4, 0.2, 0.3); box('#e9c46a', -0.3, 0.06, -0.4, 0.4, 0.2, 0.3);
        break;
      case 'centrale_charbon':
        box('#6c757d', 0, 0, 0, 1.2, 0.5, 0.7); cyl('#495057', 0.4, 0, 0.6, 0.12, 1.8); cyl('#495057', -0.2, 0, 0.6, 0.12, 1.8); box('#212529', 0, 0, -0.8, 0.9, 0.15, 0.5);
        smokeSources.push({ pos: new Vector3(0.4, 1.9, 0.6), steam: false }, { pos: new Vector3(-0.2, 1.9, 0.6), steam: false });
        break;
      case 'centrale_gaz':
        box('#adb5bd', 0, 0, 0, 0.9, 0.4, 0.5); cyl('#868e96', 0.3, 0, 0.4, 0.1, 1.1); cyl('#dee2e6', -0.5, 0, 0.5, 0.25, 0.3);
        smokeSources.push({ pos: new Vector3(0.3, 1.2, 0.4), steam: false });
        break;
      case 'centrale_nucleaire':
        cyl('#e9ecef', -0.9, 0, 0, 0.85, 2.0, 0, 0.6); cyl('#e9ecef', 0.9, 0, 0, 0.85, 2.0, 0, 0.6);
        { const s = MeshBuilder.CreateSphere('p', { diameter: 0.9, slice: 0.5 }, scene); s.position.set(0, 0, 1.2); s.material = mat('#ced4da'); parts.push(s); }
        box('#adb5bd', 0, 0, -1.2, 1.2, 0.35, 0.5);
        smokeSources.push({ pos: new Vector3(-0.9, 2.1, 0), steam: true }, { pos: new Vector3(0.9, 2.1, 0), steam: true });
        break;
      case 'barrage': box('#b0b7bf', 0, 0, 0, 0.4, 0.9, 3.4); box('#868e96', 0.3, 0, 0, 0.4, 0.3, 0.8); break;
      case 'parc_solaire':
        for (let k = 0; k < 24; k++) box('#1d3557', ((k % 6) - 2.5) * 0.45, 0.05, (Math.floor(k / 6) - 1.5) * 0.4, 0.38, 0.03, 0.28, 0.15, 0, -0.4);
        break;
      case 'zone_industrielle':
        [[-0.7, -0.5], [0.6, -0.4], [-0.5, 0.7], [0.7, 0.6]].forEach(([x, z], k) => box(k % 2 ? '#8d99ae' : '#adb5bd', x, 0, z, 0.9, 0.25 + k * 0.05, 0.6));
        cyl('#6c757d', 0, 0, 0, 0.08, 1.0);
        smokeSources.push({ pos: new Vector3(0, 1.05, 0), steam: false });
        break;
      case 'zone_commerciale': box('#e9ecef', 0, 0, 0, 1.4, 0.2, 0.8); box('#ffb703', 0, 0.2, 0.41, 0.8, 0.06, 0.02, 0.6); box('#495057', 0, 0, 1.1, 1.6, 0.01, 0.9); break;
      case 'commissariat': box('#1d3557', 0, 0, 0, 0.4, 0.25, 0.3); box('#a8dadc', 0, 0.25, 0, 0.1, 0.06, 0.1, 0.8); break;
      case 'stade': cyl('#ced4da', 0, 0, 0, 0.6, 0.18); cyl('#52b788', 0, 0.01, 0, 0.45, 0.18); break;
      case 'caserne': box('#c1121f', 0, 0, 0, 0.5, 0.25, 0.35); box('#f1faee', 0, 0.25, 0, 0.52, 0.04, 0.37); box('#c1121f', 0.3, 0, 0, 0.12, 0.6, 0.12); break;
      case 'usine':
        box('#8d99ae', 0, 0, 0, 0.9, 0.35, 0.6); box('#6c757d', 0, 0.35, 0, 0.9, 0.12, 0.2, 0, 0, 0.5); cyl('#495057', 0.35, 0, 0.2, 0.07, 0.9);
        smokeSources.push({ pos: new Vector3(0.35, 0.95, 0.2), steam: false });
        break;
      case 'ferme': box('#a4161a', 0, 0, 0, 0.35, 0.22, 0.22); box('#e9d8a6', 0.35, 0, 0.1, 0.18, 0.4, 0.18); box('#6a994e', 0, 0, 0.6, 1.2, 0.01, 0.8); break;
      case 'parc_eolien': break;
    }
    return parts.slice();
  };

  const roots: Mesh[] = [];
  const SCALE: Partial<Record<Infra['type'], number>> = { aeroport: 0.75, port: 0.9, centrale_nucleaire: 0.35, centrale_charbon: 0.35, centrale_gaz: 0.3, parc_solaire: 0.45, barrage: 0.35, zone_industrielle: 0.45, zone_commerciale: 0.3, stade: 0.45, universite: 0.4, hopital: 0.28, usine: 0.3, ferme: 0.25 };
  for (const i of country.infra) {
    const y = grid.y(i.x, i.z);
    const sc = SCALE[i.type] ?? 0.22;
    const before = smokeSources.length;
    if (i.type === 'parc_eolien') {
      const node = new TransformNode('wind', scene);
      node.position.set(i.x, y, i.z);
      node.scaling.setAll(i.name.includes('mer') ? 0.6 : 0.3);
      const towers: Mesh[] = [];
      for (let k = 0; k < 9; k++) {
        const x = ((k % 3) - 1) * 1.2;
        const z = (Math.floor(k / 3) - 1) * 1.2;
        const t = MeshBuilder.CreateCylinder('mast', { diameterTop: 0.05, diameterBottom: 0.1, height: 1.6, tessellation: 8 }, scene);
        t.position.set(x, 0.8, z);
        towers.push(t);
        const hub = new TransformNode('hub', scene);
        hub.parent = node;
        hub.position.set(x, 1.6, z + 0.06);
        for (let b = 0; b < 3; b++) {
          const blade = MeshBuilder.CreateBox('blade', { width: 0.06, height: 1.1, depth: 0.02 }, scene);
          blade.bakeTransformIntoVertices(Matrix.Translation(0, 0.55, 0));
          blade.rotation.z = (b * Math.PI * 2) / 3;
          blade.material = mat('#ffffff');
          blade.parent = hub;
          blade.isPickable = false;
        }
        rotors.push(hub);
      }
      const merged = Mesh.MergeMeshes(towers, true, true)!;
      merged.material = mat('#f2f4f7');
      merged.parent = node;
      merged.metadata = { kind: 'infra', id: i.id };
      roots.push(merged);
      continue;
    }
    const ps = build(i);
    if (!ps.length) continue;
    const merged = Mesh.MergeMeshes(ps, true, true, undefined, false, true)!;
    merged.position.set(i.x, y, i.z);
    merged.rotation.y = i.rot;
    merged.scaling.setAll(sc);
    merged.metadata = { kind: 'infra', id: i.id };
    merged.receiveShadows = true;
    roots.push(merged);
    // convertit les sources de fumée locales en coordonnées monde
    for (let k = before; k < smokeSources.length; k++) {
      const p = smokeSources[k].pos;
      const cos = Math.cos(i.rot), sin = Math.sin(i.rot);
      smokeSources[k].pos = new Vector3(i.x + (p.x * cos + p.z * sin) * sc, y + p.y * sc, i.z + (-p.x * sin + p.z * cos) * sc);
    }
  }

  // Fumées
  const tex = new DynamicTexture('smokeTex', 64, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.hasAlpha = true;
  tex.update();
  const systems = smokeSources.map((s) => {
    const ps = new ParticleSystem('smoke', 120, scene);
    ps.particleTexture = tex;
    ps.emitter = s.pos;
    ps.minEmitBox = new Vector3(-0.01, 0, -0.01);
    ps.maxEmitBox = new Vector3(0.01, 0, 0.01);
    ps.color1 = s.steam ? new Color4(1, 1, 1, 0.55) : new Color4(0.75, 0.75, 0.76, 0.5);
    ps.color2 = s.steam ? new Color4(0.95, 0.96, 1, 0.45) : new Color4(0.55, 0.56, 0.58, 0.45);
    ps.colorDead = new Color4(0.8, 0.8, 0.8, 0);
    ps.minSize = 0.06; ps.maxSize = 0.22;
    ps.minLifeTime = 3; ps.maxLifeTime = 6;
    ps.emitRate = 8;
    ps.direction1 = new Vector3(0.1, 0.5, 0); ps.direction2 = new Vector3(0.3, 0.8, 0.1);
    ps.minEmitPower = 0.06; ps.maxEmitPower = 0.12;
    ps.gravity = new Vector3(0.03, 0.01, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    return { ps, steam: s.steam };
  });

  return {
    roots,
    animate: (dt: number) => { for (const r of rotors) r.rotation.z += dt * 2.2; },
    /** Débit des fumées proportionnel aux émissions industrielles et électriques (relatives à l'état initial). */
    setEmissionFactor: (k: number) => { for (const s of systems) s.ps.emitRate = s.steam ? 8 : Math.max(0, 8 * k); },
  };
}
