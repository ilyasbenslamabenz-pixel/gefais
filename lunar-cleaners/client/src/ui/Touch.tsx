// Commandes tactiles (tablette / mobile) : joystick virtuel, caméra au doigt, boutons d'action.
import { useEffect, useRef, useState } from 'react';
import { G } from '../game/state';
import { interact, toggleVehicle } from './Controls';
import { unlockAudio } from '../audio';

export function TouchControls() {
  const [enabled] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const joyId = useRef<number | null>(null);
  const camId = useRef<number | null>(null);
  const camLast = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;
    const onStart = (e: TouchEvent) => {
      unlockAudio();
      for (const t of Array.from(e.changedTouches)) {
        const el = t.target as HTMLElement;
        if (el.closest('.touch-btn') || el.closest('.hud-card') || el.closest('.modal') || el.closest('.quick-btns')) continue;
        if (t.clientX < window.innerWidth * 0.4 && joyId.current === null) {
          joyId.current = t.identifier;
          updateJoy(t);
        } else if (camId.current === null) {
          camId.current = t.identifier;
          camLast.current = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const updateJoy = (t: Touch) => {
      const b = base.current?.getBoundingClientRect();
      if (!b) return;
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      let dx = (t.clientX - cx) / (b.width / 2);
      let dy = (t.clientY - cy) / (b.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      G.input.joy.x = dx;
      G.input.joy.y = -dy;
      setKnob({ x: dx, y: dy });
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyId.current) updateJoy(t);
        if (t.identifier === camId.current) {
          G.cam.yaw -= (t.clientX - camLast.current.x) * 0.006;
          G.cam.pitch = Math.max(-0.2, Math.min(1.3, G.cam.pitch + (t.clientY - camLast.current.y) * 0.006));
          camLast.current = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyId.current) { joyId.current = null; G.input.joy.x = 0; G.input.joy.y = 0; setKnob({ x: 0, y: 0 }); }
        if (t.identifier === camId.current) camId.current = null;
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="touch">
      <div className="joy" ref={base}>
        <div className="joy-knob" style={{ transform: `translate(${knob.x * 40}px, ${knob.y * 40}px)` }} />
      </div>
      <div className="touch-actions">
        <button className="touch-btn clean" onTouchStart={() => (G.input.touchClean = true)} onTouchEnd={() => (G.input.touchClean = false)}>🧹</button>
        <button className="touch-btn" onTouchStart={() => (G.input.jump = true)}>⤴</button>
        <button className="touch-btn" onTouchStart={() => interact()}>E</button>
        <button className="touch-btn" onTouchStart={() => toggleVehicle()}>🚜</button>
      </div>
    </div>
  );
}
