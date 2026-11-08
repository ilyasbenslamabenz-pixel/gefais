// Panneaux : boutique, inventaire, missions, profil, paramètres, classement, parties, pause, aide.
import { useEffect, useState } from 'react';
import { MISSIONS, RESOURCES, RESOURCE_IDS, TOOLS, UPGRADES, VEHICLES, upgradePrice } from '../../../shared/data';
import { MAX_PLAYERS, ZONES, ZONE_GOAL } from '../../../shared/world';
import type { PlayerLook, RoomInfo } from '../../../shared/protocol';
import { useStore } from '../store';
import { buy, claim, equip, joinRoom, leaveRoom, request, updateProfile } from '../net/socket';
import { sfx } from '../audio';
import { Modal, Stat, fmt } from './common';
import { TOOL_ICONS } from './HUD';
import { capacityClient, loadClient } from '../game/LocalPlayer';
import { AstronautPreview } from './Preview';

function NeedProfile({ children }: { children: (p: NonNullable<ReturnType<typeof useStore.getState>['profile']>) => React.ReactNode }) {
  const p = useStore((s) => s.profile);
  if (!p) return <p className="muted">Connexion au serveur…</p>;
  return <>{children(p)}</>;
}

// ---------- Boutique ----------
function ShopPanel() {
  const tab = useStore((s) => s.shopTab);
  const set = useStore((s) => s.set);
  return (
    <Modal title="🛒 Boutique de la station" wide>
      <NeedProfile>
        {(p) => (
          <>
            <div className="shop-head">
              <div className="tabs">
                <button className={tab === 'tools' ? 'on' : ''} onClick={() => set({ shopTab: 'tools' })}>🧹 Outils</button>
                <button className={tab === 'vehicles' ? 'on' : ''} onClick={() => set({ shopTab: 'vehicles' })}>🚜 Véhicules</button>
                <button className={tab === 'upgrades' ? 'on' : ''} onClick={() => set({ shopTab: 'upgrades' })}>🏭 Base & améliorations</button>
              </div>
              <div className="wallet">💰 {fmt(p.money)} ¢ · Niveau {p.level}</div>
            </div>
            <div className="cards">
              {tab === 'tools' && TOOLS.map((t) => {
                const owned = p.tools.includes(t.id);
                const lock = p.level < t.level;
                const poor = p.money < t.price;
                return (
                  <div key={t.id} className={`card ${owned ? 'owned' : ''} ${lock ? 'locked' : ''}`}>
                    <div className="card-ico" style={{ background: t.color }}>{TOOL_ICONS[t.id]}</div>
                    <div className="card-title">Nv.{t.id} — {t.name}</div>
                    <div className="card-desc">{t.desc}</div>
                    <div className="card-stats">
                      <Stat label="Puissance" value={t.power} />
                      <Stat label="Rayon" value={`${t.radius} m`} />
                      <Stat label="Capacité" value={t.capacity} />
                      <Stat label="Vitesse" value={`×${t.speed}`} />
                    </div>
                    {owned ? (
                      <button className="btn" disabled={p.equipped === t.id} onClick={() => { equip(t.id); sfx.click(); }}>{p.equipped === t.id ? 'Équipé' : 'Équiper'}</button>
                    ) : (
                      <button className="btn primary" disabled={lock || poor} onClick={() => buy('tool', t.id)}>
                        {lock ? `🔒 Niveau ${t.level}` : `Acheter ${fmt(t.price)} ¢`}
                      </button>
                    )}
                  </div>
                );
              })}
              {tab === 'vehicles' && VEHICLES.map((v) => {
                const owned = p.vehicles.includes(v.id);
                const lock = p.level < v.level;
                const poor = p.money < v.price;
                const sel = useStore.getState().selectedVehicle === v.id;
                return (
                  <div key={v.id} className={`card ${owned ? 'owned' : ''} ${lock ? 'locked' : ''}`}>
                    <div className="card-ico" style={{ background: v.color }}>{VEH_ICONS[v.id]}</div>
                    <div className="card-title">{v.name}</div>
                    <div className="card-desc">{v.desc}</div>
                    <div className="card-stats">
                      <Stat label="Vitesse" value={`${v.speed} m/s`} />
                      <Stat label="Rayon" value={`${v.radius} m`} />
                      <Stat label="Puissance" value={v.power} />
                      <Stat label="Soute +" value={v.capacityBonus} />
                    </div>
                    {owned ? (
                      <button className="btn" disabled={sel} onClick={() => { useStore.getState().set({ selectedVehicle: v.id }); localStorage.setItem('lc_vehicle', v.id); sfx.click(); }}>
                        {sel ? 'Sélectionné (touche V)' : 'Sélectionner'}
                      </button>
                    ) : (
                      <button className="btn primary" disabled={lock || poor} onClick={() => buy('vehicle', v.id)}>
                        {lock ? `🔒 Niveau ${v.level}` : `Acheter ${fmt(v.price)} ¢`}
                      </button>
                    )}
                  </div>
                );
              })}
              {tab === 'upgrades' && UPGRADES.map((u) => {
                const lvl = p.upgrades[u.id] || 0;
                const max = lvl >= u.maxLevel;
                const price = upgradePrice(u, lvl);
                return (
                  <div key={u.id} className="card">
                    <div className="card-ico" style={{ background: '#2d3561' }}>{u.icon}</div>
                    <div className="card-title">{u.name}</div>
                    <div className="card-desc">{u.desc}</div>
                    <div className="pips">{Array.from({ length: u.maxLevel }, (_, i) => <span key={i} className={i < lvl ? 'on' : ''} />)}</div>
                    <button className="btn primary" disabled={max || p.money < price} onClick={() => buy('upgrade', u.id)}>
                      {max ? 'Niveau max' : `Niveau ${lvl + 1} — ${fmt(price)} ¢`}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </NeedProfile>
    </Modal>
  );
}

export const VEH_ICONS: Record<string, string> = { robot: '🤖', tractor: '🚜', industrial: '🏗️', truck: '🚛', giant: '🦾' };

// ---------- Inventaire ----------
function InventoryPanel() {
  const vehicle = useStore((s) => s.vehicle);
  const selected = useStore((s) => s.selectedVehicle);
  return (
    <Modal title="🎒 Inventaire" wide>
      <NeedProfile>
        {(p) => {
          const mul = 1 + 0.1 * (p.upgrades.refinery || 0);
          const total = RESOURCE_IDS.reduce((s, r) => s + Math.floor(p.inventory[r]) * RESOURCES[r].price * mul, 0);
          return (
            <div className="inv-grid">
              <section>
                <h3>Ressources ({Math.floor(loadClient(p))} / {capacityClient(p, vehicle)})</h3>
                <table className="table">
                  <thead><tr><th>Ressource</th><th>Qté</th><th>Prix</th><th>Valeur</th></tr></thead>
                  <tbody>
                    {RESOURCE_IDS.map((r) => (
                      <tr key={r}>
                        <td>{RESOURCES[r].icon} {RESOURCES[r].name}</td>
                        <td>{Math.floor(p.inventory[r])}</td>
                        <td>{(RESOURCES[r].price * mul).toFixed(1)} ¢</td>
                        <td>{fmt(Math.floor(p.inventory[r]) * RESOURCES[r].price * mul)} ¢</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">Valeur totale : <b>{fmt(total)} ¢</b> — vendez au <b style={{ color: '#ffd93d' }}>Collecteur</b> (borne jaune de la station, touche E).</p>
                <h3>Portefeuille</h3>
                <div className="big-money">💰 {fmt(p.money)} ¢</div>
              </section>
              <section>
                <h3>Outils possédés</h3>
                <div className="chips">
                  {TOOLS.filter((t) => p.tools.includes(t.id)).map((t) => (
                    <button key={t.id} className={`chip ${p.equipped === t.id ? 'on' : ''}`} onClick={() => equip(t.id)}>{TOOL_ICONS[t.id]} {t.name}</button>
                  ))}
                </div>
                <h3>Garage</h3>
                {p.vehicles.length === 0 ? <p className="muted">Aucun véhicule pour l'instant (dès le niveau 4).</p> : (
                  <div className="chips">
                    {VEHICLES.filter((v) => p.vehicles.includes(v.id)).map((v) => (
                      <button key={v.id} className={`chip ${selected === v.id ? 'on' : ''}`} onClick={() => { useStore.getState().set({ selectedVehicle: v.id }); localStorage.setItem('lc_vehicle', v.id); }}>{VEH_ICONS[v.id]} {v.name}</button>
                    ))}
                  </div>
                )}
                <h3>Améliorations de la base</h3>
                {UPGRADES.map((u) => (
                  <div key={u.id} className="upg-row"><span>{u.icon} {u.name}</span><b>{p.upgrades[u.id] || 0} / {u.maxLevel}</b></div>
                ))}
              </section>
            </div>
          );
        }}
      </NeedProfile>
    </Modal>
  );
}

// ---------- Missions ----------
function MissionsPanel() {
  const zones = useStore((s) => s.zones);
  const room = useStore((s) => s.room);
  return (
    <Modal title="🎯 Missions & objectifs" wide>
      <NeedProfile>
        {(p) => {
          const owned = { tools: p.tools, vehicles: p.vehicles };
          const nextIdx = MISSIONS.findIndex((m) => !p.missionsClaimed.includes(m.id));
          return (
            <div className="inv-grid">
              <section>
                <h3>Carrière</h3>
                {MISSIONS.map((m, i) => {
                  const claimed = p.missionsClaimed.includes(m.id);
                  const prog = Math.min(m.target, m.progress(p.stats, owned));
                  const current = i === nextIdx;
                  if (!claimed && !current && i > nextIdx + 1) return null;
                  return (
                    <div key={m.id} className={`mission ${claimed ? 'done' : current ? 'cur' : 'next'}`}>
                      <div className="m-head"><b>{claimed ? '✅' : current ? '▶️' : '🔒'} {m.title}</b><span>+{fmt(m.reward)} ¢ · {m.xp} XP</span></div>
                      <div className="m-desc">{m.desc}</div>
                      {!claimed && current && (
                        <>
                          <div className="mini-bar"><div style={{ width: `${(prog / m.target) * 100}%` }} /></div>
                          <div className="m-foot">
                            <span>{fmt(prog)} / {fmt(m.target)}</span>
                            <button className="btn primary sm" disabled={prog < m.target} onClick={() => claim('mission', m.id)}>Réclamer</button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
              <section>
                <h3>Objectifs quotidiens <small className="muted">({p.daily.day})</small></h3>
                {p.daily.list.map((d) => (
                  <div key={d.id} className={`mission ${d.claimed ? 'done' : 'cur'}`}>
                    <div className="m-head"><b>{d.claimed ? '✅' : '📅'} {d.title}</b><span>+{fmt(d.reward)} ¢</span></div>
                    <div className="mini-bar"><div style={{ width: `${(d.progress / d.target) * 100}%` }} /></div>
                    <div className="m-foot">
                      <span>{fmt(d.progress)} / {fmt(d.target)}</span>
                      {!d.claimed && <button className="btn primary sm" disabled={d.progress < d.target} onClick={() => claim('daily', d.id)}>Réclamer</button>}
                    </div>
                  </div>
                ))}
                <h3>Certification des zones (coopératif)</h3>
                {!room && <p className="muted">Rejoignez une partie pour voir l'état des zones.</p>}
                {ZONES.map((z) => {
                  const zp = zones.find((q) => q.id === z.id);
                  const c = zp ? Math.max(0, zp.clean) : 0;
                  return (
                    <div key={z.id} className="zone-row">
                      <div className="m-head"><b style={{ color: z.color }}>{z.name}</b><span>Nv {z.level} · prime {fmt(z.reward)} ¢</span></div>
                      <div className="m-desc">{z.desc}</div>
                      {room && (
                        <div className="zone-bar sm">
                          <div className="zone-fill" style={{ width: `${c * 100}%`, background: z.color }} />
                          <div className="zone-goal" style={{ left: `${ZONE_GOAL * 100}%` }} />
                        </div>
                      )}
                      {room && <div className="m-desc">{Math.round(c * 100)} % propre {zp && zp.completions ? `· certifiée ${zp.completions}×` : ''}</div>}
                    </div>
                  );
                })}
              </section>
            </div>
          );
        }}
      </NeedProfile>
    </Modal>
  );
}

// ---------- Profil ----------
const SUITS = ['#f4f4f8', '#ffd93d', '#ff8c42', '#ff6b6b', '#6bcB77', '#4ecdc4', '#45b7ff', '#a66bff', '#ff6bd6', '#3a4150'];
const VISORS = ['#ffb347', '#6ff3ff', '#ff6bd6', '#7ee8a2', '#ffd93d', '#c46bff', '#1d1f2b', '#ff4d6d'];
const HATS: { id: PlayerLook['hat']; label: string }[] = [
  { id: 'none', label: 'Aucun' }, { id: 'antenna', label: 'Antenne' }, { id: 'crest', label: 'Crête' }, { id: 'halo', label: 'Auréole' }, { id: 'cap', label: 'Casquette' },
];

function ProfilePanel() {
  const p = useStore((s) => s.profile);
  const [name, setName] = useState(p?.name ?? '');
  const [look, setLook] = useState<PlayerLook | null>(p?.look ?? null);
  useEffect(() => { if (p && !look) { setLook(p.look); setName(p.name); } }, [p, look]);
  if (!p || !look) return <Modal title="👩‍🚀 Profil"><p className="muted">Connexion…</p></Modal>;
  const save = () => { updateProfile({ name, look }); sfx.buy(); useStore.getState().toast('Profil enregistré !', 'good'); };
  const Swatches = ({ list, k }: { list: string[]; k: 'suit' | 'visor' | 'accent' }) => (
    <div className="swatches">
      {list.map((c) => <button key={c} className={look[k] === c ? 'on' : ''} style={{ background: c }} onClick={() => setLook({ ...look, [k]: c })} aria-label={c} />)}
    </div>
  );
  return (
    <Modal title="👩‍🚀 Profil & personnalisation" wide>
      <div className="inv-grid">
        <section>
          <div className="preview-box"><AstronautPreview look={look} tool={p.equipped} /></div>
          <h3>Statistiques</h3>
          <div className="card-stats">
            <Stat label="Niveau" value={p.level} />
            <Stat label="Gains totaux" value={`${fmt(p.stats.totalEarned)} ¢`} />
            <Stat label="Poussière récoltée" value={fmt(p.stats.dustCollected)} />
            <Stat label="Débris détruits" value={p.stats.debrisDestroyed} />
            <Stat label="Ventes" value={p.stats.sells} />
            <Stat label="Zones certifiées" value={p.stats.zonesCompleted} />
            <Stat label="Cristaux" value={p.stats.crystals} />
            <Stat label="Zones visitées" value={`${p.stats.zonesVisited.length}/6`} />
          </div>
        </section>
        <section>
          <h3>Nom d'astronaute</h3>
          <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          <h3>Combinaison</h3>
          <Swatches list={SUITS} k="suit" />
          <h3>Visière</h3>
          <Swatches list={VISORS} k="visor" />
          <h3>Accents</h3>
          <Swatches list={SUITS.concat(['#7ee8a2', '#6ff3ff'])} k="accent" />
          <h3>Accessoire</h3>
          <div className="chips">
            {HATS.map((h) => <button key={h.id} className={`chip ${look.hat === h.id ? 'on' : ''}`} onClick={() => setLook({ ...look, hat: h.id })}>{h.label}</button>)}
          </div>
          <div style={{ marginTop: 18 }}><button className="btn primary" onClick={save}>💾 Enregistrer</button></div>
          <p className="muted small">Votre progression est sauvegardée automatiquement sur le serveur et liée à ce navigateur.</p>
        </section>
      </div>
    </Modal>
  );
}

// ---------- Paramètres ----------
function SettingsPanel() {
  const s = useStore((st) => st.settings);
  const setSettings = useStore((st) => st.setSettings);
  return (
    <Modal title="⚙️ Paramètres">
      <h3>Qualité graphique</h3>
      <div className="chips">
        {(['low', 'medium', 'high'] as const).map((q) => (
          <button key={q} className={`chip ${s.quality === q ? 'on' : ''}`} onClick={() => setSettings({ quality: q })}>{q === 'low' ? 'Basse' : q === 'medium' ? 'Moyenne' : 'Haute'}</button>
        ))}
      </div>
      <p className="muted small">Basse : sans ombres, résolution réduite (portables, tablettes). Haute : ombres HD, anticrénelage.</p>
      <h3>Sensibilité de la souris : {s.sensitivity.toFixed(1)}</h3>
      <input type="range" min={0.2} max={3} step={0.1} value={s.sensitivity} onChange={(e) => setSettings({ sensitivity: Number(e.target.value) })} />
      <h3>Volume : {Math.round(s.volume * 100)} %</h3>
      <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => { setSettings({ volume: Number(e.target.value) }); sfx.click(); }} />
      <label className="check"><input type="checkbox" checked={s.invertY} onChange={(e) => setSettings({ invertY: e.target.checked })} /> Inverser l'axe vertical</label>
      <label className="check"><input type="checkbox" checked={s.showFps} onChange={(e) => setSettings({ showFps: e.target.checked })} /> Afficher les FPS</label>
      <Controls />
    </Modal>
  );
}

function Controls() {
  const rows: [string, string][] = [
    ['ZQSD / WASD', 'Se déplacer / conduire'], ['Souris', 'Caméra'], ['Molette', 'Zoom caméra'], ['Clic gauche (maintenu)', 'Utiliser l\'outil'],
    ['Maj', 'Courir'], ['Espace', 'Sauter'], ['E', 'Interagir (vendre, boutique, garage)'], ['V', 'Monter / descendre du véhicule'],
    ['F', 'Brosses du véhicule on/off'], ['R', 'Pilote automatique (robot géant)'], ['1 – 7', 'Changer d\'outil'],
    ['B / I / M / L', 'Boutique / Inventaire / Missions / Classement'], ['Entrée', 'Chat'], ['Échap', 'Menu'],
  ];
  return (
    <>
      <h3>Commandes</h3>
      <table className="table keys">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td><span className="key">{k}</span></td><td>{v}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function HelpPanel() {
  return (
    <Modal title="❓ Comment jouer">
      <ol className="help">
        <li>Maintenez le <b>clic gauche</b> pour nettoyer la poussière devant vous : elle remplit votre <b>soute</b>.</li>
        <li>Détruisez les <b>débris</b> (rochers, déchets, cristaux) en les nettoyant : ils donnent des ressources rares.</li>
        <li>Revenez à la station et appuyez sur <b>E</b> devant le <b style={{ color: '#ffd93d' }}>Collecteur</b> (borne jaune) pour vendre.</li>
        <li>Achetez de meilleurs <b>outils</b>, des <b>véhicules</b> et des <b>améliorations</b> à la <b style={{ color: '#4ecdc4' }}>boutique</b> (borne turquoise ou touche B).</li>
        <li>Coopérez : chaque zone nettoyée à <b>{ZONE_GOAL * 100} %</b> rapporte une prime à tous les participants.</li>
        <li>Les zones lointaines sont plus dures à nettoyer mais regorgent de ressources précieuses.</li>
      </ol>
      <Controls />
    </Modal>
  );
}

// ---------- Classement ----------
function LeaderboardPanel() {
  const [rows, setRows] = useState<{ id: string; name: string; level: number; totalEarned: number }[] | null>(null);
  const roster = useStore((s) => s.roster);
  useEffect(() => {
    request<{ id: string; name: string; level: number; totalEarned: number }[]>('leaderboard').then((r) => setRows(Array.isArray(r) ? r : []));
  }, []);
  return (
    <Modal title="🏆 Classement des nettoyeurs">
      {!rows ? <p className="muted">Chargement…</p> : (
        <table className="table">
          <thead><tr><th>#</th><th>Astronaute</th><th>Niveau</th><th>Gains totaux</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.id === useStore.getState().profile?.id ? 'me' : ''}>
                <td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td>{r.name} {roster.some((q) => q.id === r.id) && <span className="online">● en ligne</span>}</td>
                <td>{r.level}</td>
                <td>{fmt(r.totalEarned)} ¢</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// ---------- Parties ----------
function RoomsPanel() {
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [code, setCode] = useState('');
  const connected = useStore((s) => s.connected);
  const refresh = () => request<RoomInfo[]>('rooms:list').then((r) => setRooms(Array.isArray(r) ? r : []));
  useEffect(() => { if (connected) refresh(); }, [connected]);
  return (
    <Modal title="🌐 Rejoindre une partie">
      <div className="row">
        <input className="input" placeholder="Code de partie (ex : K7M2Q)" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn primary" disabled={code.length < 5} onClick={() => joinRoom(code)}>Rejoindre</button>
      </div>
      <div className="row between"><h3>Parties publiques</h3><button className="btn sm" onClick={refresh}>↻ Actualiser</button></div>
      {!rooms ? <p className="muted">Chargement…</p> : rooms.length === 0 ? <p className="muted">Aucune partie publique.</p> : (
        <div className="room-list">
          {rooms.map((r) => (
            <div key={r.id} className="room">
              <div>
                <b>{r.name}</b>
                <div className="muted small">Code {r.id} · {r.players}/{r.max} joueurs</div>
              </div>
              <button className="btn primary" disabled={r.players >= r.max} onClick={() => joinRoom(r.id)}>{r.players >= r.max ? 'Complet' : 'Rejoindre'}</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CreatePanel() {
  const p = useStore((s) => s.profile);
  const [name, setName] = useState(p ? `Équipe de ${p.name}` : '');
  const [max, setMax] = useState(MAX_PLAYERS);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const r = await request<{ ok: boolean; id?: string; msg?: string }>('room:create', { name, max, private: priv });
    if (r.ok && r.id) await joinRoom(r.id);
    else useStore.getState().toast(r.msg || 'Création impossible', 'warn');
    setBusy(false);
  };
  return (
    <Modal title="✨ Créer une partie">
      <h3>Nom de la partie</h3>
      <input className="input" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
      <h3>Joueurs maximum : {max}</h3>
      <input type="range" min={2} max={MAX_PLAYERS} value={max} onChange={(e) => setMax(Number(e.target.value))} />
      <label className="check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Partie privée (accessible uniquement avec le code)</label>
      <p className="muted small">Chaque partie possède sa propre Lune : poussière, débris et zones sont partagés entre ses joueurs. Votre progression personnelle (argent, outils, véhicules) vous suit partout.</p>
      <button className="btn primary big" disabled={busy} onClick={create}>🚀 Créer et rejoindre</button>
    </Modal>
  );
}

// ---------- Pause ----------
function PausePanel() {
  const room = useStore((s) => s.room);
  const openPanel = useStore((s) => s.openPanel);
  const set = useStore((s) => s.set);
  const [copied, setCopied] = useState(false);
  const resume = () => {
    openPanel(null);
    const c = document.querySelector('#game-root canvas') as HTMLCanvasElement | null;
    if (c && !('ontouchstart' in window)) (c.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  };
  return (
    <Modal title="⏸️ Menu" onClose={resume}>
      {room && (
        <div className="room-code">
          Partie <b>{room.name}</b> — code <span className="code">{room.id}</span>
          <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(room.id); setCopied(true); }}>{copied ? 'Copié !' : 'Copier'}</button>
        </div>
      )}
      <div className="menu-list">
        <button className="btn primary big" onClick={resume}>▶️ Reprendre</button>
        <button className="btn" onClick={() => { set({ shopTab: 'tools' }); openPanel('shop'); }}>🛒 Boutique</button>
        <button className="btn" onClick={() => openPanel('inventory')}>🎒 Inventaire</button>
        <button className="btn" onClick={() => openPanel('missions')}>🎯 Missions</button>
        <button className="btn" onClick={() => openPanel('profile')}>👩‍🚀 Profil</button>
        <button className="btn" onClick={() => openPanel('leaderboard')}>🏆 Classement</button>
        <button className="btn" onClick={() => openPanel('settings')}>⚙️ Paramètres</button>
        <button className="btn" onClick={() => openPanel('help')}>❓ Aide</button>
        <button className="btn danger" onClick={leaveRoom}>🚪 Quitter la partie</button>
      </div>
    </Modal>
  );
}

export function Panels() {
  const panel = useStore((s) => s.panel);
  switch (panel) {
    case 'shop': return <ShopPanel />;
    case 'inventory': return <InventoryPanel />;
    case 'missions': return <MissionsPanel />;
    case 'profile': return <ProfilePanel />;
    case 'settings': return <SettingsPanel />;
    case 'leaderboard': return <LeaderboardPanel />;
    case 'rooms': return <RoomsPanel />;
    case 'create': return <CreatePanel />;
    case 'pause': return <PausePanel />;
    case 'help': return <HelpPanel />;
    default: return null;
  }
}
