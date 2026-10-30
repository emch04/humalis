import { analyser } from '../lexer/lexer.js';
import { analyserSyntaxe } from '../parser/parser.js';

function arbre(source: string): string {
  const nettoyer = (valeur: unknown): unknown => {
    if (Array.isArray(valeur)) return valeur.map(nettoyer);
    if (valeur && typeof valeur === 'object') return Object.fromEntries(Object.entries(valeur).filter(([cle]) => cle !== 'ligne' && cle !== 'colonne').map(([cle, contenu]) => [cle, nettoyer(contenu)]));
    return valeur;
  };
  return JSON.stringify(nettoyer(analyserSyntaxe(analyser(source))));
}

function espacerHorsChaines(ligne: string): string {
  const parties = ligne.split(/("[^"\n]*")/u);
  let commentaire = false;
  return parties.map((partie, index) => {
    if (commentaire || index % 2) return partie;
    const debutCommentaire = partie.indexOf('#');
    const avantCommentaire = debutCommentaire < 0 ? partie : partie.slice(0, debutCommentaire);
    const margeCommentaire = debutCommentaire < 0 ? '' : avantCommentaire.match(/\s*$/u)?.[0] ?? '';
    const code = debutCommentaire < 0 ? avantCommentaire : avantCommentaire.slice(0, -margeCommentaire.length || undefined);
    const suffixe = debutCommentaire < 0 ? '' : margeCommentaire + partie.slice(debutCommentaire);
    if (suffixe) commentaire = true;
    // Un nombre décimal est un jeton unique pour le lexer. La virgule
    // d'une liste, elle, est suivie d'une espace et reste un séparateur.
    const decimaux: string[] = [];
    const protege = code.replace(/\b\d+[.,]\d+\b/gu, (nombre) => {
      decimaux.push(nombre.replace('.', ','));
      return `§${decimaux.length - 1}§`;
    });
    const espace = protege.replace(/\s*([=+*])\s*/gu, ' $1 ').replace(/,\s*/gu, ', ').replace(/\s{2,}/gu, ' ')
      .replace(/§(\d+)§/gu, (_, rang: string) => decimaux[Number(rang)]);
    return espace + suffixe;
  }).join('').replace(/ +$/u, '');
}

/** Formate avec prudence : les contenus CSS, commentaires et chaînes ne sont jamais réécrits. */
export function formaterSource(source: string): string {
  const original = arbre(source);
  const lignes = source.split('\n');
  let css = false;
  let retraitCss = 0;
  const resultat = lignes.map((ligne) => {
    if (!ligne.trim() || ligne.trimStart().startsWith('#')) return ligne;
    const retrait = ligne.match(/^[ \t]*/u)?.[0] ?? '';
    const niveau = retrait.replace(/\t/gu, '    ').length / 4;
    if (css && retrait.length > retraitCss) return ligne;
    css = false;
    if (/^\s*style\s*:/u.test(ligne)) { css = true; retraitCss = retrait.length; }
    return ' '.repeat(Math.floor(niveau) * 4) + espacerHorsChaines(ligne.trimStart());
  }).join('\n');
  if (arbre(resultat) !== original) throw new Error('Le formatage modifierait l’arbre syntaxique : fichier conservé.');
  return resultat;
}
