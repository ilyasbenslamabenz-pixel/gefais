import * as THREE from 'three';
import { hashString } from '../../../shared/noise';

/** Même formule que le serveur : position orbitale du drone autonome. */
export function droneAngleClient(now: number, id: string) {
  return (now / 1000) * 1.3 + (hashString(id) % 628) / 100;
}

export function makeLabelTexture(name: string, level: number, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 26px Nunito, sans-serif';
  const text = `${name}`;
  const w = Math.min(240, ctx.measureText(text).width + 70);
  const x0 = (256 - w) / 2;
  ctx.fillStyle = 'rgba(10,14,30,0.72)';
  ctx.beginPath();
  ctx.roundRect(x0, 10, w, 44, 22);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x0 + 24, 32, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0e1e';
  ctx.font = 'bold 16px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(level), x0 + 24, 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Nunito, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(text, x0 + 46, 41, w - 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
