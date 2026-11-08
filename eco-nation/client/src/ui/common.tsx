// Composants d'interface réutilisables.
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { Policy } from '../../../shared/sim/types';

export function Drawer({ title, icon, children, wide }: { title: string; icon: string; children: ReactNode; wide?: boolean }) {
  const set = useStore((s) => s.set);
  return (
    <aside className={`drawer ${wide ? 'wide' : ''}`}>
      <header className="drawer-head">
        <h2><span>{icon}</span> {title}</h2>
        <button className="icon-btn" onClick={() => set({ panel: null })} aria-label="Fermer">✕</button>
      </header>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="section">
      <h3>{title}{hint && <Info text={hint} />}</h3>
      {children}
    </section>
  );
}

export function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen(!open)}>
      ⓘ{open && <span className="info-pop">{text}</span>}
    </span>
  );
}

export function Kpi({ label, value, sub, tone, hint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn'; hint?: string }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="kpi-label">{label}{hint && <Info text={hint} />}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Slider({ label, value, min, max, step, fmt, onChange, current, hint }: {
  label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; current?: number; hint?: string;
}) {
  const changed = current !== undefined && Math.abs(current - value) > step / 2;
  return (
    <label className={`slider ${changed ? 'changed' : ''}`}>
      <div className="slider-top">
        <span>{label}{hint && <Info text={hint} />}</span>
        <b>{fmt(value)}{changed && <em> (actuel {fmt(current!)})</em>}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <Info text={hint} />}</span>
    </label>
  );
}

export function Bars({ items, fmt, max }: { items: { label: string; value: number; color?: string }[]; fmt: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1e-9, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="bars">
      {items.map((i) => (
        <div key={i.label} className="bar-row">
          <span className="bar-label">{i.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(Math.abs(i.value) / m) * 100}%`, background: i.color ?? (i.value < 0 ? 'var(--bad)' : 'var(--accent)') }} /></div>
          <span className="bar-val">{fmt(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Politique en cours d'édition (brouillon) ou, à défaut, la politique programmée / en vigueur. */
export function usePolicy() {
  const draft = useStore((s) => s.draft);
  const snap = useStore((s) => s.snap);
  const edit = useStore((s) => s.editDraft);
  const effective = snap?.policy;
  const policy: Policy | undefined = draft ?? snap?.pending?.policy ?? snap?.policy;
  return { policy, effective, edit };
}

export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const r = Math.max(0, Math.min(1, value / max));
  const c = tone ?? (r > 0.6 ? 'var(--good)' : r > 0.4 ? 'var(--warn)' : 'var(--bad)');
  return <div className="meter"><div style={{ width: `${r * 100}%`, background: c }} /></div>;
}
