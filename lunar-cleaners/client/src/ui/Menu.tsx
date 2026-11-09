// Menu principal avec décor 3D animé.
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { joinRoom } from '../net/socket';
import { unlockAudio, sfx } from '../audio';
import { Sky } from '../game/Sky';
import { Terrain } from '../game/Terrain';
import { Props } from '../game/World';
import { Astronaut, VehicleModel, type AnimRef } from '../game/models';
import { heightAt } from '../../../shared/world';
import { fmt } from './common';
import { DEFAULT_LOOK } from '../../../shared/protocol';

function MenuCamera() {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime * 0.05;
    camera.position.set(Math.sin(t) * 26, 7 + Math.sin(t * 2) * 1.5, Math.cos(t) * 26 + 4);
    camera.lookAt(0, 2.5, 4);
  });
  return null;
}

function Hero() {
  const profile = useStore((s) => s.profile);
  const anim = useRef<AnimRef>({ speed: 0, cleaning: true, air: false, sit: false });
  const spin = useRef(1);
  return (
    <>
      <group position={[2, heightAt(2, 7), 7]} rotation={[0, 0.6, 0]}>
        <Astronaut look={profile?.look ?? DEFAULT_LOOK} tool={profile?.equipped ?? 2} anim={anim} />
      </group>
      <group position={[-4, heightAt(-4, 13), 13]} rotation={[0, 2.2, 0]}>
        <VehicleModel id="tractor" spin={spin} color="#ff8c42" />
      </group>
    </>
  );
}

function MenuScene() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 55, near: 0.1, far: 2000 }} onCreated={({ gl, scene }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      scene.background = new THREE.Color('#04050c');
      scene.fog = new THREE.Fog('#0b0d1c', 120, 300);
    }}>
      <hemisphereLight args={['#9fb8ff', '#5a4a3a', 0.6]} />
      <directionalLight position={[50, 60, 30]} intensity={3} color="#fff4e0" />
      <Sky starCount={2000} />
      <Terrain segments={160} />
      <Props />
      <Hero />
      <MenuCamera />
    </Canvas>
  );
}

export function MainMenu() {
  const connected = useStore((s) => s.connected);
  const profile = useStore((s) => s.profile);
  const openPanel = useStore((s) => s.openPanel);
  const set = useStore((s) => s.set);
  const go = (fn: () => void) => () => { unlockAudio(); sfx.click(); fn(); };
  return (
    <div className="menu">
      <div className="menu-bg"><MenuScene /></div>
      <div className="menu-overlay">
        <div className="menu-left">
          <h1 className="logo">LUNAR<span>CLEANERS</span></h1>
          <p className="tagline">La Lune est sale. Vous êtes la solution. 🌕🧹</p>
          <div className="menu-buttons">
            <button className="btn primary huge" disabled={!connected} onClick={go(() => joinRoom('ALPHA'))}>▶ JOUER</button>
            <div className="menu-row">
              <button className="btn" disabled={!connected} onClick={go(() => openPanel('rooms'))}>🌐 Rejoindre une partie</button>
              <button className="btn" disabled={!connected} onClick={go(() => openPanel('create'))}>✨ Créer une partie</button>
            </div>
            <div className="menu-row">
              <button className="btn" disabled={!profile} onClick={go(() => { set({ shopTab: 'tools' }); openPanel('shop'); })}>🛒 Boutique</button>
              <button className="btn" disabled={!profile} onClick={go(() => openPanel('inventory'))}>🎒 Inventaire</button>
              <button className="btn" disabled={!profile} onClick={go(() => openPanel('missions'))}>🎯 Missions</button>
            </div>
            <div className="menu-row">
              <button className="btn" disabled={!profile} onClick={go(() => openPanel('profile'))}>👩‍🚀 Profil</button>
              <button className="btn" disabled={!connected} onClick={go(() => openPanel('leaderboard'))}>🏆 Classement</button>
              <button className="btn" onClick={go(() => openPanel('settings'))}>⚙️ Paramètres</button>
            </div>
            <button className="btn ghost" onClick={go(() => openPanel('help'))}>❓ Comment jouer</button>
          </div>
        </div>
        <div className="menu-right">
          <div className="status-card">
            <div className={`conn ${connected ? 'on' : ''}`}>{connected ? '● Connecté au serveur' : '○ Connexion au serveur…'}</div>
            {profile && (
              <>
                <div className="p-name"><span className="lvl-badge">{profile.level}</span> {profile.name}</div>
                <div className="p-money">💰 {fmt(profile.money)} ¢</div>
                <div className="muted small">Gains totaux : {fmt(profile.stats.totalEarned)} ¢</div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="menu-foot">Multijoueur coopératif jusqu'à 16 joueurs · Progression sauvegardée automatiquement</div>
    </div>
  );
}
