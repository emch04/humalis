/**
 * La coloration sémantique (plan `2026-10-29-outils-editeur.md`, D7) :
 * les noms que l'analyse des portées reconnaît. Une variable nommée
 * comme un mot du vocabulaire (« nom ») est coloriée comme une variable ;
 * le reste garde la coloration de la grammaire TextMate.
 */
import { dansStyle, jetonsDeLigne, texteJeton } from './document.js';
import { entetes, genreBloc } from './blocs.js';
import { principal } from './projet.js';
import { baseInterpolation, symbolesDe, variableVisible, type Index, type Symbole } from './portees.js';

/** Les types de jetons, standard : tous les thèmes les connaissent. L'ordre compte (protocole). */
export const TYPES_JETONS = ['variable', 'parameter', 'class', 'type', 'property'] as const;
export const MODIFICATEURS_JETONS = ['declaration', 'readonly'] as const;

export type TypeJeton = (typeof TYPES_JETONS)[number];
export type ModificateurJeton = (typeof MODIFICATEURS_JETONS)[number];

export interface JetonSemantique {
  ligne: number;
  colonne: number;
  longueur: number;
  type: TypeJeton;
  modificateurs: ModificateurJeton[];
}

function typeDe(s: Symbole): { type: TypeJeton; readonly: boolean } | undefined {
  switch (s.genre) {
    case 'variable':
    case 'partagee':
    case 'boucle':
      return { type: 'variable', readonly: false };
    case 'calcul':
      return { type: 'variable', readonly: true };
    case 'parametrePage':
    case 'parametreComposant':
      return { type: 'parameter', readonly: false };
    case 'donnee':
      return { type: 'type', readonly: false };
    case 'champDonnee':
      return { type: 'property', readonly: false };
    default:
      return undefined;
  }
}

export function jetonsSemantiques(index: Index): JetonSemantique[] {
  const { chemin, doc } = principal(index.projet);
  const lignes = doc.lignes;
  const resultat: JetonSemantique[] = [];
  const marquer = (ligne: number, colonne: number, longueur: number, s: Symbole | undefined, declaration: boolean) => {
    const t = s && typeDe(s);
    if (!t) return;
    const modificateurs: ModificateurJeton[] = [];
    if (declaration) modificateurs.push('declaration');
    if (t.readonly) modificateurs.push('readonly');
    resultat.push({ ligne, colonne, longueur, type: t.type, modificateurs });
  };

  for (let ligne = 1; ligne <= lignes.length; ligne++) {
    const texte = lignes[ligne - 1];
    if (texte.trim() === '' || dansStyle(lignes, ligne)) continue;
    const references = index.references.get(ligne);
    const enRoute = genreBloc(lignes, entetes(lignes, ligne)) === 'route';
    for (const j of jetonsDeLigne(texte, ligne)) {
      if (j.type === 'CHAINE') {
        // {nom} dans un texte : une variable lue.
        const motif = /\{([^}]*)\}/g;
        for (let m = motif.exec(j.valeur); m; m = motif.exec(j.valeur)) {
          const base = baseInterpolation(m[1]);
          if (base === '') continue;
          const decalage = m[1].indexOf(base);
          marquer(ligne, j.colonne + 1 + m.index + 1 + decalage, base.length, variableVisible(index, base, ligne), false);
        }
        continue;
      }
      if (j.type !== 'IDENTIFIANT' && j.type !== 'MOT_CLE') continue;
      const nom = texteJeton(j);
      const declare = index.symboles.find((s) => s.fichier === chemin && s.ligne === ligne && s.colonne === j.colonne);
      if (declare) {
        marquer(ligne, j.colonne, nom.length, declare, true);
      } else if (texte[j.colonne - 2] === '.') {
        resultat.push({ ligne, colonne: j.colonne, longueur: nom.length, type: 'property', modificateurs: [] });
      } else if (references?.has(nom) || references?.has(j.valeur)) {
        marquer(ligne, j.colonne, nom.length, variableVisible(index, references.has(nom) ? nom : j.valeur, ligne), false);
      } else if (index.composantsPlaces.get(ligne)?.has(nom)) {
        resultat.push({ ligne, colonne: j.colonne, longueur: nom.length, type: 'class', modificateurs: [] });
      } else if (enRoute) {
        marquer(ligne, j.colonne, nom.length, symbolesDe(index, 'donnee').find((s) => s.nom === nom), false);
      }
    }
  }
  return resultat;
}

/**
 * Le format du protocole (LSP et VS Code) : cinq nombres par jeton, ligne
 * et colonne en écart depuis le jeton précédent, à partir de 0.
 */
export function encoderJetons(jetons: readonly JetonSemantique[]): number[] {
  const tries = [...jetons].sort((a, b) => a.ligne - b.ligne || a.colonne - b.colonne);
  const donnees: number[] = [];
  let lignePrecedente = 0;
  let colonnePrecedente = 0;
  for (const j of tries) {
    const ligne = j.ligne - 1;
    const colonne = j.colonne - 1;
    const ecartLigne = ligne - lignePrecedente;
    const ecartColonne = ecartLigne === 0 ? colonne - colonnePrecedente : colonne;
    const bits = j.modificateurs.reduce((b, m) => b | (1 << MODIFICATEURS_JETONS.indexOf(m)), 0);
    donnees.push(ecartLigne, ecartColonne, j.longueur, TYPES_JETONS.indexOf(j.type), bits);
    lignePrecedente = ligne;
    colonnePrecedente = colonne;
  }
  return donnees;
}
