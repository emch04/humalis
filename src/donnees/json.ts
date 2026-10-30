/** Vérifie les formes des fiches JSON après lecture. */
export function lireJson(texte: string): Record<string, unknown> | Record<string, unknown>[] {
  let valeur: unknown;
  try { valeur = JSON.parse(texte); } catch { throw new Error('ligne 1 : le fichier JSON est mal formé.'); }
  const fiche = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!fiche(valeur) && !(Array.isArray(valeur) && valeur.every(fiche))) throw new Error('ligne 1 : le JSON doit contenir une fiche ou une liste de fiches.');
  const verifier = (v: unknown, modele: unknown, chemin: string): void => {
    if (Array.isArray(modele)) {
      if (!Array.isArray(v)) throw new Error(`${chemin} : une liste était attendue.`);
      if (modele.length) v.forEach((item, i) => verifier(item, modele[0], `${chemin}, élément ${i + 1}`));
    } else if (fiche(modele)) {
      if (!fiche(v)) throw new Error(`${chemin} : une fiche était attendue.`);
      for (const nom of Object.keys(modele)) {
        if (!(nom in v)) throw new Error(`${chemin} n'a pas le champ « ${nom} ».`);
        verifier(v[nom], modele[nom], chemin);
      }
      for (const nom of Object.keys(v)) if (!(nom in modele)) throw new Error(`${chemin} a un champ supplémentaire « ${nom} ».`);
    } else if (typeof v !== typeof modele) throw new Error(`${chemin} : le type change d'un élément à l'autre.`);
  };
  if (Array.isArray(valeur) && valeur.length) valeur.forEach((v, i) => verifier(v, valeur[0], `l'élément ${i + 1}`));
  return valeur as Record<string, unknown> | Record<string, unknown>[];
}
