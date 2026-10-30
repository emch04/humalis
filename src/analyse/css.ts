import type { Diagnostic } from './erreurs.js';

/** Repère les classes dans les sélecteurs et les déclarations qui forcent les styles Humalis. */
export function verifierCss(css: string, premiereLigne: number, fichier?: string): { classes: Set<string>; diagnostics: Diagnostic[] } {
  const classes = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, (commentaire) => commentaire.replace(/[^\n]/g, ' '));
  const regles = /([^{}]+)\{([^{}]*)\}/g;
  for (const regle of sansCommentaires.matchAll(regles)) {
    const selecteur = regle[1];
    if (selecteur.trimStart().startsWith('@')) continue;
    const noms = [...selecteur.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
    for (const nom of noms) classes.add(nom);
    const humalis = noms.filter((nom) => nom.startsWith('humalis-'));
    if (humalis.length === 0) continue;
    for (const declaration of regle[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]*!\s*important)\s*(?=;|$)/gi)) {
      const avant = sansCommentaires.slice(0, regle.index + selecteur.length + 1 + (declaration.index ?? 0));
      const ligne = premiereLigne + (avant.match(/\n/g)?.length ?? 0);
      for (const nom of humalis) diagnostics.push({
        gravite: 'avertissement', ligne, ...(fichier ? { fichier } : {}),
        message: `le CSS écrase « ${nom} » avec !important (${declaration[1]}) : les réglages Humalis de cet élément (remplissage, largeur…) ne s'appliqueront plus. Retirez !important, ou visez votre propre classe avec « avec style ».`,
      });
    }
  }
  return { classes, diagnostics };
}
