// Graphiques SVG légers (séries historiques mensuelles).
import { useMemo, useState } from 'react';
import { START_YEAR } from '../../../shared/sim/engine';

export interface Series { key: string; label: string; values: number[]; color: string }
/** Repère ponctuel (mois depuis le début, valeur) : jalons du plan climat. Optionnel. */
export interface ChartMark { month: number; value: number; label: string; tone?: string }

export function LineChart({ series, fmt, height = 180, years, startYear = START_YEAR, marks }: { series: Series[]; fmt: (v: number) => string; height?: number; years: number | 'all'; startYear?: number; marks?: ChartMark[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520;
  const H = height;
  const pad = { l: 58, r: 10, t: 10, b: 22 };
  const data = useMemo(() => {
    const len = Math.max(...series.map((s) => s.values.length), 0);
    const n = years === 'all' ? len : Math.min(len, years * 12 + 1);
    const start = len - n;
    const sl = series.map((s) => ({ ...s, v: s.values.slice(Math.max(0, start)) }));
    let min = Infinity, max = -Infinity;
    for (const s of sl) for (const v of s.v) { if (v < min) min = v; if (v > max) max = v; }
    if (!Number.isFinite(min)) { min = 0; max = 1; }
    if (min === max) { min -= Math.abs(min) * 0.1 + 1e-6; max += Math.abs(max) * 0.1 + 1e-6; }
    const span = max - min;
    min -= span * 0.08; max += span * 0.08;
    return { sl, n, start, min, max };
  }, [series, years]);
  const x = (i: number) => pad.l + (i / Math.max(1, data.n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - data.min) / (data.max - data.min)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => data.min + t * (data.max - data.min));
  const yearTicks: number[] = [];
  const stepY = data.n > 360 ? 10 : data.n > 120 ? 5 : data.n > 36 ? 2 : 1;
  for (let i = 0; i < data.n; i++) { const m = data.start + i; if (m % (12 * stepY) === 0) yearTicks.push(i); }
  const zero = data.min < 0 && data.max > 0 ? y(0) : null;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.n - 1));
        setHover(i >= 0 && i < data.n ? i : null);
      }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{fmt(t)}</text>
          </g>
        ))}
        {zero !== null && <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} className="zero" />}
        {yearTicks.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="axis">{startYear + Math.floor((data.start + i) / 12)}</text>)}
        {data.sl.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={2} points={s.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
        {marks?.filter((m) => m.month - data.start >= 0 && m.month - data.start < data.n).map((m) => (
          <g key={m.label} className={`chart-mark ${m.tone ?? ''}`}>
            <line x1={x(m.month - data.start)} x2={x(m.month - data.start)} y1={pad.t} y2={H - pad.b} className="mark-line" />
            <rect x={x(m.month - data.start) - 3.5} y={y(m.value) - 3.5} width={7} height={7} className="mark-dot" />
            <text x={x(m.month - data.start)} y={pad.t + 9} textAnchor="middle" className="axis">{m.label}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="hover" />}
      </svg>
      <div className="legend">
        {data.sl.map((s) => (
          <span key={s.key}><i style={{ background: s.color }} />{s.label}{hover !== null && s.v[hover] !== undefined && <b> {fmt(s.v[hover])}</b>}</span>
        ))}
        {hover !== null && <span className="muted">— {monthLabel(data.start + hover, startYear)}</span>}
      </div>
    </div>
  );
}

export function monthLabel(m: number, startYear = START_YEAR) {
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${mois[m % 12]} ${startYear + Math.floor(m / 12)}`;
}

/** Pyramide des âges (tranches de 5 ans). */
export function Pyramid({ cohorts }: { cohorts: number[] }) {
  const max = Math.max(...cohorts);
  return (
    <div className="pyramid">
      {cohorts.map((v, i) => i).reverse().map((i) => (
        <div key={i} className="pyr-row">
          <span className="pyr-age">{i === 20 ? '100+' : `${i * 5}–${i * 5 + 4}`}</span>
          <div className="pyr-bars">
            <div className="pyr-l"><div style={{ width: `${(cohorts[i] / 2 / max) * 200}%` }} /></div>
            <div className="pyr-r"><div style={{ width: `${(cohorts[i] / 2 / max) * 200}%` }} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}
