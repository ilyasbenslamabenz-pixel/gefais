// Menu principal : nouvelle partie, continuer, charger, paramètres, tutoriel.
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { createGameReq, deleteGame, listGames, openGame, type GameMeta } from '../net';
import { MONTHS_FR } from '../../../shared/sim/engine';

function dateOf(m: number) { return `${MONTHS_FR[m % 12]} ${2030 + Math.floor(m / 12)}`; }

export function MainMenu() {
  const connected = useStore((s) => s.connected);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [view, setView] = useState<'home' | 'new' | 'load' | 'settings' | 'tuto'>('home');
  const [games, setGames] = useState<GameMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState({ name: "République d'Ilyas", metropoles: 5, villes: 12, communes: 30, population: 9.6, seed: Math.floor(Math.random() * 100000) });
  const refresh = () => listGames().then(setGames).catch(() => setGames([]));
  useEffect(() => { if (connected) refresh(); }, [connected]);
  const start = async () => {
    setBusy(true);
    try {
      const { id } = await createGameReq({ ...cfg, population: cfg.population * 1e6 });
      await openGame(id);
      if (!localStorage.getItem('eco_tuto')) useStore.getState().set({ tutorialStep: 0 });
    } catch (e) {
      useStore.getState().toast(`Création impossible : ${(e as Error).message}`, 'bad');
    }
    setBusy(false);
  };
  const last = games[0];
  return (
    <div className="menu">
      <div className="menu-bg" />
      <div className="menu-card">
        <h1 className="logo">ECO <span>NATION</span></h1>
        <p className="tagline">Gouvernez une cité-État de 10 millions d'habitants pendant des décennies. Chaque décision compte.</p>
        {view === 'home' && (
          <div className="menu-buttons">
            <button className="btn primary big" disabled={!connected || busy} onClick={start}>{busy ? 'Ouverture du pays…' : "▶ Gouverner la République d'Ilyas"}</button>
            <button className="btn big" disabled={!connected} onClick={() => setView('new')}>Nouvelle partie personnalisée</button>
            <button className="btn big" disabled={!last} onClick={() => last && openGame(last.id)}>Continuer{last ? ` — ${last.name}, ${dateOf(last.month)}` : ''}</button>
            <button className="btn big" disabled={!games.length} onClick={() => setView('load')}>Charger une sauvegarde</button>
            <button className="btn big" onClick={() => setView('settings')}>Paramètres</button>
            <button className="btn big" onClick={() => setView('tuto')}>Tutoriel</button>
            {!connected && <p className="muted">Connexion au serveur…</p>}
          </div>
        )}
        {view === 'new' && (
          <div className="menu-form">
            <label>Nom du pays<input className="input" value={cfg.name} maxLength={40} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></label>
            <label>Grands quartiers : <b>{cfg.metropoles}</b><input type="range" min={1} max={6} value={cfg.metropoles} onChange={(e) => setCfg({ ...cfg, metropoles: Number(e.target.value) })} /></label>
            <label>Arrondissements : <b>{cfg.villes}</b><input type="range" min={0} max={20} value={cfg.villes} onChange={(e) => setCfg({ ...cfg, villes: Number(e.target.value) })} /></label>
            <label>Quartiers périphériques : <b>{cfg.communes}</b><input type="range" min={0} max={40} value={cfg.communes} onChange={(e) => setCfg({ ...cfg, communes: Number(e.target.value) })} /></label>
            <label>Population initiale : <b>{cfg.population.toFixed(1).replace('.', ',')} millions</b><input type="range" min={2} max={60} step={0.2} value={cfg.population} onChange={(e) => setCfg({ ...cfg, population: Number(e.target.value) })} /></label>
            <label>Graine de génération<input className="input" type="number" value={cfg.seed} onChange={(e) => setCfg({ ...cfg, seed: Number(e.target.value) })} /></label>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setView('home')}>Retour</button>
              <button className="btn primary" disabled={busy || !connected} onClick={start}>{busy ? 'Création du pays…' : 'Prendre le pouvoir'}</button>
            </div>
          </div>
        )}
        {view === 'load' && (
          <div className="menu-form">
            {games.map((g) => (
              <div key={g.id} className="save-row">
                <div><b>{g.name}</b><div className="muted small">{dateOf(g.month)} · sauvegardé le {new Date(g.updatedAt).toLocaleString('fr-FR')}</div></div>
                <div className="btn-row">
                  <button className="btn primary sm" onClick={() => openGame(g.id)}>Charger</button>
                  <button className="btn danger sm" onClick={async () => { if (confirm(`Supprimer « ${g.name} » ?`)) { await deleteGame(g.id); refresh(); } }}>Supprimer</button>
                </div>
              </div>
            ))}
            <button className="btn ghost" onClick={() => setView('home')}>Retour</button>
          </div>
        )}
        {view === 'settings' && (
          <div className="menu-form">
            <label>Qualité graphique
              <select value={settings.quality} onChange={(e) => setSettings({ quality: e.target.value as typeof settings.quality })}>
                <option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option>
              </select>
            </label>
            <label>Heure de la ville
              <select value={settings.timeMode} onChange={(e) => setSettings({ timeMode: e.target.value as 'golden' })}>
                <option value="golden">Heure dorée</option><option value="cycle">Cycle jour/nuit</option><option value="day">Plein jour</option><option value="night">Nuit</option>
              </select>
            </label>
            <label>Durée d'une journée : <b>{settings.dayLength} s</b><input type="range" min={60} max={600} step={30} value={settings.dayLength} onChange={(e) => setSettings({ dayLength: Number(e.target.value) })} /></label>
            <button className="btn ghost" onClick={() => setView('home')}>Retour</button>
          </div>
        )}
        {view === 'tuto' && (
          <div className="menu-form tuto-text">
            <p><b>1.</b> Cliquez sur « Gouverner la République d'Ilyas » : la cité-État est entièrement construite et fonctionnelle : une mégapole de 10 millions d'habitants avec ses quartiers, périphériques, métro, port, aéroport, écoles, hôpitaux, usines, centrales, son économie, ses impôts et sa dette. Vous n'avez rien à construire : vous gouvernez.</p>
            <p><b>2.</b> Ouvrez un ministère dans le dock de gauche, modifiez les curseurs, puis « Adopter les réformes » : elles entrent en vigueur le mois suivant.</p>
            <p><b>3.</b> Lancez le temps (▶, ×2, ×5, ×10). Chaque pas est un mois. Suivez les effets dans la barre du haut et le Centre de contrôle.</p>
            <p><b>4.</b> Les effets ont des délais : l'emploi, les services publics et les émissions s'ajustent progressivement.</p>
            <p><b>Caméra :</b> glisser pour déplacer, clic droit pour pivoter, molette pour zoomer, ZQSD/WASD pour se déplacer.</p>
            <button className="btn ghost" onClick={() => setView('home')}>Retour</button>
          </div>
        )}
      </div>
      <div className="menu-foot">ECO NATION · simulation économique, fiscale, sociale et écologique · textures Poly Haven (CC0)</div>
    </div>
  );
}
