import type { ReactNode } from 'react';

export function Encadre({ titre, attention, children }: { titre?: string; attention?: boolean; children: ReactNode }) {
  return (
    <aside className={`encadre${attention ? ' encadre--attention' : ''}`}>
      {titre && <p className="encadre__titre">{titre}</p>}
      {children}
    </aside>
  );
}
