// Événements et crises : panneau de suivi et fenêtre de décision mise en évidence quand un événement attend un choix.
import type { GameEvent } from '../../../shared/sim/events';
import { useStore } from '../store';
import { govAction } from '../net';
import { money, pct } from '../format';
import { Drawer, Section } from './common';
import { monthLabel } from './charts';

const SPENDING: Record<string, string> = {
  sante: 'Santé', education: 'Éducation', securite: 'Sécurité', defense: 'Défense', transports: 'Transports publics', infrastructures: 'Infrastructures',
  environnement: 'Environnement', administration: 'Administration', logement: 'Aides au logement', subventions: 'Subventions', recherche: 'Recherche', formation: 'Formation',
};

function EventChoices({ ev, compact }: { ev: GameEvent; compact?: boolean }) {
  const snap = useStore((s) => s.snap)!;
  const left = Math.max(0, ev.deadline - snap.month);
  return (
    <>
      <p>{ev.text}</p>
      <p className="small"><b>⏳ {left > 0 ? `Décision attendue dans ${left} mois` : 'Échéance ce mois-ci'}</b> — sans décision, l'option par défaut s'appliquera (« {ev.options.find((o) => o.id === ev.defaultOption)?.label} »). Le temps continue de s'écouler.</p>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: compact ? '1fr' : `repeat(${ev.options.length}, 1fr)` }}>
        {ev.options.map((o) => (
          <button key={o.id} className={`btn ${o.id === ev.defaultOption ? 'ghost' : 'primary'}`} style={{ textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: 10 }}
            onClick={() => govAction({ type: 'evenement', uid: ev.uid, option: o.id })}>
            <b>{o.label}</b>{o.id === ev.defaultOption && <em> (par défaut)</em>}
            <div className="small" style={{ marginTop: 4 }}>{o.text}</div>
            <div className="small" style={{ marginTop: 4 }}>Coût total : <b>{o.cost > 0 ? money(o.cost) : 'aucun'}</b></div>
          </button>
        ))}
      </div>
    </>
  );
}

/** Fenêtre de décision superposée au jeu (premier événement en attente non réduit). */
export function EventOverlay() {
  const snap = useStore((s) => s.snap);
  const minimized = useStore((s) => s.minimizedEvents);
  const set = useStore((s) => s.set);
  const ev = snap?.events?.active.find((e) => !minimized.includes(e.uid));
  if (!snap || !ev) return null;
  const pending = snap.events!.active.length;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, pointerEvents: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ev-title" style={{ width: 'min(860px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: 'var(--panel, #1b2333)', color: 'var(--text, #eef2f8)', borderRadius: 12, padding: 20, border: `2px solid ${ev.kind === 'opportunite' ? 'var(--good, #06d6a0)' : 'var(--bad, #ef476f)'}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 id="ev-title" style={{ margin: 0 }}>{ev.icon} {ev.title}</h2>
          <span className="muted small">{monthLabel(ev.month, snap.startYear)}{pending > 1 ? ` · ${pending} événements en attente` : ''}</span>
        </div>
        <EventChoices ev={ev} />
        <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => set({ minimizedEvents: [...minimized, ev.uid] })}>Décider plus tard</button>
          <button className="btn" onClick={() => set({ panel: 'evenements', minimizedEvents: [...minimized, ev.uid] })}>Voir tous les événements</button>
        </div>
      </div>
    </div>
  );
}

export function EvenementsPanel() {
  const snap = useStore((s) => s.snap);
  const E = snap?.events;
  if (!snap || !E) return null;
  return (
    <Drawer title="Événements & crises" icon="⚠️" wide>
      <Section title={`En attente de décision (${E.active.length})`}>
        {E.active.length === 0 && <p className="muted small">Aucun événement en cours. Les crises surviennent selon l'état du pays : dépendance énergétique, risque de grève, qualité des services, inflation, climat…</p>}
        {E.active.map((ev) => (
          <div key={ev.uid} className={`notice ${ev.kind === 'opportunite' ? 'good' : 'bad'}`}>
            <div className="notice-head"><b>{ev.icon} {ev.title}</b><span>{monthLabel(ev.month, snap.startYear)}</span></div>
            <EventChoices ev={ev} compact />
          </div>
        ))}
      </Section>
      {E.modifiers.length > 0 && (
        <Section title="Effets temporaires en cours">
          <table className="table"><tbody>
            {E.modifiers.filter((m) => !m.key.startsWith('risk:')).map((m, i) => <tr key={i}><td>{m.label}</td><td>{labelKey(m.key)}</td><td className={(m.value > 0) === (m.key === 'energy') ? 'bad' : 'good'}>{m.value >= 0 ? '+' : ''}{pct(m.value)}</td><td className="muted small">{m.decay >= 1 ? 'durable' : `−${pct(1 - m.decay, 0)}/mois`}</td></tr>)}
          </tbody></table>
        </Section>
      )}
      {E.extraBudget.length > 0 && (
        <Section title="Crédits exceptionnels engagés" hint="Les coûts des décisions sont ajoutés chaque mois à la ligne budgétaire concernée et comptabilisés dans les dépenses publiques.">
          <table className="table"><tbody>
            {E.extraBudget.map((x, i) => <tr key={i}><td>{x.label}</td><td>{SPENDING[x.line] ?? x.line}</td><td>{money(x.annual / 12)}/mois</td><td>{x.months} mois restants</td></tr>)}
          </tbody></table>
        </Section>
      )}
      <Section title="Historique">
        {E.history.length === 0 && <p className="muted small">Aucun événement pour l'instant.</p>}
        {[...E.history].reverse().map((ev) => (
          <div key={ev.uid} className="notice info">
            <div className="notice-head"><b>{ev.icon} {ev.title}</b><span>{monthLabel(ev.month, snap.startYear)}</span></div>
            <p className="small">{ev.text}</p>
            <p className="small">Décision : <b>{ev.options.find((o) => o.id === ev.choice)?.label}</b>{ev.auto ? ' (option par défaut, faute de décision)' : ''} — {ev.outcome}</p>
          </div>
        ))}
      </Section>
    </Drawer>
  );
}

function labelKey(k: string) {
  if (k === 'demand') return 'Demande étrangère';
  if (k === 'energy') return 'Prix de l\'énergie';
  if (k === 'worldPrice') return 'Prix mondiaux';
  if (k === 'prod:all') return 'Productivité (tous secteurs)';
  if (k.startsWith('prod:')) return `Productivité : ${k.slice(5)}`;
  return k;
}
