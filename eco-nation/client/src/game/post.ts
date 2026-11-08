// Rendu cinématographique : pipeline de post-traitement (HDR, bloom, étalonnage chaud, vignettage, anticrénelage,
// occlusion ambiante en qualité haute) et réglage de l'heure (heure dorée par défaut, comme l'image de référence).
import { Color4, ColorCurves, DefaultRenderingPipeline, ImageProcessingConfiguration, SSAO2RenderingPipeline, type Camera, type Scene } from '@babylonjs/core';
import type { Quality, TimeMode } from '../store';
import { ENV } from './terrain';

export type { TimeMode };

/** Position du soleil dans la journée (0 = minuit, 0,5 = midi) selon le mode d'heure choisi. */
export function timeOfDay(mode: TimeMode, elapsedSec: number, dayLength: number): number {
  if (mode === 'golden') return 0.728 + Math.sin(elapsedSec * 0.05) * 0.004; // soleil bas, ville qui s'allume
  if (mode === 'day') return 0.56;
  if (mode === 'night') return 0.93;
  return ((elapsedSec / dayLength) + 0.35) % 1;
}

export function createPostProcessing(scene: Scene, camera: Camera, quality: Quality) {
  if (quality === 'low') {
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.05;
    return { update: () => {}, dispose: () => {} };
  }
  const p = new DefaultRenderingPipeline('cine', true, scene, [camera]);
  p.samples = quality === 'high' ? 4 : 1;
  p.fxaaEnabled = quality !== 'high';
  p.bloomEnabled = true;
  p.bloomKernel = 64;
  p.bloomScale = 0.5;
  p.bloomWeight = 0.35;
  p.bloomThreshold = 0.82;
  p.imageProcessingEnabled = true;
  const ip = p.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.1;
  ip.contrast = 1.12;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.6;
  ip.vignetteColor = new Color4(0.12, 0.05, 0.02, 0);
  ip.colorCurvesEnabled = true;
  const curves = new ColorCurves();
  curves.globalSaturation = 18;
  curves.highlightsHue = 35; // hautes lumières dorées
  curves.highlightsDensity = 25;
  curves.highlightsSaturation = 30;
  curves.shadowsHue = 215; // ombres bleutées
  curves.shadowsDensity = 20;
  curves.shadowsSaturation = 25;
  ip.colorCurves = curves;
  p.sharpenEnabled = quality === 'high';
  if (p.sharpenEnabled) p.sharpen.edgeAmount = 0.25;
  let ssao: SSAO2RenderingPipeline | null = null;
  if (quality === 'high') {
    ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 0.02;
    ssao.totalStrength = 1.1;
    ssao.samples = 16;
    ssao.maxZ = 60;
  }
  return {
    update: () => {
      // le soir, le bloom fait rayonner fenêtres, lampadaires et soleil couchant
      p.bloomWeight = 0.3 + ENV.night * 0.35;
      p.bloomThreshold = 0.85 - ENV.night * 0.25;
      ip.exposure = 1.1 + ENV.night * 0.25;
    },
    dispose: () => { p.dispose(); ssao?.dispose(); },
  };
}
