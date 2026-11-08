import type { ReactNode } from 'react';
import { useStore } from '../store';
import { sfx } from '../audio';

export function fmt(n: number) {
  return Math.floor(n).toLocaleString('fr-FR');
}

export function Modal({ title, children, wide, onClose }: { title: string; children: ReactNode; wide?: boolean; onClose?: () => void }) {
  const openPanel = useStore((s) => s.openPanel);
  const close = onClose ?? (() => openPanel(null));
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="close" onClick={() => { sfx.click(); close(); }} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
