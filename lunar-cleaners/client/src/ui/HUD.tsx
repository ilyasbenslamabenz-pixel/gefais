// Interface en jeu : argent, soute, zone, outils, joueurs, mini-carte, objectif, chat.
import { useEffect, useRef, useState } from 'react';
import { MISSIONS, RESOURCES, RESOURCE_IDS, TOOLS, VEHICLES, xpToNext } from '../../../shared/data';
import { DUST_RES, STATION, WORLD_HALF, ZONES, ZONE_GOAL } from '../../../shared/world';
import { useStore } from '../store';
import { G } from '../game/state';
import { capacityClient, loadClient } from '../game/LocalPlayer';
import { equip, sendChat } from '../net/socket';
import { interact, toggleVehicle } from './Controls';
import { fmt } from './common';

function TopLeft() {
  const p = useStore((s) => s.profile);
  if (!p) return null;
  const need = xpToNext(p.level);
  return (
    <div className="hud-card hud-tl">
      <div className="hud-name">
        <span className="lvl-badge">{p.level}</span>
        <span>{p.name}</span>
      </div>
      <div className="xp-bar"><div style={{ width: `${(p.xp / need) * 100}%` }} /></div>
      <div className="hud-money">💰 {fmt(p.money)} <small>¢</small></div>
    </div>
  );
}

function ZoneBar() {
  const zi = useStore((s) => s.zoneIdx);
  const zones = useStore((s) => s.zones);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (zi < 0) return (
    <div className="hud-card hud-zone"><div className="zone-name" style={{ color: '#aab' }}>Terres sauvages</div><div className="zone-sub">Hors zone de mission</div></div>
  );
  const z = ZONES[zi];
  const zp = zones.find((q) => q.id === z.id);
  const clean = zp ? Math.max(0, zp.clean) : 0;
  const stormIn = zp?.storm ? Math.max(0, Math.round((zp.storm - Date.now()) / 1000)) : 0;
  return (
    <div className="hud-card hud-zone">
      <div className="zone-name" style={{ color: z.color }}>{z.name}</div>
      <div className="zone-bar">
        <div className="zone-fill" style={{ width: `${clean * 100}%`, background: z.color }} />
        <div className="zone-goal" style={{ left: `${ZONE_GOAL * 100}%` }} />
      </div>
      <div className="zone-sub">
        Propreté {Math.round(clean * 100)} % · objectif {ZONE_GOAL * 100} % · prime {fmt(z.reward)} ¢
        {zp && zp.completions > 0 && <> · ✅×{zp.completions}</>}
        {stormIn > 0 && <> · 🌪️ tempête dans {Math.floor(stormIn / 60)}:{String(stormIn % 60).padStart(2, '0')}</>}
      </div>
      <div className="zone-sub dim">Niveau conseillé {z.level} · dureté ×{z.hardness}</div>
    </div>
  );
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const roster = useStore((s) => s.roster);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  useEffect(() => {
    const S = 128;
    bg.current = document.createElement('canvas');
    bg.current.width = bg.current.height = S;
    const bctx = bg.current.getContext('2d')!;
    const img = bctx.createImageData(S, S);
    const step = DUST_RES / S;
    const refreshBg = () => {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const v = G.dust[(y * step) * DUST_RES + x * step] / 255;
          const k = (y * S + x) * 4;
          img.data[k] = 70 + v * 120;
          img.data[k + 1] = 85 + v * 90;
          img.data[k + 2] = 120 + v * 30;
          img.data[k + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);
    };
    refreshBg();
    let frame = 0;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      frame++;
      if (frame % 30 === 0) refreshBg();
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const W = c.width;
      const toPx = (v: number) => ((v + WORLD_HALF) / (WORLD_HALF * 2)) * W;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bg.current!, 0, 0, W, W);
      for (const z of ZONES) {
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(toPx(z.x), toPx(z.z), (z.r / (WORLD_HALF * 2)) * W, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(toPx(STATION.hub.x) - 4, toPx(STATION.hub.z) - 4, 8, 8);
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath(); ctx.arc(toPx(STATION.sell.x), toPx(STATION.sell.z), 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#4ecdc4';
      ctx.beginPath(); ctx.arc(toPx(STATION.shop.x), toPx(STATION.shop.z), 3, 0, 7); ctx.fill();
      for (const r of G.remotes.values()) {
        const e = rosterRef.current.find((q) => q.id === r.id);
        ctx.fillStyle = e?.look.accent ?? '#fff';
        ctx.beginPath();
        ctx.arc(toPx(r.pos.x), toPx(r.pos.z), 3.5, 0, 7);
        ctx.fill();
      }
      // joueur local (flèche)
      const me = G.me;
      ctx.save();
      ctx.translate(toPx(me.pos.x), toPx(me.pos.z));
      ctx.rotate(-me.ry + Math.PI);
      ctx.fillStyle = '#ff4d6d';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  const room = useStore((s) => s.room);
  return (
    <div className="hud-card hud-map">
      <canvas ref={ref} width={180} height={180} />
      <div className="map-info">Partie <b>{room?.id}</b> · {roster.length}/{room?.max ?? 16}</div>
    </div>
  );
}

function PlayerList() {
  const roster = useStore((s) => s.roster);
  return (
    <div className="hud-card hud-players">
      <div className="hud-title">Équipe ({roster.length})</div>
      {roster.map((r) => (
        <div key={r.id} className="pl-row">
          <span className="dot" style={{ background: r.look.accent }} />
          <span className="pl-name">{r.name}{r.id === G.me.id ? ' (vous)' : ''}</span>
          <span className="pl-lvl">Nv {r.level}</span>
        </div>
      ))}
    </div>
  );
}

function Objective() {
  const p = useStore((s) => s.profile);
  const openPanel = useStore((s) => s.openPanel);
  if (!p) return null;
  const m = MISSIONS.find((x) => !p.missionsClaimed.includes(x.id));
  const daily = p.daily.list.find((d) => !d.claimed);
  return (
    <div className="hud-card hud-obj" onClick={() => openPanel('missions')}>
      <div className="hud-title">🎯 Objectif actuel</div>
      {m ? (() => {
        const prog = Math.min(m.target, m.progress(p.stats, { tools: p.tools, vehicles: p.vehicles }));
        const done = prog >= m.target;
        return (
          <>
            <div className="obj-title">{m.title}</div>
            <div className="obj-desc">{m.desc}</div>
            <div className="mini-bar"><div style={{ width: `${(prog / m.target) * 100}%` }} /></div>
            <div className="obj-desc">{fmt(Math.floor(prog))} / {fmt(m.target)} {done && <b className="ok">→ Réclamez (M) !</b>}</div>
          </>
        );
      })() : <div className="obj-desc">Toutes les missions sont accomplies, bravo !</div>}
      {daily && (
        <div className="obj-daily">📅 {daily.title} — {Math.floor(daily.progress)}/{daily.target}</div>
      )}
    </div>
  );
}

function BottomBar() {
  const p = useStore((s) => s.profile);
  const vehicle = useStore((s) => s.vehicle);
  const autopilot = useStore((s) => s.autopilot);
  const brushes = useStore((s) => s.brushes);
  if (!p) return null;
  const cap = capacityClient(p, vehicle);
  const load = loadClient(p);
  const ratio = Math.min(1, load / cap);
  const v = VEHICLES.find((x) => x.id === vehicle);
  return (
    <div className="hud-bottom">
      <div className="load-wrap">
        <div className="load-label">
          <span>🎒 Soute</span>
          <span>{Math.floor(load)} / {cap}</span>
        </div>
        <div className={`load-bar ${ratio >= 1 ? 'full' : ratio > 0.8 ? 'warn' : ''}`}><div style={{ width: `${ratio * 100}%` }} /></div>
        <div className="res-row">
          {RESOURCE_IDS.map((r) => (
            <span key={r} title={RESOURCES[r].name} className={p.inventory[r] > 0 ? '' : 'dim'}>
              {RESOURCES[r].icon} {Math.floor(p.inventory[r])}
            </span>
          ))}
        </div>
      </div>
      {v ? (
        <div className="veh-status">
          <b>🚜 {v.name}</b>
          <span>Brosses {brushes ? 'ON' : 'OFF'} (F){v.autopilot ? ` · Pilote auto ${autopilot ? 'ON' : 'OFF'} (R)` : ''} · V : descendre</span>
        </div>
      ) : (
        <div className="toolbar">
          {TOOLS.map((t) => {
            const owned = p.tools.includes(t.id);
            return (
              <button key={t.id} className={`tool-slot ${p.equipped === t.id ? 'active' : ''} ${owned ? '' : 'locked'}`} onClick={() => owned && equip(t.id)} title={t.name}>
                <span className="key">{t.id}</span>
                <span className="tool-ico" style={{ background: owned ? t.color : '#333a' }}>{owned ? TOOL_ICONS[t.id] : '🔒'}</span>
              </button>
            );
          })}
          <div className="tool-name">{TOOLS.find((t) => t.id === p.equipped)?.name}</div>
        </div>
      )}
    </div>
  );
}

export const TOOL_ICONS: Record<number, string> = { 1: '🪥', 2: '🧹', 3: '🔫', 4: '🌀', 5: '⚙️', 6: '🤖', 7: '🛸' };

function Prompt() {
  const prompt = useStore((s) => s.prompt);
  const p = useStore((s) => s.profile);
  if (!prompt || !p) return null;
  let text = '';
  if (prompt === 'sell') {
    const mul = 1 + 0.1 * (p.upgrades.refinery || 0);
    const val = Math.round(RESOURCE_IDS.reduce((s, r) => s + (r === 'dust' ? Math.floor(p.inventory[r]) : p.inventory[r]) * RESOURCES[r].price * mul, 0));
    text = `Vendre la récolte (${fmt(val)} ¢)`;
  } else if (prompt === 'shop') text = 'Ouvrir la boutique';
  else if (prompt === 'garage') text = 'Garage : acheter / choisir un véhicule';
  return (
    <button className="prompt" onClick={interact}>
      <span className="key big">E</span> {text}
    </button>
  );
}

function Floaters() {
  const floaters = useStore((s) => s.floaters);
  return (
    <div className="floaters">
      {floaters.map((f) => (
        <div key={f.id} className="floater" style={{ color: f.color }}>{f.text}</div>
      ))}
    </div>
  );
}

function Chat() {
  const chat = useStore((s) => s.chat);
  const open = useStore((s) => s.chatOpen);
  const set = useStore((s) => s.set);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { list.current?.scrollTo(0, 1e6); }, [chat, open]);
  const recent = open ? chat : chat.filter((m) => Date.now() - m.t < 12000);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 2000); return () => clearInterval(t); }, []);
  return (
    <div className={`hud-chat ${open ? 'open' : ''}`}>
      <div className="chat-list" ref={list}>
        {recent.slice(-30).map((m, i) => (
          <div key={i} className={`chat-msg ${m.sys ? 'sys' : ''}`}>
            {!m.sys && <b style={{ color: m.color }}>{m.from} : </b>}
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      {open ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) sendChat(text); setText(''); set({ chatOpen: false }); }}>
          <input ref={input} value={text} maxLength={200} placeholder="Message à l'équipe… (Entrée pour envoyer, Échap pour fermer)" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { set({ chatOpen: false }); setText(''); } }} onBlur={() => setTimeout(() => set({ chatOpen: false }), 100)} />
        </form>
      ) : (
        <div className="chat-hint" onClick={() => set({ chatOpen: true })}>Entrée : discuter</div>
      )}
    </div>
  );
}

function Fps() {
  const show = useStore((s) => s.settings.showFps);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!show) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last > 1000) { setFps(Math.round((frames * 1000) / (now - last))); frames = 0; last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [show]);
  return show ? <div className="fps">{fps} FPS</div> : null;
}

function QuickButtons() {
  const openPanel = useStore((s) => s.openPanel);
  const set = useStore((s) => s.set);
  return (
    <div className="quick-btns">
      <button onClick={() => { set({ shopTab: 'tools' }); openPanel('shop'); }} title="Boutique (B)">🛒</button>
      <button onClick={() => openPanel('inventory')} title="Inventaire (I)">🎒</button>
      <button onClick={() => openPanel('missions')} title="Missions (M)">🎯</button>
      <button onClick={() => openPanel('leaderboard')} title="Classement (L)">🏆</button>
      <button onClick={toggleVehicle} title="Véhicule (V)">🚜</button>
      <button onClick={() => openPanel('pause')} title="Menu (Échap)">☰</button>
    </div>
  );
}

function LockHint() {
  const locked = useStore((s) => s.locked);
  const panel = useStore((s) => s.panel);
  const chatOpen = useStore((s) => s.chatOpen);
  if (locked || panel || chatOpen || 'ontouchstart' in window) return null;
  return <div className="lock-hint">🖱️ Cliquez sur le jeu pour prendre le contrôle</div>;
}

export function HUD() {
  const locked = useStore((s) => s.locked);
  return (
    <div className="hud">
      <TopLeft />
      <ZoneBar />
      <Minimap />
      <PlayerList />
      <Objective />
      <BottomBar />
      <Prompt />
      <Floaters />
      <Chat />
      <Fps />
      <QuickButtons />
      <LockHint />
      {locked && <div className="crosshair" />}
    </div>
  );
}
