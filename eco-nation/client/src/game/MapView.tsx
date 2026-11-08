// Composant React hébergeant la scène Babylon.js.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { createWorld } from './world';

export function MapView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const country = useStore((s) => s.country);
  const quality = useStore((s) => s.settings.quality);
  useEffect(() => {
    if (!canvas.current || !labels.current || !country) return;
    let dispose: (() => void) | null = null;
    try {
      dispose = createWorld(canvas.current, country, quality, labels.current);
    } catch (e) {
      console.error(e);
      useStore.getState().toast("Impossible d'initialiser la 3D (WebGL indisponible ?)", 'bad');
    }
    return () => dispose?.();
  }, [country, quality]);
  return (
    <>
      <canvas ref={canvas} className="map-canvas" onContextMenu={(e) => e.preventDefault()} />
      <div ref={labels} id="labels" className="labels" />
    </>
  );
}
