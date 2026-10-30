import { useEffect } from 'react';

/** Met le titre de l'onglet à jour : « Les pages — Humalis ». */
export function useTitre(titre?: string): void {
  useEffect(() => {
    document.title = titre ? `${titre} — Humalis` : 'Humalis';
  }, [titre]);
}
