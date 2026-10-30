import type { Diagnostic } from './erreurs.js';

const NOMS: Record<NonNullable<Diagnostic['categorie']>, string> = {
  accessibilite: 'd’accessibilité',
  publication: 'de publication',
  traduction: 'de traduction',
  surveillance: 'de surveillance',
};

/** L'option exigeante ne concerne que les diagnostics des nouvelles familles. */
export function appliquerExigence(diagnostics: Diagnostic[], exigeant: boolean): Diagnostic[] {
  if (!exigeant) return diagnostics;
  return diagnostics.map((d) => d.gravite === 'avertissement' && d.categorie
    ? { ...d, gravite: 'erreur' as const }
    : d);
}

export function resumerQualite(diagnostics: Diagnostic[]): string | undefined {
  const parties = (Object.keys(NOMS) as (keyof typeof NOMS)[]).flatMap((categorie) => {
    const nombre = diagnostics.filter((d) => d.gravite === 'avertissement' && d.categorie === categorie).length;
    return nombre ? [`${nombre} avertissement${nombre > 1 ? 's' : ''} ${NOMS[categorie]}`] : [];
  });
  return parties.length ? parties.join(', ') + '.' : undefined;
}
