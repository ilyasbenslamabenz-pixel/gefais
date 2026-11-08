// Gestion clavier / souris / pointer-lock pendant la partie.
import { useEffect } from 'react';
import { VEHICLES } from '../../../shared/data';
import { useStore } from '../store';
import { G } from '../game/state';
import { equip, sell } from '../net/socket';
import { sfx, unlockAudio } from '../audio';

export function toggleVehicle() {
  const st = useStore.getState();
  const p = st.profile;
  if (!p) return;
  const me = G.me;
  if (me.vehicle) {
    const v = VEHICLES.find((x) => x.id === me.vehicle);
    const off = (v?.size ?? 1) + 1.2;
    me.pos.x += Math.cos(me.vehRot) * off;
    me.pos.z -= Math.sin(me.vehRot) * off;
    me.pos.y += 1;
    me.vel.set(0, 0, 0);
    me.vehicle = '';
    st.set({ vehicle: '', autopilot: false });
    st.toast('Vous descendez du véhicule.');
    return;
  }
  if (!p.vehicles.length) {
    st.toast('Aucun véhicule : achetez-en un dans la boutique (B → Véhicules).', 'warn');
    sfx.error();
    return;
  }
  const id = p.vehicles.includes(st.selectedVehicle) ? st.selectedVehicle : p.vehicles[p.vehicles.length - 1];
  me.vehicle = id;
  me.vehRot = me.ry;
  me.vehSpeed = 0;
  st.set({ vehicle: id, brushes: true });
  const v = VEHICLES.find((x) => x.id === id)!;
  st.toast(`${v.name} : ZQSD/WASD pour conduire, F brosses on/off${v.autopilot ? ', R pilote auto' : ''}, V pour descendre.`, 'good');
  sfx.engine();
}

export function interact() {
  const st = useStore.getState();
  if (st.prompt === 'sell') sell();
  else if (st.prompt === 'shop') { st.set({ shopTab: 'tools' }); st.openPanel('shop'); }
  else if (st.prompt === 'garage') { st.set({ shopTab: 'vehicles' }); st.openPanel('shop'); }
}

export function Controls() {
  useEffect(() => {
    const canvas = () => document.querySelector('#game-root canvas') as HTMLCanvasElement | null;
    const isTyping = (e: Event) => {
      const t = e.target as HTMLElement;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useStore.getState();
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Escape') {
        if (st.panel) st.openPanel(null);
        return;
      }
      if (e.code === 'Enter') {
        e.preventDefault();
        if (!st.panel) {
          if (document.pointerLockElement) document.exitPointerLock();
          st.set({ chatOpen: true });
        }
        return;
      }
      if (st.panel || st.chatOpen) {
        // raccourcis pour fermer le panneau courant
        const map: Record<string, string> = { KeyB: 'shop', KeyI: 'inventory', KeyM: 'missions', KeyL: 'leaderboard', KeyH: 'help', Tab: 'leaderboard' };
        if (map[e.code] && st.panel === map[e.code]) st.openPanel(null);
        return;
      }
      G.input.keys.add(e.code);
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyE': interact(); break;
        case 'KeyV': toggleVehicle(); break;
        case 'KeyR':
          if (G.me.vehicle && VEHICLES.find((v) => v.id === G.me.vehicle)?.autopilot) {
            st.set({ autopilot: !st.autopilot });
            st.toast(`Pilote automatique ${!st.autopilot ? 'activé' : 'désactivé'}`, 'good');
          }
          break;
        case 'KeyF':
          if (G.me.vehicle) { st.set({ brushes: !st.brushes }); st.toast(`Brosses ${!st.brushes ? 'activées' : 'désactivées'}`); }
          break;
        case 'KeyB': st.set({ shopTab: 'tools' }); st.openPanel('shop'); break;
        case 'KeyI': st.openPanel('inventory'); break;
        case 'KeyM': st.openPanel('missions'); break;
        case 'KeyL': case 'Tab': st.openPanel('leaderboard'); break;
        case 'KeyH': st.openPanel('help'); break;
        default:
          if (e.code.startsWith('Digit')) {
            const n = Number(e.code.slice(5));
            if (n >= 1 && n <= 7) {
              if (st.profile?.tools.includes(n)) { equip(n); sfx.click(); }
              else { st.toast('Outil non possédé — voir la boutique (B)', 'warn'); }
            }
          }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => G.input.keys.delete(e.code);
    const onBlur = () => { G.input.keys.clear(); G.input.mouseDown = false; };

    const onMouseDown = (e: MouseEvent) => {
      const st = useStore.getState();
      const c = canvas();
      if (!c || e.target !== c || st.panel) return;
      unlockAudio();
      if (st.chatOpen) st.set({ chatOpen: false });
      if (document.pointerLockElement !== c) {
        if (!('ontouchstart' in window)) {
          const req = c.requestPointerLock() as unknown as Promise<void> | undefined;
          req?.catch?.(() => {});
        }
        return;
      }
      if (e.button === 0) G.input.mouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) G.input.mouseDown = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const s = useStore.getState().settings;
      const k = 0.0024 * s.sensitivity;
      G.cam.yaw -= e.movementX * k;
      G.cam.pitch += e.movementY * k * (s.invertY ? -1 : 1);
      G.cam.pitch = Math.max(-0.2, Math.min(1.3, G.cam.pitch));
    };
    const onWheel = (e: WheelEvent) => {
      if (useStore.getState().panel) return;
      G.cam.dist = Math.max(3, Math.min(18, G.cam.dist + Math.sign(e.deltaY) * 0.8));
    };
    const onLock = () => {
      const st = useStore.getState();
      const locked = !!document.pointerLockElement;
      st.set({ locked });
      if (!locked) {
        G.input.mouseDown = false;
        G.input.keys.clear();
        if (!st.panel && !st.chatOpen && st.screen === 'game') st.openPanel('pause');
      }
    };
    const onContext = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLock);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLock);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);
  return null;
}
